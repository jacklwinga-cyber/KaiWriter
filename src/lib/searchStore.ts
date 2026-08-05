/**
 * searchStore.ts — P1-A full-text search
 *
 * Searches document titles and body content without requiring a live Lexical
 * editor instance. Content is stored as Lexical JSON; we walk the serialised
 * tree to extract plain text, then score and rank results.
 *
 * This is an in-memory scan (no IDB full-text index). Acceptable for the
 * document volumes KaiWriter targets (<1 000 docs). A dedicated index can be
 * layered on later if needed.
 */

// ---------------------------------------------------------------------------
// Lexical JSON → plain text
// ---------------------------------------------------------------------------

type SerializedNode = {
  type?: string;
  text?: string;
  children?: SerializedNode[];
};

type SerializedEditorState = {
  root?: SerializedNode;
};

/** Node types that act as block-level containers (add a trailing newline). */
const BLOCK_TYPES = new Set([
  'paragraph',
  'heading',
  'listitem',
  'quote',
  'code',
  'codeblock',
  'horizontalrule',
  'table',
  'tablerow',
  'tablecell',
]);

function walkNode(node: SerializedNode): string {
  // Leaf text node
  if (node.type === 'text' || node.type === 'tab') {
    return node.text ?? '';
  }
  // Explicit line-break node
  if (node.type === 'linebreak') {
    return '\n';
  }

  const childText = (node.children ?? []).map(walkNode).join('');

  if (node.type && BLOCK_TYPES.has(node.type)) {
    return childText + '\n';
  }
  return childText;
}

/**
 * Extract plain text from a Lexical editor-state JSON string.
 * Safe to call without an active editor: parses the stored JSON and walks
 * the serialised node tree. Returns '' on any parse error.
 */
export function extractTextFromLexicalJSON(content: string): string {
  if (!content) return '';
  try {
    const state = JSON.parse(content) as SerializedEditorState;
    if (!state?.root) return '';
    return walkNode(state.root).trim();
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Scoring + snippet extraction
// ---------------------------------------------------------------------------

function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2); // ignore single-char tokens
}

const SNIPPET_CONTEXT = 60; // chars of context on each side of first match

function buildSnippet(text: string, tokens: string[]): string {
  if (!text || tokens.length === 0) return '';
  const lower = text.toLowerCase();
  let firstPos = -1;
  let matchedTokenLength = 0;

  for (const token of tokens) {
    const idx = lower.indexOf(token);
    if (idx !== -1 && (firstPos === -1 || idx < firstPos)) {
      firstPos = idx;
      matchedTokenLength = token.length;
    }
  }

  if (firstPos === -1) return '';

  const start = Math.max(0, firstPos - SNIPPET_CONTEXT);
  const end = Math.min(text.length, firstPos + SNIPPET_CONTEXT + matchedTokenLength + 30);
  let snippet = text.slice(start, end).replace(/\n+/g, ' ').trim();
  if (start > 0) snippet = '…' + snippet;
  if (end < text.length) snippet += '…';
  return snippet;
}

// Fix TS error: token is not defined in outer scope — extract it inside fn
function scoreText(text: string, tokens: string[]): number {
  const lower = text.toLowerCase();
  let score = 0;
  for (const token of tokens) {
    let searchFrom = 0;
    while (true) {
      const idx = lower.indexOf(token, searchFrom);
      if (idx === -1) break;
      score += 1;
      searchFrom = idx + token.length;
      // Bonus for word-boundary match (token is a whole word)
      const before = idx === 0 || /\W/.test(text[idx - 1]);
      const after = idx + token.length >= text.length || /\W/.test(text[idx + token.length]);
      if (before && after) score += 0.5;
    }
  }
  return score;
}

// ---------------------------------------------------------------------------
// Public search API
// ---------------------------------------------------------------------------

export interface SearchResult {
  /** Document id — use to navigate to `/doc/:id` */
  documentId: string;
  /** Document name (title) */
  name: string;
  /** Short excerpt of body text surrounding the first match (≤~150 chars) */
  snippet: string;
  /** Relevance score (higher = better match). Not stable across versions. */
  score: number;
  /** True if the query matched the document title */
  titleMatch: boolean;
}

/**
 * Search all non-trashed documents for `query`.
 *
 * Matching strategy:
 *   - Exact phrase in title  → score += 20
 *   - All query tokens in title → score += 10
 *   - Some tokens in title   → score += 5 × fraction
 *   - Body text occurrences  → score += 1 per occurrence (+0.5 for whole-word)
 *
 * Returns results sorted by score descending. Returns [] for empty query.
 */
export async function searchDocuments(query: string): Promise<SearchResult[]> {
  if (!query.trim()) return [];

  const { listDocuments } = await import('./documentStore');
  const docs = await listDocuments();
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];

  const queryLower = query.toLowerCase();
  const results: SearchResult[] = [];

  for (const doc of docs) {
    const nameLower = doc.name.toLowerCase();

    // ── Title scoring ──
    let titleScore = 0;
    let titleMatch = false;

    if (nameLower.includes(queryLower)) {
      // Exact phrase match in title
      titleScore = 20;
      titleMatch = true;
    } else {
      const matchedTokens = tokens.filter((t) => nameLower.includes(t));
      if (matchedTokens.length > 0) {
        titleScore = (matchedTokens.length / tokens.length) * 10;
        titleMatch = true;
      }
    }

    // ── Body scoring ──
    const bodyText = extractTextFromLexicalJSON(doc.content);
    const bodyScore = scoreText(bodyText, tokens);
    const snippet = buildSnippet(bodyText, tokens);

    const totalScore = titleScore + bodyScore;
    if (totalScore === 0) continue;

    results.push({
      documentId: doc.id,
      name: doc.name,
      snippet,
      score: totalScore,
      titleMatch,
    });
  }

  return results.sort((a, b) => b.score - a.score);
}
