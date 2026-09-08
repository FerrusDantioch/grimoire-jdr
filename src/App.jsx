import { useEffect, useState } from 'react';
import { useApp } from './state/AppContext.jsx';
import { useDice } from './state/DiceContext.jsx';
import { usePlayer } from './state/PlayerContext.jsx';
import { useInstallPrompt } from './lib/usePwa.js';
import CharactersView from './views/CharactersView.jsx';
import JournalView from './views/JournalView.jsx';
import PdfView from './views/PdfView.jsx';
import MusicView from './views/MusicView.jsx';
import SettingsView from './views/SettingsView.jsx';
import DiceWidget from './components/DiceWidget.jsx';
import MiniPlayer from './components/MiniPlayer.jsx';
import Toasts from './components/Toasts.jsx';
import Icon from './components/Icon.jsx';

const TABS = [
  { id: 'characters', label: 'Fiches', icon: 'users' },
  { id: 'journal', label: 'Journal', icon: 'book' },
  { id: 'documents', label: 'Documents', icon: 'file' },
  { id: 'music', label: 'Musique', icon: 'music' },
  { id: 'settings', label: 'Reglages', icon: 'settings' },
];

export default function App() {
  const { ready, theme, changeTheme, activeCharacter } = useApp();
  const { roll, setPanelOpen } = useDice();
  const { current } = usePlayer();
  const { canInstall, installed, promptInstall } = useInstallPrompt();

  const [tab, setTab] = useState('characters');
  const [openCharacter, setOpenCharacter] = useState(null);
  const [openEntry, setOpenEntry] = useState(null);
  const [openDoc, setOpenDoc] = useState(null);

  /* Raccourcis du manifeste : ?tab=journal, ?roll=1d20 */
  useEffect(() => {
    if (!ready) return;
    const params = new URLSearchParams(window.location.search);
    const wanted = params.get('tab');
    if (wanted && TABS.some((t) => t.id === wanted)) setTab(wanted);
    const expr = params.get('roll');
    if (expr) {
      roll(expr);
      setPanelOpen(true);
    }
    if (wanted || expr) {
      window.history.replaceState({}, '', window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  /* Reserve la place de la barre de lecture sous le contenu. */
  useEffect(() => {
    document.documentElement.style.setProperty('--mini-h', current ? '54px' : '0px');
  }, [current]);

  const documentOpen = tab === 'documents' && openDoc;

  if (!ready) {
    return (
      <div className="boot">
        <div className="boot__mark" aria-hidden="true">
          <Icon name="dice" size={40} />
        </div>
        <p className="small muted">Ouverture du grimoire…</p>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <span className="topbar__brand">
          <Icon name="dice" size={20} style={{ color: 'var(--accent)' }} />
          <span className="topbar__title">Grimoire</span>
        </span>

        {activeCharacter && (
          <button
            type="button"
            className="chip topbar__active"
            onClick={() => {
              setTab('characters');
              setOpenCharacter(activeCharacter.id);
            }}
            title="Fiche liee au lanceur de des"
          >
            <Icon name="users" size={13} />
            {activeCharacter.name}
          </button>
        )}

        <span className="topbar__spacer" />

        {canInstall && !installed && (
          <button type="button" className="btn btn--sm btn--primary" onClick={promptInstall}>
            <Icon name="download" />
            <span className="hide-xs">Installer</span>
          </button>
        )}

        <button
          type="button"
          className="btn btn--ghost btn--icon"
          onClick={() => changeTheme(theme === 'grimoire' ? 'parchemin' : 'grimoire')}
          aria-label={theme === 'grimoire' ? 'Passer au theme clair' : 'Passer au theme sombre'}
        >
          <Icon name={theme === 'grimoire' ? 'sun' : 'moon'} />
        </button>
      </header>

      <div className="shell">
        <nav className="rail" aria-label="Sections de l’application">
          <span className="rail__label">Table de jeu</span>
          {TABS.map((t) => (
            <button key={t.id} type="button" aria-current={tab === t.id} onClick={() => setTab(t.id)}>
              <Icon name={t.icon} />
              {t.label}
            </button>
          ))}
        </nav>

        <main className={`content${documentOpen ? ' content--flush' : ''}`}>
          <div className={documentOpen ? '' : 'content__inner'}>
            {tab === 'characters' && <CharactersView openId={openCharacter} setOpenId={setOpenCharacter} />}
            {tab === 'journal' && <JournalView openId={openEntry} setOpenId={setOpenEntry} />}
            {tab === 'documents' && <PdfView openId={openDoc} setOpenId={setOpenDoc} />}
            {tab === 'music' && <MusicView />}
            {tab === 'settings' && <SettingsView />}
          </div>
        </main>
      </div>

      <MiniPlayer onOpen={() => setTab('music')} />

      <nav className="tabbar" aria-label="Sections de l’application">
        {TABS.map((t) => (
          <button key={t.id} type="button" aria-current={tab === t.id} onClick={() => setTab(t.id)}>
            <Icon name={t.icon} />
            {t.label}
          </button>
        ))}
      </nav>

      <DiceWidget />
      <Toasts />
    </div>
  );
}
