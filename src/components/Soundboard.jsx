import { useCallback, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { useAmbiance } from '../state/AmbianceContext.jsx';
import { formatBytes, pickFiles } from '../lib/utils.js';
import Icon from './Icon.jsx';
import Modal, { ConfirmDialog } from './Modal.jsx';

const AUDIO_ACCEPT = 'audio/*,.mp3,.ogg,.wav,.m4a,.flac,.opus,.aac';
const AUDIO_EXT = /\.(mp3|ogg|wav|m4a|flac|opus|aac)$/i;

/**
 * Soundboard d'ambiances : chaque son est une pastille lecture/stop, avec
 * mode boucle, renommage et suppression. La lecture elle-meme est geree par
 * AmbianceContext, au-dessus des vues : quitter cet onglet ne coupe rien.
 */
export default function Soundboard() {
  const { sounds, addSounds, updateSound, deleteSound, toast } = useApp();
  const { playingIds, volume, setVolume, toggle, stopAll } = useAmbiance();

  const [importing, setImporting] = useState(false);
  const [renameTarget, setRenameTarget] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);

  // Le lecteur suit la nouvelle valeur `loop` via la liste des sons.
  const toggleLoop = useCallback((sound) => updateSound({ ...sound, loop: !sound.loop }), [updateSound]);

  const importSounds = useCallback(async () => {
    const files = await pickFiles({ accept: AUDIO_ACCEPT, multiple: true });
    if (!files.length) return;
    const audio = files.filter((f) => f.type.startsWith('audio/') || AUDIO_EXT.test(f.name));
    if (!audio.length) {
      toast('Aucun fichier audio reconnu.', 'err');
      return;
    }
    setImporting(true);
    try {
      const created = await addSounds(audio);
      toast(`${created.length} ambiance(s) ajoutée(s).`, 'ok');
    } catch (err) {
      console.error(err);
      toast("L'import a échoué (espace de stockage insuffisant ?).", 'err');
    } finally {
      setImporting(false);
    }
  }, [addSounds, toast]);

  const submitRename = useCallback(() => {
    const name = renameValue.trim();
    if (renameTarget && name) updateSound({ ...renameTarget, name });
    setRenameTarget(null);
  }, [renameTarget, renameValue, updateSound]);

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
            onChange={(e) => setVolume(e.target.value)}
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
