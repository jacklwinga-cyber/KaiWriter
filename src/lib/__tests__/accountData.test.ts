import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resetDatabaseForTests } from '../idb';
import { saveDocument, listAllDocuments, setCloudSyncUserId } from '../documentStore';
import { createFolder, listFolders } from '../folderStore';
import { saveVersion, listVersions } from '../versionStore';
import { addDictionaryWord, loadDictionary } from '../personalDictionary';
import { buildDataExport, clearLocalAccountData, requestAccountDeletion } from '../accountData';
import { hasBillableSubscription, needsReauth, REAUTH_WINDOW_MS } from '../../../supabase/functions/_shared/accountCore';

const USER = 'user-123';
const content = (text: string) => JSON.stringify({
  root: { children: [{ type: 'paragraph', children: [{ type: 'text', text }] }], type: 'root' },
});

beforeEach(async () => {
  localStorage.clear();
  setCloudSyncUserId(null);
  await resetDatabaseForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('account deletion rules', () => {
  it('requires a recent sign-in', () => {
    const now = Date.parse('2026-10-25T12:00:00Z');
    expect(needsReauth(new Date(now - 60_000).toISOString(), now)).toBe(false);
    expect(needsReauth(new Date(now - REAUTH_WINDOW_MS - 1).toISOString(), now)).toBe(true);
    expect(needsReauth(null, now)).toBe(true);
    expect(needsReauth('garbage', now)).toBe(true);
    expect(needsReauth(new Date(now + 3_600_000).toISOString(), now)).toBe(true); // in the future
  });

  it('blocks deletion while a paid subscription would keep billing', () => {
    expect(hasBillableSubscription(null)).toBe(false);
    expect(hasBillableSubscription({ status: 'active', stripe_subscription_id: 'sub_1' })).toBe(true);
    expect(hasBillableSubscription({ status: 'past_due', stripe_subscription_id: 'sub_1' })).toBe(true);
    expect(hasBillableSubscription({ status: 'canceled', stripe_subscription_id: 'sub_1' })).toBe(false);
    expect(hasBillableSubscription({ status: 'active', stripe_subscription_id: null })).toBe(false);
  });
});

describe('buildDataExport', () => {
  it('includes documents (with text and history), trash, folders, dictionary and settings, but no credentials', async () => {
    const folder = await createFolder('Work');
    await saveDocument({ id: 'd1', name: 'Plan', lastModified: 2_000, content: content('Hello world'), folderId: folder.id, pinned: true });
    await saveDocument({ id: 'd2', name: 'Old', lastModified: 1_000, content: content('Gone'), deletedAt: 1_500 });
    await saveVersion('d1', 'Plan', content('Hello'), 'manual');
    addDictionaryWord(null, 'Lilongwe');
    localStorage.setItem('kaiwriter-editor-preferences', JSON.stringify({ localeId: 'en-GB' }));
    localStorage.setItem('kaiwriter-pin-hash', 'secret-hash');

    const data = await buildDataExport({ id: null, email: null });
    expect(data.format).toBe('kaiwriter-data-export');
    expect(data.documents.map((d) => [d.name, d.text, d.inTrash, d.pinned])).toEqual([
      ['Plan', 'Hello world', false, true],
      ['Old', 'Gone', true, false],
    ]);
    expect(data.documents[0].folderId).toBe(folder.id);
    expect(data.documents[0].versions.map((v) => v.text)).toEqual(['Hello']);
    expect(JSON.parse(data.documents[0].content).root.children[0].children[0].text).toBe('Hello world');
    expect(data.folders).toEqual([{ id: folder.id, name: 'Work' }]);
    expect(data.personalDictionary).toEqual(['Lilongwe']);
    expect(data.settings).toEqual({ 'kaiwriter-editor-preferences': { localeId: 'en-GB' } });
    expect(JSON.stringify(data)).not.toContain('secret-hash');
    expect(data.aiUsage).toEqual({ unavailable: 'Not signed in to a cloud account.' });
  });
});

describe('clearLocalAccountData', () => {
  it('removes only this account’s keys unless documents are requested', async () => {
    await saveDocument({ id: 'd1', name: 'Plan', lastModified: 2_000, content: content('Hi') });
    localStorage.setItem(`kaiwriter-sync-outbox-${USER}`, '["doc:d1"]');
    localStorage.setItem(`kaiwriter-personal-dictionary:${USER}`, '[]');
    localStorage.setItem('kaiwriter-sync-outbox-someone-else', '["doc:x"]');
    localStorage.setItem('kaiwriter-theme', 'dark');

    await clearLocalAccountData(USER, { documents: false });
    expect(localStorage.getItem(`kaiwriter-sync-outbox-${USER}`)).toBeNull();
    expect(localStorage.getItem(`kaiwriter-personal-dictionary:${USER}`)).toBeNull();
    expect(localStorage.getItem('kaiwriter-sync-outbox-someone-else')).not.toBeNull();
    expect(localStorage.getItem('kaiwriter-theme')).toBe('dark');
    expect(await listAllDocuments()).toHaveLength(1);
  });

  it('clears documents, history, folders and the guest dictionary when asked', async () => {
    await saveDocument({ id: 'd1', name: 'Plan', lastModified: 2_000, content: content('Hi') });
    await saveVersion('d1', 'Plan', content('Hi'), 'manual');
    await createFolder('Work');
    addDictionaryWord(null, 'Lilongwe');
    localStorage.setItem('kaiwriter-theme', 'dark');

    await clearLocalAccountData(USER, { documents: true });
    expect(await listAllDocuments()).toEqual([]);
    expect(await listVersions('d1')).toEqual([]);
    expect(await listFolders()).toEqual([]);
    expect(loadDictionary(null)).toEqual([]);
    expect(localStorage.getItem('kaiwriter-theme')).toBe('dark');
  });
});

describe('requestAccountDeletion', () => {
  const OPTS = { supabaseUrl: 'https://example.supabase.co', anonKey: 'anon' };

  it('posts the confirmation and resolves when the server confirms', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ deleted: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await requestAccountDeletion('token', 'DELETE', OPTS);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://example.supabase.co/functions/v1/delete-account');
    expect(JSON.parse(init.body as string)).toEqual({ confirm: 'DELETE' });
  });

  it('never sends without the confirmation phrase', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(requestAccountDeletion('token', 'delete', OPTS)).rejects.toMatchObject({ code: 'bad_request' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('explains why the server refused, and treats anything unclear as not deleted', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { code: 'subscription_active' } }), { status: 409 })));
    await expect(requestAccountDeletion('token', 'DELETE', OPTS)).rejects.toMatchObject({
      code: 'subscription_active',
      message: expect.stringMatching(/Cancel your Pro subscription/),
    });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"ok":true}', { status: 200 })));
    await expect(requestAccountDeletion('token', 'DELETE', OPTS)).rejects.toMatchObject({ code: 'failed' });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));
    await expect(requestAccountDeletion('token', 'DELETE', OPTS)).rejects.toMatchObject({ code: 'network' });
  });
});
