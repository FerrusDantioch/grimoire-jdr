/**
 * Moteur de des : analyse d'expressions (« 2d6+3 », « 4d6kh3 », « 1d20-1 »)
 * et tirage aleatoire cryptographique.
 */

export const DIE_TYPES = [4, 6, 8, 10, 12, 20, 100];

export const MAX_COUNT = 100;
export const MAX_SIDES = 1000;
export const MAX_TERMS = 12;

const TERM_RE = /^(\d*)d(\d+)(?:(kh|kl)(\d+))?$/;

/** Entier uniforme dans [1, sides], sans biais modulo. */
function rollDie(sides) {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const buf = new Uint32Array(1);
    const limit = Math.floor(0x100000000 / sides) * sides;
    let value;
    do {
      crypto.getRandomValues(buf);
      value = buf[0];
    } while (value >= limit);
    return (value % sides) + 1;
  }
  return Math.floor(Math.random() * sides) + 1;
}

/**
 * Analyse une expression de des.
 * @returns {{terms: Array, normalized: string}}
 * @throws {Error} message lisible en francais
 */
export function parseExpression(input) {
  const cleaned = String(input ?? '').toLowerCase().replace(/\s+/g, '').replace(/[−–—]/g, '-');
  if (!cleaned) throw new Error('Expression vide.');
  if (!/^[-+]?[0-9dkhl+-]+$/.test(cleaned)) {
    throw new Error('Caracteres non valides. Exemple attendu : 2d6+3');
  }

  const chunks = cleaned.match(/[+-]?[^+-]+/g);
  if (!chunks) throw new Error(`Expression illisible : « ${input} »`);
  if (chunks.length > MAX_TERMS) throw new Error(`Trop de termes (maximum ${MAX_TERMS}).`);

  const terms = chunks.map((chunk) => {
    let sign = 1;
    let body = chunk;
    if (body[0] === '+' || body[0] === '-') {
      sign = body[0] === '-' ? -1 : 1;
      body = body.slice(1);
    }
    if (!body) throw new Error('Terme vide dans l’expression.');

    if (/^\d+$/.test(body)) {
      return { kind: 'const', sign, value: Number(body), label: body };
    }

    const match = TERM_RE.exec(body);
    if (!match) throw new Error(`Terme non reconnu : « ${body} »`);

    const count = match[1] === '' ? 1 : Number(match[1]);
    const sides = Number(match[2]);
    const keepMode = match[3] || null;
    const keepCount = match[4] ? Number(match[4]) : null;

    if (count < 1) throw new Error('Il faut au moins 1 de.');
    if (count > MAX_COUNT) throw new Error(`Maximum ${MAX_COUNT} des par terme.`);
    if (sides < 2) throw new Error('Un de doit avoir au moins 2 faces.');
    if (sides > MAX_SIDES) throw new Error(`Maximum ${MAX_SIDES} faces.`);
    if (keepMode && (keepCount < 1 || keepCount > count)) {
      throw new Error(`« ${keepMode}${keepCount} » impossible avec ${count} de(s).`);
    }

    return {
      kind: 'dice',
      sign,
      count,
      sides,
      keepMode,
      keepCount,
      label: `${count}d${sides}${keepMode ? keepMode + keepCount : ''}`,
    };
  });

  const normalized = terms
    .map((t, i) => (i === 0 ? (t.sign < 0 ? '-' : '') + t.label : (t.sign < 0 ? ' - ' : ' + ') + t.label))
    .join('');

  return { terms, normalized };
}

/** Verifie une expression sans lancer. */
export function validateExpression(input) {
  try {
    parseExpression(input);
    return null;
  } catch (err) {
    return err.message;
  }
}

/**
 * Lance les des.
 * @param {string} expression  ex. « 1d20 »
 * @param {object} options
 * @param {Array<{label:string, value:number}>} options.modifiers  modificateurs additionnels (fiche, bonus manuel)
 * @param {object} options.character  { id, name } lie au jet
 */
export function rollExpression(expression, options = {}) {
  const { modifiers = [], character = null, label = null } = options;
  const { terms, normalized } = parseExpression(expression);

  let diceTotal = 0;
  const rolled = terms.map((term) => {
    if (term.kind === 'const') {
      diceTotal += term.sign * term.value;
      return { ...term, value: term.value, total: term.sign * term.value };
    }
    const rolls = Array.from({ length: term.count }, () => rollDie(term.sides));
    let kept = rolls;
    let dropped = [];
    if (term.keepMode) {
      const order = [...rolls].sort((a, b) => (term.keepMode === 'kh' ? b - a : a - b));
      kept = order.slice(0, term.keepCount);
      dropped = order.slice(term.keepCount);
    }
    const sum = kept.reduce((a, b) => a + b, 0);
    diceTotal += term.sign * sum;
    return { ...term, rolls, kept, dropped, value: sum, total: term.sign * sum };
  });

  const cleanMods = modifiers
    .filter((m) => m && Number.isFinite(Number(m.value)) && Number(m.value) !== 0)
    .map((m) => ({ label: m.label || 'Modificateur', value: Number(m.value), source: m.source || 'manual' }));

  const modTotal = cleanMods.reduce((a, m) => a + m.value, 0);

  // Coup critique : un seul d20 lance, sans « keep »
  let crit = null;
  const diceTerms = rolled.filter((t) => t.kind === 'dice');
  if (diceTerms.length === 1 && diceTerms[0].sides === 20 && diceTerms[0].count === 1) {
    const natural = diceTerms[0].rolls[0];
    if (natural === 20) crit = 'critique';
    else if (natural === 1) crit = 'echec';
  }

  return {
    id: `roll_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    at: Date.now(),
    expression: normalized,
    rawExpression: expression,
    label,
    terms: rolled,
    modifiers: cleanMods,
    diceTotal,
    modTotal,
    total: diceTotal + modTotal,
    crit,
    characterId: character?.id ?? null,
    characterName: character?.name ?? null,
  };
}

/** « 1d20 (14) + 3 (Force) = 17 » */
export function formatBreakdown(result) {
  if (!result) return '';
  const parts = result.terms.map((term, i) => {
    const sign = i === 0 ? (term.sign < 0 ? '-' : '') : term.sign < 0 ? ' - ' : ' + ';
    if (term.kind === 'const') return `${sign}${term.value}`;
    const detail = term.dropped?.length
      ? `${term.kept.join(', ')} ~~${term.dropped.join(', ')}~~`
      : term.rolls.join(', ');
    return `${sign}${term.label} (${detail})`;
  });
  for (const mod of result.modifiers) {
    parts.push(`${mod.value < 0 ? ' - ' : ' + '}${Math.abs(mod.value)} (${mod.label})`);
  }
  return `${parts.join('')} = ${result.total}`;
}

/** Version compacte pour l'historique : « 1d20 + 3 = 17 » */
export function formatShort(result) {
  const mods = result.modifiers.reduce((a, m) => a + m.value, 0);
  const modText = mods === 0 ? '' : mods > 0 ? ` + ${mods}` : ` - ${Math.abs(mods)}`;
  return `${result.expression}${modText} = ${result.total}`;
}

/** Construit « 3d6 » a partir d'un nombre et d'un type de de. */
export function buildExpression(count, sides) {
  return `${Math.max(1, Math.min(MAX_COUNT, count))}d${sides}`;
}

/**
 * Valeur de modificateur derivee d'une caracteristique.
 * - « brut »  : la valeur telle quelle (ex. bonus de competence +3)
 * - « d20 »   : formule classique (valeur - 10) / 2 arrondie vers le bas
 */
export function statToModifier(rawValue, mode = 'raw') {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) return null;
  if (mode === 'dnd') return Math.floor((value - 10) / 2);
  return Math.trunc(value);
}

export const MOD_MODES = [
  { id: 'raw', label: 'Valeur brute', hint: 'La valeur est ajoutee telle quelle (ex. +3)' },
  { id: 'dnd', label: 'Modificateur d20', hint: '(valeur - 10) / 2, arrondi vers le bas' },
];
