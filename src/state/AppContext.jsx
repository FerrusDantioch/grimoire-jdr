import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as db from '../lib/db.js';
import { uid } from '../lib/utils.js';

const AppContext = createContext(null);

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp doit etre utilise dans <AppProvider>');
  return ctx;
}

const byUpdated = (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0);

export function AppProvider({ children }) {
  const [ready, setReady] = useState(false);
  const [characters, setCharacters] = useState([]);
  const [journal, setJournal] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [tracks, setTracks] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [theme, setTheme] = useState('grimoire');
  const [activeCharacterId, setActiveCharacterId] = useState(null);
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  // Lectures ponctuelles depuis les callbacks de suppression, sans avoir a
  // declarer ces listes en dependance (ce qui recreerait les callbacks).
  const journalRef = useRef(journal);
  journalRef.current = journal;
  const playlistsRef = useRef(playlists);
  playlistsRef.current = playlists;

  /* ---------- chargement initial ---------- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [chars, entries, docs, audio, lists, savedTheme, savedActive] = await Promise.all([
          db.getAll(db.STORES.characters),
          db.getAll(db.STORES.journal),
          db.getAll(db.STORES.documents),
          db.getAll(db.STORES.tracks),
          db.getAll(db.STORES.playlists),
          db.getSetting('theme', 'grimoire'),
          db.getSetting('activeCharacterId', null),
        ]);
        if (cancelled) return;
        setCharacters(chars.sort(byUpdated));
        setJournal(entries.sort(byUpdated));
        setDocuments(docs.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0)));
        setTracks(audio.sort((a, b) => (a.name || '').localeCompare(b.name || '')));
        setPlaylists(lists);
        setTheme(savedTheme);
        if (savedActive && chars.some((c) => c.id === savedActive)) setActiveCharacterId(savedActive);
        db.requestPersistence();
      } catch (err) {
        console.error('[app] chargement impossible', err);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* ---------- theme ---------- */
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'grimoire' ? '#141019' : '#f3ead8');
  }, [theme]);

  const changeTheme = useCallback((next) => {
    setTheme(next);
    db.setSetting('theme', next);
  }, []);

  /* ---------- notifications ---------- */
  const dismissToast = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const toast = useCallback(
    (message, kind = 'info', duration = 2800) => {
      const id = uid('toast');
      setToasts((list) => [...list.slice(-3), { id, message, kind }]);
      timers.current.set(
        id,
        setTimeout(() => dismissToast(id), duration)
      );
      return id;
    },
    [dismissToast]
  );

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  /* ---------- personnages ---------- */
  const saveCharacter = useCallback(async (character) => {
    const next = { ...character, updatedAt: Date.now() };
    await db.put(db.STORES.characters, next);
    setCharacters((list) => {
      const without = list.filter((c) => c.id !== next.id);
      return [next, ...without].sort(byUpdated);
    });
    return next;
  }, []);

  const deleteCharacter = useCallback(async (id) => {
    await db.remove(db.STORES.characters, id);
    setCharacters((list) => list.filter((c) => c.id !== id));
    setActiveCharacterId((current) => {
      if (current !== id) return current;
      db.setSetting('activeCharacterId', null);
      return null;
    });

    // Delie le personnage des seances qui le referencaient.
    const touched = journalRef.current.filter((e) => e.characterIds?.includes(id));
    if (touched.length) {
      const updated = touched.map((e) => ({
        ...e,
        characterIds: e.characterIds.filter((c) => c !== id),
      }));
      await db.putMany(db.STORES.journal, updated);
      setJournal((list) => list.map((e) => updated.find((u) => u.id === e.id) || e));
    }
  }, []);

  const activateCharacter = useCallback((id) => {
    setActiveCharacterId(id);
    db.setSetting('activeCharacterId', id);
  }, []);

  /* ---------- journal ---------- */
  const saveEntry = useCallback(async (entry) => {
    const next = { ...entry, updatedAt: Date.now() };
    await db.put(db.STORES.journal, next);
    setJournal((list) => [next, ...list.filter((e) => e.id !== next.id)].sort(byUpdated));
    return next;
  }, []);

  const deleteEntry = useCallback(async (id) => {
    await db.remove(db.STORES.journal, id);
    setJournal((list) => list.filter((e) => e.id !== id));
  }, []);

  /* ---------- documents PDF ---------- */
  const addDocument = useCallback(async (file) => {
    const doc = {
      id: uid('doc'),
      name: file.name.replace(/\.pdf$/i, ''),
      size: file.size,
      blob: file,
      addedAt: Date.now(),
      lastPage: 1,
    };
    await db.put(db.STORES.documents, doc);
    setDocuments((list) => [doc, ...list]);
    return doc;
  }, []);

  const updateDocument = useCallback(async (doc) => {
    await db.put(db.STORES.documents, doc);
    setDocuments((list) => list.map((d) => (d.id === doc.id ? doc : d)));
    return doc;
  }, []);

  const deleteDocument = useCallback(async (id) => {
    await db.remove(db.STORES.documents, id);
    setDocuments((list) => list.filter((d) => d.id !== id));
  }, []);

  /* ---------- pistes audio ---------- */
  const addTracks = useCallback(async (files) => {
    const created = files.map((file) => ({
      id: uid('track'),
      name: file.name.replace(/\.[^.]+$/, ''),
      type: file.type || 'audio/mpeg',
      size: file.size,
      blob: file,
      duration: null,
      addedAt: Date.now(),
    }));
    await db.putMany(db.STORES.tracks, created);
    setTracks((list) => [...list, ...created].sort((a, b) => a.name.localeCompare(b.name)));
    return created;
  }, []);

  const updateTrack = useCallback(async (track) => {
    await db.put(db.STORES.tracks, track);
    setTracks((list) => list.map((t) => (t.id === track.id ? track : t)));
  }, []);

  const deleteTrack = useCallback(async (id) => {
    await db.remove(db.STORES.tracks, id);
    setTracks((list) => list.filter((t) => t.id !== id));

    // Retire aussi la piste des playlists qui la contenaient.
    const touched = playlistsRef.current.filter((p) => p.trackIds.includes(id));
    if (touched.length) {
      const updated = touched.map((p) => ({ ...p, trackIds: p.trackIds.filter((t) => t !== id) }));
      await db.putMany(db.STORES.playlists, updated);
      setPlaylists((list) => list.map((p) => updated.find((u) => u.id === p.id) || p));
    }
  }, []);

  /* ---------- playlists ---------- */
  const savePlaylist = useCallback(async (playlist) => {
    const next = { ...playlist, updatedAt: Date.now() };
    await db.put(db.STORES.playlists, next);
    setPlaylists((list) => {
      const exists = list.some((p) => p.id === next.id);
      return exists ? list.map((p) => (p.id === next.id ? next : p)) : [...list, next];
    });
    return next;
  }, []);

  const deletePlaylist = useCallback(async (id) => {
    await db.remove(db.STORES.playlists, id);
    setPlaylists((list) => list.filter((p) => p.id !== id));
  }, []);

  /* ---------- rechargement apres restauration ---------- */
  const reloadAll = useCallback(async () => {
    const [chars, entries, docs, audio, lists] = await Promise.all([
      db.getAll(db.STORES.characters),
      db.getAll(db.STORES.journal),
      db.getAll(db.STORES.documents),
      db.getAll(db.STORES.tracks),
      db.getAll(db.STORES.playlists),
    ]);
    setCharacters(chars.sort(byUpdated));
    setJournal(entries.sort(byUpdated));
    setDocuments(docs.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0)));
    setTracks(audio.sort((a, b) => (a.name || '').localeCompare(b.name || '')));
    setPlaylists(lists);
  }, []);

  const activeCharacter = useMemo(
    () => characters.find((c) => c.id === activeCharacterId) || null,
    [characters, activeCharacterId]
  );

  const characterNames = useMemo(
    () => Object.fromEntries(characters.map((c) => [c.id, c.name])),
    [characters]
  );

  const value = useMemo(
    () => ({
      ready,
      characters,
      journal,
      documents,
      tracks,
      playlists,
      theme,
      changeTheme,
      toasts,
      toast,
      dismissToast,
      activeCharacter,
      activeCharacterId,
      activateCharacter,
      characterNames,
      saveCharacter,
      deleteCharacter,
      saveEntry,
      deleteEntry,
      addDocument,
      updateDocument,
      deleteDocument,
      addTracks,
      updateTrack,
      deleteTrack,
      savePlaylist,
      deletePlaylist,
      reloadAll,
    }),
    [
      ready, characters, journal, documents, tracks, playlists, theme, changeTheme,
      toasts, toast, dismissToast, activeCharacter, activeCharacterId, activateCharacter,
      characterNames, saveCharacter, deleteCharacter, saveEntry, deleteEntry,
      addDocument, updateDocument, deleteDocument, addTracks, updateTrack, deleteTrack,
      savePlaylist, deletePlaylist, reloadAll,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
