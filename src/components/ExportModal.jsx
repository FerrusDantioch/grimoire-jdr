import { useState } from 'react';
import Modal from './Modal.jsx';
import Icon from './Icon.jsx';

const FORMATS = [
  {
    id: 'pdf',
    label: 'PDF',
    icon: 'file',
    hint: 'Mise en page soignee, prete a imprimer ou a partager.',
  },
  {
    id: 'txt',
    label: 'Texte',
    icon: 'edit3',
    hint: 'Fichier .txt structure, editable partout.',
  },
];

/**
 * Modale de confirmation d'export. `extra` permet d'ajouter des options
 * propres au contexte (par exemple : cette entree seule ou tout le journal).
 */
export default function ExportModal({ open, onClose, title = 'Exporter', subtitle, extra, onExport, busy = false }) {
  const [format, setFormat] = useState('pdf');

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Annuler
          </button>
          <button type="button" className="btn btn--primary" onClick={() => onExport(format)} disabled={busy}>
            <Icon name="download" />
            {busy ? 'Preparation…' : 'Telecharger'}
          </button>
        </>
      }
    >
      {subtitle ? <p className="small muted" style={{ marginTop: 0 }}>{subtitle}</p> : null}

      <div className="export-grid" role="radiogroup" aria-label="Format d'export">
        {FORMATS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="radio"
            aria-checked={format === f.id}
            className={`export-choice${format === f.id ? ' export-choice--on' : ''}`}
            onClick={() => setFormat(f.id)}
          >
            <Icon name={f.icon} size={24} />
            <strong>{f.label}</strong>
            <span className="small muted">{f.hint}</span>
          </button>
        ))}
      </div>

      {extra ? <div style={{ marginTop: 16 }}>{extra}</div> : null}
    </Modal>
  );
}
