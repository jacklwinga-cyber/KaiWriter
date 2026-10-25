import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { resetDatabaseForTests } from '../idb';
import {
  applyRetention,
  DEFAULT_RETENTION,
  deleteVersion,
  getRetention,
  listVersions,
  maybeAutoSaveVersion,
  saveVersion,
  setRetention,
  versionsToDelete,
  type DocumentVersion,
} from '../versionStore';

const DAY = 24 * 60 * 60 * 1000;

function version(i: number, source: 'auto' | 'manual', ageDays: number, now: number): DocumentVersion {
  return { id: `v${i}`, documentId: 'd', name: 'Doc', content: `c${i}`, createdAt: now - ageDays * DAY, source };
}

beforeEach(async () => {
  localStorage.clear();
  await resetDatabaseForTests();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('retention settings', () => {
  it('defaults to the previous behaviour and ignores invalid values', () => {
    expect(getRetention()).toEqual(DEFAULT_RETENTION);
    localStorage.setItem('kaiwriter-history-retention', JSON.stringify({ maxVersions: 7, maxAgeDays: 30, autoSnapshots: false }));
    expect(getRetention()).toEqual({ maxVersions: 50, maxAgeDays: 30, autoSnapshots: false });
    localStorage.setItem('kaiwriter-history-retention', 'not json');
    expect(getRetention()).toEqual(DEFAULT_RETENTION);
  });

  it('deletes versions over the limit, and old automatic snapshots but not saved versions', () => {
    const now = 1_000 * DAY;
    const versions = [
      version(1, 'auto', 1, now),
      version(2, 'manual', 100, now),
      version(3, 'auto', 100, now),
      version(4, 'auto', 2, now),
    ];
    expect(versionsToDelete(versions, { maxVersions: 50, maxAgeDays: 30, autoSnapshots: true }, now).map((v) => v.id)).toEqual(['v3']);
    expect(versionsToDelete(versions, { maxVersions: 2, maxAgeDays: 0, autoSnapshots: true }, now).map((v) => v.id)).toEqual(['v3', 'v4']);
  });
});

describe('versionStore with retention', () => {
  it('applies a new limit to every document at once', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    for (let i = 0; i < 12; i += 1) {
      vi.setSystemTime(1_000_000 + i * 1000);
      await saveVersion('a', 'A', `a${i}`, 'manual');
      await saveVersion('b', 'B', `b${i}`, 'manual');
    }
    expect(await setRetention({ maxVersions: 10, maxAgeDays: 0, autoSnapshots: true })).toBe(4);
    const a = await listVersions('a');
    expect(a).toHaveLength(10);
    expect(a[0].content).toBe('a11'); // newest kept
    expect(await listVersions('b')).toHaveLength(10);
  });

  it('keeps new saves within the limit', async () => {
    await setRetention({ maxVersions: 10, maxAgeDays: 0, autoSnapshots: true });
    vi.useFakeTimers({ toFake: ['Date'] });
    for (let i = 0; i < 13; i += 1) {
      vi.setSystemTime(2_000_000 + i * 1000);
      await saveVersion('a', 'A', `a${i}`, 'manual');
    }
    expect(await listVersions('a')).toHaveLength(10);
  });

  it('stops automatic snapshots when they are turned off', async () => {
    await setRetention({ ...DEFAULT_RETENTION, autoSnapshots: false });
    await maybeAutoSaveVersion('a', 'A', 'content');
    expect(await listVersions('a')).toHaveLength(0);
    await setRetention(DEFAULT_RETENTION);
    await maybeAutoSaveVersion('a', 'A', 'content');
    expect(await listVersions('a')).toHaveLength(1);
  });

  it('deletes a single version and old automatic snapshots', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(10 * DAY);
    await saveVersion('a', 'A', 'old auto', 'auto');
    vi.setSystemTime(10 * DAY + 1000);
    await saveVersion('a', 'A', 'old manual', 'manual');
    vi.setSystemTime(100 * DAY);
    const recent = await saveVersion('a', 'A', 'recent', 'auto');
    await setRetention({ maxVersions: 50, maxAgeDays: 30, autoSnapshots: true });
    expect((await listVersions('a')).map((v) => v.content)).toEqual(['recent', 'old manual']);
    await deleteVersion(recent.id);
    expect((await listVersions('a')).map((v) => v.content)).toEqual(['old manual']);
    expect(await applyRetention('a')).toBe(0);
  });
});
