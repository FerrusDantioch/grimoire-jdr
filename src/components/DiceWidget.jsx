import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { useDice } from '../state/DiceContext.jsx';
import { DIE_TYPES, formatBreakdown, validateExpression } from '../lib/dice.js';
import { formatRelative } from '../lib/utils.js';
import Icon from './Icon.jsx';
import './dice.css';

const QUICK = [
  { label: 'Avantage', expr: '2d20kh1', hint: 'Deux d20, on garde le meilleur' },
  { label: 'Desavantage', expr: '2d20kl1', hint: 'Deux d20, on garde le pire' },
  { label: 'Caracteristique', expr: '4d6kh3', hint: 'Quatre d6, on jette le plus faible' },
];

/** Chiffres qui defilent pendant l'animation du lancer. */
function Tumbler({ sides = 20 }) {
  const [face, setFace] = useState(1);
  useEffect(() => {
    const id = setInterval(() => setFace(1 + Math.floor(Math.random() * sides)), 55);
    return () => clearInterval(id);
  }, [sides]);
  return <span className="dice-result__value dice-result__value--rolling">{face}</span>;
}

export default function DiceWidget() {
  const { activeCharacter } = useApp();
  const {
    history, last, rolling, panelOpen, setPanelOpen,
    expression, setExpression, manualMod, setManualMod,
    availableModifiers, selectedModifiers, selectedFieldIds, toggleModifier, clearModifiers,
    modifierTotal, roll, reroll, clearHistory,
  } = useDice();

  const [count, setCount] = useState(1);
  const [showHistory, setShowHistory] = useState(false);
  const panelRef = useRef(null);
  const fabRef = useRef(null);

  const error = expression.trim() ? validateExpression(expression) : null;

  /* Fermeture au clic exterieur et a la touche Echap. */
  useEffect(() => {
    if (!panelOpen) return undefined;
    const onPointer = (e) => {
      if (panelRef.current?.contains(e.target) || fabRef.current?.contains(e.target)) return;
      setPanelOpen(false);
    };
    const onKey = (e) => e.key === 'Escape' && setPanelOpen(false);
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [panelOpen, setPanelOpen]);

  /** Faces du premier de de l'expression, pour animer le bon type de de. */
  const animatedSides = useMemo(() => {
    const match = /d(\d+)/i.exec(expression);
    return match ? Math.min(100, Number(match[1])) : 20;
  }, [expression]);

  const previewMods = [
    ...selectedModifiers.map((m) => ({ label: m.label, value: m.value })),
    ...(Number(manualMod) ? [{ label: 'Bonus manuel', value: Number(manualMod) }] : []),
  ];

  const rollDie = (sides) => {
    const expr = `${count}d${sides}`;
    setExpression(expr);
    roll(expr);
    setPanelOpen(true);
  };

  const fabLabel = rolling ? '…' : last ? String(last.total) : null;

  return (
    <>
      <button
        ref={fabRef}
        type="button"
        className={`dice-fab${rolling ? ' dice-fab--rolling' : ''}${panelOpen ? ' dice-fab--open' : ''}`}
        onClick={() => setPanelOpen(!panelOpen)}
        aria-expanded={panelOpen}
        aria-label={
          last && !rolling ? `Lanceur de des, dernier resultat ${last.total}` : 'Ouvrir le lanceur de des'
        }
      >
        <Icon name="dice" size={26} className="dice-fab__icon" />
        {fabLabel !== null && <span className="dice-fab__badge">{fabLabel}</span>}
      </button>

      {panelOpen && (
        <div className="dice-panel" ref={panelRef} role="dialog" aria-label="Lanceur de des">
          {/* -------- resultat -------- */}
          <div className={`dice-result${last?.crit === 'critique' ? ' dice-result--crit' : ''}${last?.crit === 'echec' ? ' dice-result--fumble' : ''}`}>
            {rolling ? (
              <Tumbler sides={animatedSides} />
            ) : last ? (
              <span className="dice-result__value" key={last.id}>
                {last.total}
              </span>
            ) : (
              <span className="dice-result__value dice-result__value--idle">—</span>
            )}

            <div className="dice-result__detail">
              {rolling ? (
                <span className="muted">Lancer en cours…</span>
              ) : last ? (
                <>
                  <span className="dice-result__formula">{formatBreakdown(last)}</span>
                  {last.crit && (
                    <span className={`dice-badge dice-badge--${last.crit === 'critique' ? 'crit' : 'fumble'}`}>
                      {last.crit === 'critique' ? 'Reussite critique' : 'Echec critique'}
                    </span>
                  )}
                  {last.characterName && (
                    <span className="dice-badge dice-badge--char">{last.characterName}</span>
                  )}
                </>
              ) : (
                <span className="muted">Choisissez un de pour commencer.</span>
              )}
            </div>
          </div>

          <div className="dice-panel__scroll">
            {/* -------- des rapides -------- */}
            <div className="dice-section">
              <div className="dice-section__head">
                <span className="label" style={{ margin: 0 }}>Des</span>
                <div className="dice-count">
                  <button
                    type="button"
                    className="btn btn--sm btn--icon"
                    onClick={() => setCount((c) => Math.max(1, c - 1))}
                    aria-label="Un de de moins"
                  >
                    <Icon name="minus" />
                  </button>
                  <span className="dice-count__value" aria-live="polite">{count}</span>
                  <button
                    type="button"
                    className="btn btn--sm btn--icon"
                    onClick={() => setCount((c) => Math.min(20, c + 1))}
                    aria-label="Un de de plus"
                  >
                    <Icon name="plus" />
                  </button>
                </div>
              </div>
              <div className="dice-grid">
                {DIE_TYPES.map((sides) => (
                  <button key={sides} type="button" className="dice-btn" onClick={() => rollDie(sides)}>
                    <span className="dice-btn__shape" aria-hidden="true" />
                    <span className="dice-btn__label">d{sides}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* -------- modificateurs de la fiche ouverte -------- */}
            <div className="dice-section">
              <div className="dice-section__head">
                <span className="label" style={{ margin: 0 }}>Appliquer un modificateur</span>
                {(selectedModifiers.length > 0 || Number(manualMod) !== 0) && (
                  <button type="button" className="btn btn--ghost btn--sm" onClick={clearModifiers}>
                    Effacer
                  </button>
                )}
              </div>

              {activeCharacter ? (
                availableModifiers.length ? (
                  <>
                    <p className="small muted dice-hint">
                      Fiche ouverte : <strong>{activeCharacter.name}</strong> — touchez une caracteristique
                      pour l’ajouter au jet.
                    </p>
                    <div className="dice-mods">
                      {availableModifiers.map((mod) => (
                        <button
                          key={mod.id}
                          type="button"
                          className="chip"
                          aria-pressed={selectedFieldIds.includes(mod.id)}
                          onClick={() => toggleModifier(mod.id)}
                          title={`${mod.section} · valeur ${mod.raw}${mod.modMode === 'dnd' ? ' → modificateur' : ''}`}
                        >
                          {mod.label}
                          <b>{mod.value >= 0 ? `+${mod.value}` : mod.value}</b>
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="small muted dice-hint">
                    <strong>{activeCharacter.name}</strong> n’a aucun champ numerique marque « utilisable comme
                    modificateur ». Activez l’option sur un champ de la fiche.
                  </p>
                )
              ) : (
                <p className="small muted dice-hint">
                  Ouvrez une fiche de personnage pour ajouter ses caracteristiques au jet.
                </p>
              )}

              <div className="dice-manual">
                <span className="small muted">Bonus manuel</span>
                <div className="dice-count">
                  <button
                    type="button"
                    className="btn btn--sm btn--icon"
                    onClick={() => setManualMod((m) => Number(m) - 1)}
                    aria-label="Diminuer le bonus manuel"
                  >
                    <Icon name="minus" />
                  </button>
                  <input
                    className="dice-manual__input"
                    type="number"
                    value={manualMod}
                    onChange={(e) => setManualMod(Number(e.target.value) || 0)}
                    aria-label="Bonus manuel"
                  />
                  <button
                    type="button"
                    className="btn btn--sm btn--icon"
                    onClick={() => setManualMod((m) => Number(m) + 1)}
                    aria-label="Augmenter le bonus manuel"
                  >
                    <Icon name="plus" />
                  </button>
                </div>
              </div>
            </div>

            {/* -------- expression libre -------- */}
            <div className="dice-section">
              <span className="label">Expression</span>
              <form
                className="dice-expr"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!error) roll(expression);
                }}
              >
                <input
                  className="input mono"
                  value={expression}
                  onChange={(e) => setExpression(e.target.value)}
                  placeholder="2d6+3"
                  aria-label="Expression de des"
                  aria-invalid={Boolean(error)}
                  spellCheck={false}
                  autoComplete="off"
                />
                <button type="submit" className="btn btn--primary" disabled={Boolean(error) || rolling}>
                  <Icon name="dice" />
                  Lancer
                </button>
              </form>
              {error ? (
                <p className="small dice-error">{error}</p>
              ) : (
                <p className="small muted dice-preview">
                  {expression}
                  {previewMods.map((m) => (
                    <span key={m.label}>
                      {m.value < 0 ? ' − ' : ' + '}
                      {Math.abs(m.value)} <em>({m.label})</em>
                    </span>
                  ))}
                  {modifierTotal !== 0 && <b> — total des bonus : {modifierTotal > 0 ? `+${modifierTotal}` : modifierTotal}</b>}
                </p>
              )}
              <div className="dice-quick">
                {QUICK.map((q) => (
                  <button
                    key={q.expr}
                    type="button"
                    className="chip"
                    title={q.hint}
                    onClick={() => {
                      setExpression(q.expr);
                      roll(q.expr);
                    }}
                  >
                    {q.label}
                  </button>
                ))}
                <button type="button" className="chip" onClick={reroll} disabled={!last} title="Relancer le dernier jet">
                  <Icon name="refresh" size={13} />
                  Relancer
                </button>
              </div>
            </div>

            {/* -------- historique -------- */}
            <div className="dice-section">
              <div className="dice-section__head">
                <button
                  type="button"
                  className="dice-history__toggle"
                  onClick={() => setShowHistory((s) => !s)}
                  aria-expanded={showHistory}
                >
                  <Icon name={showHistory ? 'chevronDown' : 'chevronRight'} size={15} />
                  Historique ({history.length})
                </button>
                {showHistory && history.length > 0 && (
                  <button type="button" className="btn btn--ghost btn--sm" onClick={clearHistory}>
                    Vider
                  </button>
                )}
              </div>

              {showHistory &&
                (history.length ? (
                  <ul className="dice-history">
                    {history.slice(0, 25).map((entry) => (
                      <li key={entry.id}>
                        <button
                          type="button"
                          className="dice-history__row"
                          onClick={() => roll(entry.rawExpression || entry.expression)}
                          title="Relancer cette expression"
                        >
                          <span className={`dice-history__total${entry.crit === 'critique' ? ' is-crit' : ''}${entry.crit === 'echec' ? ' is-fumble' : ''}`}>
                            {entry.total}
                          </span>
                          <span className="dice-history__formula mono">{formatBreakdown(entry)}</span>
                          <span className="dice-history__meta small muted">
                            {entry.characterName ? `${entry.characterName} · ` : ''}
                            {formatRelative(entry.at)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="small muted dice-hint">Aucun jet pour l’instant.</p>
                ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
