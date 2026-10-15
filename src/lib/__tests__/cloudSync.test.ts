/**
 * Cross-device sync tests. Supabase is replaced by an in-memory fake; "the
 * other device" is simulated by changing cloud rows directly, the same way its
 * pushes would.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
let clock = 0;
let failWrites = false;

function nextUpdatedAt(): string {
  return new Date(Date.UTC(2026, 0, 1) + ++clock).toISOString();
}

class FakeQuery {
  private filters: Array<(r: Row) => boolean> = [];
  private op: 'select' | 'insert' | 'update' | 'upsert' | null = null;
  private payload: Row | null = null;
  private orderKey: string | null = null;
  private limitN = Infinity;
  private single = false;

  private table: string;

  constructor(table: string) {
    this.table = table;
  }

  private rows(): Row[] {
    return (tables[this.table] ??= []);
  }

  select() {
    this.op ??= 'select';
    return this;
  }
  insert(row: Row) {
    this.op = 'insert';
    this.payload = row;
    return this;
  }
  update(row: Row) {
    this.op = 'update';
    this.payload = row;
    return this;
  }
  upsert(row: Row) {
    this.op = 'upsert';
    this.payload = row;
    return this;
  }
  eq(key: string, value: unknown) {
    this.filters.push((r) => r[key] === value);
    return this;
  }
  gt(key: string, value: string) {
    this.filters.push((r) => String(r[key]) > value);
    return this;
  }
  order(key: string) {
    this.orderKey = key;
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  maybeSingle() {
    this.single = true;
    return this.exec();
  }
  then<T>(resolve: (v: { data: unknown; error: unknown }) => T, reject?: (e: unknown) => T) {
    return this.exec().then(resolve, reject);
  }

  private async exec(): Promise<{ data: unknown; error: { code?: string; message: string } | null }> {
    const rows = this.rows();
    const match = (r: Row) => this.filters.every((f) => f(r));
    const sameKey = (a: Row, b: Row) => a.id === b.id && a.user_id === b.user_id;
    if (this.op !== 'select' && failWrites) return { data: null, error: { message: 'network down' } };

    if (this.op === 'insert') {
      if (rows.some((r) => sameKey(r, this.payload!))) {
        return { data: null, error: { code: '23505', message: 'duplicate key' } };
      }
      rows.push({ ...this.payload, updated_at: nextUpdatedAt() });
      return { data: null, error: null };
    }
    if (this.op === 'upsert') {
      const i = rows.findIndex((r) => sameKey(r, this.payload!));
      const row = { ...(i >= 0 ? rows[i] : {}), ...this.payload, updated_at: nextUpdatedAt() };
      if (i >= 0) rows[i] = row;
      else rows.push(row);
      return { data: null, error: null };
    }
    if (this.op === 'update') {
      const hits = rows.filter(match);
      for (const r of hits) Object.assign(r, this.payload, { updated_at: nextUpdatedAt() });
      return { data: hits.map((r) => ({ id: r.id })), error: null };
    }
    let result = rows.filter(match).map((r) => ({ ...r }));
    if (this.orderKey) {
      const k = this.orderKey;
      result.sort((a, b) => String(a[k]).localeCompare(String(b[k])));
    }
    result = result.slice(0, this.limitN);
    if (this.single) return { data: result[0] ?? null, error: null };
    return { data: result, error: null };
  }
}

vi.mock('../supabase', () => ({
  isSupabaseConfigured: () => true,
  getSupabase: () => ({ from: (table: string) => new FakeQuery(table) }),
}));

import { syncNow, flushOutbox } from '../cloudSync';
import {
  getDocument,
  listDocuments,
  permanentlyDeleteDocument,
  saveDocument,
  setCloudSyncUserId,
  setOnSyncStatusChange,
  trashDocument,
  type StoredDocument,
} from '../documentStore';
import { createFolder, getFolder, listFolders, moveDocumentToFolder } from '../folderStore';
import { DOCUMENT_UPDATED_EVENT, pendingSync, type DocumentUpdatedDetail } from '../syncOutbox';

const USER = 'user-1';

const cloudDocs = () => (tables.kaiwriter_documents ??= []);
const cloudDoc = (id: string) => cloudDocs().find((r) => r.id === id);

/** What another device's push would write. */
function otherDeviceWrites(id: string, fields: Row) {
  const existing = cloudDoc(id);
  const row = {
    id,
    user_id: USER,
    name: `Doc ${id}`,
    content: '',
    template_id: null,
    branding: null,
    deleted_at: null,
    purged: false,
    pinned: false,
    folder_id: null,
    ...existing,
    ...fields,
    updated_at: nextUpdatedAt(),
  };
  if (existing) Object.assign(existing, row);
  else cloudDocs().push(row);
}

async function settle() {
  // Let fire-and-forget flushes started by store calls finish.
  await new Promise((r) => setTimeout(r, 0));
  await flushOutbox(USER);
  await syncNow(USER);
}

function doc(id: string, content: string, lastModified = Date.now()): StoredDocument {
  return { id, name: `Doc ${id}`, lastModified, content };
}

beforeEach(() => {
  for (const key of Object.keys(tables)) delete tables[key];
  failWrites = false;
  setCloudSyncUserId(USER);
});

afterEach(() => {
  setCloudSyncUserId(null);
  setOnSyncStatusChange(null);
});

describe('cloud sync — push', () => {
  it('uploads documents created on this device', async () => {
    await saveDocument(doc('p1', 'hello', 1000));
    await settle();

    expect(cloudDoc('p1')).toMatchObject({ content: 'hello', last_modified: 1000, purged: false });
    expect((await getDocument('p1'))?.cloudLastModified).toBe(1000);
  });

  it('uploads documents made while signed out once sync starts', async () => {
    setCloudSyncUserId(null);
    await saveDocument(doc('p2', 'offline draft', 1000));
    setCloudSyncUserId(USER);

    await syncNow(USER);

    expect(cloudDoc('p2')?.content).toBe('offline draft');
  });

  it('keeps changes queued while the cloud is unreachable and retries later', async () => {
    const statuses: string[] = [];
    setOnSyncStatusChange((s) => statuses.push(s));
    failWrites = true;
    await saveDocument(doc('p3', 'written offline', 1000));
    await settle();

    expect(cloudDoc('p3')).toBeUndefined();
    expect(pendingSync(USER).map(([k]) => k)).toContain('doc:p3');
    expect(statuses).toContain('sync_failed');

    failWrites = false;
    await syncNow(USER);

    expect(cloudDoc('p3')?.content).toBe('written offline');
    expect(pendingSync(USER)).toHaveLength(0);
    expect(statuses.at(-1)).toBe('synced');
  });
});

describe('cloud sync — pull', () => {
  it('applies an edit made on another device and notifies the open editor', async () => {
    await saveDocument(doc('l1', 'v1', 1000));
    await settle();
    const events: DocumentUpdatedDetail[] = [];
    const listener = (e: Event) => events.push((e as CustomEvent<DocumentUpdatedDetail>).detail);
    window.addEventListener(DOCUMENT_UPDATED_EVENT, listener);

    otherDeviceWrites('l1', { content: 'v2 from laptop', last_modified: 2000 });
    await syncNow(USER);
    window.removeEventListener(DOCUMENT_UPDATED_EVENT, listener);

    const local = await getDocument('l1');
    expect(local?.content).toBe('v2 from laptop');
    expect(local?.cloudLastModified).toBe(2000);
    expect(events).toEqual([{ id: 'l1', content: 'v2 from laptop', name: 'Doc l1', previousBase: 1000 }]);
  });

  it('downloads documents created on another device', async () => {
    otherDeviceWrites('l2', { content: 'from phone', last_modified: 3000 });
    await syncNow(USER);
    expect((await getDocument('l2'))?.content).toBe('from phone');
  });

  it('local saves after a pull are uploaded normally', async () => {
    otherDeviceWrites('l3', { content: 'cloud', last_modified: 3000 });
    await syncNow(USER);

    await saveDocument({ ...(await getDocument('l3'))!, content: 'edited here', lastModified: 4000 });
    await settle();

    expect(cloudDoc('l3')?.content).toBe('edited here');
    await expect(listDocuments()).resolves.toHaveLength(1);
  });
});

describe('cloud sync — conflicts', () => {
  it('keeps both versions when two devices edit the same document', async () => {
    await saveDocument(doc('c1', 'base', 1000));
    await settle();

    otherDeviceWrites('c1', { content: 'phone edit', last_modified: 2000 });
    await saveDocument({ ...(await getDocument('c1'))!, content: 'desktop edit', lastModified: 2500 });
    await settle();

    const all = await listDocuments();
    const original = all.find((d) => d.id === 'c1');
    const copy = all.find((d) => d.id !== 'c1');
    expect(original?.content).toBe('desktop edit');
    expect(copy?.content).toBe('phone edit');
    expect(copy?.name).toBe('Doc c1 (conflicted copy)');
    expect(cloudDoc('c1')?.content).toBe('desktop edit');
    expect(cloudDoc(copy!.id)?.content).toBe('phone edit');
  });

  it('first sync of a pre-existing document keeps the newer version without a copy', async () => {
    setCloudSyncUserId(null);
    await saveDocument(doc('c2', 'old local', 1000));
    setCloudSyncUserId(USER);
    otherDeviceWrites('c2', { content: 'newer cloud', last_modified: 5000 });

    await syncNow(USER);

    expect(await listDocuments()).toHaveLength(1);
    expect((await getDocument('c2'))?.content).toBe('newer cloud');
  });
});

describe('cloud sync — trash, delete, pins and folders', () => {
  it('syncs trashing a document in both directions', async () => {
    await saveDocument(doc('t1', 'x', 1000));
    await saveDocument(doc('t2', 'y', 1000));
    await settle();

    await trashDocument('t1');
    await settle();
    expect(cloudDoc('t1')?.deleted_at).toEqual(expect.any(Number));

    otherDeviceWrites('t2', { deleted_at: 7000, last_modified: 7000 });
    await syncNow(USER);
    expect((await listDocuments()).map((d) => d.id)).toEqual([]);
  });

  it('permanent deletes propagate as tombstones instead of being re-uploaded', async () => {
    await saveDocument(doc('d1', 'x', 1000));
    await saveDocument(doc('d2', 'y', 1000));
    await settle();

    await permanentlyDeleteDocument('d1');
    await settle();
    expect(cloudDoc('d1')).toMatchObject({ purged: true, content: '' });

    otherDeviceWrites('d2', { purged: true, content: '', last_modified: 8000 });
    await syncNow(USER);
    expect(await getDocument('d2')).toBeNull();
  });

  it('syncs pins and folders', async () => {
    await saveDocument(doc('f1', 'x', 1000));
    const folder = await createFolder('Book');
    await moveDocumentToFolder('f1', folder.id);
    await settle();

    expect(tables.kaiwriter_folders?.find((r) => r.id === folder.id)).toMatchObject({ name: 'Book', deleted_at: null });
    expect(cloudDoc('f1')?.folder_id).toBe(folder.id);

    // Another device deletes the folder: the folder goes away and its documents move to root.
    Object.assign(tables.kaiwriter_folders!.find((r) => r.id === folder.id)!, { deleted_at: 9000, modified_at: 9000 });
    otherDeviceWrites('f1', { folder_id: null, pinned: true, last_modified: 9000 });
    await syncNow(USER);

    expect(await getFolder(folder.id)).toBeNull();
    expect(await listFolders()).toHaveLength(0);
    const local = await getDocument('f1');
    expect(local?.folderId).toBeUndefined();
    expect(local?.pinned).toBe(true);
  });
});
