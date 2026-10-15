/**
 * Tests for mergeCloudIntoLocal — cloud rows carry no revision, so the merge
 * must stamp one that the stale-write guard in saveDocumentLocal accepts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

let cloudRows: Array<Record<string, unknown>> = [];
const upsert = vi.fn(async () => ({ error: null }));

vi.mock('../supabase', () => ({
  isSupabaseConfigured: () => true,
  getSupabase: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          order: async () => ({ data: cloudRows, error: null }),
        }),
      }),
      upsert,
    }),
  }),
}));

import { mergeCloudIntoLocal } from '../cloudSync';
import { getDocument, saveDocument, trashDocument } from '../documentStore';

function cloudRow(id: string, content: string, lastModified: number) {
  return { id, name: `Doc ${id}`, content, template_id: null, last_modified: lastModified, branding: null };
}

describe('mergeCloudIntoLocal', () => {
  beforeEach(() => {
    cloudRows = [];
    upsert.mockClear();
  });

  it('applies a newer cloud version over an existing local document', async () => {
    await saveDocument({ id: 'm1', name: 'Doc m1', lastModified: 1000, content: 'local' });
    await saveDocument({ id: 'm1', name: 'Doc m1', lastModified: 1000, content: 'local 2' });
    cloudRows = [cloudRow('m1', 'from other device', 5000)];

    await mergeCloudIntoLocal('user-1');

    const stored = await getDocument('m1');
    expect(stored?.content).toBe('from other device');
    expect(stored?.lastModified).toBe(5000);
  });

  it('local saves after a merge are still accepted', async () => {
    await saveDocument({ id: 'm2', name: 'Doc m2', lastModified: 1000, content: 'local' });
    cloudRows = [cloudRow('m2', 'cloud', 5000)];
    await mergeCloudIntoLocal('user-1');

    await saveDocument({ id: 'm2', name: 'Doc m2', lastModified: 6000, content: 'edited after merge' });

    expect((await getDocument('m2'))?.content).toBe('edited after merge');
  });

  it('keeps an older local version and pushes it to the cloud', async () => {
    await saveDocument({ id: 'm3', name: 'Doc m3', lastModified: 9000, content: 'local newer' });
    cloudRows = [cloudRow('m3', 'cloud older', 5000)];

    await mergeCloudIntoLocal('user-1');

    expect((await getDocument('m3'))?.content).toBe('local newer');
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ id: 'm3', content: 'local newer' }));
  });

  it('does not resurrect a locally trashed document', async () => {
    await saveDocument({ id: 'm4', name: 'Doc m4', lastModified: 1000, content: 'local' });
    await trashDocument('m4');
    cloudRows = [cloudRow('m4', 'cloud', 5000)];

    await mergeCloudIntoLocal('user-1');

    const stored = await getDocument('m4');
    expect(stored?.deletedAt).toBeDefined();
    expect(stored?.content).toBe('local');
  });
});
