/**
 * paragraphFormat.ts — pure helpers for paragraph-level CSS style manipulation.
 *
 * The Lexical ParagraphNode stores styles via ElementNode.setStyle(). However
 * ParagraphNode.createDOM / updateDOM do NOT apply __style to the DOM element.
 * The ParagraphFormatPlugin mutation listener reads these values and applies
 * them as individual CSS properties (preserving Lexical's own textAlign and
 * padding-inline-start properties set by the reconciler).
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface ParagraphFormat {
  /** Left block indent (margin-left), px */
  indentLeft: number;
  /** Right block indent (margin-right), px */
  indentRight: number;
  /**
   * First-line offset (text-indent), px.
   * Positive = first-line indent; negative = hanging indent.
   * For a classic hanging indent set indentLeft = X, firstLine = -X.
   */
  firstLine: number;
  /** Space before paragraph (margin-top), px */
  spaceBefore: number;
  /** Space after paragraph (margin-bottom), px */
  spaceAfter: number;
}

export const DEFAULT_PARAGRAPH_FORMAT: ParagraphFormat = {
  indentLeft: 0,
  indentRight: 0,
  firstLine: 0,
  spaceBefore: 0,
  spaceAfter: 0,
};

// ── CSS property names we own on the paragraph <p> element ──────────────────

const PARA_PROPS = [
  'margin-top',
  'margin-bottom',
  'margin-left',
  'margin-right',
  'text-indent',
] as const;

// ── Pure helpers ─────────────────────────────────────────────────────────────

/** Parse a CSS style string into a map of property → value. */
function parseStyleMap(css: string): Record<string, string> {
  const map: Record<string, string> = {};
  css.split(';').forEach(part => {
    const idx = part.indexOf(':');
    if (idx < 0) return;
    const k = part.slice(0, idx).trim().toLowerCase();
    const v = part.slice(idx + 1).trim();
    if (k && v) map[k] = v;
  });
  return map;
}

/** Parse a pixel value string to a number (returns 0 on failure). */
function parsePx(v: string | undefined): number {
  if (!v) return 0;
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

/**
 * Build a CSS style string from paragraph format overrides, merging into an
 * existing style string (preserving unrelated CSS properties).
 */
export function buildParagraphStyle(
  fmt: Partial<ParagraphFormat>,
  existing = '',
): string {
  const map = parseStyleMap(existing);

  const set = (cssKey: string, value: number) => {
    if (value !== 0) map[cssKey] = `${value}px`;
    else delete map[cssKey];
  };

  if (fmt.indentLeft   !== undefined) set('margin-left',   fmt.indentLeft);
  if (fmt.indentRight  !== undefined) set('margin-right',  fmt.indentRight);
  if (fmt.firstLine    !== undefined) set('text-indent',   fmt.firstLine);
  if (fmt.spaceBefore  !== undefined) set('margin-top',    fmt.spaceBefore);
  if (fmt.spaceAfter   !== undefined) set('margin-bottom', fmt.spaceAfter);

  return Object.entries(map)
    .map(([k, v]) => `${k}: ${v}`)
    .join('; ');
}

/** Parse a CSS style string back into a ParagraphFormat. */
export function parseParagraphStyle(css: string): ParagraphFormat {
  const map = parseStyleMap(css);
  return {
    indentLeft:  parsePx(map['margin-left']),
    indentRight: parsePx(map['margin-right']),
    firstLine:   parsePx(map['text-indent']),
    spaceBefore: parsePx(map['margin-top']),
    spaceAfter:  parsePx(map['margin-bottom']),
  };
}

/**
 * Apply paragraph-format CSS properties to a live DOM element.
 *
 * Only sets the five properties we own. This is safe to call from a Lexical
 * mutation listener because the Lexical reconciler only touches:
 *   • dom.style.textAlign          (FORMAT_ELEMENT_COMMAND / setElementFormat)
 *   • dom.style.paddingInlineStart (INDENT_CONTENT_COMMAND / setElementIndent)
 *
 * Setting individual CSS properties (not overwriting the entire style
 * attribute) ensures those reconciler-managed properties are preserved.
 */
export function applyParagraphStyleToDOM(
  dom: HTMLElement,
  styleString: string,
): void {
  const fmt = parseParagraphStyle(styleString);
  dom.style.marginTop    = fmt.spaceBefore ? `${fmt.spaceBefore}px` : '';
  dom.style.marginBottom = fmt.spaceAfter  ? `${fmt.spaceAfter}px`  : '';
  dom.style.marginLeft   = fmt.indentLeft  ? `${fmt.indentLeft}px`  : '';
  dom.style.marginRight  = fmt.indentRight ? `${fmt.indentRight}px` : '';
  dom.style.textIndent   = fmt.firstLine   ? `${fmt.firstLine}px`   : '';
}

/**
 * Clear only the paragraph-format CSS properties from a DOM element.
 */
export function clearParagraphStyleOnDOM(dom: HTMLElement): void {
  for (const prop of PARA_PROPS) {
    dom.style.removeProperty(prop);
  }
}

/** Returns true if all ParagraphFormat values are zero (no custom formatting). */
export function isParagraphFormatEmpty(fmt: ParagraphFormat): boolean {
  return (
    fmt.indentLeft  === 0 &&
    fmt.indentRight === 0 &&
    fmt.firstLine   === 0 &&
    fmt.spaceBefore === 0 &&
    fmt.spaceAfter  === 0
  );
}
