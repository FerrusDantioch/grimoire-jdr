import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as db from '../lib/db.js';
import { useApp } from './AppContext.jsx';

const AmbianceContext = createContext(null);

export function useAmbiance() {
  const ctx = useContext(AmbianceContext);
  if (!ctx) throw new Error('useAmbiance doit être utilisé dans <AmbianceProvider>');
  return ctx;
}

const clampVolume = (value) => Math.max(0, Math.min(1, Number(value) || 0));

/**
 * Ambiances du soundboard. Comme le lecteur de musique, les lecteurs audio
 * vivent ici, au-dessus des vues : changer d'onglet ne coupe plus la pluie ou
 * le feu de camp. Seuls « Tout arrêter », un nouvel appui sur la pastille ou
 * la suppression du son les arretent.
 *
 * Un lecteur `Audio` par son, cree a la premiere lecture et garde dans une Map
 * (hors rendu React) ; son URL d'objet est revoquee quand le son disparait.
 */
export function AmbianceProvider({ children }) {
  const { sounds, toast } = useApp();

  const playersRef = useRef(new Map()); // id -> { audio, url }
  const volumeRef = useRef(0.9);
  const [playingIds, setPlayingIds] = useState(() => new Set());
  const [volume, setVolumeState] = useState(0.9);

  const markStopped = useCallback((id) => {
    setPlayingIds((set) => {
      if (!set.has(id)) return set;
      const next = new Set(set);
      next.delete(id);
      return next;
    });
  }, []);

  /* Volume propre aux ambiances, distinct de celui de la musique. */
  useEffect(() => {
    db.getSetting('sfxVolume', 0.9)
      .then((v) => {
        const num = clampVolume(v);
        volumeRef.current = num;
        setVolumeState(num);
        for (const { audio } of playersRef.current.values()) audio.volume = num;
      })
      .catch(() => {});
  }, []);

  const setVolume = useCallback((value) => {
    const v = clampVolume(value);
    volumeRef.current = v;
    setVolumeState(v);
    db.setSetting('sfxVolume', v).catch(() => {});
    for (const { audio } of playersRef.current.values()) audio.volume = v;
  }, []);

  const getPlayer = useCallback(
    (sound) => {
      let player = playersRef.current.get(sound.id);
      if (!player) {
        const url = URL.createObjectURL(sound.blob);
        const audio = new Audio(url);
        audio.volume = volumeRef.current;
        // Un son joue sans boucle s'arrete seul : la pastille doit le suivre.
        audio.addEventListener('ended', () => markStopped(sound.id));
        player = { audio, url };
        playersRef.current.set(sound.id, player);
      }
      return player;
    },
    [markStopped]
  );

  /** Lance le son depuis le debut, ou l'arrete s'il joue deja. */
  const toggle = useCallback(
    (sound) => {
      const { audio } = getPlayer(sound);
      if (!audio.paused) {
        audio.pause();
        audio.currentTime = 0;
        markStopped(sound.id);
        return;
      }
      audio.loop = Boolean(sound.loop);
      audio.currentTime = 0;
      audio
        .play()
        .then(() => setPlayingIds((set) => new Set(set).add(sound.id)))
        .catch(() => toast('Lecture impossible pour ce fichier.', 'err'));
    },
    [getPlayer, markStopped, toast]
  );

  const stopAll = useCallback(() => {
    for (const { audio } of playersRef.current.values()) {
      audio.pause();
      audio.currentTime = 0;
    }
    setPlayingIds(new Set());
  }, []);

  /* Suit la liste des sons : mode boucle modifie, son supprime. */
  useEffect(() => {
    const byId = new Map(sounds.map((s) => [s.id, s]));
    for (const [id, player] of playersRef.current) {
      const sound = byId.get(id);
      if (sound) {
        player.audio.loop = Boolean(sound.loop);
        continue;
      }
      player.audio.pause();
      URL.revokeObjectURL(player.url);
      playersRef.current.delete(id);
      markStopped(id);
    }
  }, [sounds, markStopped]);

  /* Fermeture de l'application : on libere tout. */
  useEffect(() => {
    const players = playersRef.current;
    return () => {
      for (const player of players.values()) {
        player.audio.pause();
        URL.revokeObjectURL(player.url);
      }
      players.clear();
    };
  }, []);

  const value = useMemo(
    () => ({ playingIds, playingCount: playingIds.size, volume, setVolume, toggle, stopAll }),
    [playingIds, volume, setVolume, toggle, stopAll]
  );

  return <AmbianceContext.Provider value={value}>{children}</AmbianceContext.Provider>;
}
