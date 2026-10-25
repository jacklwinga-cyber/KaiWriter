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

/** Highlight names to paint into: the Review panel and live checking use separate sets. */
export interface HighlightNames {
  error: string;
  style: string;
}

export const PANEL_HIGHLIGHTS: HighlightNames = { error: HIGHLIGHT_ERROR, style: HIGHLIGHT_STYLE };
export const LIVE_HIGHLIGHTS: HighlightNames = { error: 'kw-live-error', style: 'kw-live-style' };

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

/**
 * Browsers repaint every highlight on every frame, so hundreds of underlines
 * make typing slow. Only issues within this many screen-heights of the
 * visible area are underlined; callers repaint on scroll.
 */
const VIEWPORT_MARGIN_SCREENS = 0.25;

function nearViewport(text: Text, start: number, end: number): boolean {
  // Measure the issue itself, not its paragraph: one paragraph can be very long.
  const probe = document.createRange();
  probe.setStart(text, start);
  probe.setEnd(text, end);
  const rect = probe.getBoundingClientRect();
  const margin = window.innerHeight * VIEWPORT_MARGIN_SCREENS;
  return rect.bottom >= -margin && rect.top <= window.innerHeight + margin;
}

/** Paint underlines for `issues` near the visible area; returns how many issues were highlighted. */
export function paintHighlights(
  editor: LexicalEditor,
  issues: HighlightableIssue[],
  names: HighlightNames = PANEL_HIGHLIGHTS,
): number {
  if (!supportsHighlights()) return 0;
  const errors = new Highlight();
  const style = new Highlight();
  let painted = 0;
  editor.getEditorState().read(() => {
    for (const { range, pieces } of piecesForRanges(buildPlainTextMap(), issues)) {
      // StaticRange, not Range: live ranges are updated by the browser on every
      // DOM change, which makes typing slow with hundreds of underlines. We
      // repaint after each pause in typing instead.
      const domRanges: StaticRange[] = [];
      const firstText = domTextNode(editor.getElementByKey(pieces[0].key));
      if (!firstText || pieces[0].end > firstText.length) continue;
      if (!nearViewport(firstText, pieces[0].start, pieces[0].end)) continue;
      for (const piece of pieces) {
        const text = domTextNode(editor.getElementByKey(piece.key));
        if (!text || piece.end > text.length) {
          domRanges.length = 0; // DOM not in sync with the state yet; skip this issue
          break;
        }
        domRanges.push(new StaticRange({ startContainer: text, startOffset: piece.start, endContainer: text, endOffset: piece.end }));
      }
      if (!domRanges.length) continue;
      const target = range.kind === 'style' || range.kind === 'clarity' ? style : errors;
      domRanges.forEach((r) => target.add(r));
      painted += 1;
    }
  });
  CSS.highlights.set(names.error, errors);
  CSS.highlights.set(names.style, style);
  return painted;
}

/** Call `repaint` (throttled to one animation frame) when the user scrolls anywhere. */
export function onScrollRepaint(repaint: () => void): () => void {
  let frame = 0;
  const onScroll = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      repaint();
    });
  };
  window.addEventListener('scroll', onScroll, { capture: true, passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  return () => {
    cancelAnimationFrame(frame);
    window.removeEventListener('scroll', onScroll, { capture: true });
    window.removeEventListener('resize', onScroll);
  };
}

export function clearHighlights(names: HighlightNames = PANEL_HIGHLIGHTS): void {
  if (!supportsHighlights()) return;
  CSS.highlights.delete(names.error);
  CSS.highlights.delete(names.style);
}
