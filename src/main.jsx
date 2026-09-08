import React from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.jsx';
import { AppProvider } from './state/AppContext.jsx';
import { DiceProvider } from './state/DiceContext.jsx';
import { PlayerProvider } from './state/PlayerContext.jsx';
import './styles/global.css';
import './styles/parts.css';

// pdf.js 4 s'appuie sur Promise.withResolvers, absent des navigateurs
// anterieurs a Chrome 119 / Safari 17.4.
if (typeof Promise.withResolvers !== 'function') {
  Promise.withResolvers = function withResolvers() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

document.documentElement.dataset.theme = 'grimoire';

registerSW({
  immediate: true,
  onOfflineReady() {
    console.info('[pwa] pret pour une utilisation hors ligne');
  },
  onRegisterError(error) {
    console.warn('[pwa] service worker non enregistre', error);
  },
});

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppProvider>
      <PlayerProvider>
        <DiceProvider>
          <App />
        </DiceProvider>
      </PlayerProvider>
    </AppProvider>
  </React.StrictMode>
);
