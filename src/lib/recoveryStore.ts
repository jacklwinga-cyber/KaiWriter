/**
 * Emergency crash-recovery snapshots stored in localStorage.
 *
 * localStorage writes are synchronous — they survive browser/tab crashes
 * where an async IndexedDB write in-flight would not.
 *
 * Lifecycle:
 *   1. DocumentSavePlugin writes a snapshot every RECOVERY_INTERVAL_MS.
 *   2. beforeunload writes a final flush.
 *   3. After a successful IDB save, the snapshot is cleared.
 *   4. On EditorView load, if a snapshot exists that is newer than the
 *      saved document, a recovery banner is shown.
 */

const KEY_PREFIX = 'kaiwriter-recovery-';
export const RECOVERY_INTERVAL_MS = 30_000; // 30 s

export interface RecoverySnapshot {
  documentId: string;
  name: string;
  content: string;
  savedAt: number; // IDB lastModified at time of snapshot
  snapshotAt: number; // wall-clock time of snapshot
}

export function saveRecoverySnapshot(snapshot: RecoverySnapshot): void {
  try {
    localStorage.setItem(KEY_PREFIX + snapshot.documentId, JSON.stringify(snapshot));
  } catch {
    // localStorage quota exceeded — non-critical, skip silently
  }
}

export function loadRecoverySnapshot(documentId: string): RecoverySnapshot | null {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + documentId);
    if (!raw) return null;
    return JSON.parse(raw) as RecoverySnapshot;
  } catch {
    return null;
  }
}

export function clearRecoverySnapshot(documentId: string): void {
  try {
    localStorage.removeItem(KEY_PREFIX + documentId);
  } catch {
    // ignore
  }
}

/** True if a recovery snapshot exists AND is newer than the last known saved time. */
export function hasNewerRecovery(documentId: string, lastSavedAt: number): boolean {
  const snap = loadRecoverySnapshot(documentId);
  if (!snap) return false;
  // The snapshot is useful only if its content differs and it is newer
  return snap.snapshotAt > lastSavedAt + 2_000; // 2 s grace period
}
