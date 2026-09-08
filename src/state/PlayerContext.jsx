import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as db from '../lib/db.js';
import { useApp } from './AppContext.jsx';

const PlayerContext = createContext(null);

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer doit etre utilise dans <PlayerProvider>');
  return ctx;
}

export const REPEAT_MODES = ['off', 'all', 'one'];

/**
 * Lecteur audio global. L'element <audio> vit ici, au-dessus des vues :
 * la lecture continue quand on change d'onglet, et l'API Media Session
 * expose les commandes sur l'ecran de verrouillage / la barre systeme.
 */
export function PlayerProvider({ children }) {
  const { tracks, updateTrack, toast } = useApp();

  const audioRef = useRef(null);
  if (!audioRef.current && typeof Audio !== 'undefined') {
    audioRef.current = new Audio();
    audioRef.current.preload = 'metadata';
  }

  const urlRef = useRef(null);
  const [queue, setQueue] = useState([]);
  const [queueLabel, setQueueLabel] = useState('Toutes les pistes');
  const [index, setIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolumeState] = useState(0.8);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState('off');

  const trackById = useMemo(() => new Map(tracks.map((t) => [t.id, t])), [tracks]);
  const currentId = index >= 0 ? queue[index] : null;
  const current = currentId ? trackById.get(currentId) || null : null;

  /* ---------- reglages persistants ---------- */
  useEffect(() => {
    (async () => {
      const [v, r, s] = await Promise.all([
        db.getSetting('volume', 0.8),
        db.getSetting('repeat', 'off'),
        db.getSetting('shuffle', false),
      ]);
      setVolumeState(v);
      setRepeat(REPEAT_MODES.includes(r) ? r : 'off');
      setShuffle(Boolean(s));
      if (audioRef.current) audioRef.current.volume = v;
    })();
  }, []);

  const setVolume = useCallback((v) => {
    const clamped = Math.min(1, Math.max(0, v));
    setVolumeState(clamped);
    if (audioRef.current) audioRef.current.volume = clamped;
    db.setSetting('volume', clamped);
  }, []);

  const toggleShuffle = useCallback(() => {
    setShuffle((s) => {
      db.setSetting('shuffle', !s);
      return !s;
    });
  }, []);

  const cycleRepeat = useCallback(() => {
    setRepeat((r) => {
      const next = REPEAT_MODES[(REPEAT_MODES.indexOf(r) + 1) % REPEAT_MODES.length];
      db.setSetting('repeat', next);
      return next;
    });
  }, []);

  /* ---------- source audio ---------- */
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!current?.blob) {
      audio.removeAttribute('src');
      audio.load();
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
      setDuration(0);
      setPosition(0);
      return;
    }

    const url = URL.createObjectURL(current.blob);
    const previous = urlRef.current;
    urlRef.current = url;
    audio.src = url;
    audio.load();
    if (playing) {
      audio.play().catch((err) => {
        console.warn('[audio] lecture refusee', err);
        setPlaying(false);
      });
    }
    if (previous) URL.revokeObjectURL(previous);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    []
  );

  /* ---------- evenements de l'element audio ---------- */
  const goNext = useCallback(
    (auto = false) => {
      setIndex((i) => {
        if (queue.length === 0) return -1;
        if (shuffle) {
          if (queue.length === 1) return i;
          let next = i;
          while (next === i) next = Math.floor(Math.random() * queue.length);
          return next;
        }
        if (i + 1 < queue.length) return i + 1;
        if (repeat === 'all') return 0;
        if (auto) {
          setPlaying(false);
          return i;
        }
        return 0;
      });
    },
    [queue, repeat, shuffle]
  );

  const goPrev = useCallback(() => {
    const audio = audioRef.current;
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    setIndex((i) => (i > 0 ? i - 1 : Math.max(0, queue.length - 1)));
  }, [queue.length]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTime = () => setPosition(audio.currentTime);
    const onDuration = () => {
      setDuration(audio.duration || 0);
      // Memorise la duree sur la piste pour l'afficher dans la liste.
      if (current && !current.duration && Number.isFinite(audio.duration)) {
        updateTrack({ ...current, duration: audio.duration });
      }
    };
    const onEnded = () => {
      if (repeat === 'one') {
        audio.currentTime = 0;
        audio.play().catch(() => {});
        return;
      }
      goNext(true);
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onError = () => {
      if (audio.getAttribute('src')) {
        toast(`Lecture impossible : ${current?.name || 'piste inconnue'}`, 'err');
        setPlaying(false);
      }
    };

    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onDuration);
    audio.addEventListener('durationchange', onDuration);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('error', onError);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onDuration);
      audio.removeEventListener('durationchange', onDuration);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('error', onError);
    };
  }, [current, repeat, goNext, updateTrack, toast]);

  /* ---------- commandes ---------- */
  const play = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !current) return;
    audio.play().catch((err) => {
      console.warn('[audio] lecture refusee', err);
      toast('Le navigateur a refuse la lecture automatique.', 'err');
    });
  }, [current, toast]);

  const pause = useCallback(() => audioRef.current?.pause(), []);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !current) return;
    if (audio.paused) play();
    else audio.pause();
  }, [current, play]);

  const seek = useCallback((seconds) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(seconds)) return;
    audio.currentTime = Math.max(0, Math.min(audio.duration || 0, seconds));
    setPosition(audio.currentTime);
  }, []);

  /** Demarre une file de lecture. `startId` choisit la piste de depart. */
  const playQueue = useCallback(
    (trackIds, { startId = null, label = 'Toutes les pistes' } = {}) => {
      const ids = trackIds.filter((id) => trackById.has(id));
      if (!ids.length) {
        toast('Aucune piste jouable dans cette selection.', 'err');
        return;
      }
      const start = startId ? Math.max(0, ids.indexOf(startId)) : 0;
      setQueue(ids);
      setQueueLabel(label);
      setIndex(start);
      setPlaying(true);
      // La lecture demarre dans l'effet de changement de source.
      requestAnimationFrame(() => audioRef.current?.play().catch(() => {}));
    },
    [trackById, toast]
  );

  // Une piste supprimee doit sortir de la file.
  useEffect(() => {
    setQueue((q) => {
      const filtered = q.filter((id) => trackById.has(id));
      return filtered.length === q.length ? q : filtered;
    });
  }, [trackById]);

  /* ---------- Media Session (ecran de verrouillage) ---------- */
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    if (!current) {
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = 'none';
      return;
    }
    navigator.mediaSession.metadata = new MediaMetadata({
      title: current.name,
      artist: queueLabel,
      album: 'Grimoire — Compagnon JDR',
      // BASE_URL, et non un chemin absolu : l'application peut etre servie
      // depuis un sous-repertoire (GitHub Pages).
      artwork: [
        { src: `${import.meta.env.BASE_URL}icons/icon-192.png`, sizes: '192x192', type: 'image/png' },
        { src: `${import.meta.env.BASE_URL}icons/icon-512.png`, sizes: '512x512', type: 'image/png' },
      ],
    });
    navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';

    const handlers = [
      ['play', () => play()],
      ['pause', () => pause()],
      ['nexttrack', () => goNext(false)],
      ['previoustrack', () => goPrev()],
      ['seekto', (e) => e.seekTime != null && seek(e.seekTime)],
    ];
    for (const [action, handler] of handlers) {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        /* action non supportee */
      }
    }
    return () => {
      for (const [action] of handlers) {
        try {
          navigator.mediaSession.setActionHandler(action, null);
        } catch {
          /* ignore */
        }
      }
    };
  }, [current, playing, queueLabel, play, pause, goNext, goPrev, seek]);

  const value = useMemo(
    () => ({
      current,
      queue,
      queueLabel,
      index,
      playing,
      volume,
      setVolume,
      position,
      duration,
      shuffle,
      toggleShuffle,
      repeat,
      cycleRepeat,
      play,
      pause,
      togglePlay,
      next: () => goNext(false),
      prev: goPrev,
      seek,
      playQueue,
      stop: () => {
        pause();
        setIndex(-1);
        setQueue([]);
      },
    }),
    [
      current, queue, queueLabel, index, playing, volume, setVolume, position, duration,
      shuffle, toggleShuffle, repeat, cycleRepeat, play, pause, togglePlay, goNext, goPrev,
      seek, playQueue,
    ]
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}
