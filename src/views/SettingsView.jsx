import { useEffect, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import * as db from '../lib/db.js';
import { downloadBlob, formatBytes, pickFiles } from '../lib/utils.js';
import { useInstallPrompt, useOnline } from '../lib/usePwa.js';
import Icon from '../components/Icon.jsx';
import { ConfirmDialog } from '../components/Modal.jsx';

function Row({ icon, title, description, children }) {
  return (
    <div className="setting-row">
      <span className="setting-row__icon" aria-hidden="true">
        <Icon name={icon} size={18} />
      </span>
      <div className="setting-row__body">
        <strong>{title}</strong>
        {description && <span className="small muted">{description}</span>}
      </div>
      <div className="setting-row__action">{children}</div>
    </div>
  );
}

export default function SettingsView() {
  const { theme, changeTheme, characters, journal, documents, tracks, playlists, encounters, sounds, reloadAll, toast } = useApp();
  const { canInstall, installed, promptInstall } = useInstallPrompt();
  const online = useOnline();

  const [usage, setUsage] = useState(null);
  const [busy, setBusy] = useState('');
  const [confirmWipe, setConfirmWipe] = useState(false);

  const refreshUsage = () => db.storageEstimate().then(setUsage);
  useEffect(() => {
    refreshUsage();
  }, []);

  const exportBackup = async () => {
    setBusy('export');
    try {
      const dump = await db.exportBackup({ includeFiles: true });
      const blob = new Blob([JSON.stringify(dump)], { type: 'application/json' });
      const stamp = new Date().toISOString().slice(0, 10);
      downloadBlob(blob, `grimoire-sauvegarde-${stamp}.json`);
      toast('Sauvegarde téléchargée.', 'ok');
    } catch (err) {
      console.error(err);
      toast('La sauvegarde a échoué.', 'err');
    } finally {
      setBusy('');
    }
  };

  const importBackup = async () => {
    const [file] = await pickFiles({ accept: 'application/json,.json' });
    if (!file) return;
    setBusy('import');
    try {
      const dump = JSON.parse(await file.text());
      const { counts, skipped } = await db.importBackup(dump, { merge: true });
      await reloadAll();
      await refreshUsage();
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      toast(
        skipped
          ? `${total} élément(s) restauré(s), ${skipped} ligne(s) invalide(s) ignorée(s).`
          : `${total} élément(s) restauré(s).`,
        skipped ? 'err' : 'ok'
      );
    } catch (err) {
      console.error(err);
      toast(err.message || 'Fichier de sauvegarde invalide.', 'err');
    } finally {
      setBusy('');
    }
  };

  const counts = [
    { label: 'Personnages', value: characters.length },
    { label: 'Séances', value: journal.length },
    { label: 'Documents', value: documents.length },
    { label: 'Pistes', value: tracks.length },
    { label: 'Playlists', value: playlists.length },
    { label: 'Combats', value: encounters.length },
    { label: 'Ambiances', value: sounds.length },
  ];

  return (
    <>
      <div className="page-head">
        <h2>Réglages</h2>
      </div>

      <section className="card setting-group">
        <h3 className="setting-group__title">Apparence</h3>
        <Row icon={theme === 'grimoire' ? 'moon' : 'sun'} title="Thème" description="Sombre pour jouer le soir, clair pour le grand jour.">
          <div className="segmented segmented--inline">
            <button type="button" className={theme === 'grimoire' ? 'is-on' : ''} onClick={() => changeTheme('grimoire')}>
              Grimoire
            </button>
            <button type="button" className={theme === 'parchemin' ? 'is-on' : ''} onClick={() => changeTheme('parchemin')}>
              Parchemin
            </button>
          </div>
        </Row>
      </section>

      <section className="card setting-group">
        <h3 className="setting-group__title">Application</h3>
        <Row
          icon="download"
          title="Installer sur l’appareil"
          description={
            installed
              ? 'Déjà installée — elle s’ouvre comme une application.'
              : canInstall
                ? 'Ajoutez une icône et un lancement plein écran.'
                : 'Utilisez « Ajouter à l’écran d’accueil » dans le menu du navigateur.'
          }
        >
          <button type="button" className="btn btn--sm btn--primary" onClick={promptInstall} disabled={!canInstall || installed}>
            {installed ? 'Installée' : 'Installer'}
          </button>
        </Row>
        <Row
          icon="info"
          title="Fonctionnement hors ligne"
          description={
            online
              ? 'Connecté. Les fichiers de l’application sont en cache pour les coupures réseau.'
              : 'Hors ligne — toutes les fonctions restent disponibles.'
          }
        >
          <span className={`chip chip--static${online ? '' : ' chip--on'}`}>{online ? 'En ligne' : 'Hors ligne'}</span>
        </Row>
      </section>

      <section className="card setting-group">
        <h3 className="setting-group__title">Données</h3>

        <div className="stats-grid">
          {counts.map((c) => (
            <div key={c.label} className="stat">
              <strong>{c.value}</strong>
              <span className="small muted">{c.label}</span>
            </div>
          ))}
        </div>

        {usage && (
          <div className="storage">
            <div className="storage__bar">
              <span style={{ width: `${Math.min(100, Math.max(1, usage.ratio * 100))}%` }} />
            </div>
            <span className="small muted">
              {formatBytes(usage.usage)} utilisés sur {formatBytes(usage.quota)} disponibles
            </span>
          </div>
        )}

        <Row icon="save" title="Sauvegarder" description="Un fichier JSON contenant fiches, journal, PDF et musiques.">
          <button type="button" className="btn btn--sm" onClick={exportBackup} disabled={busy === 'export'}>
            <Icon name="download" />
            {busy === 'export' ? 'En cours…' : 'Exporter'}
          </button>
        </Row>

        <Row icon="upload" title="Restaurer" description="Fusionne le contenu du fichier avec les données actuelles.">
          <button type="button" className="btn btn--sm" onClick={importBackup} disabled={busy === 'import'}>
            <Icon name="upload" />
            {busy === 'import' ? 'En cours…' : 'Importer'}
          </button>
        </Row>

        <Row icon="trash" title="Tout effacer" description="Supprime définitivement l’ensemble des données locales.">
          <button type="button" className="btn btn--sm btn--danger" onClick={() => setConfirmWipe(true)}>
            Effacer
          </button>
        </Row>
      </section>

      <section className="card setting-group">
        <h3 className="setting-group__title">À propos</h3>
        <p className="small muted" style={{ padding: '0 14px 14px', margin: 0 }}>
          <strong>Grimoire</strong> — compagnon de jeu de rôle fonctionnant entièrement sur votre appareil.
          Aucune donnée n’est envoyée sur un serveur : fiches, journal, documents et musiques restent
          dans le stockage local du navigateur. Pensez à exporter une sauvegarde de temps en temps.
        </p>
        <p className="small muted" style={{ padding: '0 14px 14px', margin: 0 }}>
          Application développée par <strong>Ferrus Dantioch</strong> avec l’aide de l’intelligence
          artificielle. Distribuée sous licence MIT.
        </p>
      </section>

      <ConfirmDialog
        open={confirmWipe}
        title="Effacer toutes les données ?"
        message="Personnages, journal, documents, musiques et historique de dés seront définitivement supprimés. Exportez une sauvegarde avant si besoin."
        confirmLabel="Tout effacer"
        onConfirm={async () => {
          await db.wipeAll();
          await reloadAll();
          await refreshUsage();
          toast('Toutes les données ont été effacées.');
        }}
        onClose={() => setConfirmWipe(false)}
      />
    </>
  );
}
