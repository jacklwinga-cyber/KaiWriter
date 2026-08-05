/**
 * Tests for documentStore — focused on soft-delete / trash semantics.
 * Uses fake-indexeddb (polyfilled globally in src/test/setup.ts).
 *
 * Each test gets a fresh IDB via the module reset trick: we re-import the
 * store module inside beforeEach so the openDb() call re-runs against a
 * freshly reset fake IDB environment.
 */
import { describe, it, expect } from 'vitest';

// We reimport per describe block so IDB resets between suites.
// fake-indexeddb/auto resets between test files automatically.
import {
  saveDocument,
  getDocument,
  listDocuments,
  trashDocument,
  restoreDocument,
  listTrashedDocuments,
  permanentlyDeleteDocument,
  countDocuments,
  type StoredDocument,
} from '../documentStore';

function makeDoc(id: string, overrides: Partial<StoredDocument> = {}): StoredDocument {
  return {
    id,
    name: `Doc ${id}`,
    lastModified: Date.now(),
    content: '{"root":{}}',
    ...overrides,
  };
}

describe('documentStore — active library', () => {
  it('saves and retrieves a document', async () => {
    const doc = makeDoc('a1');
    await saveDocument(doc);
    const result = await getDocument('a1');
    expect(result?.id).toBe('a1');
    expect(result?.name).toBe('Doc a1');
  });

  it('listDocuments excludes trashed documents', async () => {
    await saveDocument(makeDoc('active'));
    await saveDocument(makeDoc('will-trash'));
    await trashDocument('will-trash');

    const list = await listDocuments();
    const ids = list.map((d) => d.id);
    expect(ids).toContain('active');
    expect(ids).not.toContain('will-trash');
  });

  it('countDocuments excludes trashed documents', async () => {
    await saveDocument(makeDoc('c1'));
    await saveDocument(makeDoc('c2'));
    await trashDocument('c2');
    expect(await countDocuments()).toBe(1);
  });

  it('pinned documents sort before unpinned', async () => {
    await saveDocument(makeDoc('unpinned', { lastModified: 200 }));
    await saveDocument(makeDoc('pinned',   { lastModified: 100, pinned: true }));
    const list = await listDocuments();
    expect(list[0].id).toBe('pinned');
  });
});

describe('documentStore — soft-delete / trash', () => {
  it('trashDocument sets deletedAt on the document', async () => {
    await saveDocument(makeDoc('t1'));
    const before = Date.now();
    await trashDocument('t1');
    const doc = await getDocument('t1');
    expect(doc?.deletedAt).toBeDefined();
    expect(doc?.deletedAt).toBeGreaterThanOrEqual(before);
  });

  it('trashed document appears in listTrashedDocuments', async () => {
    await saveDocument(makeDoc('t2'));
    await trashDocument('t2');
    const trashed = await listTrashedDocuments();
    expect(trashed.map((d) => d.id)).toContain('t2');
  });

  it('listTrashedDocuments does not include active documents', async () => {
    await saveDocument(makeDoc('active-only'));
    const trashed = await listTrashedDocuments();
    expect(trashed.map((d) => d.id)).not.toContain('active-only');
  });

  it('trashDocument on non-existent id is a no-op', async () => {
    await expect(trashDocument('nonexistent')).resolves.not.toThrow();
  });
});

describe('documentStore — restore', () => {
  it('restoreDocument removes deletedAt and returns doc to active list', async () => {
    await saveDocument(makeDoc('r1'));
    await trashDocument('r1');
    await restoreDocument('r1');

    const active = await listDocuments();
    const trashed = await listTrashedDocuments();

    expect(active.map((d) => d.id)).toContain('r1');
    expect(trashed.map((d) => d.id)).not.toContain('r1');

    const doc = await getDocument('r1');
    expect(doc?.deletedAt).toBeUndefined();
  });

  it('restoring a document preserves its content and name', async () => {
    const original = makeDoc('r2', { name: 'Important Report', content: '{"root":{"v":1}}' });
    await saveDocument(original);
    await trashDocument('r2');
    await restoreDocument('r2');

    const doc = await getDocument('r2');
    expect(doc?.name).toBe('Important Report');
    expect(doc?.content).toBe('{"root":{"v":1}}');
  });
});

describe('documentStore — permanent delete', () => {
  it('permanentlyDeleteDocument removes the document entirely', async () => {
    await saveDocument(makeDoc('pd1'));
    await trashDocument('pd1');
    await permanentlyDeleteDocument('pd1');

    expect(await getDocument('pd1')).toBeNull();
    expect((await listTrashedDocuments()).map((d) => d.id)).not.toContain('pd1');
  });

  it('permanentlyDeleteDocument only affects the targeted document', async () => {
    await saveDocument(makeDoc('pd-target'));
    await saveDocument(makeDoc('pd-bystander'));
    await trashDocument('pd-target');
    await permanentlyDeleteDocument('pd-target');

    expect(await getDocument('pd-bystander')).not.toBeNull();
  });

  it('Empty Trash: permanently deleting all trashed docs leaves active ones intact', async () => {
    await saveDocument(makeDoc('keep-me'));
    await saveDocument(makeDoc('trash-a'));
    await saveDocument(makeDoc('trash-b'));
    await trashDocument('trash-a');
    await trashDocument('trash-b');

    const trashed = await listTrashedDocuments();
    for (const doc of trashed) {
      await permanentlyDeleteDocument(doc.id);
    }

    const active = await listDocuments();
    expect(active.map((d) => d.id)).toContain('keep-me');
    expect(active).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// P0-C2: Revision / stale-write protection
// ---------------------------------------------------------------------------

describe('documentStore — revision protection (P0-C2)', () => {
  it('saveDocument stamps an incrementing revision on every write', async () => {
    const doc = makeDoc('rev1');
    await saveDocument(doc);
    const v1 = await getDocument('rev1');
    expect(v1?.revision).toBeGreaterThan(0);

    await saveDocument({ ...doc, content: '{"root":{"v":2}}' });
    const v2 = await getDocument('rev1');
    expect(v2?.revision).toBeGreaterThan(v1!.revision!);
  });

  it('saveDocumentLocal rejects a write with a lower revision than stored', async () => {
    // Import saveDocumentLocal for the low-level test
    const { saveDocumentLocal } = await import('../documentStore');

    // Write revision=10
    await saveDocumentLocal({ ...makeDoc('cas1'), revision: 10, content: 'new' });
    // Attempt to write revision=5 (stale)
    const accepted = await saveDocumentLocal({ ...makeDoc('cas1'), revision: 5, content: 'old' });

    expect(accepted).toBe(false);
    const stored = await getDocument('cas1');
    expect(stored?.content).toBe('new');  // stale write must NOT win
    expect(stored?.revision).toBe(10);
  });

  it('saveDocumentLocal accepts a write with equal revision (internal ops)', async () => {
    const { saveDocumentLocal } = await import('../documentStore');

    // Simulate trash/restore which pass the same revision unchanged
    await saveDocumentLocal({ ...makeDoc('cas2'), revision: 7 });
    const accepted = await saveDocumentLocal({
      ...makeDoc('cas2'),
      revision: 7,
      deletedAt: Date.now(),
    });
    expect(accepted).toBe(true);
  });

  it('concurrent saves: later-triggered save wins even if it completes first', async () => {
    // This is the adversarial race P0-C2 must prevent:
    //   1. save A triggered  (saveOrder = N)
    //   2. save B triggered  (saveOrder = N+1, newer content)
    //   3. B's IDB write finishes first
    //   4. A's IDB write arrives → must be rejected (A is stale)
    //
    // We simulate this by calling saveDocument twice without awaiting the first,
    // then confirming the last-triggered call's content is what's stored.

    const id = 'race1';

    // Both calls start concurrently (neither is awaited before the other begins)
    const saveA = saveDocument({ ...makeDoc(id), content: 'content-A' }); // saveOrder N
    const saveB = saveDocument({ ...makeDoc(id), content: 'content-B' }); // saveOrder N+1

    await Promise.all([saveA, saveB]);

    const stored = await getDocument(id);
    // B was triggered later so has higher saveOrder → B must win
    expect(stored?.content).toBe('content-B');
  });

  it('multiple rapid saves: final save content always wins', async () => {
    const id = 'race2';
    const saves = ['first', 'second', 'third', 'fourth', 'fifth'].map((label) =>
      saveDocument({ ...makeDoc(id), content: label }),
    );
    await Promise.all(saves);

    const stored = await getDocument(id);
    // 'fifth' was triggered last (highest saveOrder)
    expect(stored?.content).toBe('fifth');
  });

  it('revision is monotonic across multiple saves of the same document', async () => {
    const id = 'mono1';
    await saveDocument({ ...makeDoc(id), content: 'v1' });
    await saveDocument({ ...makeDoc(id), content: 'v2' });
    await saveDocument({ ...makeDoc(id), content: 'v3' });

    const doc = await getDocument(id);
    // Stored revision must be >= 3 (at minimum one increment per call)
    expect(doc?.revision).toBeGreaterThanOrEqual(3);
  });

  it('trashDocument preserves the current revision', async () => {
    await saveDocument(makeDoc('trash-rev'));
    const beforeTrash = await getDocument('trash-rev');
    await trashDocument('trash-rev');
    const afterTrash = await getDocument('trash-rev');

    // Revision should be unchanged by trash (same doc, just deletedAt set)
    expect(afterTrash?.revision).toBe(beforeTrash?.revision);
    expect(afterTrash?.deletedAt).toBeDefined();
  });
});
