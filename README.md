# Grimoire — Compagnon JDR

Application web progressive (PWA) pour le jeu de rôle solo et multi-joueurs.
Installable sur mobile et ordinateur sans passer par les stores, fonctionne
entièrement hors ligne, et ne transmet aucune donnée à un serveur.

**→ [Ouvrir l'application](https://ferrusdantioch.github.io/grimoire-jdr/)**

Ouvrez ce lien sur téléphone ou sur ordinateur, puis installez l'application
depuis le bouton **Installer** de la barre du haut. Elle fonctionne ensuite sans
réseau. Rien à installer par ailleurs : les sections ci-dessous ne concernent que
le développement.

## Démarrer

**Le plus simple : double-cliquer sur `Lancer Grimoire.cmd`.** Il installe les
dépendances au premier lancement, compile l'application et ouvre le navigateur.
Laissez la fenêtre noire ouverte pendant l'utilisation ; la fermer arrête le serveur.

En ligne de commande, c'est équivalent :

```bash
npm install
npm start
```

| Commande | Effet |
| --- | --- |
| `npm start` | Compile puis sert l'application sur http://localhost:4173 et ouvre le navigateur |
| `npm run dev` | Serveur de développement (rechargement à chaud) sur http://localhost:5173 |
| `npm run build` | Build de production dans `dist/` (manifeste + service worker) |
| `npm run serve` | Sert `dist/` sans recompiler ni ouvrir le navigateur |
| `npm test` | Tests du moteur de dés et du rendu markdown (28 assertions) |
| `npm run icons` | Régénère les icônes PNG de la PWA |

### Pourquoi un double-clic sur `index.html` donne une page blanche

C'est normal, et aucune configuration ne peut y remédier : ouvert ainsi, le
fichier utilise le protocole `file://`, et une application web moderne ne peut
pas fonctionner dans ce contexte.

- `index.html` à la racine ne contient que `<script src="/src/main.jsx">` : du
  JSX, que le navigateur ne sait pas exécuter. C'est Vite qui le transforme.
- `dist/index.html` référence `/assets/…` ; sur `file://`, la barre oblique
  initiale pointe vers la racine du disque (`C:\assets\…`), donc rien ne charge.
- Même avec des chemins corrigés, les modules ES sont bloqués par la politique
  d'origine sur `file://`, et le service worker, la persistance du stockage et
  l'invite d'installation exigent tous une origine `http://localhost` ou `https://`.

L'application doit donc être **servie**, ce que fait `Lancer Grimoire.cmd`.

### L'installer comme une vraie application

Une fois la page ouverte sur http://localhost:4173, le bouton **Installer** de la
barre du haut (ou l'icône d'installation dans la barre d'adresse de Chrome/Edge)
crée un raccourci qui ouvre Grimoire dans sa propre fenêtre, sans barre de
navigateur. Il faut malgré tout que le serveur tourne.

C'est exactement ce que fait la version en ligne : **https://ferrusdantioch.github.io/grimoire-jdr/**.
En HTTPS, le service worker met tout en cache et l'application fonctionne ensuite
sans réseau et sans rien lancer localement — c'est la façon recommandée de s'en servir.

### Déploiement

Chaque `push` sur `main` déclenche `.github/workflows/deploy.yml` : installation,
tests, build et publication sur GitHub Pages. Le build de déploiement reçoit la
variable `GITHUB_PAGES` avec le nom du dépôt, ce qui bascule `base`, `start_url`
et `scope` sur `/<dépôt>/` ; sans cette variable (donc en local), tout reste à la
racine et `Lancer Grimoire.cmd` continue de fonctionner.

## Fonctionnalités

### Fiches de personnage
Structure entièrement libre : l'utilisateur nomme lui-même chaque **catégorie**
(« Caractéristiques », « Magie », « Contacts »…) et chaque **champ**. Cinq types
de champ : nombre, texte court, texte long, liste déroulante, case à cocher.
Catégories et champs s'ajoutent, se renomment, se réordonnent et se suppriment à
la volée. Trois modèles de départ (vierge, aventurier d20, héros narratif) ne
sont que des points de départ — rien n'est figé.

Sauvegarde automatique dans IndexedDB, 600 ms après la dernière frappe, et
immédiate à la fermeture de la fiche.

### Lanceur de dés, lié aux fiches
Bouton flottant présent sur **tous** les onglets, affichant le dernier résultat.
Le panneau propose d4 à d100 avec compteur, une expression libre
(`2d6+3`, `4d6kh3`, `2d20kl1`…), des raccourcis avantage / désavantage, une
animation de lancer et l'historique des 200 derniers jets (rejouables d'un tap).

**Modificateurs de personnage** — quand une fiche est ouverte, elle devient la
fiche active : ses champs numériques marqués « utilisable comme modificateur »
apparaissent en pastilles dans le panneau. On en sélectionne un ou plusieurs, on
peut ajouter un bonus manuel temporaire, et le résultat est détaillé :

```
1d20 (19) + 3 (Force) = 22
```

Deux modes de calcul par champ : **valeur brute** (le nombre est ajouté tel quel)
ou **modificateur d20** (`(valeur − 10) / 2`, arrondi vers le bas — Force 16 → +3).

### Journal d'aventure
Éditeur markdown avec barre d'insertion et aperçu rendu. Les séances se
regroupent par chapitre, portent une date et peuvent être liées à des
personnages. Recherche plein texte, compteur de mots, export d'une séance ou du
journal entier.

### Visionneuse PDF
pdf.js intégré : navigation par page (clavier inclus), zoom, ajustement à la
largeur, glisser-déposer pour se déplacer. Le **mode battlemap** passe en plein
écran avec une grille superposée dont la taille des cases et l'opacité sont
réglables. Les documents importés sont stockés localement et la dernière page
consultée est mémorisée.

### Lecteur de musique
Import de fichiers audio locaux (mp3, ogg, wav, m4a, flac, opus), playlists,
lecture aléatoire et répétition. L'élément audio vit au-dessus des vues : **la
lecture continue quand on change d'onglet ou que l'onglet passe en arrière-plan**,
et l'API Media Session expose les commandes sur l'écran de verrouillage. Une
barre de lecture compacte reste visible partout dans l'application.

### Export
Modale de confirmation avec choix du format :

- **PDF** — mise en page dessinée à la main via jsPDF : titre, filets, grille de
  champs sur deux colonnes pour les fiches ; titres, listes, citations et pied de
  page numéroté pour le journal.
- **Texte** — `.txt` structuré, lisible et modifiable partout.

Les réglages proposent en plus une **sauvegarde complète** en JSON (fiches,
journal, PDF et musiques compris, encodés en data-URL) et sa restauration.

## Architecture

```
src/
├── main.jsx                 point d'entrée, enregistrement du service worker
├── App.jsx                  navigation, mise en page, raccourcis du manifeste
├── lib/
│   ├── db.js                IndexedDB (idb) : magasins, réglages, sauvegarde
│   ├── dice.js              analyse d'expressions + tirage cryptographique
│   ├── markdown.js          rendu markdown sûr (échappement avant transformation)
│   ├── exporters.js         PDF (jsPDF) et texte
│   ├── templates.js         modèles de fiches, fabriques de champs
│   ├── utils.js             dates, tailles, fichiers, aides diverses
│   └── usePwa.js            invite d'installation, état de connexion
├── state/
│   ├── AppContext.jsx       données + CRUD + thème + notifications
│   ├── DiceContext.jsx      jets, historique, modificateurs actifs
│   └── PlayerContext.jsx    lecteur audio global + Media Session
├── components/              Icon, Modal, ExportModal, DiceWidget,
│                            CharacterEditor, MiniPlayer, Toasts
├── views/                   Personnages, Journal, Documents, Musique, Réglages
└── styles/                  design system et styles partagés
```

Les données vivent dans IndexedDB (`grimoire-jdr`) : `characters`, `journal`,
`documents`, `tracks`, `playlists`, `rolls`, plus un magasin `settings` clé/valeur.
Les PDF et fichiers audio sont stockés en `Blob`. L'application demande la
persistance du stockage au premier lancement pour éviter l'éviction automatique.

## PWA

- `manifest.webmanifest` : `display: standalone`, icônes 192/512 + maskable,
  raccourcis « Lancer 1d20 » et « Journal ».
- Service worker Workbox (`registerType: autoUpdate`) : 14 fichiers pré-chargés,
  environ 2,3 Mo, avec repli de navigation sur `index.html`.
- Bouton « Installer » affiché dans la barre du haut dès que le navigateur le
  propose ; sur iOS, passer par « Ajouter à l'écran d'accueil ».

Le service worker n'est actif que sur le build de production servi en HTTP(S) :
`npm run build && npm run preview`, puis couper le réseau pour vérifier.

## Responsive

Conception mobile d'abord. Barre d'onglets en bas sous 900 px, rail latéral
au-delà ; zones tactiles de 44 px minimum, marges de sécurité (encoches) prises
en compte. Deux thèmes, **grimoire** (sombre) et **parchemin** (clair).

## Vérifications effectuées

- `npm test` : 28 assertions sur l'analyse d'expressions, les bornes de tirage,
  `kh`/`kl`, les modificateurs, la détection des critiques, le rendu markdown et
  la neutralisation du HTML et des liens `javascript:`.
- Parcours manuel : création de fiche, modificateur Force 16 → +3 appliqué à un
  `1d20`, journal avec aperçu markdown, visionneuse PDF sur deux pages, mode
  battlemap avec grille, lecture audio avec enchaînement des pistes et barre
  globale, thèmes clair et sombre, absence de débordement horizontal à 360 et
  430 px.
- Exports PDF relus par extraction de texte : titres, grille deux colonnes,
  pieds de page numérotés.
- Sauvegarde JSON : export, effacement complet, restauration — le PDF revient
  identique octet pour octet.
- Service worker vérifié en conditions réelles sur l'adresse publique : il
  s'enregistre, s'active, contrôle la page, et met en cache les 14 fichiers du
  pré-cache (worker pdf.js compris). Le repli de navigation résout bien
  `index.html` depuis le cache.

---

## Licence

Distribué sous licence **[MIT](LICENSE)**.

Vous pouvez utiliser, modifier et redistribuer ce code librement, y compris à
des fins commerciales, à la seule condition de conserver la mention de
copyright et le texte de la licence. Le logiciel est fourni « en l'état »,
sans aucune garantie.

Les bibliothèques tierces utilisées par ce projet (voir `package.json`)
restent soumises à leurs propres licences.

© 2026 FerrusDantioch
