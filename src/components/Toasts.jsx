import { useApp } from '../state/AppContext.jsx';

export default function Toasts() {
  const { toasts } = useApp();
  if (!toasts.length) return null;
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast${t.kind === 'err' ? ' toast--err' : t.kind === 'ok' ? ' toast--ok' : ''}`}>
          {t.message}
        </div>
      ))}
    </div>
  );
}
