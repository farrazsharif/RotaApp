// Tiny IndexedDB wrapper for the offline outbox. IndexedDB (not localStorage)
// because queued receipt photos are Blobs, which localStorage can't hold, and
// the ~5MB string cap would be hit fast.
const DB_NAME = 'caremid-offline';
const STORE = 'outbox';
const VERSION = 1;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        // autoIncrement 'seq' keeps natural FIFO order — queued actions must
        // replay in the order the carer did them (clock in before clock out).
        db.createObjectStore(STORE, { keyPath: 'seq', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
      }),
  );
}

export function idbAll<T>(): Promise<T[]> {
  return tx<T[]>('readonly', (s) => s.getAll() as IDBRequest<T[]>);
}

export function idbAdd<T>(value: T): Promise<IDBValidKey> {
  return tx('readwrite', (s) => s.add(value as unknown as Record<string, unknown>));
}

export function idbPut<T>(value: T): Promise<IDBValidKey> {
  return tx('readwrite', (s) => s.put(value as unknown as Record<string, unknown>));
}

export function idbDelete(seq: number): Promise<undefined> {
  return tx('readwrite', (s) => s.delete(seq) as IDBRequest<undefined>);
}

// IndexedDB can be unavailable (private mode, locked-down browser). Callers
// treat a false here as "no offline queue" rather than crashing.
export function idbAvailable(): boolean {
  try { return typeof indexedDB !== 'undefined' && indexedDB !== null; } catch { return false; }
}
