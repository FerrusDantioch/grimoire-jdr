import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { useDice } from '../state/DiceContext.jsx';
import { FIELD_TYPES, field as makeField, section as makeSection } from '../lib/templates.js';
import { MOD_MODES, statToModifier } from '../lib/dice.js';
import { exportCharacter } from '../lib/exporters.js';
import { debounce, formatRelative, move } from '../lib/utils.js';
import Icon from './Icon.jsx';
import ExportModal from './ExportModal.jsx';
import { ConfirmDialog } from './Modal.jsx';
import './characters.css';

/** Ligne d'edition d'un champ : libelle, valeur et reglages replies. */
function FieldRow({ field, onChange, onRemove, onMove, isFirst, isLast }) {
  const [open, setOpen] = useState(false);
  const modifier = field.type === 'number' && field.useAsModifier ? statToModifier(field.value, field.modMode) : null;

  return (
    <div className={`fieldrow${open ? ' fieldrow--open' : ''}`}>
      <div className="fieldrow__main">
        <input
          className="input fieldrow__label"
          value={field.label}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder="Nom du champ"
          aria-label="Nom du champ"
        />

        {field.type === 'longtext' ? (
          <textarea
            className="textarea fieldrow__value"
            value={field.value ?? ''}
            onChange={(e) => onChange({ value: e.target.value })}
            placeholder="…"
            aria-label={`Valeur de ${field.label}`}
            rows={3}
          />
        ) : field.type === 'select' ? (
          <select
            className="select fieldrow__value"
            value={field.value ?? ''}
            onChange={(e) => onChange({ value: e.target.value })}
            aria-label={`Valeur de ${field.label}`}
          >
            <option value="">—</option>
            {(field.options || []).map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        ) : field.type === 'checkbox' ? (
          <label className="fieldrow__check">
            <input
              type="checkbox"
              checked={Boolean(field.value)}
              onChange={(e) => onChange({ value: e.target.checked })}
            />
            <span>{field.value ? 'Oui' : 'Non'}</span>
          </label>
        ) : (
          <input
            className="input fieldrow__value"
            type={field.type === 'number' ? 'number' : 'text'}
            value={field.value ?? ''}
            onChange={(e) => onChange({ value: field.type === 'number' ? e.target.value : e.target.value })}
            placeholder={field.type === 'number' ? '0' : '…'}
            aria-label={`Valeur de ${field.label}`}
            inputMode={field.type === 'number' ? 'numeric' : undefined}
          />
        )}

        {modifier !== null && (
          <span className="fieldrow__mod" title="Modificateur applicable aux jets de des">
            {modifier >= 0 ? `+${modifier}` : modifier}
          </span>
        )}

        <button
          type="button"
          className={`btn btn--ghost btn--icon btn--sm${open ? ' is-on' : ''}`}
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={`Reglages du champ ${field.label}`}
        >
          <Icon name="settings" />
        </button>
      </div>

      {open && (
        <div className="fieldrow__settings">
          <div className="fieldrow__settings-grid">
            <label className="field" style={{ margin: 0 }}>
              <span className="label">Type</span>
              <select
                className="select"
                value={field.type}
                onChange={(e) => {
                  const type = e.target.value;
                  onChange({
                    type,
                    value: type === 'checkbox' ? Boolean(field.value) : type === 'number' ? Number(field.value) || 0 : String(field.value ?? ''),
                    useAsModifier: type === 'number' ? field.useAsModifier : false,
                  });
                }}
              >
                {FIELD_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>

            {field.type === 'number' && (
              <label className="field" style={{ margin: 0 }}>
                <span className="label">Calcul du modificateur</span>
                <select
                  className="select"
                  value={field.modMode || 'raw'}
                  onChange={(e) => onChange({ modMode: e.target.value })}
                  disabled={!field.useAsModifier}
                >
                  {MOD_MODES.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          {field.type === 'number' && (
            <label className="fieldrow__toggle">
              <input
                type="checkbox"
                checked={Boolean(field.useAsModifier)}
                onChange={(e) => onChange({ useAsModifier: e.target.checked })}
              />
              <span>
                Utilisable comme modificateur de des
                <em className="small muted">
                  {' '}
                  — {MOD_MODES.find((m) => m.id === (field.modMode || 'raw'))?.hint}
                </em>
              </span>
            </label>
          )}

          {field.type === 'select' && (
            <label className="field" style={{ margin: 0 }}>
              <span className="label">Options (une par ligne)</span>
              <textarea
                className="textarea"
                rows={3}
                value={(field.options || []).join('\n')}
                onChange={(e) =>
                  onChange({ options: e.target.value.split('\n').map((o) => o.trim()).filter(Boolean) })
                }
                placeholder={'Novice\nAguerri\nMaitre'}
              />
            </label>
          )}

          <div className="fieldrow__actions">
            <button type="button" className="btn btn--sm" onClick={() => onMove(-1)} disabled={isFirst}>
              <Icon name="chevronUp" />
              Monter
            </button>
            <button type="button" className="btn btn--sm" onClick={() => onMove(1)} disabled={isLast}>
              <Icon name="chevronDown" />
              Descendre
            </button>
            <span className="spacer" />
            <button type="button" className="btn btn--sm btn--danger" onClick={onRemove}>
              <Icon name="trash" />
              Supprimer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CharacterEditor({ character, onBack }) {
  const { saveCharacter, deleteCharacter, activateCharacter, activeCharacterId, toast } = useApp();
  const { setPanelOpen } = useDice();

  const [draft, setDraft] = useState(character);
  const [collapsed, setCollapsed] = useState({});
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [savedAt, setSavedAt] = useState(character.updatedAt);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  // La fiche ouverte devient la fiche active : ses caracteristiques
  // alimentent le lanceur de des.
  useEffect(() => {
    if (activeCharacterId !== character.id) activateCharacter(character.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [character.id]);

  useEffect(() => {
    setDraft(character);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [character.id]);

  const persist = useMemo(
    () =>
      debounce(async (value) => {
        const saved = await saveCharacter(value);
        setSavedAt(saved.updatedAt);
      }, 600),
    [saveCharacter]
  );

  // Sauvegarde differee a chaque modification, et immediate a la fermeture.
  const update = useCallback(
    (patch) => {
      setDraft((current) => {
        const next = typeof patch === 'function' ? patch(current) : { ...current, ...patch };
        persist(next);
        return next;
      });
    },
    [persist]
  );

  useEffect(
    () => () => {
      persist.flush(draftRef.current);
    },
    [persist]
  );

  /* ---------- categories ---------- */
  const addSection = () =>
    update((c) => ({ ...c, sections: [...c.sections, makeSection('Nouvelle categorie', [])] }));

  const patchSection = (sectionId, patch) =>
    update((c) => ({
      ...c,
      sections: c.sections.map((s) => (s.id === sectionId ? { ...s, ...patch } : s)),
    }));

  const removeSection = (sectionId) =>
    update((c) => ({ ...c, sections: c.sections.filter((s) => s.id !== sectionId) }));

  const moveSection = (index, delta) =>
    update((c) => ({ ...c, sections: move(c.sections, index, index + delta) }));

  /* ---------- champs ---------- */
  const addField = (sectionId) =>
    update((c) => ({
      ...c,
      sections: c.sections.map((s) =>
        s.id === sectionId ? { ...s, fields: [...s.fields, makeField('Nouveau champ', 'text', '')] } : s
      ),
    }));

  const patchField = (sectionId, fieldId, patch) =>
    update((c) => ({
      ...c,
      sections: c.sections.map((s) =>
        s.id === sectionId
          ? { ...s, fields: s.fields.map((f) => (f.id === fieldId ? { ...f, ...patch } : f)) }
          : s
      ),
    }));

  const removeField = (sectionId, fieldId) =>
    update((c) => ({
      ...c,
      sections: c.sections.map((s) =>
        s.id === sectionId ? { ...s, fields: s.fields.filter((f) => f.id !== fieldId) } : s
      ),
    }));

  const moveField = (sectionId, index, delta) =>
    update((c) => ({
      ...c,
      sections: c.sections.map((s) =>
        s.id === sectionId ? { ...s, fields: move(s.fields, index, index + delta) } : s
      ),
    }));

  const modifierCount = useMemo(
    () =>
      draft.sections.reduce(
        (n, s) => n + s.fields.filter((f) => f.type === 'number' && f.useAsModifier).length,
        0
      ),
    [draft.sections]
  );

  const handleExport = async (format) => {
    setExporting(true);
    try {
      persist.flush(draftRef.current);
      await exportCharacter(draftRef.current, format);
      toast(`Fiche exportee en ${format.toUpperCase()}.`, 'ok');
      setExportOpen(false);
    } catch (err) {
      console.error(err);
      toast("L'export a echoue.", 'err');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="editor">
      <div className="editor__bar">
        <button type="button" className="btn btn--ghost btn--icon" onClick={onBack} aria-label="Retour a la liste">
          <Icon name="arrowLeft" />
        </button>
        <div className="editor__bar-meta">
          <span className="small muted">
            {savedAt ? `Enregistre ${formatRelative(savedAt)}` : 'Non enregistre'}
          </span>
        </div>
        <button type="button" className="btn btn--sm" onClick={() => setExportOpen(true)}>
          <Icon name="download" />
          Exporter
        </button>
        <button
          type="button"
          className="btn btn--sm btn--danger btn--icon"
          onClick={() => setConfirmDelete(true)}
          aria-label="Supprimer le personnage"
        >
          <Icon name="trash" />
        </button>
      </div>

      <div className="editor__identity card card--pad">
        <input
          className="editor__name"
          value={draft.name}
          onChange={(e) => update({ name: e.target.value })}
          placeholder="Nom du personnage"
          aria-label="Nom du personnage"
        />
        <div className="editor__identity-row">
          <input
            className="input"
            value={draft.system || ''}
            onChange={(e) => update({ system: e.target.value })}
            placeholder="Systeme de jeu"
            aria-label="Systeme de jeu"
          />
          <input
            className="input"
            value={draft.role || ''}
            onChange={(e) => update({ role: e.target.value })}
            placeholder="Classe, role, archetype…"
            aria-label="Role"
          />
        </div>
        <button type="button" className="editor__dicehint" onClick={() => setPanelOpen(true)}>
          <Icon name="dice" size={16} />
          {modifierCount > 0
            ? `${modifierCount} caracteristique${modifierCount > 1 ? 's' : ''} disponible${modifierCount > 1 ? 's' : ''} comme modificateur — ouvrir les des`
            : 'Aucun modificateur : activez l’option sur un champ numerique'}
        </button>
      </div>

      {draft.sections.map((section, sIndex) => {
        const isCollapsed = collapsed[section.id];
        return (
          <section key={section.id} className="sectioncard card">
            <header className="sectioncard__head">
              <button
                type="button"
                className="btn btn--ghost btn--icon btn--sm"
                onClick={() => setCollapsed((c) => ({ ...c, [section.id]: !c[section.id] }))}
                aria-expanded={!isCollapsed}
                aria-label={isCollapsed ? 'Deplier la categorie' : 'Replier la categorie'}
              >
                <Icon name={isCollapsed ? 'chevronRight' : 'chevronDown'} />
              </button>
              <input
                className="sectioncard__name"
                value={section.name}
                onChange={(e) => patchSection(section.id, { name: e.target.value })}
                placeholder="Nom de la categorie"
                aria-label="Nom de la categorie"
              />
              <span className="small muted sectioncard__count">{section.fields.length}</span>
              <button
                type="button"
                className="btn btn--ghost btn--icon btn--sm"
                onClick={() => moveSection(sIndex, -1)}
                disabled={sIndex === 0}
                aria-label="Monter la categorie"
              >
                <Icon name="chevronUp" />
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--icon btn--sm"
                onClick={() => moveSection(sIndex, 1)}
                disabled={sIndex === draft.sections.length - 1}
                aria-label="Descendre la categorie"
              >
                <Icon name="chevronDown" />
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--icon btn--sm"
                onClick={() => removeSection(section.id)}
                aria-label="Supprimer la categorie"
              >
                <Icon name="trash" />
              </button>
            </header>

            {!isCollapsed && (
              <div className="sectioncard__body">
                {section.fields.map((f, fIndex) => (
                  <FieldRow
                    key={f.id}
                    field={f}
                    isFirst={fIndex === 0}
                    isLast={fIndex === section.fields.length - 1}
                    onChange={(patch) => patchField(section.id, f.id, patch)}
                    onRemove={() => removeField(section.id, f.id)}
                    onMove={(delta) => moveField(section.id, fIndex, delta)}
                  />
                ))}
                <button type="button" className="btn btn--sm btn--block" onClick={() => addField(section.id)}>
                  <Icon name="plus" />
                  Ajouter un champ
                </button>
              </div>
            )}
          </section>
        );
      })}

      <button type="button" className="btn btn--block" onClick={addSection}>
        <Icon name="plus" />
        Ajouter une categorie
      </button>

      <section className="card card--pad" style={{ marginTop: 14 }}>
        <span className="label">Notes libres</span>
        <textarea
          className="textarea"
          rows={5}
          value={draft.notes || ''}
          onChange={(e) => update({ notes: e.target.value })}
          placeholder="Historique, contacts, objectifs… (markdown accepte)"
        />
      </section>

      <ExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        title={`Exporter « ${draft.name} »`}
        subtitle="Choisissez le format du fichier a telecharger."
        onExport={handleExport}
        busy={exporting}
      />

      <ConfirmDialog
        open={confirmDelete}
        title="Supprimer ce personnage ?"
        message={`« ${draft.name} » et toutes ses categories seront definitivement effaces. Cette action est irreversible.`}
        confirmLabel="Supprimer"
        onConfirm={async () => {
          persist.cancel();
          await deleteCharacter(draft.id);
          toast('Personnage supprime.');
          onBack();
        }}
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  );
}
