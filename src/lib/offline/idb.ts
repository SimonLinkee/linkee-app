// Stockage local (IndexedDB) pour le mode hors ligne de « Ma journée » du logisticien.
//  • kv      : copie de la journée (arrêts, barèmes…) et photos prises sans réseau, en attente d'envoi ;
//  • outbox  : file d'attente des saisies faites sans réseau (arrêts validés, démarrage / clôture de journée), envoyées dans l'ordre au retour du réseau.
// Tout est effacé à la déconnexion.

const DB_NAME = "linkee-offline";
const VERSION = 1;

export type OutboxEntry = {
  id?: number;
  kind: "stop" | "day_start" | "day_close";
  createdAt: number;
  userId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any;
  blobs?: { path: string; blob: Blob }[];
};

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
      if (!db.objectStoreNames.contains("outbox")) db.createObjectStore("outbox", { keyPath: "id", autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run<T>(store: "kv" | "outbox", mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const r = fn(tx.objectStore(store));
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
        tx.oncomplete = () => db.close();
        tx.onabort = () => reject(tx.error);
      }),
  );
}

export const supported = () => typeof indexedDB !== "undefined";

export async function kvGet<T>(key: string): Promise<T | undefined> {
  if (!supported()) return undefined;
  try {
    return (await run<T | undefined>("kv", "readonly", (s) => s.get(key))) ?? undefined;
  } catch {
    return undefined;
  }
}
export async function kvSet(key: string, value: unknown): Promise<void> {
  if (!supported()) return;
  try {
    await run("kv", "readwrite", (s) => s.put(value, key));
  } catch {
    /* stockage plein ou indisponible : le mode hors ligne se dégrade, l'appli continue */
  }
}
export async function kvDel(key: string): Promise<void> {
  if (!supported()) return;
  try {
    await run("kv", "readwrite", (s) => s.delete(key));
  } catch {
    /* ignoré */
  }
}

export async function outboxAdd(e: Omit<OutboxEntry, "id">): Promise<void> {
  await run("outbox", "readwrite", (s) => s.add(e));
}
export async function outboxList(): Promise<OutboxEntry[]> {
  if (!supported()) return [];
  try {
    const all = await run<OutboxEntry[]>("outbox", "readonly", (s) => s.getAll());
    return all.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
  } catch {
    return [];
  }
}
export async function outboxRemove(id: number): Promise<void> {
  await run("outbox", "readwrite", (s) => s.delete(id));
}

/** À la déconnexion : plus rien de l'utilisateur ne reste sur l'appareil. */
export async function clearAllOffline(): Promise<void> {
  if (!supported()) return;
  try {
    await run("kv", "readwrite", (s) => s.clear());
    await run("outbox", "readwrite", (s) => s.clear());
  } catch {
    /* ignoré */
  }
}
