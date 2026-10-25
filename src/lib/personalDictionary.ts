/**
 * Personal dictionary: words the user has told proofreading to accept.
 *
 * Stored per user on this device and, for cloud accounts, synced across
 * devices (cloudSync.ts, table kaiwriter_dictionary_words). Each word is its
 * own entry with a modified time; removals are kept as tombstones until
 * they've reached the cloud, so concurrent edits on two devices merge
 * word by word (the later change to the same word wins).
 *
 * Matching ignores case, curly vs straight apostrophes and surrounding
 * punctuation.
 */
import { getCloudSyncUserId } from './documentStore';
import { enqueueSync } from './syncOutbox';

const KEY_PREFIX = 'kaiwriter-personal-dictionary:';
/** Fired on window when the dictionary changes, so every open view can refresh. */
export const DICTIONARY_CHANGED_EVENT = 'kaiwriter:dictionary-changed';
export const MAX_WORD_LENGTH = 64;
export const MAX_WORDS = 5_000;

export interface DictionaryEntry {
  /** The word as the user added it. */
  word: string;
  /** Matching key (see normalizeWord). */
  norm: string;
  /** Unix ms of the last add or remove. */
  modifiedAt: number;
  /** Set when removed (a tombstone, so the removal syncs). */
  deletedAt?: number;
  /** False until this version has reached the cloud. */
  synced: boolean;
}

function storageKey(userId: string | null | undefined): string {
  return KEY_PREFIX + (userId || 'guest');
}

/** Canonical form used for matching. */
export function normalizeWord(word: string): string {
  return word
    .normalize('NFC')
    .replace(/[‘’ʼ]/g, "'")
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
    .toLocaleLowerCase();
}

/** A single word (letters, digits, apostrophes, hyphens), within the length limit. */
export function isValidDictionaryWord(word: string): boolean {
  const w = normalizeWord(word);
  return w.length > 0 && w.length <= MAX_WORD_LENGTH && /^[\p{L}\p{N}][\p{L}\p{N}'’-]*$/u.test(w);
}

function displayForm(word: string): string {
  return word.trim().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}

/** All entries, including tombstones. Accepts the older plain string-list format. */
export function loadEntries(userId: string | null | undefined): DictionaryEntry[] {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    const entries: DictionaryEntry[] = [];
    for (const item of parsed) {
      if (typeof item === 'string') {
        // Older format: a plain word list that has never been synced.
        if (isValidDictionaryWord(item)) entries.push({ word: item, norm: normalizeWord(item), modifiedAt: 0, synced: false });
      } else if (item && typeof item === 'object' && typeof item.word === 'string' && isValidDictionaryWord(item.word)) {
        entries.push({
          word: item.word,
          norm: normalizeWord(item.word),
          modifiedAt: Number(item.modifiedAt) || 0,
          ...(item.deletedAt ? { deletedAt: Number(item.deletedAt) } : {}),
          synced: item.synced === true,
        });
      }
    }
    return entries;
  } catch {
    return [];
  }
}

function saveEntries(userId: string | null | undefined, entries: DictionaryEntry[]): void {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(entries));
  } catch {
    // storage full or unavailable: the change lasts for this session only
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(DICTIONARY_CHANGED_EVENT));
}

/** Active words, sorted. */
export function loadDictionary(userId: string | null | undefined): string[] {
  return loadEntries(userId)
    .filter((e) => !e.deletedAt)
    .map((e) => e.word)
    .sort((a, b) => a.localeCompare(b));
}

export function getEntry(userId: string, norm: string): DictionaryEntry | null {
  return loadEntries(userId).find((e) => e.norm === norm) ?? null;
}

/** Queue a word for upload if this user is signed in to cloud sync. */
function queueSync(userId: string | null | undefined, norm: string): void {
  if (!userId || getCloudSyncUserId() !== userId) return;
  enqueueSync(userId, `dict:${norm}`);
  void import('./cloudSync').then((m) => m.flushOutbox(userId));
}

function upsert(userId: string | null | undefined, entry: Omit<DictionaryEntry, 'synced'>): string[] {
  const entries = loadEntries(userId).filter((e) => e.norm !== entry.norm);
  entries.push({ ...entry, synced: false });
  saveEntries(userId, entries);
  queueSync(userId, entry.norm);
  return loadDictionary(userId);
}

/** Add a word; returns the updated list (unchanged if invalid, duplicate or full). */
export function addDictionaryWord(userId: string | null | undefined, word: string): string[] {
  const display = displayForm(word);
  if (!isValidDictionaryWord(display)) return loadDictionary(userId);
  const norm = normalizeWord(display);
  const entries = loadEntries(userId);
  const active = entries.filter((e) => !e.deletedAt);
  if (active.some((e) => e.norm === norm) || active.length >= MAX_WORDS) return loadDictionary(userId);
  return upsert(userId, { word: display, norm, modifiedAt: Date.now() });
}

export function removeDictionaryWord(userId: string | null | undefined, word: string): string[] {
  const norm = normalizeWord(word);
  const existing = loadEntries(userId).find((e) => e.norm === norm && !e.deletedAt);
  if (!existing) return loadDictionary(userId);
  const now = Date.now();
  return upsert(userId, { word: existing.word, norm, modifiedAt: now, deletedAt: now });
}

/** Mark the version uploaded at `modifiedAt` as synced (a newer local edit stays unsynced). */
export function markEntrySynced(userId: string, norm: string, modifiedAt: number): void {
  const entries = loadEntries(userId);
  const entry = entries.find((e) => e.norm === norm);
  if (!entry || entry.modifiedAt !== modifiedAt) return;
  entry.synced = true;
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(entries));
  } catch {
    // retried on the next sync
  }
}

/**
 * Apply entries pulled from the cloud. For each word the later modified_at
 * wins; a word with unsynced local changes keeps them if they're newer.
 * Returns true if anything changed (and fires DICTIONARY_CHANGED_EVENT once).
 */
export function applyRemoteEntries(
  userId: string,
  remote: Array<{ word: string; norm: string; modifiedAt: number; deletedAt?: number | null }>,
): boolean {
  const entries = loadEntries(userId);
  const byNorm = new Map(entries.map((e) => [e.norm, e]));
  let changed = false;
  for (const r of remote) {
    if (!isValidDictionaryWord(r.word)) continue;
    const local = byNorm.get(r.norm);
    if (local && local.modifiedAt >= r.modifiedAt) continue;
    byNorm.set(r.norm, {
      word: r.word,
      norm: r.norm,
      modifiedAt: r.modifiedAt,
      ...(r.deletedAt ? { deletedAt: r.deletedAt } : {}),
      synced: true,
    });
    changed = true;
  }
  if (changed) saveEntries(userId, [...byNorm.values()]);
  return changed;
}

/** Entries that haven't reached the cloud yet (e.g. added before signing in). */
export function unsyncedEntries(userId: string): DictionaryEntry[] {
  return loadEntries(userId).filter((e) => !e.synced);
}

/**
 * Words added while not signed in (the "guest" dictionary) are copied into
 * the account's dictionary on sign-in, unless the account already has an
 * entry (or a removal) for that word. The guest list itself is left as is.
 */
export function adoptGuestDictionary(userId: string): number {
  const guest = loadEntries(null).filter((e) => !e.deletedAt);
  if (!guest.length) return 0;
  const entries = loadEntries(userId);
  const known = new Set(entries.map((e) => e.norm));
  const added = guest.filter((e) => !known.has(e.norm)).map((e) => ({ ...e, synced: false }));
  if (added.length) saveEntries(userId, [...entries, ...added]);
  return added.length;
}

/** Drop spelling suggestions for words in the dictionary. Other kinds are kept. */
export function filterByDictionary<T extends { kind: string; original: string }>(issues: T[], words: string[]): T[] {
  if (!words.length) return issues;
  const known = new Set(words.map(normalizeWord));
  return issues.filter((issue) => issue.kind !== 'spelling' || !known.has(normalizeWord(issue.original)));
}
