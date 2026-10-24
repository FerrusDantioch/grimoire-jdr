/*
 * LICENCES DES BIBLIOTHEQUES TIERCES  (commande : npm run licences)
 *
 * L'application compilee contient du code ecrit par d'autres auteurs (React,
 * jsPDF, pdf.js...). Ces bibliotheques gardent leur propre licence
 * (MIT, ISC, BSD, Apache 2.0), et non celle de l'application. La plupart
 * imposent une condition : leur texte de licence doit accompagner toute copie
 * publiee.
 *
 * Ce script rassemble donc, dans public/licences-tierces.txt, le texte de
 * licence de chaque bibliotheque publiee avec l'application. Le fichier est
 * mis en ligne avec le site. La liste vient de package-lock.json : seules
 * les bibliotheques utilisees par l'application sont gardees, pas les outils
 * de developpement (Vite, Vitest...).
 *
 * Il est relance automatiquement avant chaque construction ("prebuild" dans
 * package.json) : la liste suit donc toute mise a jour des bibliotheques.
 */

import fs from 'node:fs';
import path from 'node:path';

const SORTIE = path.resolve('public/licences-tierces.txt');

// Elements publies qui ne viennent pas de npm (aucun pour l'instant).
const SUPPLEMENTS = [];

const paquetsProjet = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const verrou = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));

const EST_LICENCE = (nom) => /^(licen[cs]e|copying)/i.test(nom);

/**
 * Cherche le fichier de licence d'un paquet (LICENSE, LICENCE.md, COPYING...).
 * S'il n'y en a pas a la racine, on regarde dans les sous-dossiers : certains
 * paquets (ex. victory-vendor) y rangent les licences du code qu'ils embarquent.
 */
function texteDeLicence(dossier) {
  if (!fs.existsSync(dossier)) return null;
  const fichier = fs.readdirSync(dossier).filter(EST_LICENCE).sort()[0];
  if (fichier) return fs.readFileSync(path.join(dossier, fichier), 'utf8').trim();

  const trouves = fs
    .readdirSync(dossier, { recursive: true })
    .map(String)
    .filter((chemin) => !chemin.includes('node_modules') && EST_LICENCE(path.basename(chemin)))
    .sort();
  if (!trouves.length) return null;
  return trouves
    .map((chemin) => `[${chemin}]\n${fs.readFileSync(path.join(dossier, chemin), 'utf8').trim()}`)
    .join('\n\n');
}

// Chaque entree de "packages" (sauf "", le projet lui-meme) est une
// bibliotheque installee ; "dev: true" marque les outils de developpement.
// "os" ou "cpu" marquent un programme compile pour un systeme precis
// (Windows, Android...) : il ne sert jamais dans le navigateur.
const paquets = Object.entries(verrou.packages)
  .filter(([chemin, infos]) => chemin && !infos.dev && !infos.os && !infos.cpu)
  .map(([chemin, infos]) => ({
    nom: chemin.split('node_modules/').pop(),
    version: infos.version,
    licence: infos.license || 'non indiquee',
    texte: texteDeLicence(path.resolve(chemin)),
  }))
  .sort((a, b) => a.nom.localeCompare(b.nom));

// Un meme paquet peut etre installe plusieurs fois (dans des versions differentes).
const vus = new Set();
const blocs = [];
for (const p of paquets) {
  const cle = `${p.nom}@${p.version}`;
  if (vus.has(cle)) continue;
  vus.add(cle);
  blocs.push(
    `${cle} — licence ${p.licence}\n\n` +
      (p.texte || `(Le paquet ne fournit pas de fichier de licence ; licence declaree : ${p.licence}.)`)
  );
}
for (const s of SUPPLEMENTS) blocs.push(`${s.nom} — licence ${s.licence}\n\n${s.texte}`);

const SEPARATEUR = '\n\n' + '='.repeat(72) + '\n\n';
const entete =
  `Licences des bibliotheques tierces — ${paquetsProjet.name}\n\n` +
  "Ces bibliotheques, ecrites par d'autres auteurs, sont incluses dans l'application.\n" +
  "Elles gardent leur propre licence, reproduite ci-dessous. L'application elle-meme\n" +
  'est sous licence Creative Commons BY-NC-ND 4.0 (fichier LICENSE du depot).\n\n' +
  `Fichier fabrique par scripts/licences-tierces.mjs (${blocs.length} elements).`;

// Fins de ligne Windows (\r\n) ramenees a \n : le fichier reste identique
// d'un ordinateur a l'autre.
const contenu = (entete + SEPARATEUR + blocs.join(SEPARATEUR) + '\n').replace(/\r\n?/g, '\n');
fs.writeFileSync(SORTIE, contenu);
const sansTexte = paquets.filter((p) => !p.texte).map((p) => p.nom);
console.log(`[licences] ${blocs.length} elements ecrits dans public/licences-tierces.txt`);
if (sansTexte.length) console.log(`[licences] sans fichier de licence : ${sansTexte.join(', ')}`);
