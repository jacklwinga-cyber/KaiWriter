/**
 * Underlines proofreading issues in the editor with the CSS Custom Highlight
 * API. Highlights are painted over the text without touching the DOM or the
 * document, so they can't affect saving, undo, sync or track changes. Browsers
 * without the API (older Firefox) just show no underlines.
 */
import type { LexicalEditor } from 'lexical';
import { buildPlainTextMap, piecesForRanges } from '../../lib/plainTextMap';

export const HIGHLIGHT_ERROR = 'kw-proof-error';
export const HIGHLIGHT_STYLE = 'kw-proof-style';

export interface HighlightableIssue {
  offset: number;
  length: number;
  original: string;
  kind: string;
}

export function supportsHighlights(): boolean {
  return typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight !== 'undefined';
}

/** The DOM text node Lexical renders for a text node (formatted text can be nested inside tags). */
function domTextNode(element: HTMLElement | null): Text | null {
  let node: Node | null = element;
  while (node && node.nodeType !== Node.TEXT_NODE) node = node.firstChild;
  return node as Text | null;
}

/** Paint underlines for `issues`; returns how many issues were highlighted. */
export function paintHighlights(editor: LexicalEditor, issues: HighlightableIssue[]): number {
  if (!supportsHighlights()) return 0;
  const errors = new Highlight();
  const style = new Highlight();
  let painted = 0;
  editor.getEditorState().read(() => {
    for (const { range, pieces } of piecesForRanges(buildPlainTextMap(), issues)) {
      const domRanges: Range[] = [];
      for (const piece of pieces) {
        const text = domTextNode(editor.getElementByKey(piece.key));
        if (!text || piece.end > text.length) {
          domRanges.length = 0; // DOM not in sync with the state yet; skip this issue
          break;
        }
        const r = document.createRange();
        r.setStart(text, piece.start);
        r.setEnd(text, piece.end);
        domRanges.push(r);
      }
      if (!domRanges.length) continue;
      const target = range.kind === 'style' || range.kind === 'clarity' ? style : errors;
      domRanges.forEach((r) => target.add(r));
      painted += 1;
    }
  });
  CSS.highlights.set(HIGHLIGHT_ERROR, errors);
  CSS.highlights.set(HIGHLIGHT_STYLE, style);
  return painted;
}

export function clearHighlights(): void {
  if (!supportsHighlights()) return;
  CSS.highlights.delete(HIGHLIGHT_ERROR);
  CSS.highlights.delete(HIGHLIGHT_STYLE);
}
