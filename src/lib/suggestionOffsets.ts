/**
 * Keeps proofreading suggestions aligned with the text as edits are applied.
 * Offsets are plain-text character positions (see plainTextMap.ts).
 */

export interface TextRange {
  offset: number;
  length: number;
}

export interface PlannedEdit extends TextRange {
  /** Text expected at the range; the edit is skipped if the document no longer matches. */
  original: string;
  replacement: string;
}

function overlaps(a: TextRange, b: TextRange): boolean {
  const aEnd = a.offset + a.length;
  const bEnd = b.offset + b.length;
  // Zero-length ranges (insertions) touching the same point also conflict.
  if (a.length === 0 || b.length === 0) return a.offset >= b.offset && a.offset <= bEnd && b.offset >= a.offset && b.offset <= aEnd;
  return a.offset < bEnd && b.offset < aEnd;
}

/**
 * After replacing `applied` with text of length `replacementLength`, shift the
 * ranges after it and drop the ones that overlapped it (their text is gone).
 */
export function rebaseRanges<T extends TextRange>(ranges: T[], applied: TextRange, replacementLength: number): T[] {
  const delta = replacementLength - applied.length;
  const appliedEnd = applied.offset + applied.length;
  const result: T[] = [];
  for (const range of ranges) {
    if (overlaps(range, applied)) continue;
    if (range.offset >= appliedEnd) result.push({ ...range, offset: range.offset + delta });
    else result.push(range);
  }
  return result;
}

/** A conflict-free subset (earliest first), for "accept all". */
export function selectNonOverlapping<T extends TextRange>(ranges: T[]): T[] {
  const sorted = [...ranges].sort((a, b) => a.offset - b.offset || a.length - b.length);
  const chosen: T[] = [];
  for (const range of sorted) {
    if (chosen.some((c) => overlaps(c, range))) continue;
    chosen.push(range);
  }
  return chosen;
}

/** Apply non-overlapping edits to a string (used for previews and tests). */
export function applyEditsToText(text: string, edits: PlannedEdit[]): { text: string; applied: number } {
  let result = text;
  let applied = 0;
  for (const edit of selectNonOverlapping(edits).sort((a, b) => b.offset - a.offset)) {
    if (result.slice(edit.offset, edit.offset + edit.length) !== edit.original) continue;
    result = result.slice(0, edit.offset) + edit.replacement + result.slice(edit.offset + edit.length);
    applied += 1;
  }
  return { text: result, applied };
}
