# Grimoire — Compagnon JDR — notes pour Claude

PWA compagnon de jeu de rôle en **React + Vite** : fiches à structure libre,
lanceur de dés, journal, visionneuse PDF, lecteur audio. Contrairement aux PWA
en JS pur de l'utilisateur, ce projet passe par une **étape de compilation**.

```bash
npm install
npm run dev      # développement
npm run build    # produit dist/
npm start        # build puis aperçu sur http://localhost:4173
npm test         # scripts/test-core.mjs
```

Le fichier `Lancer Grimoire.cmd` fait tout cela d'un double-clic sous Windows
(installe les dépendances au premier lancement, compile, puis ouvre le
navigateur).

## Version du service worker : automatique, ne rien incrémenter à la main

Le service worker est **généré à chaque build** par `vite-plugin-pwa`, configuré
en `registerType: 'autoUpdate'` dans `vite.config.js`. Le greffon calcule sa
propre liste de fichiers et ses révisions : il n'y a aucune constante de version
à modifier, et aucun fichier de service worker dans le dépôt.

## Chemin de base variable

```js
const base = process.env.GITHUB_PAGES ? `/${process.env.GITHUB_PAGES}/` : '/';
```

En local le site est servi depuis la racine ; le workflow de déploiement pose la
variable `GITHUB_PAGES`. **Ce `base` alimente aussi le manifeste PWA**
(`id`, `start_url`, `scope`) : le modifier sans cohérence casserait
l'installation de l'application.

## ⚠️ Le fichier .cmd doit rester en CRLF

`.gitattributes` contient une exception délibérée :

```
*.cmd text eol=crlf
```

`cmd.exe` interprète mal un fichier `.cmd` n'ayant que des LF, en particulier les
blocs entre parenthèses (`if errorlevel 1 ( ... )`) — et `Lancer Grimoire.cmd`
en contient plusieurs. **Ne pas retirer cette règle.**

## À savoir

- Déploiement automatique par GitHub Actions (`.github/workflows/deploy.yml`) à
  chaque envoi sur `main` → https://ferrusdantioch.github.io/grimoire-jdr/
- Code et commentaires en français : conserver ce niveau d'explication.
