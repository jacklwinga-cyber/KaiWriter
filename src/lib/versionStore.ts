import { openDb } from './idb';

const STORE_NAME = 'versions';
const MAX_VERSIONS = 50;
const AUTO_INTERVAL_MS = 5 * 60 * 1000; // 5 min — was 15 min, now tighter safety net

export interface DocumentVersion {
  id: string;
  documentId: string;
  name: string;
  content: string;
  createdAt: number;
  source: 'auto' | 'manual';
}


export async function listVersions(documentId: string): Promise<DocumentVersion[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('documentId');
    const request = index.getAll(documentId);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const versions = (request.result as DocumentVersion[]) ?? [];
      resolve(versions.sort((a, b) => b.createdAt - a.createdAt));
    };
  });
}

async function trimOldVersions(documentId: string): Promise<void> {
  const versions = await listVersions(documentId);
  if (versions.length <= MAX_VERSIONS) return;
  const db = await openDb();
  const toDelete = versions.slice(MAX_VERSIONS);
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    for (const v of toDelete) store.delete(v.id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function saveVersion(
  documentId: string,
  name: string,
  content: string,
  source: 'auto' | 'manual',
): Promise<DocumentVersion> {
  const version: DocumentVersion = {
    id: `${documentId}-${Date.now()}`,
    documentId,
    name,
    content,
    createdAt: Date.now(),
    source,
  };
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(version);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  await trimOldVersions(documentId);
  return version;
}

/** Save an auto snapshot if enough time passed since the last one. */
export async function maybeAutoSaveVersion(
  documentId: string,
  name: string,
  content: string,
): Promise<void> {
  const versions = await listVersions(documentId);
  const lastAuto = versions.find((v) => v.source === 'auto');
  if (lastAuto && Date.now() - lastAuto.createdAt < AUTO_INTERVAL_MS) return;
  if (lastAuto?.content === content) return;
  await saveVersion(documentId, name, content, 'auto');
}

export async function deleteVersionsForDocument(documentId: string): Promise<void> {
  const versions = await listVersions(documentId);
  if (versions.length === 0) return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    for (const v of versions) store.delete(v.id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
