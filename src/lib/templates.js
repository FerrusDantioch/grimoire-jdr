import { uid } from './utils.js';

export const FIELD_TYPES = [
  { id: 'number', label: 'Nombre', hint: 'Utilisable comme modificateur de des' },
  { id: 'text', label: 'Texte court' },
  { id: 'longtext', label: 'Texte long' },
  { id: 'select', label: 'Liste deroulante' },
  { id: 'checkbox', label: 'Case a cocher' },
];

export const field = (label, type = 'text', value = '', extra = {}) => ({
  id: uid('f'),
  label,
  type,
  value,
  options: [],
  useAsModifier: type === 'number',
  modMode: 'raw',
  ...extra,
});

export const section = (name, fields = []) => ({
  id: uid('s'),
  name,
  collapsed: false,
  fields,
});

const stat = (label, value) => field(label, 'number', value, { useAsModifier: true, modMode: 'dnd' });
const bonus = (label, value) => field(label, 'number', value, { useAsModifier: true, modMode: 'raw' });

/**
 * Modeles de depart. Rien n'est fige : chaque categorie et chaque champ
 * reste renommable, deplacable et supprimable depuis l'editeur.
 */
export const TEMPLATES = [
  {
    id: 'vierge',
    name: 'Fiche vierge',
    description: 'Une seule categorie vide, a construire entierement.',
    icon: '📄',
    build: () => ({
      system: '',
      sections: [section('Nouvelle categorie', [field('Nouveau champ', 'text', '')])],
    }),
  },
  {
    id: 'd20',
    name: 'Aventurier (d20)',
    description: 'Caracteristiques classiques, etat, competences et equipement.',
    icon: '⚔️',
    build: () => ({
      system: 'Systeme d20',
      sections: [
        section('Caracteristiques', [
          stat('Force', 10),
          stat('Dexterite', 10),
          stat('Constitution', 10),
          stat('Intelligence', 10),
          stat('Sagesse', 10),
          stat('Charisme', 10),
        ]),
        section('Etat', [
          field('Points de vie', 'number', 10, { useAsModifier: false }),
          field('PV maximum', 'number', 10, { useAsModifier: false }),
          bonus('Classe d’armure', 12),
          bonus('Initiative', 0),
          field('Vitesse', 'text', '9 m'),
          field('Niveau', 'number', 1, { useAsModifier: false }),
        ]),
        section('Competences', [
          bonus('Bonus de maitrise', 2),
          bonus('Discretion', 0),
          bonus('Perception', 0),
          bonus('Athletisme', 0),
        ]),
        section('Equipement', [field('Sac', 'longtext', ''), field('Bourse', 'text', '0 po')]),
        section('Traits', [
          field('Race', 'text', ''),
          field('Classe', 'text', ''),
          field('Historique', 'longtext', ''),
        ]),
      ],
    }),
  },
  {
    id: 'narratif',
    name: 'Heros narratif',
    description: 'Approches, aspects et consequences pour les jeux narratifs.',
    icon: '🎭',
    build: () => ({
      system: 'Jeu narratif',
      sections: [
        section('Concept', [
          field('Haut concept', 'text', ''),
          field('Probleme', 'text', ''),
          field('Points de destin', 'number', 3, { useAsModifier: false }),
        ]),
        section('Approches', [
          bonus('Prudent', 1),
          bonus('Malin', 2),
          bonus('Rapide', 1),
          bonus('Fort', 0),
          bonus('Discret', 2),
          bonus('Panache', 3),
        ]),
        section('Aspects', [field('Aspects', 'longtext', '')]),
        section('Consequences', [
          field('Legere', 'text', ''),
          field('Moderee', 'text', ''),
          field('Grave', 'text', ''),
          field('Hors combat', 'checkbox', false),
        ]),
      ],
    }),
  },
];

export function createCharacter(templateId = 'vierge', name = '') {
  const template = TEMPLATES.find((t) => t.id === templateId) || TEMPLATES[0];
  const base = template.build();
  const now = Date.now();
  return {
    id: uid('char'),
    name: name || 'Nouveau personnage',
    role: '',
    notes: '',
    templateId: template.id,
    ...base,
    createdAt: now,
    updatedAt: now,
  };
}

export function createJournalEntry(overrides = {}) {
  const now = Date.now();
  return {
    id: uid('entry'),
    title: 'Nouvelle seance',
    chapter: '',
    date: new Date().toISOString().slice(0, 10),
    content: '',
    characterIds: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}
