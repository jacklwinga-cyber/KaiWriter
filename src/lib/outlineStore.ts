/**
 * outlineStore.ts — P2-A document outline
 *
 * Pure functions for extracting a document outline (heading tree) from a
 * Lexical editor-state JSON string. No Lexical runtime required — works on
 * the serialised content stored in IndexedDB or passed via the editor's
 * editorState.toJSON() output.
 *
 * The NavigationSidebarPlugin uses the live Lexical editor for real-time
 * extraction (faster, no JSON round-trip), but these pure functions are the
 * canonical reference implementation used by unit tests.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type HeadingLevel = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';

export interface OutlineEntry {
  /** Lexical node key — used to scroll the editor to this heading. */
  key: string;
  /** Plain-text content of the heading (may be empty for blank headings). */
  text: string;
  /** Lexical heading tag. */
  tag: HeadingLevel;
  /** Numeric heading level 1–6. Derived from tag for easy arithmetic. */
  level: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const HEADING_LEVELS: Readonly<Record<HeadingLevel, number>> = {
  h1: 1, h2: 2, h3: 3, h4: 4, h5: 5, h6: 6,
};

function isHeadingTag(value: unknown): value is HeadingLevel {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(HEADING_LEVELS, value);
}

type SerializedNode = {
  type?: string;
  tag?: string;
  text?: string;
  /**
   * Lexical stores the node key as `__key` in its serialisation output.
   * We also accept `key` as a fallback so tests can use shorter hand-crafted
   * fixtures without the double-underscore prefix.
   */
  __key?: string;
  key?: string;
  children?: SerializedNode[];
  [k: string]: unknown;
};

/** Collect all text content from a node and its descendants. */
function collectText(node: SerializedNode): string {
  if (node.type === 'text') return (node.text as string) ?? '';
  if (node.type === 'linebreak') return '\n';
  return (node.children ?? []).map(collectText).join('');
}

/**
 * Walk a serialised Lexical node tree and push heading entries into `out`.
 * Children of heading nodes are NOT recursed (headings cannot contain headings).
 */
function walkForOutline(node: SerializedNode, out: OutlineEntry[]): void {
  if (node.type === 'heading' && isHeadingTag(node.tag)) {
    out.push({
      key: (node.__key ?? node.key ?? '') as string,
      text: collectText(node),
      tag: node.tag,
      level: HEADING_LEVELS[node.tag],
    });
    // Do not recurse into heading children — they cannot contain nested headings
    return;
  }
  // For all other container nodes, recurse into children
  for (const child of node.children ?? []) {
    walkForOutline(child, out);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extract an ordered list of heading entries from a serialised Lexical
 * editor-state JSON string.
 *
 * Returns [] on empty input, invalid JSON, or documents with no headings.
 * Never throws.
 */
export function extractOutlineFromJSON(content: string): OutlineEntry[] {
  if (!content) return [];
  try {
    const state = JSON.parse(content) as { root?: SerializedNode };
    if (!state?.root) return [];
    const entries: OutlineEntry[] = [];
    for (const child of state.root.children ?? []) {
      walkForOutline(child, entries);
    }
    return entries;
  } catch {
    return [];
  }
}

/**
 * Return the 0-based indent depth for a heading level (1–6).
 * h1 → 0, h2 → 1, … h6 → 5.
 * Values outside 1–6 are clamped to 0.
 */
export function headingIndentDepth(level: number): number {
  return Math.max(0, level - 1);
}
