import type { DocumentBranding } from './branding';
import type { PageSetup } from './pageSetup';
import { openDb } from './idb';
import { enqueueSync } from './syncOutbox';

let cloudSyncUserId: string | null = null;

export function setCloudSyncUserId(userId: string | null) {
  cloudSyncUserId = userId;
}

export function getCloudSyncUserId(): string | null {
  return cloudSyncUserId;
}

/**
 * Callback invoked whenever a cloud-sync push changes state.
 * Registered by DocumentSavePlugin so the UI can reflect sync status
 * independently of local IDB save status (P0-C3).
 */
type SyncStatusCallback = (status: 'syncing' | 'synced' | 'sync_failed' | 'offline') => void;
let _onSyncStatusChange: SyncStatusCallback | null = null;

/** Register (or clear) the cloud-sync status callback. */
export function setOnSyncStatusChange(cb: SyncStatusCallback | null): void {
  _onSyncStatusChange = cb;
}

export function notifySyncStatus(status: Parameters<SyncStatusCallback>[0]): void {
  _onSyncStatusChange?.(status);
}

/** Queue a document for upload and kick off a flush (no-op when not signed in to the cloud). */
function queueCloudPush(id: string): void {
  if (!cloudSyncUserId) return;
  enqueueSync(cloudSyncUserId, `doc:${id}`);
  flushCloudPush();
}

function flushCloudPush(): void {
  if (!cloudSyncUserId) return;
  const userId = cloudSyncUserId;
  void import('./cloudSync').then((m) => m.flushOutbox(userId));
}

const STORE_NAME = 'documents';

export interface StoredDocument {
  id: string;
  name: string;
  lastModified: number;
  content: string;
  templateId?: string;
  pinned?: boolean;
  branding?: DocumentBranding;
  /** Paper size, margins, header/footer and page numbers. Undefined = defaults. */
  pageSetup?: PageSetup;
  /** Set when document is soft-deleted (moved to Trash). Unix ms timestamp. */
  deletedAt?: number;
  /**
   * Folder the document belongs to. Undefined = root / unfiled.
   * References StoredFolder.id in the `folders` IDB store.
   */
  folderId?: string;
  /**
   * Monotonically increasing revision counter.
   * Incremented on every write so stale async saves can be detected and
   * rejected before they overwrite newer content (P0-C2).
   * Documents created before this field was added have revision = undefined,
   * treated as revision 0.
   */
  revision?: number;
  /**
   * last_modified of the cloud row this local copy was last synced with.
   * Undefined = never synced. A push only succeeds while the cloud row still
   * has this value; otherwise another device changed it (conflict).
   */
  cloudLastModified?: number;
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

/**
 * Session-level save-order counter, assigned SYNCHRONOUSLY at the moment
 * saveDocument() is called — before any async/await.
 *
 * Why this matters: two concurrent saveDocument() calls cannot get the same
 * counter value because JavaScript is single-threaded and the increment is
 * synchronous. This gives us a strict causal ordering even when IDB ops
 * interleave unpredictably.
 */
let _sessionSaveCounter = 0;

/**
 * Per-document cross-session revision base.
 * On the first save for a document this session, we read the stored revision
 * and cache it here so the session counter can build on top of it.
 * Without this, after a page reload the session counter starts at 0 and the
 * saveDocumentLocal guard would reject every write (stored revision >> 0).
 */
const _documentBaseRevisions = new Map<string, number>();

/**
 * Save a document with revision protection.
 *
 * Revision assignment algorithm:
 *   revision = cross_session_base + session_save_order
 *
 * Where:
 *   - cross_session_base  = stored revision at session start (keeps us ahead
 *     of previous-session writes after a page reload)
 *   - session_save_order  = synchronously-assigned counter, strictly ordered
 *     by when the save was triggered (not when it completes)
 *
 * This prevents the stale-write race:
 *   1. User types → save A triggered → saveOrder=1
 *   2. User types more → save B triggered → saveOrder=2
 *   3. B's IDB write completes first (revision = base+2 stored)
 *   4. A's IDB write arrives — storedRev=base+2 > A's rev=base+1 → REJECTED ✓
 */
export async function saveDocument(doc: StoredDocument): Promise<void> {
  // SYNCHRONOUS: assign save order before any await so concurrent callers
  // get strictly ordered tokens regardless of async interleaving.
  const saveOrder = ++_sessionSaveCounter;
  // Queue before writing so a cloud pull running meanwhile treats this
  // document as locally changed and doesn't apply a remote version over it.
  if (cloudSyncUserId) enqueueSync(cloudSyncUserId, `doc:${doc.id}`);

  // Lazily initialise the cross-session base for this document (once per session).
  if (!_documentBaseRevisions.has(doc.id)) {
    const existing = await getDocument(doc.id);
    // Guard: a concurrent call might have populated it while we awaited
    if (!_documentBaseRevisions.has(doc.id)) {
      _documentBaseRevisions.set(doc.id, existing?.revision ?? 0);
    }
  }

  const base = _documentBaseRevisions.get(doc.id)!;
  const revision = base + saveOrder;
  const withRevision = { ...doc, revision };

  const written = await saveDocumentLocal(withRevision);
  if (written) flushCloudPush();
}

/**
 * Write a document to IDB only if incoming revision > stored revision.
 *
 * Stale write detection:
 *   - incomingRev MUST be strictly greater than storedRev
 *   - Equal revisions are also rejected (two concurrent calls must get different
 *     save-orders so equal revisions indicate a bug, not a legitimate write)
 *
 * Internal operations (trash, restore) pass the doc's own revision unchanged,
 * which equals the stored revision → this check uses strict < so equal revisions
 * are NOT rejected for internal ops.
 *
 * Returns true if the write succeeded, false if rejected as stale.
 */
export async function saveDocumentLocal(doc: StoredDocument): Promise<boolean> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    const readReq = store.get(doc.id);
    readReq.onerror = () => reject(readReq.error);
    readReq.onsuccess = () => {
      const existing = readReq.result as StoredDocument | undefined;
      const storedRev = existing?.revision ?? 0;
      const incomingRev = doc.revision ?? 0;

      // Reject stale writes: incoming revision must be >= stored revision.
      // (Internal ops — trash/restore — pass the same revision, so they
      //  satisfy incomingRev === storedRev and are NOT rejected here.)
      if (existing && incomingRev < storedRev) {
        resolve(false);
        return;
      }

      // Merge over the stored record so callers that build a partial document
      // (e.g. the editor autosave) don't drop pinned/folderId/sync metadata.
      // To clear a field, pass it explicitly as undefined.
      const writeReq = store.put({ ...existing, ...doc, lastModified: doc.lastModified || Date.now() });
      writeReq.onerror = () => reject(writeReq.error);
      writeReq.onsuccess = () => resolve(true);
    };
  });
}

/** Every stored document, including trashed ones. */
export async function listAllDocuments(): Promise<StoredDocument[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve((request.result as StoredDocument[]) ?? []);
  });
}

export async function listDocuments(): Promise<StoredDocument[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const docs = (request.result as StoredDocument[]) ?? [];
      resolve(
        docs
          .filter((d) => !d.deletedAt) // exclude trashed documents
          .sort((a, b) => {
            if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
            return b.lastModified - a.lastModified;
          }),
      );
    };
  });
}

/** Move a document to Trash (soft-delete). Recoverable via restoreDocument(). */
export async function trashDocument(id: string): Promise<void> {
  const doc = await getDocument(id);
  if (!doc) return;
  const now = Date.now();
  await saveDocumentLocal({ ...doc, deletedAt: now, lastModified: now });
  queueCloudPush(id);
}

/** Restore a trashed document back to the active library. */
export async function restoreDocument(id: string): Promise<void> {
  const db = await openDb();
  const doc = await new Promise<StoredDocument | null>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get(id);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve((request.result as StoredDocument) ?? null);
  });
  if (!doc) return;
  await saveDocumentLocal({ ...doc, deletedAt: undefined, lastModified: Date.now() });
  queueCloudPush(id);
}

/** List documents currently in Trash (soft-deleted). */
export async function listTrashedDocuments(): Promise<StoredDocument[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const docs = (request.result as StoredDocument[]) ?? [];
      resolve(
        docs
          .filter((d) => Boolean(d.deletedAt))
          .sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0)),
      );
    };
  });
}

/** Delete a document and its versions/comments from this device only. */
export async function removeDocumentLocal(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const request = tx.objectStore(STORE_NAME).delete(id);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
  const { deleteVersionsForDocument } = await import('./versionStore');
  await deleteVersionsForDocument(id);
  const { deleteCommentsForDocument } = await import('./commentStore');
  await deleteCommentsForDocument(id);
}

/** Permanently delete a document. Only call from Trash UI with explicit user confirmation. */
export async function permanentlyDeleteDocument(id: string): Promise<void> {
  await removeDocumentLocal(id);
  // The flush finds no local copy and uploads a tombstone, so other devices
  // delete it too instead of re-uploading their copy.
  queueCloudPush(id);
}

/**
 * Record that the cloud row now has `cloudLastModified`. Read and write happen
 * in one transaction so a concurrent autosave can't be overwritten.
 */
export async function setCloudBase(id: string, cloudLastModified: number): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const readReq = store.get(id);
    readReq.onerror = () => reject(readReq.error);
    readReq.onsuccess = () => {
      const existing = readReq.result as StoredDocument | undefined;
      if (!existing) return resolve();
      const writeReq = store.put({ ...existing, cloudLastModified });
      writeReq.onerror = () => reject(writeReq.error);
      writeReq.onsuccess = () => resolve();
    };
  });
}

/** @deprecated Use trashDocument() instead. Kept for any legacy callers. */
export async function deleteDocument(id: string): Promise<void> {
  return trashDocument(id);
}

export async function updateDocumentName(id: string, name: string): Promise<void> {
  const doc = await getDocument(id);
  if (!doc) {
    await saveDocument({ id, name, lastModified: Date.now(), content: '' });
    return;
  }
  await saveDocument({ ...doc, name, lastModified: Date.now() });
}

export async function updateDocumentPageSetup(id: string, pageSetup: PageSetup): Promise<void> {
  const doc = await getDocument(id);
  await saveDocument({
    ...(doc ?? { id, name: 'Untitled Document', content: '' }),
    pageSetup,
    lastModified: Date.now(),
  });
}

export async function toggleDocumentPin(id: string): Promise<void> {
  const doc = await getDocument(id);
  if (!doc) return;
  // lastModified must change for other devices to pick up the new pin state.
  await saveDocument({ ...doc, pinned: !doc.pinned, lastModified: Date.now() });
}

export async function countDocuments(): Promise<number> {
  const docs = await listDocuments();
  return docs.length;
}
