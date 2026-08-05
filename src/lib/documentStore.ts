import type { DocumentBranding } from './branding';

let cloudSyncUserId: string | null = null;

export function setCloudSyncUserId(userId: string | null) {
  cloudSyncUserId = userId;
}

const DB_NAME = 'kaiwriter';
const DB_VERSION = 3;
const STORE_NAME = 'documents';

export interface StoredDocument {
  id: string;
  name: string;
  lastModified: number;
  content: string;
  templateId?: string;
  pinned?: boolean;
  branding?: DocumentBranding;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('versions')) {
        const store = db.createObjectStore('versions', { keyPath: 'id' });
        store.createIndex('documentId', 'documentId', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
      if (!db.objectStoreNames.contains('comments')) {
        const store = db.createObjectStore('comments', { keyPath: 'id' });
        store.createIndex('documentId', 'documentId', { unique: false });
      }
    };
  });
}

/** Migrate legacy localStorage documents into IndexedDB (one-time). */
export async function migrateFromLocalStorage(): Promise<void> {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith('kaiwriter-doc-')) keys.push(key);
  }
  if (keys.length === 0) return;

  for (const key of keys) {
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      const id = key.replace('kaiwriter-doc-', '');
      const existing = await getDocument(id);
      if (!existing) {
        await saveDocument({
          id,
          name: parsed.name || 'Untitled Document',
          lastModified: parsed.lastModified || Date.now(),
          content: parsed.content || '',
        });
      }
    } catch {
      // skip corrupt entries
    }
  }
}

export async function getDocument(id: string): Promise<StoredDocument | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(id);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve((request.result as StoredDocument) ?? null);
  });
}

export async function saveDocument(doc: StoredDocument): Promise<void> {
  await saveDocumentLocal(doc);
  if (cloudSyncUserId) {
    void import('./cloudSync').then((m) => m.pushDocumentToCloud(cloudSyncUserId!, doc));
  }
}

async function saveDocumentLocal(doc: StoredDocument): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put({ ...doc, lastModified: doc.lastModified || Date.now() });
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

export { saveDocumentLocal };

export async function listDocuments(): Promise<StoredDocument[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const docs = (request.result as StoredDocument[]) ?? [];
      resolve(docs.sort((a, b) => {
        if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
        return b.lastModified - a.lastModified;
      }));
    };
  });
}

export async function deleteDocument(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
  const { deleteVersionsForDocument } = await import('./versionStore');
  await deleteVersionsForDocument(id);
  const { deleteCommentsForDocument } = await import('./commentStore');
  await deleteCommentsForDocument(id);
  if (cloudSyncUserId) {
    void import('./cloudSync').then((m) => m.deleteDocumentFromCloud(cloudSyncUserId!, id));
  }
}

export async function updateDocumentName(id: string, name: string): Promise<void> {
  const doc = await getDocument(id);
  if (!doc) {
    await saveDocument({ id, name, lastModified: Date.now(), content: '' });
    return;
  }
  await saveDocument({ ...doc, name, lastModified: Date.now() });
}

export async function toggleDocumentPin(id: string): Promise<void> {
  const doc = await getDocument(id);
  if (!doc) return;
  await saveDocument({ ...doc, pinned: !doc.pinned, lastModified: doc.lastModified });
}

export async function countDocuments(): Promise<number> {
  const docs = await listDocuments();
  return docs.length;
}
