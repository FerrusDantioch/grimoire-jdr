import { openDB } from 'idb';

const DB_NAME = 'grimoire-jdr';
const DB_VERSION = 1;

/** Tous les magasins a cle primaire `id`, sauf `settings` (cle/valeur). */
export const STORES = {
  characters: 'characters',
  journal: 'journal',
  documents: 'documents',
  tracks: 'tracks',
  playlists: 'playlists',
  rolls: 'rolls',
};

const KEYED = Object.values(STORES);

let dbPromise = null;

export function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        for (const name of KEYED) {
          if (!db.objectStoreNames.contains(name)) {
            const store = db.createObjectStore(name, { keyPath: 'id' });
            if (name === STORES.rolls) store.createIndex('at', 'at');
            if (name === STORES.journal) store.createIndex('updatedAt', 'updatedAt');
          }
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings');
        }
      },
      blocked() {
        console.warn('[db] mise a jour bloquee par un autre onglet');
      },
    });
  }
  return dbPromise;
}

export async function getAll(store) {
  return (await getDB()).getAll(store);
}

export async function getOne(store, id) {
  return (await getDB()).get(store, id);
}

export async function put(store, value) {
  await (await getDB()).put(store, value);
  return value;
}

export async function putMany(store, values) {
  const db = await getDB();
  const tx = db.transaction(store, 'readwrite');
  await Promise.all([...values.map((v) => tx.store.put(v)), tx.done]);
  return values;
}

export async function remove(store, id) {
  await (await getDB()).delete(store, id);
}

export async function clearStore(store) {
  await (await getDB()).clear(store);
}

export async function getSetting(key, fallback = null) {
  const value = await (await getDB()).get('settings', key);
  return value === undefined ? fallback : value;
}

export async function setSetting(key, value) {
  await (await getDB()).put('settings', value, key);
  return value;
}

/** Ne garde que les `keep` lancers les plus recents. */
export async function trimRolls(keep = 200) {
  const db = await getDB();
  const tx = db.transaction(STORES.rolls, 'readwrite');
  const excess = (await tx.store.count()) - keep;
  if (excess > 0) {
    // getAllKeys sur l'index « at » renvoie les cles primaires du plus ancien
    // au plus recent : on supprime donc bien les plus vieux jets.
    const doomed = await tx.store.index('at').getAllKeys(null, excess);
    await Promise.all(doomed.map((k) => tx.store.delete(k)));
  }
  await tx.done;
}

/** Estimation de l'espace disque utilise par l'application. */
export async function storageEstimate() {
  if (!navigator.storage?.estimate) return null;
  try {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    return { usage, quota, ratio: quota ? usage / quota : 0 };
  } catch {
    return null;
  }
}

/** Demande au navigateur de ne pas evincer les donnees en cas de pression disque. */
export async function requestPersistence() {
  if (!navigator.storage?.persist) return false;
  try {
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

/* ---------------- sauvegarde complete ---------------- */

const blobToDataURL = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

async function dataURLToBlob(dataUrl) {
  const res = await fetch(dataUrl);
  return res.blob();
}

/**
 * Exporte tout le contenu en JSON. Les Blob (PDF, audio) sont encodes en
 * data-URL : la sauvegarde peut donc etre volumineuse.
 */
export async function exportBackup({ includeFiles = true } = {}) {
  const dump = { format: 'grimoire-backup', version: 1, exportedAt: new Date().toISOString(), data: {} };

  for (const store of KEYED) {
    const rows = await getAll(store);
    dump.data[store] = await Promise.all(
      rows.map(async (row) => {
        if (row.blob instanceof Blob) {
          if (!includeFiles) return { ...row, blob: undefined, blobOmitted: true };
          return { ...row, blob: await blobToDataURL(row.blob), blobEncoded: true };
        }
        return row;
      })
    );
  }
  return dump;
}

export async function importBackup(dump, { merge = true } = {}) {
  if (!dump || dump.format !== 'grimoire-backup') {
    throw new Error('Fichier de sauvegarde non reconnu.');
  }
  const counts = {};
  for (const store of KEYED) {
    const rows = dump.data?.[store];
    if (!Array.isArray(rows)) continue;
    if (!merge) await clearStore(store);
    const restored = [];
    for (const row of rows) {
      if (row.blobEncoded && typeof row.blob === 'string') {
        restored.push({ ...row, blob: await dataURLToBlob(row.blob), blobEncoded: undefined });
      } else if (row.blobOmitted) {
        continue; // fichier absent de la sauvegarde : on ignore l'entree
      } else {
        restored.push(row);
      }
    }
    if (restored.length) await putMany(store, restored);
    counts[store] = restored.length;
  }
  return counts;
}

export async function wipeAll() {
  for (const store of KEYED) await clearStore(store);
  await (await getDB()).clear('settings');
}
