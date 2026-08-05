/**
 * Tests for folderStore — P1-C folder data model.
 * Uses fake-indexeddb (polyfilled in src/test/setup.ts).
 */
import { describe, it, expect } from 'vitest';
import {
  createFolder,
  getFolder,
  listFolders,
  renameFolder,
  deleteFolder,
  moveDocumentToFolder,
  listDocumentsInFolder,
  countDocumentsPerFolder,
} from '../folderStore';
import { saveDocument, getDocument, type StoredDocument } from '../documentStore';

function makeDoc(id: string, overrides: Partial<StoredDocument> = {}): StoredDocument {
  return { id, name: `Doc ${id}`, lastModified: Date.now(), content: '', ...overrides };
}

// ── createFolder / getFolder ─────────────────────────────────────────────────

describe('folderStore — create & retrieve', () => {
  it('creates a folder and retrieves it by id', async () => {
    const folder = await createFolder('Design');
    expect(folder.id).toMatch(/^folder_/);
    expect(folder.name).toBe('Design');

    const retrieved = await getFolder(folder.id);
    expect(retrieved?.id).toBe(folder.id);
    expect(retrieved?.name).toBe('Design');
  });

  it('trims whitespace from folder names', async () => {
    const folder = await createFolder('  Drafts  ');
    expect(folder.name).toBe('Drafts');
  });

  it('falls back to "Untitled Folder" for blank name', async () => {
    const folder = await createFolder('   ');
    expect(folder.name).toBe('Untitled Folder');
  });

  it('getFolder returns null for nonexistent id', async () => {
    expect(await getFolder('nonexistent')).toBeNull();
  });
});

// ── listFolders ──────────────────────────────────────────────────────────────

describe('folderStore — listing', () => {
  it('lists all created folders', async () => {
    const a = await createFolder('Alpha');
    const b = await createFolder('Beta');
    const list = await listFolders();
    const ids = list.map((f) => f.id);
    expect(ids).toContain(a.id);
    expect(ids).toContain(b.id);
  });

  it('sorts folders by sortOrder ascending', async () => {
    const second = await createFolder('Second', 2);
    const first  = await createFolder('First',  1);
    const list = await listFolders();
    const myIds = [first.id, second.id];
    const mine = list.filter((f) => myIds.includes(f.id));
    expect(mine[0].id).toBe(first.id);
    expect(mine[1].id).toBe(second.id);
  });
});

// ── renameFolder ─────────────────────────────────────────────────────────────

describe('folderStore — rename', () => {
  it('renames a folder', async () => {
    const folder = await createFolder('Old Name');
    await renameFolder(folder.id, 'New Name');
    const updated = await getFolder(folder.id);
    expect(updated?.name).toBe('New Name');
    expect(updated?.updatedAt).toBeGreaterThanOrEqual(folder.updatedAt);
  });

  it('renameFolder is a no-op for nonexistent id', async () => {
    await expect(renameFolder('does-not-exist', 'Whatever')).resolves.not.toThrow();
  });
});

// ── deleteFolder — safety ────────────────────────────────────────────────────

describe('folderStore — delete (safety)', () => {
  it('deletes the folder record', async () => {
    const folder = await createFolder('Temp');
    await deleteFolder(folder.id);
    expect(await getFolder(folder.id)).toBeNull();
  });

  it('moves documents inside the deleted folder to root first', async () => {
    const folder = await createFolder('Projects');
    await saveDocument(makeDoc('doc-in-folder'));
    await moveDocumentToFolder('doc-in-folder', folder.id);

    // Confirm it's in the folder before delete
    expect((await getDocument('doc-in-folder'))?.folderId).toBe(folder.id);

    await deleteFolder(folder.id);

    // Document must still exist and be at root
    const doc = await getDocument('doc-in-folder');
    expect(doc).not.toBeNull();
    expect(doc?.folderId).toBeUndefined();
  });

  it('does not affect documents in other folders', async () => {
    const folderA = await createFolder('Folder A');
    const folderB = await createFolder('Folder B');
    await saveDocument(makeDoc('doc-a'));
    await saveDocument(makeDoc('doc-b'));
    await moveDocumentToFolder('doc-a', folderA.id);
    await moveDocumentToFolder('doc-b', folderB.id);

    await deleteFolder(folderA.id);

    const docB = await getDocument('doc-b');
    expect(docB?.folderId).toBe(folderB.id);
  });
});

// ── moveDocumentToFolder ─────────────────────────────────────────────────────

describe('folderStore — moveDocumentToFolder', () => {
  it('assigns folderId to a document', async () => {
    const folder = await createFolder('Work');
    await saveDocument(makeDoc('work-doc'));
    await moveDocumentToFolder('work-doc', folder.id);

    const doc = await getDocument('work-doc');
    expect(doc?.folderId).toBe(folder.id);
  });

  it('moves document back to root when targetFolderId is null', async () => {
    const folder = await createFolder('Temp2');
    await saveDocument(makeDoc('move-back'));
    await moveDocumentToFolder('move-back', folder.id);
    await moveDocumentToFolder('move-back', null);

    const doc = await getDocument('move-back');
    expect(doc?.folderId).toBeUndefined();
  });

  it('throws if target folder does not exist', async () => {
    await saveDocument(makeDoc('orphan-doc'));
    await expect(
      moveDocumentToFolder('orphan-doc', 'ghost-folder-id'),
    ).rejects.toThrow('does not exist');
  });

  it('is a no-op if document does not exist', async () => {
    const folder = await createFolder('NoDoc');
    await expect(
      moveDocumentToFolder('nonexistent-doc', folder.id),
    ).resolves.not.toThrow();
  });
});

// ── listDocumentsInFolder ────────────────────────────────────────────────────

describe('folderStore — listDocumentsInFolder', () => {
  it('returns documents in the specified folder', async () => {
    const folder = await createFolder('Archive');
    await saveDocument(makeDoc('arch-1'));
    await saveDocument(makeDoc('arch-2'));
    await moveDocumentToFolder('arch-1', folder.id);
    await moveDocumentToFolder('arch-2', folder.id);

    const docs = await listDocumentsInFolder(folder.id);
    const ids = docs.map((d) => d.id);
    expect(ids).toContain('arch-1');
    expect(ids).toContain('arch-2');
  });

  it('null folderId returns root (unfiled) documents only', async () => {
    const folder = await createFolder('Filed');
    await saveDocument(makeDoc('filed-doc'));
    await saveDocument(makeDoc('unfiled-doc'));
    await moveDocumentToFolder('filed-doc', folder.id);

    const root = await listDocumentsInFolder(null);
    const ids = root.map((d) => d.id);
    expect(ids).toContain('unfiled-doc');
    expect(ids).not.toContain('filed-doc');
  });
});

// ── countDocumentsPerFolder ───────────────────────────────────────────────────

describe('folderStore — countDocumentsPerFolder', () => {
  it('counts documents per folder including root', async () => {
    const folder = await createFolder('Counts');
    await saveDocument(makeDoc('cnt-1'));
    await saveDocument(makeDoc('cnt-2'));
    await saveDocument(makeDoc('cnt-root'));
    await moveDocumentToFolder('cnt-1', folder.id);
    await moveDocumentToFolder('cnt-2', folder.id);
    // cnt-root stays at root

    const counts = await countDocumentsPerFolder();
    expect(counts.get(folder.id)).toBeGreaterThanOrEqual(2);
    // root key is '' (empty string)
    expect((counts.get('') ?? 0)).toBeGreaterThanOrEqual(1);
  });
});
