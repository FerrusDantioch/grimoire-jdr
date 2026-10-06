import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import * as db from '../lib/db.js';
import { formatBytes, pickFiles } from '../lib/utils.js';
import Icon from './Icon.jsx';
import Modal, { ConfirmDialog } from './Modal.jsx';

const AUDIO_ACCEPT = 'audio/*,.mp3,.ogg,.wav,.m4a,.flac,.opus,.aac';

/**
 * Soundboard d'ambiances : chaque son est une pastille lecture/stop, avec
 * mode boucle, renommage et suppression. Les lecteurs audio sont crees a la
 * volee et gardes dans une Map (hors rendu React) ; les URL d'objet sont
 * revoquees au demontage.
 */
export default function Soundboard() {
  const { sounds, addSounds, updateSound, deleteSound, toast } = useApp();

  const playersRef = useRef(new Map()); // id -> { audio, url }
  const [playingIds, setPlayingIds] = useState(new Set());
  const [importing, setImporting] = useState(false);
  const [volume, setVolume] = useState(0.9);
  const [renameTarget, setRenameTarget] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);

  /* Volume global persiste dans les reglages. */
  useEffect(() => {
    db.getSetting('sfxVolume', 0.9).then((v) => {
      const num = Number(v);
      if (Number.isFinite(num)) setVolume(Math.max(0, Math.min(1, num)));
    });
  }, []);

  const changeVolume = useCallback((value) => {
    const v = Math.max(0, Math.min(1, Number(value) || 0));
    setVolume(v);
    db.setSetting('sfxVolume', v).catch(() => {});
    for (const { audio } of playersRef.current.values()) audio.volume = v;
  }, []);

  const getPlayer = useCallback(
    (sound) => {
      let player = playersRef.current.get(sound.id);
      if (!player) {
        const url = URL.createObjectURL(sound.blob);
        const audio = new Audio(url);
        audio.volume = volume;
        audio.addEventListener('ended', () => {
          setPlayingIds((set) => {
            const next = new Set(set);
            next.delete(sound.id);
            return next;
          });
        });
        player = { audio, url };
        playersRef.current.set(sound.id, player);
      }
      return player;
    },
    [volume]
  );

  const toggle = useCallback(
    (sound) => {
      const { audio } = getPlayer(sound);
      if (playingIds.has(sound.id)) {
        audio.pause();
        audio.currentTime = 0;
        setPlayingIds((set) => {
          const next = new Set(set);
          next.delete(sound.id);
          return next;
        });
      } else {
        audio.loop = Boolean(sound.loop);
        audio.currentTime = 0;
        audio.play().then(() => {
          setPlayingIds((set) => new Set(set).add(sound.id));
        }).catch(() => {
          toast('Lecture impossible pour ce fichier.', 'err');
        });
      }
    },
    [getPlayer, playingIds, toast]
  );

  const stopAll = useCallback(() => {
    for (const { audio } of playersRef.current.values()) {
      audio.pause();
      audio.currentTime = 0;
    }
    setPlayingIds(new Set());
  }, []);

  const toggleLoop = useCallback(
    (sound) => {
      const next = { ...sound, loop: !sound.loop };
      updateSound(next);
      const player = playersRef.current.get(sound.id);
      if (player) player.audio.loop = next.loop;
    },
    [updateSound]
  );

  const importSounds = useCallback(async () => {
    const files = await pickFiles({ accept: AUDIO_ACCEPT, multiple: true });
    if (!files.length) return;
    setImporting(true);
    try {
      const created = await addSounds(files);
      toast(`${created.length} ambiance(s) ajoutée(s).`, 'ok');
    } finally {
      setImporting(false);
    }
  }, [addSounds, toast]);

  const submitRename = useCallback(() => {
    const name = renameValue.trim();
    if (renameTarget && name) updateSound({ ...renameTarget, name });
    setRenameTarget(null);
  }, [renameTarget, renameValue, updateSound]);

  /* Supprime les lecteurs des sons qui n'existent plus. */
  useEffect(() => {
    const ids = new Set(sounds.map((s) => s.id));
    for (const [id, player] of playersRef.current) {
      if (!ids.has(id)) {
        player.audio.pause();
        URL.revokeObjectURL(player.url);
        playersRef.current.delete(id);
      }
    }
    setPlayingIds((set) => new Set([...set].filter((id) => ids.has(id))));
  }, [sounds]);

  /* Nettoyage au demontage. */
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

  return (
    <div className="soundboard">
      <div className="soundboard__bar">
        <button type="button" className="btn btn--sm" onClick={importSounds} disabled={importing}>
          <Icon name="upload" />
          {importing ? 'Import…' : 'Importer'}
        </button>
        {playingIds.size > 0 && (
          <button type="button" className="btn btn--sm btn--danger" onClick={stopAll}>
            <Icon name="x" />
            Tout arrêter
          </button>
        )}
        <span className="spacer" />
        <label className="soundboard__volume" title="Volume des ambiances">
          <Icon name="music" size={14} />
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(e) => changeVolume(e.target.value)}
            aria-label="Volume des ambiances"
          />
        </label>
      </div>

      {sounds.length === 0 ? (
        <div className="empty">
          <span className="empty__icon">🔊</span>
          <h3>Aucune ambiance</h3>
          <p className="small">
            Importez des effets sonores — pluie, taverne, donjon — et déclenchez-les d'un tap pendant la
            partie. Le mode boucle les fait tourner en continu.
          </p>
          <button type="button" className="btn btn--primary" onClick={importSounds} style={{ marginTop: 12 }}>
            <Icon name="upload" />
            Importer des effets
          </button>
        </div>
      ) : (
        <div className="pad-grid">
          {sounds.map((sound) => {
            const playing = playingIds.has(sound.id);
            return (
              <div key={sound.id} className={`pad${playing ? ' pad--playing' : ''}`}>
                <button
                  type="button"
                  className="pad__play"
                  onClick={() => toggle(sound)}
                  aria-label={playing ? `Arrêter ${sound.name}` : `Jouer ${sound.name}`}
                >
                  <Icon name={playing ? 'x' : 'play'} size={20} />
                  <span className="pad__name">{sound.name}</span>
                  <span className="small muted">{formatBytes(sound.size)}</span>
                </button>
                <div className="pad__tools">
                  <button
                    type="button"
                    className={`btn btn--ghost btn--icon btn--sm${sound.loop ? ' chip--on' : ''}`}
                    onClick={() => toggleLoop(sound)}
                    aria-label={`Lecture en boucle pour ${sound.name}`}
                    title="Lecture en boucle"
                  >
                    <Icon name="refresh" size={14} />
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost btn--icon btn--sm"
                    onClick={() => {
                      setRenameTarget(sound);
                      setRenameValue(sound.name);
                    }}
                    aria-label={`Renommer ${sound.name}`}
                  >
                    <Icon name="edit3" size={14} />
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost btn--icon btn--sm"
                    onClick={() => setDeleteTarget(sound)}
                    aria-label={`Supprimer ${sound.name}`}
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={Boolean(renameTarget)} onClose={() => setRenameTarget(null)} title="Renommer l'ambiance">
        <div className="field">
          <input
            className="input"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitRename()}
            aria-label="Nouveau nom"
          />
        </div>
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
          <button type="button" className="btn" onClick={() => setRenameTarget(null)}>
            Annuler
          </button>
          <button type="button" className="btn btn--primary" onClick={submitRename} disabled={!renameValue.trim()}>
            Renommer
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Supprimer cette ambiance ?"
        message={`« ${deleteTarget?.name || ''} » sera définitivement retirée du soundboard.`}
        confirmLabel="Supprimer"
        onConfirm={async () => {
          await deleteSound(deleteTarget.id);
          setDeleteTarget(null);
          toast('Ambiance supprimée.');
        }}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
