/**
 * Durable queue of local changes waiting to reach the cloud.
 *
 * Entries are keys like `doc:<id>` or `folder:<id>`; the current local state of
 * that record is pushed when the outbox flushes, so repeated edits collapse
 * into one entry. Stored in localStorage per user so pending changes survive
 * reloads and offline periods, and never leak into another account.
 *
 * Each enqueue bumps a sequence number. A flush only removes an entry if its
 * sequence is unchanged, so an edit made mid-push stays queued.
 */

import type { PageSetup } from './pageSetup';

const KEY_PREFIX = 'kaiwriter-sync-outbox-';

type Outbox = Record<string, number>;

function read(userId: string): Outbox {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + userId);
    return raw ? (JSON.parse(raw) as Outbox) : {};
  } catch {
    return {};
  }
}

function write(userId: string, outbox: Outbox): void {
  try {
    localStorage.setItem(KEY_PREFIX + userId, JSON.stringify(outbox));
  } catch {
    // Quota exceeded — the next full sync re-detects unsynced records.
  }
}

let seq = Date.now();

export function enqueueSync(userId: string, key: string): void {
  const outbox = read(userId);
  outbox[key] = ++seq;
  write(userId, outbox);
}

export function pendingSync(userId: string): Array<[key: string, seq: number]> {
  return Object.entries(read(userId));
}

export function hasPendingSync(userId: string, key: string): boolean {
  return key in read(userId);
}

/** Remove an entry if it hasn't been re-queued since `entrySeq` was read. */
export function completeSync(userId: string, key: string, entrySeq: number): void {
  const outbox = read(userId);
  if (outbox[key] !== entrySeq) return;
  delete outbox[key];
  write(userId, outbox);
}

// ── Window events so open views can react to changes pulled from the cloud ──

export const LIBRARY_CHANGED_EVENT = 'kaiwriter:library-changed';
export const DOCUMENT_UPDATED_EVENT = 'kaiwriter:document-updated';

export interface DocumentUpdatedDetail {
  id: string;
  content: string;
  name: string;
  pageSetup?: PageSetup;
  /** cloudLastModified the local copy was based on before this update. */
  previousBase: number | undefined;
}

export function emitLibraryChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(LIBRARY_CHANGED_EVENT));
}

export function emitDocumentUpdated(detail: DocumentUpdatedDetail): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<DocumentUpdatedDetail>(DOCUMENT_UPDATED_EVENT, { detail }));
}
