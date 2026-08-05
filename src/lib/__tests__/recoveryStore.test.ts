import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveRecoverySnapshot,
  loadRecoverySnapshot,
  clearRecoverySnapshot,
  hasNewerRecovery,
  RECOVERY_INTERVAL_MS,
  type RecoverySnapshot,
} from '../recoveryStore';

const DOC_ID = 'test-doc-123';
const OTHER_DOC_ID = 'other-doc-456';

function makeSnapshot(overrides: Partial<RecoverySnapshot> = {}): RecoverySnapshot {
  return {
    documentId: DOC_ID,
    name: 'Test Doc',
    content: '{"root":{"children":[]}}',
    savedAt: 1000,
    snapshotAt: 2000,
    ...overrides,
  };
}

describe('recoveryStore', () => {
  beforeEach(() => localStorage.clear());

  // ── save / load ────────────────────────────────────────────────────────────

  it('saves and loads a snapshot', () => {
    const snap = makeSnapshot();
    saveRecoverySnapshot(snap);
    expect(loadRecoverySnapshot(DOC_ID)).toEqual(snap);
  });

  it('returns null when no snapshot exists', () => {
    expect(loadRecoverySnapshot('no-such-doc')).toBeNull();
  });

  it('overwrites an existing snapshot with a newer one', () => {
    saveRecoverySnapshot(makeSnapshot({ snapshotAt: 1000 }));
    saveRecoverySnapshot(makeSnapshot({ snapshotAt: 2000, content: 'newer' }));
    expect(loadRecoverySnapshot(DOC_ID)?.content).toBe('newer');
  });

  // ── clear ──────────────────────────────────────────────────────────────────

  it('clears a snapshot after confirmed save', () => {
    saveRecoverySnapshot(makeSnapshot());
    clearRecoverySnapshot(DOC_ID);
    expect(loadRecoverySnapshot(DOC_ID)).toBeNull();
  });

  it('clear on non-existent key does not throw', () => {
    expect(() => clearRecoverySnapshot('nonexistent')).not.toThrow();
  });

  // ── isolation ──────────────────────────────────────────────────────────────

  it('one document snapshot cannot be read as another', () => {
    saveRecoverySnapshot(makeSnapshot({ documentId: DOC_ID, content: 'doc-a' }));
    saveRecoverySnapshot(makeSnapshot({ documentId: OTHER_DOC_ID, content: 'doc-b' }));

    expect(loadRecoverySnapshot(DOC_ID)?.content).toBe('doc-a');
    expect(loadRecoverySnapshot(OTHER_DOC_ID)?.content).toBe('doc-b');

    clearRecoverySnapshot(DOC_ID);
    expect(loadRecoverySnapshot(DOC_ID)).toBeNull();
    expect(loadRecoverySnapshot(OTHER_DOC_ID)?.content).toBe('doc-b'); // untouched
  });

  // ── hasNewerRecovery ───────────────────────────────────────────────────────

  it('returns true when snapshot is newer than last saved', () => {
    const lastSaved = 1000;
    saveRecoverySnapshot(makeSnapshot({ snapshotAt: lastSaved + 5000 }));
    expect(hasNewerRecovery(DOC_ID, lastSaved)).toBe(true);
  });

  it('returns false when snapshot is older than last saved', () => {
    const lastSaved = 9000;
    saveRecoverySnapshot(makeSnapshot({ snapshotAt: lastSaved - 1000 }));
    expect(hasNewerRecovery(DOC_ID, lastSaved)).toBe(false);
  });

  it('returns false within the 2-second grace period', () => {
    const lastSaved = 1000;
    saveRecoverySnapshot(makeSnapshot({ snapshotAt: lastSaved + 1500 })); // < 2000ms grace
    expect(hasNewerRecovery(DOC_ID, lastSaved)).toBe(false);
  });

  it('returns false when no snapshot exists', () => {
    expect(hasNewerRecovery(DOC_ID, 0)).toBe(false);
  });

  it('recovery does not reappear after clear (post-restore)', () => {
    saveRecoverySnapshot(makeSnapshot({ snapshotAt: 9999 }));
    expect(hasNewerRecovery(DOC_ID, 1000)).toBe(true);
    clearRecoverySnapshot(DOC_ID);
    expect(hasNewerRecovery(DOC_ID, 1000)).toBe(false); // cleared — won't reappear
  });

  // ── quota / storage failure ────────────────────────────────────────────────

  it('handles QuotaExceededError gracefully without crashing', () => {
    const original = localStorage.setItem.bind(localStorage);
    localStorage.setItem = () => { throw new DOMException('QuotaExceededError', 'QuotaExceededError'); };
    expect(() => saveRecoverySnapshot(makeSnapshot())).not.toThrow();
    localStorage.setItem = original;
  });

  it('handles corrupt localStorage data gracefully', () => {
    localStorage.setItem('kaiwriter-recovery-' + DOC_ID, 'not-valid-json{{{{');
    expect(loadRecoverySnapshot(DOC_ID)).toBeNull();
    expect(hasNewerRecovery(DOC_ID, 0)).toBe(false);
  });

  // ── RECOVERY_INTERVAL_MS sanity ────────────────────────────────────────────

  it('RECOVERY_INTERVAL_MS is defined and reasonable (10s–5min)', () => {
    expect(RECOVERY_INTERVAL_MS).toBeGreaterThanOrEqual(10_000);
    expect(RECOVERY_INTERVAL_MS).toBeLessThanOrEqual(300_000);
  });
});
