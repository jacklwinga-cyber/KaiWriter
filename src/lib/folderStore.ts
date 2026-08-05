/**
 * folderStore.ts — P1-C folder data model
 *
 * Folders are stored in the `folders` IDB object store (added in schema v4).
 * Each document optionally references a folder via `StoredDocument.folderId`.
 *
 * Safety rules enforced here:
 *  - deleteFolder()  moves all documents inside to root before removing the folder.
 *    This means no document is ever orphaned by a folder deletion.
 *  - renameFolder()  is a pure metadata update; document refs are unchanged.
 *  - moveDocumentToFolder() validates the target folder exists (or is null = root).
 */

import { openDb } from './idb';
import { getDocument, saveDocument } from './documentStore';

const STORE = 'folders';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StoredFolder {
  /** Unique ID (nanoid-style, created via createFolderId()) */
  id: string;
  /** Display name shown in the sidebar */
  name: string;
  /** Creation timestamp (Unix ms) */
  createdAt: number;
  /** Last-modified timestamp (Unix ms) — updated on rename */
  updatedAt: number;
  /**
   * Optional sort order for sidebar display.
   * Lower values appear first. Unset = append to end.
   */
  sortOrder?: number;
}

// ---------------------------------------------------------------------------
// ID generation (mirrors createDocumentId)
// ---------------------------------------------------------------------------

export function createFolderId(): string {
  // Matches the nanoid-style IDs used elsewhere in the codebase
  return `folder_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

/** Create a new folder. Returns the created StoredFolder. */
export async function createFolder(name: string, sortOrder?: number): Promise<StoredFolder> {
  const db = await openDb();
  const now = Date.now();
  const folder: StoredFolder = {
    id: createFolderId(),
    name: name.trim() || 'Untitled Folder',
    createdAt: now,
    updatedAt: now,
    sortOrder,
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).add(folder);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(folder);
  });
}

/** Retrieve a single folder by id. Returns null if not found. */
export async function getFolder(id: string): Promise<StoredFolder | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(id);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve((req.result as StoredFolder) ?? null);
  });
}

/** List all folders, sorted by sortOrder (asc) then createdAt (asc). */
export async function listFolders(): Promise<StoredFolder[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const folders = (req.result as StoredFolder[]) ?? [];
      resolve(
        folders.sort((a, b) => {
          const orderA = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
          const orderB = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
          if (orderA !== orderB) return orderA - orderB;
          return a.createdAt - b.createdAt;
        }),
      );
    };
  });
}

/** Rename a folder. No-op if the folder doesn't exist. */
export async function renameFolder(id: string, newName: string): Promise<void> {
  const folder = await getFolder(id);
  if (!folder) return;
  const db = await openDb();
  const updated: StoredFolder = { ...folder, name: newName.trim() || folder.name, updatedAt: Date.now() };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).put(updated);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve();
  });
}

/**
 * Delete a folder.
 *
 * Safety: all documents inside the folder are moved to root (folderId = undefined)
 * BEFORE the folder record is removed. This ensures no document is orphaned.
 */
export async function deleteFolder(id: string): Promise<void> {
  // 1. Move all documents in this folder to root
  const { listDocuments } = await import('./documentStore');
  const docs = await listDocuments();
  const inFolder = docs.filter((d) => d.folderId === id);
  for (const doc of inFolder) {
    const { folderId: _removed, ...withoutFolder } = doc;
    await saveDocument(withoutFolder);
  }

  // 2. Remove the folder record
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).delete(id);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve();
  });
}

// ---------------------------------------------------------------------------
// Document ↔ folder assignment
// ---------------------------------------------------------------------------

/**
 * Move a document into a folder (or to root if folderId is null/undefined).
 * Validates that the target folder exists before assigning.
 * Throws if targetFolderId is set but the folder does not exist.
 */
export async function moveDocumentToFolder(
  documentId: string,
  targetFolderId: string | null,
): Promise<void> {
  const doc = await getDocument(documentId);
  if (!doc) return;

  if (targetFolderId) {
    const folder = await getFolder(targetFolderId);
    if (!folder) {
      throw new Error(
        `moveDocumentToFolder: folder "${targetFolderId}" does not exist.`,
      );
    }
    await saveDocument({ ...doc, folderId: targetFolderId });
  } else {
    // Move to root — remove folderId
    const { folderId: _removed, ...withoutFolder } = doc;
    await saveDocument(withoutFolder);
  }
}

/**
 * List all documents in a specific folder.
 * Pass null for folderId to list root (unfiled) documents.
 */
export async function listDocumentsInFolder(
  folderId: string | null,
): Promise<import('./documentStore').StoredDocument[]> {
  const { listDocuments } = await import('./documentStore');
  const all = await listDocuments();
  if (folderId === null) {
    return all.filter((d) => !d.folderId);
  }
  return all.filter((d) => d.folderId === folderId);
}

/**
 * Count documents in each folder.
 * Returns a Map from folderId → count. Root documents use key '' (empty string).
 */
export async function countDocumentsPerFolder(): Promise<Map<string, number>> {
  const { listDocuments } = await import('./documentStore');
  const docs = await listDocuments();
  const counts = new Map<string, number>();
  for (const doc of docs) {
    const key = doc.folderId ?? '';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}
