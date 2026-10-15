/**
 * Cross-device cloud sync for documents and folders.
 *
 * Push: every local change queues `doc:<id>` / `folder:<id>` in the durable
 * outbox (syncOutbox.ts). flushOutbox() uploads the current local state of each
 * queued record and keeps retrying until the cloud accepts it.
 *
 * Document uploads are conditional: they only overwrite the cloud row while it
 * still has the last_modified this device last synced (cloudLastModified). If
 * another device changed it in the meantime, both versions are kept — the other
 * device's text becomes a "(conflicted copy)" document and this device's
 * version stays in place. Nothing is overwritten silently.
 *
 * Pull: syncNow() fetches rows changed since the last pull (server updated_at
 * cursor) and applies them, skipping records with local changes still queued.
 * startCloudSync() runs it on sign-in, on Supabase Realtime change events, on
 * window focus, when the connection returns, and every minute.
 *
 * Deletions upload tombstones (purged / deleted_at) so other devices remove
 * their copy instead of re-uploading it.
 */
import { getSupabase, isSupabaseConfigured } from './supabase';
import {
  getDocument,
  listAllDocuments,
  notifySyncStatus,
  removeDocumentLocal,
  saveDocument,
  saveDocumentLocal,
  setCloudBase,
  type StoredDocument,
} from './documentStore';
import {
  getFolder,
  listFolders,
  putFolderFromCloud,
  removeFolderFromCloud,
  type StoredFolder,
} from './folderStore';
import { listComments, replaceCommentsForDocument, type DocumentComment } from './commentStore';
import type { DocumentBranding } from './branding';
import type { PageSetup } from './pageSetup';
import { createDocumentId } from './ids';
import {
  completeSync,
  emitDocumentUpdated,
  emitLibraryChanged,
  enqueueSync,
  hasPendingSync,
  pendingSync,
} from './syncOutbox';

const DOCS_TABLE = 'kaiwriter_documents';
const FOLDERS_TABLE = 'kaiwriter_folders';
const DOC_COLUMNS =
  'id, name, content, template_id, last_modified, branding, page_setup, deleted_at, purged, pinned, folder_id, updated_at';
const PULL_PAGE_SIZE = 200;
const CURSOR_PREFIX = 'kaiwriter-sync-cursor-';

interface DocumentRow {
  id: string;
  name: string;
  content: string;
  template_id: string | null;
  last_modified: number;
  branding?: DocumentBranding | null;
  page_setup?: PageSetup | null;
  deleted_at?: number | null;
  purged?: boolean | null;
  pinned?: boolean | null;
  folder_id?: string | null;
  updated_at?: string;
}

interface FolderRow {
  id: string;
  name: string;
  sort_order: number | null;
  created_at: number;
  modified_at: number;
  deleted_at: number | null;
}

function rowToDoc(row: DocumentRow): StoredDocument {
  // Optional fields are set explicitly (even to undefined) so applying the row
  // over a stored document clears values removed on the other device.
  return {
    id: row.id,
    name: row.name,
    content: row.content,
    templateId: row.template_id ?? undefined,
    lastModified: row.last_modified,
    branding: row.branding ?? undefined,
    pageSetup: row.page_setup ?? undefined,
    deletedAt: row.deleted_at ?? undefined,
    pinned: Boolean(row.pinned),
    folderId: row.folder_id ?? undefined,
    cloudLastModified: row.last_modified,
  };
}

function docToRow(userId: string, doc: StoredDocument) {
  return {
    id: doc.id,
    user_id: userId,
    name: doc.name,
    content: doc.content,
    template_id: doc.templateId ?? null,
    last_modified: doc.lastModified,
    branding: doc.branding ?? null,
    page_setup: doc.pageSetup ?? null,
    deleted_at: doc.deletedAt ?? null,
    pinned: Boolean(doc.pinned),
    folder_id: doc.folderId ?? null,
    purged: false,
  };
}

function rowToFolder(row: FolderRow): StoredFolder {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.modified_at,
    sortOrder: row.sort_order ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Push
// ---------------------------------------------------------------------------

/** Upload a document. Returns 'conflict' if another device changed the cloud row. */
async function pushDocument(userId: string, doc: StoredDocument): Promise<'ok' | 'conflict'> {
  const supabase = getSupabase();
  const row = docToRow(userId, doc);
  if (doc.cloudLastModified === undefined) {
    const { error } = await supabase.from(DOCS_TABLE).insert(row);
    if (error) {
      if (error.code === '23505') return 'conflict'; // row already exists
      throw new Error(error.message);
    }
  } else {
    const { data, error } = await supabase
      .from(DOCS_TABLE)
      .update(row)
      .eq('user_id', userId)
      .eq('id', doc.id)
      .eq('last_modified', doc.cloudLastModified)
      .select('id');
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) return 'conflict';
  }
  await setCloudBase(doc.id, doc.lastModified);
  return 'ok';
}

async function fetchDocumentRow(userId: string, id: string): Promise<DocumentRow | null> {
  const { data, error } = await getSupabase()
    .from(DOCS_TABLE)
    .select(DOC_COLUMNS)
    .eq('user_id', userId)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as DocumentRow | null) ?? null;
}

/** Save another version of a document as a new "(conflicted copy)" document. */
async function saveConflictCopy(source: StoredDocument): Promise<void> {
  await saveDocument({
    ...source,
    id: createDocumentId(),
    name: `${source.name} (conflicted copy)`,
    lastModified: Date.now(),
    cloudLastModified: undefined,
    revision: undefined,
  });
  emitLibraryChanged();
}

/** Applies a cloud version to the local copy and tells any open editor. */
async function applyCloudVersion(local: StoredDocument | null, cloud: StoredDocument): Promise<void> {
  await saveDocumentLocal({ ...cloud, revision: (local?.revision ?? 0) + 1 });
  if (local) {
    emitDocumentUpdated({
      id: cloud.id,
      content: cloud.content,
      name: cloud.name,
      pageSetup: cloud.pageSetup,
      previousBase: local.cloudLastModified,
    });
  }
}

/** Another device changed this document since we last synced it. Keep both versions. */
async function resolveConflict(userId: string, local: StoredDocument): Promise<void> {
  const row = await fetchDocumentRow(userId, local.id);
  if (!row) {
    // The cloud row was removed outright (older app version): upload ours again.
    if ((await pushDocument(userId, { ...local, cloudLastModified: undefined })) === 'conflict') {
      throw new Error('Sync conflict did not resolve');
    }
    return;
  }

  if (row.purged) {
    // Permanently deleted on another device. Keep this device's edits as a new document.
    if (!local.deletedAt) await saveConflictCopy(local);
    await removeDocumentLocal(local.id);
    emitLibraryChanged();
    return;
  }

  const cloud = rowToDoc(row);
  const sameContent = cloud.content === local.content && cloud.name === local.name;
  if (!sameContent) {
    if (local.cloudLastModified === undefined) {
      // First sync of a document from before conflict tracking: keep the newer one,
      // matching how the app behaved before.
      if (cloud.lastModified > local.lastModified) {
        await applyCloudVersion(local, cloud);
        emitLibraryChanged();
        return;
      }
    } else {
      await saveConflictCopy(cloud);
    }
  }

  const current = (await getDocument(local.id)) ?? local;
  if ((await pushDocument(userId, { ...current, cloudLastModified: cloud.lastModified })) === 'conflict') {
    throw new Error('Sync conflict did not resolve'); // changed again meanwhile; next flush retries
  }
}

async function flushDocument(userId: string, id: string): Promise<void> {
  const local = await getDocument(id);
  if (!local) {
    // Permanently deleted here: upload a tombstone.
    const now = Date.now();
    const { error } = await getSupabase().from(DOCS_TABLE).upsert({
      id,
      user_id: userId,
      name: '',
      content: '',
      template_id: null,
      last_modified: now,
      branding: null,
      page_setup: null,
      deleted_at: now,
      pinned: false,
      folder_id: null,
      purged: true,
    });
    if (error) throw new Error(error.message);
    return;
  }
  if ((await pushDocument(userId, local)) === 'conflict') {
    await resolveConflict(userId, local);
  }
}

async function flushFolder(userId: string, id: string): Promise<void> {
  const folder = await getFolder(id);
  const now = Date.now();
  const row: FolderRow & { user_id: string } = folder
    ? {
        id,
        user_id: userId,
        name: folder.name,
        sort_order: folder.sortOrder ?? null,
        created_at: folder.createdAt,
        modified_at: folder.updatedAt,
        deleted_at: null,
      }
    : { id, user_id: userId, name: '', sort_order: null, created_at: now, modified_at: now, deleted_at: now };
  const { error } = await getSupabase().from(FOLDERS_TABLE).upsert(row);
  if (error) throw new Error(error.message);
}

let flushing: Promise<void> | null = null;
let flushAgain = false;

/** Upload every queued local change. Safe to call often; concurrent calls coalesce. */
export function flushOutbox(userId: string): Promise<void> {
  if (!isSupabaseConfigured()) return Promise.resolve();
  if (flushing) {
    flushAgain = true;
    return flushing;
  }
  const run = async () => {
    try {
      do {
        flushAgain = false;
        const entries = pendingSync(userId);
        if (entries.length === 0) break;
        notifySyncStatus('syncing');
        // Folders first so documents never reference a folder the cloud hasn't seen.
        entries.sort(([a], [b]) => Number(b.startsWith('folder:')) - Number(a.startsWith('folder:')));
        for (const [key, entrySeq] of entries) {
          const [kind, ...rest] = key.split(':');
          const id = rest.join(':');
          if (kind === 'doc') await flushDocument(userId, id);
          else if (kind === 'folder') await flushFolder(userId, id);
          completeSync(userId, key, entrySeq);
        }
        notifySyncStatus('synced');
      } while (flushAgain);
    } catch (err) {
      console.error('[KaiWriter] cloud sync push failed:', err);
      const offline = typeof navigator !== 'undefined' && !navigator.onLine;
      notifySyncStatus(offline ? 'offline' : 'sync_failed');
    }
  };
  // Cleared in .finally so it runs after the assignment, even if run() finishes synchronously.
  flushing = run().finally(() => {
    flushing = null;
  });
  return flushing;
}

// ---------------------------------------------------------------------------
// Pull
// ---------------------------------------------------------------------------

function readCursor(userId: string): string | null {
  try {
    return localStorage.getItem(CURSOR_PREFIX + userId);
  } catch {
    return null;
  }
}

function writeCursor(userId: string, cursor: string): void {
  try {
    localStorage.setItem(CURSOR_PREFIX + userId, cursor);
  } catch {
    // Next pull re-fetches from the old cursor; applying rows is idempotent.
  }
}

/** Apply one cloud row locally. Returns true if anything changed. */
async function applyDocumentRow(userId: string, row: DocumentRow): Promise<boolean> {
  // Local changes still queued: the push detects the conflict and keeps both versions.
  if (hasPendingSync(userId, `doc:${row.id}`)) return false;
  const local = await getDocument(row.id);
  if (row.purged) {
    if (!local) return false;
    await removeDocumentLocal(row.id);
    return true;
  }
  if (local?.cloudLastModified === row.last_modified) return false; // already up to date
  if (hasPendingSync(userId, `doc:${row.id}`)) return false; // a local save started meanwhile
  await applyCloudVersion(local, rowToDoc(row));
  return true;
}

async function pullDocuments(userId: string): Promise<boolean> {
  const supabase = getSupabase();
  let cursor = readCursor(userId);
  let changed = false;
  for (;;) {
    let query = supabase.from(DOCS_TABLE).select(DOC_COLUMNS).eq('user_id', userId);
    if (cursor) query = query.gt('updated_at', cursor);
    const { data, error } = await query.order('updated_at', { ascending: true }).limit(PULL_PAGE_SIZE);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as DocumentRow[];
    for (const row of rows) {
      if (await applyDocumentRow(userId, row)) changed = true;
    }
    const last = rows[rows.length - 1]?.updated_at;
    if (last) {
      cursor = last;
      writeCursor(userId, last);
    }
    if (rows.length < PULL_PAGE_SIZE) return changed;
  }
}

async function pullFolders(userId: string): Promise<boolean> {
  const { data, error } = await getSupabase()
    .from(FOLDERS_TABLE)
    .select('id, name, sort_order, created_at, modified_at, deleted_at')
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as FolderRow[];
  const cloudIds = new Set(rows.map((r) => r.id));
  let changed = false;

  for (const row of rows) {
    if (hasPendingSync(userId, `folder:${row.id}`)) continue;
    const local = await getFolder(row.id);
    if (row.deleted_at) {
      if (local) {
        await removeFolderFromCloud(row.id);
        changed = true;
      }
    } else if (!local || row.modified_at > local.updatedAt) {
      await putFolderFromCloud(rowToFolder(row));
      changed = true;
    }
  }

  // Folders created on this device before it was signed in to the cloud.
  for (const folder of await listFolders()) {
    if (!cloudIds.has(folder.id)) enqueueSync(userId, `folder:${folder.id}`);
  }
  return changed;
}

/** Queue local documents that have never reached the cloud or changed while signed out. */
async function queueUnsyncedDocuments(userId: string): Promise<void> {
  for (const doc of await listAllDocuments()) {
    if (doc.cloudLastModified === undefined || doc.cloudLastModified !== doc.lastModified) {
      enqueueSync(userId, `doc:${doc.id}`);
    }
  }
}

let syncChain: Promise<void> = Promise.resolve();

/** Push queued changes, then pull everything changed on other devices. */
export function syncNow(userId: string): Promise<void> {
  if (!isSupabaseConfigured()) return Promise.resolve();
  syncChain = syncChain.then(async () => {
    await queueUnsyncedDocuments(userId);
    await flushOutbox(userId);
    try {
      const foldersChanged = await pullFolders(userId);
      const docsChanged = await pullDocuments(userId);
      if (foldersChanged || docsChanged) emitLibraryChanged();
    } catch (err) {
      console.error('[KaiWriter] cloud sync pull failed:', err);
    }
    // Pulling may have queued local-only folders.
    await flushOutbox(userId);
  });
  return syncChain;
}

let stopActiveSync: (() => void) | null = null;
let activeSyncUserId: string | null = null;

/**
 * Keep this device in sync with the user's other devices until stopCloudSync()
 * is called. Starting for a different account stops the previous loop; starting
 * again for the same account (e.g. on token refresh) just syncs now.
 * Resolves when the initial sync has finished.
 */
export function startCloudSync(userId: string): Promise<void> {
  if (activeSyncUserId === userId && stopActiveSync) return syncNow(userId);
  stopCloudSync();
  if (!isSupabaseConfigured() || typeof window === 'undefined') return Promise.resolve();
  activeSyncUserId = userId;

  let timer: ReturnType<typeof setTimeout> | null = null;
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void syncNow(userId);
    }, 400);
  };
  const onVisible = () => {
    if (document.visibilityState === 'visible') schedule();
  };

  const initial = syncNow(userId);
  window.addEventListener('focus', schedule);
  window.addEventListener('online', schedule);
  document.addEventListener('visibilitychange', onVisible);
  const interval = setInterval(schedule, 60_000);

  const supabase = getSupabase();
  const channel = supabase
    .channel(`kaiwriter-sync-${userId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: DOCS_TABLE, filter: `user_id=eq.${userId}` }, schedule)
    .on('postgres_changes', { event: '*', schema: 'public', table: FOLDERS_TABLE, filter: `user_id=eq.${userId}` }, schedule)
    .subscribe();

  stopActiveSync = () => {
    if (timer) clearTimeout(timer);
    clearInterval(interval);
    window.removeEventListener('focus', schedule);
    window.removeEventListener('online', schedule);
    document.removeEventListener('visibilitychange', onVisible);
    void supabase.removeChannel(channel);
  };
  return initial;
}

export function stopCloudSync(): void {
  stopActiveSync?.();
  stopActiveSync = null;
  activeSyncUserId = null;
}

export interface SubscriptionDetails {
  plan: 'free' | 'pro' | 'teams';
  status: string;
  currentPeriodEnd: number | null;
}

export async function fetchSubscriptionDetails(userId: string): Promise<SubscriptionDetails> {
  if (!isSupabaseConfigured()) {
    return { plan: 'free', status: 'inactive', currentPeriodEnd: null };
  }
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('kaiwriter_subscriptions')
    .select('plan, status, current_period_end')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) {
    return { plan: 'free', status: 'inactive', currentPeriodEnd: null };
  }
  const periodEnd = data.current_period_end
    ? new Date(data.current_period_end).getTime()
    : null;
  const isPaid = data.status === 'active' || data.status === 'trialing';
  return {
    plan: isPaid ? (data.plan as 'free' | 'pro' | 'teams') : 'free',
    status: data.status,
    currentPeriodEnd: periodEnd,
  };
}

export async function fetchSubscriptionPlan(userId: string): Promise<'free' | 'pro' | 'teams'> {
  const details = await fetchSubscriptionDetails(userId);
  return details.plan;
}

function rowToComment(row: {
  id: string;
  document_id: string;
  author_name: string;
  body: string;
  resolved: boolean;
  created_at: string;
}): DocumentComment {
  return {
    id: row.id,
    documentId: row.document_id,
    authorName: row.author_name,
    body: row.body,
    resolved: row.resolved,
    createdAt: new Date(row.created_at).getTime(),
  };
}

export async function fetchCloudComments(userId: string, documentId: string): Promise<DocumentComment[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('kaiwriter_comments')
    .select('id, document_id, author_name, body, resolved, created_at')
    .eq('user_id', userId)
    .eq('document_id', documentId)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('Cloud comments fetch failed:', error.message);
    return [];
  }
  return (data ?? []).map(rowToComment);
}

export async function syncCommentsToCloud(userId: string, documentId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const supabase = getSupabase();
  const local = await listComments(documentId);

  const { error: deleteError } = await supabase
    .from('kaiwriter_comments')
    .delete()
    .eq('user_id', userId)
    .eq('document_id', documentId);
  if (deleteError) {
    console.error('Cloud comments delete failed:', deleteError.message);
    return;
  }

  if (local.length === 0) return;

  const { error } = await supabase.from('kaiwriter_comments').insert(
    local.map((c) => ({
      id: c.id,
      user_id: userId,
      document_id: c.documentId,
      author_name: c.authorName,
      body: c.body,
      resolved: c.resolved,
      created_at: new Date(c.createdAt).toISOString(),
    })),
  );
  if (error) console.error('Cloud comments push failed:', error.message);
}

export async function mergeCommentsFromCloud(userId: string, documentId: string): Promise<void> {
  const [cloud, local] = await Promise.all([
    fetchCloudComments(userId, documentId),
    listComments(documentId),
  ]);
  if (cloud.length === 0 && local.length === 0) return;
  if (cloud.length === 0) {
    await syncCommentsToCloud(userId, documentId);
    return;
  }
  if (local.length === 0) {
    await replaceCommentsForDocument(documentId, cloud);
    return;
  }
  const merged = new Map<string, DocumentComment>();
  for (const c of [...cloud, ...local]) merged.set(c.id, c);
  const result = [...merged.values()].sort((a, b) => b.createdAt - a.createdAt);
  await replaceCommentsForDocument(documentId, result);
  await syncCommentsToCloud(userId, documentId);
}
