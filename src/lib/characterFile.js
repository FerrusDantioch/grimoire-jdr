/**
 * Duplication et partage d'une fiche de personnage seule (fichier .json),
 * par exemple pour l'envoyer au MJ ou la passer d'un appareil a l'autre.
 *
 * Toute fiche copiee ou importee recoit de NOUVEAUX identifiants (fiche,
 * categories, champs) : importer deux fois le meme fichier cree deux fiches,
 * sans jamais ecraser une fiche existante. Le contenu d'un fichier importe
 * est verifie et nettoye champ par champ : un fichier abime ou bricole ne peut
 * pas introduire de valeur inattendue dans la base.
 */
import { uid } from './utils.js';
import { FIELD_TYPES } from './templates.js';

export const CHARACTER_FILE_FORMAT = 'grimoire-fiche';
export const CHARACTER_FILE_VERSION = 1;

const FIELD_TYPE_IDS = new Set(FIELD_TYPES.map((t) => t.id));
const MOD_MODE_IDS = new Set(['raw', 'dnd']);

const text = (value, max) => (typeof value === 'string' ? value : value == null ? '' : String(value)).slice(0, max);

function cleanField(field) {
  const type = FIELD_TYPE_IDS.has(field?.type) ? field.type : 'text';
  let value = field?.value;
  if (type === 'checkbox') value = Boolean(value);
  else if (type === 'number') value = value === '' || value == null || !Number.isFinite(Number(value)) ? '' : value;
  else value = text(value, 20000);
  return {
    id: uid('f'),
    label: text(field?.label, 200),
    type,
    value,
    options: Array.isArray(field?.options)
      ? field.options.map((o) => text(o, 200).trim()).filter(Boolean).slice(0, 200)
      : [],
    useAsModifier: type === 'number' && Boolean(field?.useAsModifier),
    modMode: MOD_MODE_IDS.has(field?.modMode) ? field.modMode : 'raw',
  };
}

function cleanSection(section) {
  return {
    id: uid('s'),
    name: text(section?.name, 200),
    collapsed: false,
    fields: (Array.isArray(section?.fields) ? section.fields : []).slice(0, 500).map(cleanField),
  };
}

/** Fiche propre, avec de nouveaux identifiants. */
function cleanCharacter(source, overrides = {}) {
  const now = Date.now();
  return {
    id: uid('char'),
    name: text(source?.name, 200),
    system: text(source?.system, 200),
    role: text(source?.role, 200),
    notes: text(source?.notes, 100000),
    templateId: text(source?.templateId, 40) || 'vierge',
    sections: (Array.isArray(source?.sections) ? source.sections : []).slice(0, 200).map(cleanSection),
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/** Copie complete d'une fiche, nommee « … (copie) ». */
export function cloneCharacter(character) {
  return cleanCharacter(character, { name: `${character.name || 'Sans nom'} (copie)` });
}

/** Contenu du fichier .json d'une fiche. */
export function characterToFile(character) {
  const { id, createdAt, updatedAt, ...content } = character;
  return {
    format: CHARACTER_FILE_FORMAT,
    version: CHARACTER_FILE_VERSION,
    exportedAt: new Date().toISOString(),
    character: content,
  };
}

/**
 * Lit le contenu d'un fichier de fiche (deja passe par JSON.parse).
 * @throws {Error} message lisible si le fichier n'est pas une fiche Omni-Grimoire
 */
export function characterFromFile(data) {
  if (!data || data.format !== CHARACTER_FILE_FORMAT || !data.character || typeof data.character !== 'object') {
    throw new Error("Ce fichier n'est pas une fiche Omni-Grimoire.");
  }
  if (!Array.isArray(data.character.sections)) {
    throw new Error('Fiche illisible : aucune catégorie trouvée.');
  }
  return cleanCharacter(data.character, { name: text(data.character.name, 200) || 'Personnage importé' });
}
