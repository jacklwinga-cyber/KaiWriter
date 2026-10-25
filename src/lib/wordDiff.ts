/**
 * Word-level comparison of an original and a revised text, for showing a
 * rewrite as insertions and deletions before it is accepted.
 */

export type DiffPart = { type: 'same' | 'insert' | 'delete'; text: string };

const TOKEN = /\s+|[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*|[^\s\p{L}\p{N}]/gu;
/** Above this many token pairs, show a whole replacement instead of a detailed diff. */
const MAX_CELLS = 4_000_000;

function tokenize(text: string): string[] {
  return text.match(TOKEN) ?? [];
}

function push(parts: DiffPart[], type: DiffPart['type'], text: string) {
  if (!text) return;
  const last = parts[parts.length - 1];
  if (last && last.type === type) last.text += text;
  else parts.push({ type, text });
}

/**
 * Longest-common-subsequence diff over words, spaces and punctuation.
 * Concatenating the 'same' + 'delete' parts gives `before`; 'same' + 'insert'
 * gives `after`.
 */
export function diffWords(before: string, after: string): DiffPart[] {
  const a = tokenize(before);
  const b = tokenize(after);
  const parts: DiffPart[] = [];

  // Common prefix and suffix are cheap and usually large.
  let pre = 0;
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre += 1;
  let suf = 0;
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf += 1;
  push(parts, 'same', a.slice(0, pre).join(''));

  const x = a.slice(pre, a.length - suf);
  const y = b.slice(pre, b.length - suf);
  const n = x.length;
  const m = y.length;

  if (n * m > MAX_CELLS) {
    push(parts, 'delete', x.join(''));
    push(parts, 'insert', y.join(''));
  } else if (n && m) {
    // lcs[i][j] = LCS length of x[i..] and y[j..], stored row-major.
    const width = m + 1;
    const lcs = new Uint32Array((n + 1) * width);
    for (let i = n - 1; i >= 0; i -= 1) {
      for (let j = m - 1; j >= 0; j -= 1) {
        lcs[i * width + j] = x[i] === y[j]
          ? lcs[(i + 1) * width + j + 1] + 1
          : Math.max(lcs[(i + 1) * width + j], lcs[i * width + j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (x[i] === y[j]) {
        push(parts, 'same', x[i]);
        i += 1;
        j += 1;
      } else if (lcs[(i + 1) * width + j] >= lcs[i * width + j + 1]) {
        push(parts, 'delete', x[i]);
        i += 1;
      } else {
        push(parts, 'insert', y[j]);
        j += 1;
      }
    }
    push(parts, 'delete', x.slice(i).join(''));
    push(parts, 'insert', y.slice(j).join(''));
  } else {
    push(parts, 'delete', x.join(''));
    push(parts, 'insert', y.join(''));
  }

  push(parts, 'same', a.slice(a.length - suf).join(''));
  return parts;
}

/** How much changed, as counts of inserted and deleted words. */
export function diffStats(parts: DiffPart[]): { inserted: number; deleted: number } {
  const words = (text: string) => (text.match(/[\p{L}\p{N}]+/gu) ?? []).length;
  let inserted = 0;
  let deleted = 0;
  for (const part of parts) {
    if (part.type === 'insert') inserted += words(part.text);
    else if (part.type === 'delete') deleted += words(part.text);
  }
  return { inserted, deleted };
}
