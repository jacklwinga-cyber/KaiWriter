import { openDb } from './idb';

const STORE_NAME = 'versions';
export const AUTO_INTERVAL_MS = 5 * 60 * 1000; // 5 min — was 15 min, now tighter safety net
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How much writing history to keep on this device (versions are stored
 * locally, per document). The defaults match the behaviour before these
 * settings existed: 50 versions, kept until the limit is reached.
 */
export interface HistoryRetention {
  /** Newest versions kept per document. */
  maxVersions: number;
  /** Automatic snapshots older than this are deleted; 0 keeps them. Versions you saved are kept. */
  maxAgeDays: number;
  /** Take automatic snapshots while editing. */
  autoSnapshots: boolean;
}

export const RETENTION_VERSION_CHOICES = [10, 25, 50, 100] as const;
export const RETENTION_AGE_CHOICES = [0, 7, 30, 90, 365] as const;
export const DEFAULT_RETENTION: HistoryRetention = { maxVersions: 50, maxAgeDays: 0, autoSnapshots: true };
const RETENTION_KEY = 'kaiwriter-history-retention';

export function getRetention(): HistoryRetention {
  try {
    const raw = JSON.parse(localStorage.getItem(RETENTION_KEY) ?? 'null') as Partial<HistoryRetention> | null;
    if (!raw || typeof raw !== 'object') return DEFAULT_RETENTION;
    return {
      maxVersions: (RETENTION_VERSION_CHOICES as readonly number[]).includes(Number(raw.maxVersions))
        ? Number(raw.maxVersions)
        : DEFAULT_RETENTION.maxVersions,
      maxAgeDays: (RETENTION_AGE_CHOICES as readonly number[]).includes(Number(raw.maxAgeDays))
        ? Number(raw.maxAgeDays)
        : DEFAULT_RETENTION.maxAgeDays,
      autoSnapshots: raw.autoSnapshots !== false,
    };
  } catch {
    return DEFAULT_RETENTION;
  }
}

/** Save retention settings and apply them to every document's history now. Returns the number of versions deleted. */
export async function setRetention(retention: HistoryRetention): Promise<number> {
  try {
    localStorage.setItem(RETENTION_KEY, JSON.stringify(retention));
  } catch {
    // applied for this session only
  }
  return applyRetention();
}

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

/** Versions (newest first) that the retention settings say to delete. */
export function versionsToDelete(
  versions: DocumentVersion[],
  retention: HistoryRetention,
  now = Date.now(),
): DocumentVersion[] {
  const cutoff = retention.maxAgeDays > 0 ? now - retention.maxAgeDays * DAY_MS : -Infinity;
  return versions.filter((v, i) => i >= retention.maxVersions || (v.source === 'auto' && v.createdAt < cutoff));
}

async function deleteVersionsById(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    for (const id of ids) store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function trimOldVersions(documentId: string): Promise<void> {
  const versions = await listVersions(documentId);
  await deleteVersionsById(versionsToDelete(versions, getRetention()).map((v) => v.id));
}

/** Apply the retention settings to every document's history (or one document's). Returns how many versions were deleted. */
export async function applyRetention(documentId?: string): Promise<number> {
  let all: DocumentVersion[];
  if (documentId) {
    all = await listVersions(documentId);
  } else {
    const db = await openDb();
    all = await new Promise<DocumentVersion[]>((resolve, reject) => {
      const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve((request.result as DocumentVersion[]) ?? []);
    });
  }
  const byDocument = new Map<string, DocumentVersion[]>();
  for (const v of all) byDocument.set(v.documentId, [...(byDocument.get(v.documentId) ?? []), v]);
  const retention = getRetention();
  const ids: string[] = [];
  for (const versions of byDocument.values()) {
    versions.sort((a, b) => b.createdAt - a.createdAt);
    ids.push(...versionsToDelete(versions, retention).map((v) => v.id));
  }
  await deleteVersionsById(ids);
  return ids.length;
}

export async function deleteVersion(id: string): Promise<void> {
  await deleteVersionsById([id]);
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
  if (!getRetention().autoSnapshots) return;
  const versions = await listVersions(documentId);
  const lastAuto = versions.find((v) => v.source === 'auto');
  if (lastAuto && Date.now() - lastAuto.createdAt < AUTO_INTERVAL_MS) return;
  if (lastAuto?.content === content) return;
  await saveVersion(documentId, name, content, 'auto');
}

export async function deleteVersionsForDocument(documentId: string): Promise<void> {
  const versions = await listVersions(documentId);
  await deleteVersionsById(versions.map((v) => v.id));
}
