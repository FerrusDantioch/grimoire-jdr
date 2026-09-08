import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { createJournalEntry } from '../lib/templates.js';
import { renderMarkdown, wordCount } from '../lib/markdown.js';
import { exportJournal } from '../lib/exporters.js';
import { debounce, formatDate, formatRelative } from '../lib/utils.js';
import Icon from '../components/Icon.jsx';
import ExportModal from '../components/ExportModal.jsx';
import { ConfirmDialog } from '../components/Modal.jsx';

const SANS_CHAPITRE = 'Sans chapitre';

/** Barre d'insertion markdown au-dessus de la zone de saisie. */
function MarkdownToolbar({ textareaRef, onChange }) {
  const wrap = (before, after = before, placeholder = 'texte') => {
    const el = textareaRef.current;
    if (!el) return;
    const { selectionStart: start, selectionEnd: end, value } = el;
    const selected = value.slice(start, end) || placeholder;
    const next = value.slice(0, start) + before + selected + after + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + before.length, start + before.length + selected.length);
    });
  };

  const prefix = (mark) => {
    const el = textareaRef.current;
    if (!el) return;
    const { selectionStart: start, value } = el;
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const next = value.slice(0, lineStart) + mark + value.slice(lineStart);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + mark.length, start + mark.length);
    });
  };

  const tools = [
    { icon: 'edit3', label: 'Titre', run: () => prefix('## ') },
    { label: 'G', title: 'Gras', run: () => wrap('**'), strong: true },
    { label: 'I', title: 'Italique', run: () => wrap('*'), em: true },
    { icon: 'list', label: 'Liste', run: () => prefix('- ') },
    { label: '"', title: 'Citation', run: () => prefix('> ') },
    { icon: 'link', label: 'Lien', run: () => wrap('[', '](https://)', 'lien') },
  ];

  return (
    <div className="md-toolbar">
      {tools.map((t) => (
        <button
          key={t.label}
          type="button"
          className="btn btn--sm btn--ghost"
          onClick={t.run}
          title={t.title || t.label}
          aria-label={t.title || t.label}
          style={{ fontWeight: t.strong ? 800 : 600, fontStyle: t.em ? 'italic' : 'normal' }}
        >
          {t.icon ? <Icon name={t.icon} /> : t.label}
        </button>
      ))}
    </div>
  );
}

function JournalEditor({ entry, onBack }) {
  const { saveEntry, deleteEntry, characters, characterNames, journal, toast } = useApp();
  const [draft, setDraft] = useState(entry);
  const [preview, setPreview] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportScope, setExportScope] = useState('entry');
  const [exporting, setExporting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [savedAt, setSavedAt] = useState(entry.updatedAt);
  const textareaRef = useRef(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  useEffect(() => {
    setDraft(entry);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.id]);

  const persist = useMemo(
    () =>
      debounce(async (value) => {
        const saved = await saveEntry(value);
        setSavedAt(saved.updatedAt);
      }, 700),
    [saveEntry]
  );

  const update = useCallback(
    (patch) => {
      setDraft((current) => {
        const next = { ...current, ...patch };
        persist(next);
        return next;
      });
    },
    [persist]
  );

  useEffect(() => () => persist.flush(draftRef.current), [persist]);

  const chapters = useMemo(
    () => [...new Set(journal.map((e) => e.chapter).filter(Boolean))],
    [journal]
  );

  const html = useMemo(() => (preview ? renderMarkdown(draft.content) : ''), [preview, draft.content]);

  const handleExport = async (format) => {
    setExporting(true);
    try {
      persist.flush(draftRef.current);
      const entries = exportScope === 'all' ? journal : [draftRef.current];
      await exportJournal(entries, format, { characterNames, title: "Journal d'aventure" });
      toast(`Journal exporte en ${format.toUpperCase()}.`, 'ok');
      setExportOpen(false);
    } catch (err) {
      console.error(err);
      toast("L'export a echoue.", 'err');
    } finally {
      setExporting(false);
    }
  };

  const toggleCharacter = (id) =>
    update({
      characterIds: draft.characterIds.includes(id)
        ? draft.characterIds.filter((c) => c !== id)
        : [...draft.characterIds, id],
    });

  return (
    <div className="editor">
      <div className="editor__bar">
        <button type="button" className="btn btn--ghost btn--icon" onClick={onBack} aria-label="Retour au journal">
          <Icon name="arrowLeft" />
        </button>
        <div className="editor__bar-meta">
          <span className="small muted">{savedAt ? `Enregistre ${formatRelative(savedAt)}` : ''}</span>
        </div>
        <button
          type="button"
          className={`btn btn--sm${preview ? ' btn--primary' : ''}`}
          onClick={() => setPreview((p) => !p)}
        >
          <Icon name="eye" />
          {preview ? 'Editer' : 'Apercu'}
        </button>
        <button type="button" className="btn btn--sm" onClick={() => setExportOpen(true)}>
          <Icon name="download" />
          <span className="hide-xs">Exporter</span>
        </button>
        <button
          type="button"
          className="btn btn--sm btn--danger btn--icon"
          onClick={() => setConfirmDelete(true)}
          aria-label="Supprimer l'entree"
        >
          <Icon name="trash" />
        </button>
      </div>

      <div className="card card--pad" style={{ display: 'grid', gap: 10 }}>
        <input
          className="editor__name"
          value={draft.title}
          onChange={(e) => update({ title: e.target.value })}
          placeholder="Titre de la seance"
          aria-label="Titre de la seance"
        />
        <div className="journal-meta">
          <label className="field" style={{ margin: 0 }}>
            <span className="label">Chapitre</span>
            <input
              className="input"
              list="chapitres"
              value={draft.chapter || ''}
              onChange={(e) => update({ chapter: e.target.value })}
              placeholder="Acte I, Les marches grises…"
            />
            <datalist id="chapitres">
              {chapters.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
          <label className="field" style={{ margin: 0 }}>
            <span className="label">Date</span>
            <input
              className="input"
              type="date"
              value={draft.date || ''}
              onChange={(e) => update({ date: e.target.value })}
            />
          </label>
        </div>

        {characters.length > 0 && (
          <div>
            <span className="label">Personnages presents</span>
            <div className="row row--wrap">
              {characters.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="chip"
                  aria-pressed={draft.characterIds.includes(c.id)}
                  onClick={() => toggleCharacter(c.id)}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {preview ? (
        <div className="card card--pad md-preview" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <div className="card">
          <MarkdownToolbar textareaRef={textareaRef} onChange={(content) => update({ content })} />
          <textarea
            ref={textareaRef}
            className="textarea journal-textarea"
            value={draft.content}
            onChange={(e) => update({ content: e.target.value })}
            placeholder={'Ce qui s’est passe cette seance…\n\n## Rencontres\n- Le passeur du gue\n\n> « Vous ne passerez pas sans peage. »'}
            aria-label="Contenu de la seance"
          />
        </div>
      )}

      <p className="small muted" style={{ textAlign: 'right', margin: 0 }}>
        {wordCount(draft.content)} mots
      </p>

      <ExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        title="Exporter le journal"
        subtitle="Choisissez le format et l’etendue de l’export."
        onExport={handleExport}
        busy={exporting}
        extra={
          <div>
            <span className="label">Etendue</span>
            <div className="row row--wrap">
              <button
                type="button"
                className="chip"
                aria-pressed={exportScope === 'entry'}
                onClick={() => setExportScope('entry')}
              >
                Cette seance
              </button>
              <button
                type="button"
                className="chip"
                aria-pressed={exportScope === 'all'}
                onClick={() => setExportScope('all')}
              >
                Tout le journal ({journal.length})
              </button>
            </div>
          </div>
        }
      />

      <ConfirmDialog
        open={confirmDelete}
        title="Supprimer cette seance ?"
        message={`« ${draft.title} » sera definitivement effacee.`}
        confirmLabel="Supprimer"
        onConfirm={async () => {
          persist.cancel();
          await deleteEntry(draft.id);
          toast('Seance supprimee.');
          onBack();
        }}
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  );
}

export default function JournalView({ openId, setOpenId }) {
  const { journal, saveEntry, characterNames, toast } = useApp();
  const [query, setQuery] = useState('');
  const [exportAllOpen, setExportAllOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const open = journal.find((e) => e.id === openId) || null;

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? journal.filter((e) =>
          [e.title, e.chapter, e.content].filter(Boolean).some((v) => v.toLowerCase().includes(q))
        )
      : journal;

    const map = new Map();
    for (const entry of list) {
      const key = entry.chapter?.trim() || SANS_CHAPITRE;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(entry);
    }
    for (const entries of map.values()) {
      entries.sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.updatedAt - a.updatedAt);
    }
    return [...map.entries()];
  }, [journal, query]);

  const create = async () => {
    const entry = createJournalEntry({ title: `Seance ${journal.length + 1}` });
    await saveEntry(entry);
    setOpenId(entry.id);
  };

  const handleExportAll = async (format) => {
    setExporting(true);
    try {
      await exportJournal(journal, format, { characterNames, title: "Journal d'aventure" });
      toast(`Journal exporte en ${format.toUpperCase()}.`, 'ok');
      setExportAllOpen(false);
    } catch (err) {
      console.error(err);
      toast("L'export a echoue.", 'err');
    } finally {
      setExporting(false);
    }
  };

  if (open) return <JournalEditor entry={open} onBack={() => setOpenId(null)} />;

  return (
    <>
      <div className="page-head">
        <h2>Journal</h2>
        <span className="spacer" />
        {journal.length > 0 && (
          <button type="button" className="btn btn--sm" onClick={() => setExportAllOpen(true)}>
            <Icon name="download" />
            <span className="hide-xs">Tout exporter</span>
          </button>
        )}
        <button type="button" className="btn btn--primary btn--sm" onClick={create}>
          <Icon name="plus" />
          Seance
        </button>
      </div>

      {journal.length > 3 && (
        <div className="field">
          <input
            className="input"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher dans le journal…"
            aria-label="Rechercher dans le journal"
          />
        </div>
      )}

      {grouped.length === 0 ? (
        <div className="empty">
          <span className="empty__icon">📖</span>
          <h3>{journal.length ? 'Aucun resultat' : 'Journal vide'}</h3>
          <p className="small">
            {journal.length
              ? 'Aucune seance ne correspond a cette recherche.'
              : 'Consignez vos seances, regroupees par chapitre.'}
          </p>
          {!journal.length && (
            <button type="button" className="btn btn--primary" onClick={create} style={{ marginTop: 12 }}>
              <Icon name="plus" />
              Premiere seance
            </button>
          )}
        </div>
      ) : (
        grouped.map(([chapter, entries]) => (
          <section key={chapter} className="journal-group">
            <h3 className="journal-group__title">
              {chapter}
              <span className="small muted"> · {entries.length}</span>
            </h3>
            <div className="journal-list">
              {entries.map((entry) => (
                <button key={entry.id} type="button" className="journal-item" onClick={() => setOpenId(entry.id)}>
                  <span className="journal-item__head">
                    <strong>{entry.title || 'Sans titre'}</strong>
                    <span className="small muted">{entry.date ? formatDate(entry.date) : ''}</span>
                  </span>
                  <span className="journal-item__excerpt small muted">
                    {entry.content.slice(0, 160).replace(/[#*>`_-]/g, '') || 'Vide'}
                  </span>
                  <span className="journal-item__foot small muted">
                    {(entry.characterIds || []).map((id) => characterNames[id]).filter(Boolean).join(', ')}
                    {entry.characterIds?.length ? ' · ' : ''}
                    {wordCount(entry.content)} mots
                  </span>
                </button>
              ))}
            </div>
          </section>
        ))
      )}

      <ExportModal
        open={exportAllOpen}
        onClose={() => setExportAllOpen(false)}
        title="Exporter tout le journal"
        subtitle={`${journal.length} seance(s) seront regroupees dans un seul fichier.`}
        onExport={handleExportAll}
        busy={exporting}
      />
    </>
  );
}
