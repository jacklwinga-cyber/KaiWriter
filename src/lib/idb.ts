/**
 * Single canonical IndexedDB opener for the `kaiwriter` database.
 *
 * IMPORTANT: All persistence modules (documentStore, versionStore, commentStore)
 * must import openDb from here. Having multiple independent openDb() functions
 * that each manage their own onupgradeneeded handler creates a race condition:
 * whichever module opens the DB first defines the schema for the entire session,
 * silently omitting stores created by other modules' handlers.
 *
 * Schema history:
 *   v1 – documents store
 *   v2 – versions store (documentId index, createdAt index)
 *   v3 – comments store (documentId index)
 *   v4 – folders store; folderId index on documents
 *
 * Adding fields to stored objects (e.g. deletedAt, pinned, branding) does NOT
 * require a version bump — IDB stores plain objects and returns them as stored.
 * Only structural changes (new stores, new indexes) require bumping DB_VERSION.
 */

export const DB_NAME = 'kaiwriter';
export const DB_VERSION = 4;

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  // Return a shared promise — avoids opening multiple connections simultaneously
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      dbPromise = null; // allow retry on next call
      reject(request.error);
    };

    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      const oldVersion = event.oldVersion; // 0 = fresh install

      // v1 → documents store
      if (!db.objectStoreNames.contains('documents')) {
        db.createObjectStore('documents', { keyPath: 'id' });
      }

      // v2 → versions store
      if (!db.objectStoreNames.contains('versions')) {
        const vs = db.createObjectStore('versions', { keyPath: 'id' });
        vs.createIndex('documentId', 'documentId', { unique: false });
        vs.createIndex('createdAt',  'createdAt',  { unique: false });
      }

      // v3 → comments store
      if (!db.objectStoreNames.contains('comments')) {
        const cs = db.createObjectStore('comments', { keyPath: 'id' });
        cs.createIndex('documentId', 'documentId', { unique: false });
      }

      // v4 → folders store + folderId index on documents
      if (!db.objectStoreNames.contains('folders')) {
        db.createObjectStore('folders', { keyPath: 'id' });
      }
      // Add folderId index to documents store (only possible during upgrade)
      if (db.objectStoreNames.contains('documents')) {
        // getObjectStore requires the transaction from the upgrade event
        const upgradeTx = (event as IDBVersionChangeEvent & { target: { transaction: IDBTransaction } })
          .target.transaction;
        if (upgradeTx) {
          const docStore = upgradeTx.objectStore('documents');
          if (!docStore.indexNames.contains('folderId')) {
            docStore.createIndex('folderId', 'folderId', { unique: false });
          }
        }
      }

      void oldVersion; // referenced to suppress unused-var lint warning
    };
  });

  return dbPromise;
}


/**
 * TEST-ONLY — resets the shared DB promise and deletes the IDB database.
 * Must NOT be called in production code. Used by beforeEach in test files
 * to give every test a deterministic, empty database.
 *
 * Steps:
 *  1. Await (and close) any open connection so deleteDatabase isn't blocked.
 *  2. Null the shared promise so the next openDb() re-opens fresh.
 *  3. Delete the database from fake-indexeddb's in-memory store.
 */
export async function resetDatabaseForTests(): Promise<void> {
  if (dbPromise) {
    const db = await dbPromise.catch(() => null);
    db?.close();
    dbPromise = null;
  }
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve(); // best-effort; DB already deleted
  });
}
