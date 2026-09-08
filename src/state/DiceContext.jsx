import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as db from '../lib/db.js';
import { rollExpression, statToModifier, validateExpression } from '../lib/dice.js';
import { useApp } from './AppContext.jsx';

const DiceContext = createContext(null);

export function useDice() {
  const ctx = useContext(DiceContext);
  if (!ctx) throw new Error('useDice doit etre utilise dans <DiceProvider>');
  return ctx;
}

/** Duree de l'animation du de avant l'affichage du resultat. */
export const ROLL_ANIMATION_MS = 620;

export function DiceProvider({ children }) {
  const { activeCharacter, toast } = useApp();

  const [history, setHistory] = useState([]);
  const [last, setLast] = useState(null);
  const [rolling, setRolling] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [expression, setExpression] = useState('1d20');
  const [manualMod, setManualMod] = useState(0);
  const [selectedFieldIds, setSelectedFieldIds] = useState([]);
  const rollTimer = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const rows = await db.getAll(db.STORES.rolls);
        const sorted = rows.sort((a, b) => b.at - a.at).slice(0, 60);
        setHistory(sorted);
        if (sorted[0]) setLast(sorted[0]);
      } catch (err) {
        console.error('[des] historique illisible', err);
      }
    })();
    return () => clearTimeout(rollTimer.current);
  }, []);

  /* Les modificateurs selectionnes appartiennent a la fiche ouverte :
     changer de personnage remet la selection a zero. */
  useEffect(() => {
    setSelectedFieldIds([]);
  }, [activeCharacter?.id]);

  /** Champs numeriques de la fiche active utilisables comme modificateur. */
  const availableModifiers = useMemo(() => {
    if (!activeCharacter) return [];
    const out = [];
    for (const section of activeCharacter.sections || []) {
      for (const field of section.fields || []) {
        if (field.type !== 'number' || !field.useAsModifier) continue;
        const value = statToModifier(field.value, field.modMode);
        if (value === null) continue;
        out.push({
          id: field.id,
          label: field.label || 'Sans nom',
          section: section.name,
          raw: Number(field.value),
          value,
          modMode: field.modMode,
        });
      }
    }
    return out;
  }, [activeCharacter]);

  const selectedModifiers = useMemo(
    () => availableModifiers.filter((m) => selectedFieldIds.includes(m.id)),
    [availableModifiers, selectedFieldIds]
  );

  // Une selection devient caduque si le champ est supprime ou change de type.
  useEffect(() => {
    setSelectedFieldIds((ids) => {
      const valid = ids.filter((id) => availableModifiers.some((m) => m.id === id));
      return valid.length === ids.length ? ids : valid;
    });
  }, [availableModifiers]);

  const toggleModifier = useCallback((fieldId) => {
    setSelectedFieldIds((ids) =>
      ids.includes(fieldId) ? ids.filter((i) => i !== fieldId) : [...ids, fieldId]
    );
  }, []);

  const clearModifiers = useCallback(() => {
    setSelectedFieldIds([]);
    setManualMod(0);
  }, []);

  /** Total des modificateurs qui seront appliques au prochain jet. */
  const modifierTotal = useMemo(
    () => selectedModifiers.reduce((a, m) => a + m.value, 0) + Number(manualMod || 0),
    [selectedModifiers, manualMod]
  );

  const roll = useCallback(
    (expr = expression, options = {}) => {
      const error = validateExpression(expr);
      if (error) {
        toast(error, 'err', 3600);
        return null;
      }

      const modifiers = [
        ...(options.ignoreModifiers
          ? []
          : selectedModifiers.map((m) => ({ label: m.label, value: m.value, source: 'character' }))),
        ...(!options.ignoreModifiers && Number(manualMod)
          ? [{ label: 'Bonus manuel', value: Number(manualMod), source: 'manual' }]
          : []),
        ...(options.extraModifiers || []),
      ];

      const result = rollExpression(expr, {
        modifiers,
        character: options.ignoreModifiers ? null : activeCharacter,
        label: options.label ?? null,
      });

      setExpression(expr);
      setRolling(true);
      clearTimeout(rollTimer.current);
      rollTimer.current = setTimeout(() => {
        setRolling(false);
        setLast(result);
        setHistory((list) => [result, ...list].slice(0, 60));
        db.put(db.STORES.rolls, result).then(() => db.trimRolls(200)).catch(() => {});
        if (navigator.vibrate) navigator.vibrate(result.crit ? [12, 40, 22] : 12);
      }, ROLL_ANIMATION_MS);

      return result;
    },
    [expression, selectedModifiers, manualMod, activeCharacter, toast]
  );

  const reroll = useCallback(() => {
    if (last) roll(last.rawExpression || last.expression);
    else roll(expression);
  }, [last, expression, roll]);

  const clearHistory = useCallback(async () => {
    await db.clearStore(db.STORES.rolls);
    setHistory([]);
    setLast(null);
  }, []);

  const value = useMemo(
    () => ({
      history,
      last,
      rolling,
      panelOpen,
      setPanelOpen,
      expression,
      setExpression,
      manualMod,
      setManualMod,
      availableModifiers,
      selectedModifiers,
      selectedFieldIds,
      toggleModifier,
      clearModifiers,
      modifierTotal,
      roll,
      reroll,
      clearHistory,
    }),
    [
      history, last, rolling, panelOpen, expression, manualMod, availableModifiers,
      selectedModifiers, selectedFieldIds, toggleModifier, clearModifiers, modifierTotal,
      roll, reroll, clearHistory,
    ]
  );

  return <DiceContext.Provider value={value}>{children}</DiceContext.Provider>;
}
