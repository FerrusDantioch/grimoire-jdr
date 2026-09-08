import { useMemo, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { TEMPLATES, createCharacter } from '../lib/templates.js';
import { colorFromString, formatRelative, initials } from '../lib/utils.js';
import CharacterEditor from '../components/CharacterEditor.jsx';
import Modal from '../components/Modal.jsx';
import Icon from '../components/Icon.jsx';

export default function CharactersView({ openId, setOpenId }) {
  const { characters, saveCharacter, activeCharacterId, toast } = useApp();
  const [query, setQuery] = useState('');
  const [newOpen, setNewOpen] = useState(false);

  const open = characters.find((c) => c.id === openId) || null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return characters;
    return characters.filter((c) =>
      [c.name, c.system, c.role].filter(Boolean).some((v) => v.toLowerCase().includes(q))
    );
  }, [characters, query]);

  const create = async (templateId) => {
    const character = createCharacter(templateId);
    await saveCharacter(character);
    setNewOpen(false);
    setOpenId(character.id);
    toast('Fiche creee.', 'ok');
  };

  if (open) {
    return <CharacterEditor character={open} onBack={() => setOpenId(null)} />;
  }

  return (
    <>
      <div className="page-head">
        <h2>Personnages</h2>
        <span className="spacer" />
        <button type="button" className="btn btn--primary btn--sm" onClick={() => setNewOpen(true)}>
          <Icon name="plus" />
          Nouveau
        </button>
      </div>

      {characters.length > 3 && (
        <div className="field">
          <input
            className="input"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un personnage…"
            aria-label="Rechercher un personnage"
          />
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="empty">
          <span className="empty__icon">🎲</span>
          <h3>{characters.length ? 'Aucun resultat' : 'Aucun personnage'}</h3>
          <p className="small">
            {characters.length
              ? 'Essayez un autre terme de recherche.'
              : 'Creez une fiche : chaque categorie et chaque champ porte le nom que vous choisissez.'}
          </p>
          {!characters.length && (
            <button type="button" className="btn btn--primary" onClick={() => setNewOpen(true)} style={{ marginTop: 12 }}>
              <Icon name="plus" />
              Creer une fiche
            </button>
          )}
        </div>
      ) : (
        <div className="char-grid">
          {filtered.map((character) => {
            const fieldCount = character.sections.reduce((n, s) => n + s.fields.length, 0);
            return (
              <button key={character.id} type="button" className="char-card" onClick={() => setOpenId(character.id)}>
                <span
                  className="char-card__avatar"
                  style={{ background: colorFromString(character.id) }}
                  aria-hidden="true"
                >
                  {initials(character.name)}
                </span>
                <span className="char-card__body">
                  <span className="char-card__name">{character.name || 'Sans nom'}</span>
                  <span className="char-card__meta small muted">
                    {character.system && <span>{character.system}</span>}
                    {character.role && <span>· {character.role}</span>}
                    <span>· {character.sections.length} categories</span>
                    <span>· {fieldCount} champs</span>
                    {activeCharacterId === character.id && (
                      <span className="char-card__active">Des actifs</span>
                    )}
                  </span>
                  <span className="small muted">Modifie {formatRelative(character.updatedAt)}</span>
                </span>
                <Icon name="chevronRight" className="muted" />
              </button>
            );
          })}
        </div>
      )}

      <Modal open={newOpen} onClose={() => setNewOpen(false)} title="Nouvelle fiche">
        <p className="small muted" style={{ marginTop: 0 }}>
          Un modele sert de point de depart : tout reste renommable, deplacable et supprimable ensuite.
        </p>
        <div className="template-list">
          {TEMPLATES.map((t) => (
            <button key={t.id} type="button" className="template-card" onClick={() => create(t.id)}>
              <span className="template-card__icon" aria-hidden="true">{t.icon}</span>
              <span>
                <strong>{t.name}</strong>
                <span className="small muted">{t.description}</span>
              </span>
              <Icon name="chevronRight" className="muted" />
            </button>
          ))}
        </div>
      </Modal>
    </>
  );
}
