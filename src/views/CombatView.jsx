import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { debounce, formatRelative, uid } from '../lib/utils.js';
import Icon from '../components/Icon.jsx';
import { ConfirmDialog } from '../components/Modal.jsx';
import './combat.css';

/** Combatant type : initiative numerique, PV optionnels, note libre (etats). */
const newCombatant = (overrides = {}) => ({
  id: uid('cb'),
  name: '',
  initiative: 10,
  hp: null,
  hpMax: null,
  note: '',
  characterId: null,
  ...overrides,
});

export function createEncounter(overrides = {}) {
  const now = Date.now();
  return {
    id: uid('enc'),
    name: 'Nouveau combat',
    combatants: [],
    turnId: null,
    round: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/**
 * Detecte initiative et points de vie dans une fiche, a partir des noms de
 * champs (« Initiative », « Points de vie », « PV maximum »…). Tout reste
 * modifiable ensuite dans le tracker.
 */
function combatantFromCharacter(character) {
  let initiative = 10;
  let hp = null;
  let hpMax = null;
  for (const section of character.sections || []) {
    for (const field of section.fields || []) {
      if (field.type !== 'number') continue;
      const label = String(field.label || '').toLowerCase();
      const value = Number(field.value);
      if (!Number.isFinite(value)) continue;
      if (/init/.test(label)) initiative = value;
      else if (/max/.test(label) && /(vie|pv|hp)/.test(label)) hpMax = value;
      else if (/(point.*vie|^pv$|^pv\b|^hp$|^hp\b|vie)/.test(label) && hp === null) hp = value;
    }
  }
  if (hp !== null && hpMax === null) hpMax = hp;
  if (hp === null && hpMax !== null) hp = hpMax;
  return newCombatant({
    name: character.name || 'Sans nom',
    initiative,
    hp,
    hpMax,
    characterId: character.id,
  });
}

/* =========================================================
   Tracker d'un combat
   ========================================================= */

function Tracker({ encounter, onBack }) {
  const { saveEncounter, deleteEncounter, characters, toast } = useApp();

  const [draft, setDraft] = useState(encounter);
  const [form, setForm] = useState({ name: '', initiative: '', hp: '' });
  const [confirmFinish, setConfirmFinish] = useState(false);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  useEffect(() => {
    setDraft(encounter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [encounter.id]);

  const persist = useMemo(
    () => debounce((value) => saveEncounter(value), 500),
    [saveEncounter]
  );

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

  useEffect(() => () => persist.flush(draftRef.current), [persist]);

  /* Ordre de jeu : initiative decroissante. */
  const sorted = useMemo(
    () => [...draft.combatants].sort((a, b) => b.initiative - a.initiative || a.name.localeCompare(b.name)),
    [draft.combatants]
  );

  const activeIndex = sorted.findIndex((c) => c.id === draft.turnId);

  // Le tour pointe un combatant supprime : on repart a zero.
  useEffect(() => {
    if (draft.turnId && activeIndex === -1) update({ turnId: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.turnId, activeIndex]);

  const nextTurn = useCallback(() => {
    update((current) => {
      if (!sorted.length) return current;
      const idx = sorted.findIndex((c) => c.id === current.turnId);
      const nextIdx = idx + 1;
      if (nextIdx >= sorted.length) {
        return { ...current, turnId: sorted[0].id, round: current.round + 1 };
      }
      return { ...current, turnId: sorted[nextIdx].id };
    });
  }, [sorted, update]);

  const prevTurn = useCallback(() => {
    update((current) => {
      if (!sorted.length) return current;
      const idx = sorted.findIndex((c) => c.id === current.turnId);
      if (idx === 0) {
        if (current.round > 1) {
          return { ...current, turnId: sorted[sorted.length - 1].id, round: current.round - 1 };
        }
        return current;
      }
      if (idx === -1) {
        return { ...current, turnId: sorted[sorted.length - 1].id };
      }
      return { ...current, turnId: sorted[idx - 1].id };
    });
  }, [sorted, update]);

  const resetFight = useCallback(() => {
    update((current) => ({
      ...current,
      turnId: null,
      round: 1,
      combatants: current.combatants.map((c) => (c.hpMax !== null ? { ...c, hp: c.hpMax } : c)),
    }));
    toast('Combat réinitialisé.', 'ok');
  }, [update, toast]);

  const patchCombatant = useCallback(
    (id, patch) => {
      update((current) => ({
        ...current,
        combatants: current.combatants.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      }));
    },
    [update]
  );

  const removeCombatant = useCallback(
    (id) => {
      update((current) => ({
        ...current,
        combatants: current.combatants.filter((c) => c.id !== id),
      }));
    },
    [update]
  );

  const hpDelta = useCallback(
    (c, delta) => {
      const base = c.hp ?? c.hpMax ?? 0;
      const max = c.hpMax ?? null;
      const next = max === null ? Math.max(0, base + delta) : Math.max(0, Math.min(max, base + delta));
      patchCombatant(c.id, { hp: next });
    },
    [patchCombatant]
  );

  const addFromForm = useCallback(() => {
    const name = form.name.trim();
    if (!name) return;
    const initiative = Number(form.initiative);
    const hp = form.hp === '' ? null : Math.max(0, Number(form.hp) || 0);
    update((current) => ({
      ...current,
      combatants: [
        ...current.combatants,
        newCombatant({
          name,
          initiative: Number.isFinite(initiative) && form.initiative !== '' ? initiative : 10,
          hp,
          hpMax: hp,
        }),
      ],
    }));
    setForm({ name: '', initiative: '', hp: '' });
  }, [form, update]);

  const addCharacter = useCallback(
    (character) => {
      update((current) => ({
        ...current,
        combatants: [...current.combatants, combatantFromCharacter(character)],
      }));
    },
    [update]
  );

  const notInFight = useMemo(
    () => characters.filter((c) => !draft.combatants.some((cb) => cb.characterId === c.id)),
    [characters, draft.combatants]
  );

  return (
    <div className="combat">
      <div className="combat__head">
        <button type="button" className="btn btn--ghost btn--icon" onClick={onBack} aria-label="Retour aux combats">
          <Icon name="arrowLeft" />
        </button>
        <input
          className="input combat__name"
          value={draft.name}
          onChange={(e) => update({ name: e.target.value })}
          placeholder="Nom du combat"
          aria-label="Nom du combat"
        />
        <button
          type="button"
          className="btn btn--sm btn--danger btn--icon"
          onClick={() => setConfirmFinish(true)}
          aria-label="Terminer le combat"
          title="Terminer le combat"
        >
          <Icon name="check" />
        </button>
      </div>

      {/* -------- controle du tour -------- */}
      <div className="combat__turnbar">
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={prevTurn}
          disabled={!sorted.length}
        >
          <Icon name="chevronLeft" />
          <span className="hide-xs">Précédent</span>
        </button>
        <div className="combat__round">
          <span className="label" style={{ margin: 0 }}>Round</span>
          <strong>{draft.round}</strong>
        </div>
        <button type="button" className="btn btn--primary btn--sm" onClick={nextTurn} disabled={!sorted.length}>
          {activeIndex < 0 ? 'Commencer' : 'Tour suivant'}
          <Icon name="chevronRight" />
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={resetFight}
          disabled={!sorted.length}
          title="Réinitialiser les tours et les PV"
        >
          <Icon name="refresh" size={14} />
          <span className="hide-xs">Réinit.</span>
        </button>
      </div>

      {/* -------- liste -------- */}
      {sorted.length === 0 ? (
        <div className="empty">
          <span className="empty__icon">⚔️</span>
          <h3>Aucun combatant</h3>
          <p className="small">Ajoutez des monstres à la main ou importez vos personnages ci-dessous.</p>
        </div>
      ) : (
        <ol className="combat__list">
          {sorted.map((c, index) => {
            const isActive = c.id === draft.turnId;
            const dead = c.hp !== null && c.hp <= 0;
            const ratio = c.hpMax ? Math.max(0, Math.min(1, (c.hp ?? 0) / c.hpMax)) : null;
            return (
              <li
                key={c.id}
                className={`combatant${isActive ? ' combatant--active' : ''}${dead ? ' combatant--dead' : ''}`}
              >
                <span className="combatant__order" aria-hidden="true">
                  {isActive ? <Icon name="chevronRight" size={15} /> : index + 1}
                </span>

                <div className="combatant__main">
                  <div className="combatant__row">
                    <input
                      className="combatant__name"
                      value={c.name}
                      onChange={(e) => patchCombatant(c.id, { name: e.target.value })}
                      placeholder="Nom"
                      aria-label="Nom du combatant"
                    />
                    <label className="combatant__init" title="Initiative">
                      <Icon name="dice" size={13} />
                      <input
                        type="number"
                        value={c.initiative}
                        onChange={(e) => patchCombatant(c.id, { initiative: Number(e.target.value) || 0 })}
                        aria-label={`Initiative de ${c.name || 'combatant'}`}
                      />
                    </label>
                    <button
                      type="button"
                      className="btn btn--ghost btn--icon btn--sm"
                      onClick={() => removeCombatant(c.id)}
                      aria-label={`Retirer ${c.name || 'ce combatant'}`}
                    >
                      <Icon name="trash" size={15} />
                    </button>
                  </div>

                  {(c.hp !== null || c.hpMax !== null) && (
                    <div className="combatant__hp">
                      <button
                        type="button"
                        className="btn btn--sm btn--icon"
                        onClick={() => hpDelta(c, -1)}
                        aria-label="Retirer 1 PV"
                      >
                        <Icon name="minus" size={14} />
                      </button>
                      <div className="combatant__hpbar" role="img" aria-label={`${c.hp ?? 0} PV sur ${c.hpMax ?? '?'}`}>
                        <span style={{ width: `${(ratio ?? 0) * 100}%` }} />
                        <b>
                          {c.hp ?? '—'} / {c.hpMax ?? '—'}
                        </b>
                      </div>
                      <button
                        type="button"
                        className="btn btn--sm btn--icon"
                        onClick={() => hpDelta(c, 1)}
                        aria-label="Ajouter 1 PV"
                      >
                        <Icon name="plus" size={14} />
                      </button>
                      <button type="button" className="btn btn--sm combatant__hp5" onClick={() => hpDelta(c, -5)}>
                        −5
                      </button>
                      <button type="button" className="btn btn--sm combatant__hp5" onClick={() => hpDelta(c, 5)}>
                        +5
                      </button>
                    </div>
                  )}

                  <input
                    className="combatant__note"
                    value={c.note}
                    onChange={(e) => patchCombatant(c.id, { note: e.target.value })}
                    placeholder="États, conditions… (empoisonné, à terre)"
                    aria-label={`Notes pour ${c.name || 'combatant'}`}
                  />
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {/* -------- ajout -------- */}
      <div className="card card--pad combat__add">
        <span className="label">Ajouter un combatant</span>
        <div className="combat__addrow">
          <input
            className="input"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && addFromForm()}
            placeholder="Gobelin, dragon…"
            aria-label="Nom du combatant"
          />
          <input
            className="input combat__addnum"
            type="number"
            value={form.initiative}
            onChange={(e) => setForm({ ...form, initiative: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && addFromForm()}
            placeholder="Init."
            aria-label="Initiative"
          />
          <input
            className="input combat__addnum"
            type="number"
            value={form.hp}
            onChange={(e) => setForm({ ...form, hp: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && addFromForm()}
            placeholder="PV"
            aria-label="Points de vie"
          />
          <button type="button" className="btn btn--primary" onClick={addFromForm} disabled={!form.name.trim()}>
            <Icon name="plus" />
            <span className="hide-xs">Ajouter</span>
          </button>
        </div>

        {notInFight.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <span className="label">Depuis les fiches</span>
            <div className="row row--wrap">
              {notInFight.map((c) => (
                <button key={c.id} type="button" className="chip" onClick={() => addCharacter(c)}>
                  <Icon name="plus" size={12} />
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmFinish}
        title="Terminer ce combat ?"
        message="La rencontre sera retirée de la liste. Les fiches de personnage ne sont pas touchées."
        confirmLabel="Terminer"
        onConfirm={async () => {
          persist.cancel();
          await deleteEncounter(draftRef.current.id);
          toast('Combat terminé.', 'ok');
          onBack();
        }}
        onClose={() => setConfirmFinish(false)}
      />
    </div>
  );
}

/* =========================================================
   Liste des rencontres
   ========================================================= */

export default function CombatView({ openId, setOpenId }) {
  const { encounters, saveEncounter, deleteEncounter, toast } = useApp();
  const [confirmId, setConfirmId] = useState(null);

  const open = encounters.find((e) => e.id === openId) || null;

  const create = async () => {
    const encounter = createEncounter();
    await saveEncounter(encounter);
    setOpenId(encounter.id);
  };

  if (open) {
    return <Tracker encounter={open} onBack={() => setOpenId(null)} />;
  }

  return (
    <>
      <div className="page-head">
        <h2>Combat</h2>
        <span className="spacer" />
        <button type="button" className="btn btn--primary btn--sm" onClick={create}>
          <Icon name="plus" />
          Nouveau
        </button>
      </div>

      {encounters.length === 0 ? (
        <div className="empty">
          <span className="empty__icon">⚔️</span>
          <h3>Aucun combat en préparation</h3>
          <p className="small">
            Préparez vos rencontres à l'avance ou lancez-les à table : initiative, tours, rounds et points de
            vie sont suivis ici.
          </p>
          <button type="button" className="btn btn--primary" onClick={create} style={{ marginTop: 12 }}>
            <Icon name="plus" />
            Préparer un combat
          </button>
        </div>
      ) : (
        <div className="combat-grid">
          {encounters.map((enc) => {
            const running = enc.turnId !== null;
            return (
              <div key={enc.id} className="card combat-card">
                <button type="button" className="combat-card__open" onClick={() => setOpenId(enc.id)}>
                  <strong>{enc.name || 'Sans nom'}</strong>
                  <span className="small muted">
                    {enc.combatants.length} combatant(s)
                    {running ? ` · round ${enc.round}` : ''} · modifié {formatRelative(enc.updatedAt)}
                  </span>
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--icon btn--sm"
                  onClick={() => setConfirmId(enc.id)}
                  aria-label={`Supprimer ${enc.name}`}
                >
                  <Icon name="trash" size={15} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirmId)}
        title="Supprimer cette rencontre ?"
        message="Le combat et son suivi seront définitivement supprimés."
        confirmLabel="Supprimer"
        onConfirm={async () => {
          await deleteEncounter(confirmId);
          setConfirmId(null);
          toast('Rencontre supprimée.');
        }}
        onClose={() => setConfirmId(null)}
      />
    </>
  );
}
