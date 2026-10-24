export function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function debounce(fn, delay = 400) {
  let timer = null;
  const wrapped = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, delay);
  };
  wrapped.cancel = () => {
    clearTimeout(timer);
    timer = null;
  };
  // N'execute `fn` que si un appel est encore en attente. Sans cette garde,
  // fermer un editeur sans rien modifier reenregistrait l'element (et changeait
  // sa date), et fermer l'editeur juste apres une suppression ressuscitait
  // l'element supprime.
  wrapped.flush = (...args) => {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
    fn(...args);
  };
  return wrapped;
}

const DATE_FMT = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
const TIME_FMT = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

/**
 * Accepte un horodatage ou une date « AAAA-MM-JJ » (champ date du journal).
 * `new Date('2026-10-11')` lirait cette chaine comme minuit UTC, soit la
 * veille au soir dans les fuseaux a l'ouest de Greenwich (Antilles, Guyane,
 * Polynesie…) : on la construit donc en heure locale.
 */
function toDate(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(value);
}

export function formatDate(ts) {
  if (!ts) return '';
  return DATE_FMT.format(toDate(ts));
}

export function formatDateTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${DATE_FMT.format(d)} à ${TIME_FMT.format(d)}`;
}

export function formatTime(ts) {
  if (!ts) return '';
  return TIME_FMT.format(new Date(ts));
}

/** « il y a 3 min », « hier », « 12 mars » */
export function formatRelative(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const min = Math.round(diff / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'hier';
  if (days < 7) return `il y a ${days} jours`;
  return formatDate(ts);
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '—';
  if (bytes < 1024) return `${bytes} o`;
  const units = ['Ko', 'Mo', 'Go'];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0).replace('.', ',')} ${units[i]}`;
}

/** Secondes -> « 3:07 » */
export function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

/** Nom de fichier sans caracteres interdits. */
export function safeFilename(name, fallback = 'omni-grimoire') {
  const clean = String(name ?? '')
    .normalize('NFD') // separe les accents, retires par le filtre ci-dessous
    .replace(/[^a-zA-Z0-9 _-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60);
  return clean || fallback;
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function downloadText(text, filename, mime = 'text/plain;charset=utf-8') {
  downloadBlob(new Blob([text], { type: mime }), filename);
}

/**
 * Ouvre un selecteur de fichiers et resout avec la liste choisie (liste vide
 * si l'utilisateur annule).
 *
 * On ne se fie pas au retour du focus sur la fenetre pour detecter
 * l'annulation : sur Android, ce focus revient AVANT l'evenement `change`
 * quand le fichier est gros ou stocke dans le cloud (il est d'abord copie),
 * et l'import etait alors perdu sans message. L'evenement `cancel` des
 * navigateurs recents suffit ; ailleurs, le champ cache est simplement
 * nettoye a l'ouverture suivante.
 */
export function pickFiles({ accept = '*/*', multiple = false } = {}) {
  document.querySelectorAll('input[data-file-picker]').forEach((old) => old.remove());
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.style.display = 'none';
    input.dataset.filePicker = '';
    document.body.appendChild(input);
    const done = (files) => {
      input.remove();
      resolve(files);
    };
    input.addEventListener('change', () => done(Array.from(input.files || [])), { once: true });
    input.addEventListener('cancel', () => done([]), { once: true });
    input.click();
  });
}

/** Initiales pour l'avatar d'un personnage. */
export function initials(name) {
  const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Couleur stable derivee du nom (avatars). */
export function colorFromString(str) {
  let hash = 0;
  for (let i = 0; i < String(str).length; i++) {
    hash = (hash * 31 + String(str).charCodeAt(i)) | 0;
  }
  return `hsl(${Math.abs(hash) % 360} 52% 52%)`;
}

export function move(array, from, to) {
  if (to < 0 || to >= array.length) return array;
  const next = [...array];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
