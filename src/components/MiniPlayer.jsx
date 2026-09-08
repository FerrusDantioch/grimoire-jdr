import { usePlayer } from '../state/PlayerContext.jsx';
import Icon from './Icon.jsx';

/**
 * Barre de lecture visible sur tous les onglets tant qu'une piste est chargee.
 * Un appui sur le titre ramene vers l'onglet Musique.
 */
export default function MiniPlayer({ onOpen }) {
  const { current, playing, togglePlay, next, position, duration } = usePlayer();
  if (!current) return null;

  const progress = duration ? Math.min(100, (position / duration) * 100) : 0;

  return (
    <div className="mini-player">
      <button
        type="button"
        className="mini-player__info"
        onClick={onOpen}
        aria-label={`Ouvrir le lecteur — ${current.name}`}
      >
        <span className="mini-player__name">{current.name}</span>
        <span className="small muted">{playing ? 'Lecture en cours' : 'En pause'}</span>
      </button>
      <button
        type="button"
        className="btn btn--ghost btn--icon"
        onClick={togglePlay}
        aria-label={playing ? 'Pause' : 'Lecture'}
      >
        <Icon name={playing ? 'pause' : 'play'} />
      </button>
      <button type="button" className="btn btn--ghost btn--icon" onClick={next} aria-label="Piste suivante">
        <Icon name="skipForward" />
      </button>
      <span className="mini-player__bar" style={{ width: `${progress}%` }} aria-hidden="true" />
    </div>
  );
}
