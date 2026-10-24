import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages sert le site depuis /<nom-du-depot>/, alors qu'en local
// (npm start, npm run dev) il est servi depuis la racine. Le workflow de
// deploiement pose GITHUB_PAGES ; partout ailleurs on reste a la racine.
const base = process.env.GITHUB_PAGES ? `/${process.env.GITHUB_PAGES}/` : '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Pas de `includeAssets` : les icones et le favicon sont deja couverts
      // par `globPatterns`, et les lister deux fois les mettrait en cache en double.
      manifest: {
        id: base,
        name: 'Omni-Grimoire — Compagnon JDR',
        short_name: 'Omni-Grimoire',
        description:
          "Fiches de personnage, journal d'aventure, visionneuse PDF, lanceur de dés et lecteur de musique. Fonctionne hors ligne.",
        lang: 'fr',
        dir: 'ltr',
        start_url: base,
        scope: base,
        display: 'standalone',
        display_override: ['window-controls-overlay', 'standalone'],
        orientation: 'any',
        background_color: '#141019',
        theme_color: '#141019',
        categories: ['games', 'entertainment', 'utilities'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ],
        shortcuts: [
          { name: 'Lancer 1d20', short_name: '1d20', url: `${base}?roll=1d20` },
          { name: 'Journal', short_name: 'Journal', url: `${base}?tab=journal` }
        ]
      },
      workbox: {
        // Les icones citees dans le manifeste sont ajoutees automatiquement
        // par le plugin : on ne les reprend pas ici, pour eviter les doublons.
        globPatterns: ['**/*.{js,mjs,css,html,woff2}', 'favicon.svg', 'icons/apple-touch-icon.png'],
        // Dependances optionnelles de jsPDF (rendu HTML/SVG) que l'application
        // n'appelle jamais : inutile de les embarquer dans le cache hors ligne.
        globIgnores: ['**/html2canvas*', '**/purify.es*', '**/index.es*'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api/]
      },
      devOptions: { enabled: false }
    })
  ],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        // Seul React a un paquet impose. jsPDF et pdf.js sont deja importes a
        // la demande (import()) : Rollup leur donne leur propre paquet. Les
        // forcer ici rangeait aussi dans le paquet jsPDF le petit assistant de
        // chargement de Vite (jsPDF fait lui-meme des imports dynamiques), et
        // dans le paquet pdf.js l'adresse du worker : le paquet principal en
        // avait besoin et chargeait donc jsPDF et pdf.js (~220 Ko compresses)
        // des le demarrage, alors qu'ils ne servent qu'a l'export et aux PDF.
        manualChunks(id) {
          if (/\/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react';
          return undefined;
        }
      }
    }
  },
  server: { port: 5173, host: true }
});
