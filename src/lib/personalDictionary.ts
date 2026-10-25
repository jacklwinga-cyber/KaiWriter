/**
 * Personal dictionary: words the user has told proofreading to accept.
 * Stored per user on this device. Matching ignores case, curly vs straight
 * apostrophes and surrounding punctuation.
 */

const KEY_PREFIX = 'kaiwriter-personal-dictionary:';
/** Fired on window when the dictionary changes, so every open view can refresh. */
export const DICTIONARY_CHANGED_EVENT = 'kaiwriter:dictionary-changed';
export const MAX_WORD_LENGTH = 64;
export const MAX_WORDS = 5_000;

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

export function loadDictionary(userId: string | null | undefined): string[] {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((w): w is string => typeof w === 'string' && isValidDictionaryWord(w)) : [];
  } catch {
    return [];
  }
}

function save(userId: string | null | undefined, words: string[]): void {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(words));
  } catch {
    // storage full or unavailable: the change lasts for this session only
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(DICTIONARY_CHANGED_EVENT));
}

/** Add a word; returns the updated list (unchanged if invalid, duplicate or full). */
export function addDictionaryWord(userId: string | null | undefined, word: string): string[] {
  const words = loadDictionary(userId);
  const display = word.trim().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
  if (!isValidDictionaryWord(display) || words.length >= MAX_WORDS) return words;
  if (words.some((w) => normalizeWord(w) === normalizeWord(display))) return words;
  const next = [...words, display].sort((a, b) => a.localeCompare(b));
  save(userId, next);
  return next;
}

export function removeDictionaryWord(userId: string | null | undefined, word: string): string[] {
  const target = normalizeWord(word);
  const next = loadDictionary(userId).filter((w) => normalizeWord(w) !== target);
  save(userId, next);
  return next;
}

/** Drop spelling suggestions for words in the dictionary. Other kinds are kept. */
export function filterByDictionary<T extends { kind: string; original: string }>(issues: T[], words: string[]): T[] {
  if (!words.length) return issues;
  const known = new Set(words.map(normalizeWord));
  return issues.filter((issue) => issue.kind !== 'spelling' || !known.has(normalizeWord(issue.original)));
}
