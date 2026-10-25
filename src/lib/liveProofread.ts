/**
 * Live (as-you-type) proofreading: offline checks only, so nothing is sent
 * anywhere while typing. The full online check stays a deliberate action in
 * the Review panel.
 */
import { localClarityIssues, type WritingIssue } from './writingAssist';
import { filterByDictionary } from './personalDictionary';

/** Skip live checks on very large documents to keep typing smooth. */
export const MAX_LIVE_TEXT_CHARS = 200_000;
export const LIVE_DEBOUNCE_MS = 500;

/** Identifies "this kind of issue on this text", for Ignore. */
export function ignoreKey(issue: Pick<WritingIssue, 'original' | 'message'>): string {
  return `${issue.original.toLowerCase()}|${issue.message}`;
}

export function computeLiveIssues(
  text: string,
  languageCode: string,
  dictionary: string[],
  ignored: ReadonlySet<string>,
): WritingIssue[] {
  if (!text.trim() || text.length > MAX_LIVE_TEXT_CHARS) return [];
  return filterByDictionary(localClarityIssues(text, languageCode), dictionary).filter(
    (issue) => !ignored.has(ignoreKey(issue)),
  );
}

/** The issue under a caret position (inclusive of both ends, so clicking just after a word works). */
export function issueAtOffset<T extends { offset: number; length: number }>(issues: T[], offset: number): T | null {
  let best: T | null = null;
  for (const issue of issues) {
    if (offset < issue.offset || offset > issue.offset + issue.length) continue;
    if (!best || issue.length < best.length) best = issue; // prefer the most specific
  }
  return best;
}
