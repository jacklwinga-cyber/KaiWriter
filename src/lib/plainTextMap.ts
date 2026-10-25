import {
  $createRangeSelection,
  $getRoot,
  $getSelection,
  $isLineBreakNode,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
  type LexicalEditor,
  type LexicalNode,
  type TextNode,
} from 'lexical';
import { selectNonOverlapping, type PlannedEdit } from './suggestionOffsets';

export interface PlainTextMap {
  text: string;
  segments: Array<{ node: TextNode; start: number; end: number }>;
}

/**
 * Builds plain text aligned with {@link lexicalToPlainText} offset semantics.
 * Text pending deletion under track changes is left out: it isn't part of the
 * document's current text and must not be proofread or edited.
 */
export function buildPlainTextMap(): PlainTextMap {
  const segments: PlainTextMap['segments'] = [];
  let text = '';

  const appendText = (node: TextNode) => {
    const content = node.getTextContent();
    if (!content) return;
    const start = text.length;
    text += content;
    segments.push({ node, start, end: text.length });
  };

  const walk = (node: LexicalNode): void => {
    if (node.getType() === 'tracked-delete') return;
    if ($isTextNode(node)) {
      appendText(node);
      return;
    }
    if ($isLineBreakNode(node)) {
      text += '\n';
      return;
    }
    if ('getChildren' in node && typeof node.getChildren === 'function') {
      for (const child of node.getChildren()) {
        walk(child);
      }
    }
    const type = node.getType();
    if (type === 'paragraph' || type === 'heading' || type === 'listitem') {
      text += '\n';
    }
  };

  for (const child of $getRoot().getChildren()) {
    walk(child);
  }

  return { text, segments };
}

export function getPlainTextFromEditor(editor: LexicalEditor): string {
  let result = '';
  editor.getEditorState().read(() => {
    result = buildPlainTextMap().text;
  });
  return result;
}

export function getSelectedPlainText(editor: LexicalEditor): string {
  let result = '';
  editor.getEditorState().read(() => {
    const selection = $getSelection();
    if ($isRangeSelection(selection) && !selection.isCollapsed()) {
      result = selection.getTextContent();
    }
  });
  return result;
}

/**
 * Replace plain-text range [offset, offset+length) in the editor's text nodes.
 * The range may span several text nodes in one paragraph (e.g. part bold);
 * the replacement goes into the first node and keeps its formatting. Returns
 * false, changing nothing, if the text there isn't `expected` (the document
 * changed since it was checked) or the range crosses a paragraph boundary.
 */
export function applyPlainTextEdit(
  map: PlainTextMap,
  offset: number,
  length: number,
  replacement: string,
  expected?: string,
): boolean {
  if (offset < 0 || length < 0 || (length === 0 && !replacement)) return false;
  if (expected !== undefined && map.text.slice(offset, offset + length) !== expected) return false;

  const end = offset + length;
  const startIndex = map.segments.findIndex((s) => offset >= s.start && (offset < s.end || (length === 0 && offset === s.end)));
  if (startIndex === -1) return false;

  // Collect the segments covering the range; they must be contiguous (no paragraph gap).
  const covered = [map.segments[startIndex]];
  while (covered[covered.length - 1].end < end) {
    const next = map.segments[startIndex + covered.length];
    if (!next || next.start !== covered[covered.length - 1].end) return false;
    covered.push(next);
  }

  covered.forEach((segment, i) => {
    const content = segment.node.getTextContent();
    const localStart = Math.max(offset, segment.start) - segment.start;
    const localEnd = Math.min(end, segment.end) - segment.start;
    const insert = i === 0 ? replacement : '';
    const next = `${content.slice(0, localStart)}${insert}${content.slice(localEnd)}`;
    if (next) segment.node.setTextContent(next);
    else segment.node.remove();
  });
  return true;
}

/**
 * Apply several edits in one editor update (one undo step), last first so
 * earlier offsets stay valid. Overlapping edits and edits whose text changed
 * are skipped. Returns the edits that were applied.
 */
export function applyPlainTextEditsInEditor<T extends PlannedEdit>(editor: LexicalEditor, edits: T[]): T[] {
  const applied: T[] = [];
  editor.update(() => {
    const ordered = selectNonOverlapping(edits).sort((a, b) => b.offset - a.offset);
    for (const edit of ordered) {
      // Rebuild the map each time: removing a node shifts the segments after it.
      const map = buildPlainTextMap();
      if (applyPlainTextEdit(map, edit.offset, edit.length, edit.replacement, edit.original)) applied.push(edit);
    }
  });
  return applied;
}

/** A piece of a plain-text range inside one text node. */
export interface TextNodePiece {
  key: string;
  start: number;
  end: number;
}

/**
 * For each range whose text still matches `original`, the text-node pieces it
 * covers (a range can span several nodes). Ranges whose text changed since
 * they were computed are left out, so stale suggestions are never highlighted.
 */
export function piecesForRanges<T extends { offset: number; length: number; original: string }>(
  map: PlainTextMap,
  ranges: T[],
): Array<{ range: T; pieces: TextNodePiece[] }> {
  const result: Array<{ range: T; pieces: TextNodePiece[] }> = [];
  for (const range of ranges) {
    const end = range.offset + range.length;
    if (range.length <= 0 || map.text.slice(range.offset, end) !== range.original) continue;
    const pieces: TextNodePiece[] = [];
    for (const segment of map.segments) {
      if (segment.end <= range.offset || segment.start >= end) continue;
      pieces.push({
        key: segment.node.getKey(),
        start: Math.max(range.offset, segment.start) - segment.start,
        end: Math.min(end, segment.end) - segment.start,
      });
    }
    if (pieces.length) result.push({ range, pieces });
  }
  return result;
}

/** Plain-text offsets of the current selection, or null if nothing is selected. */
export function getSelectionPlainTextRange(editor: LexicalEditor): { start: number; end: number } | null {
  let range: { start: number; end: number } | null = null;
  editor.getEditorState().read(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection) || selection.isCollapsed()) return;
    const map = buildPlainTextMap();
    const toOffset = (key: string, offset: number, type: 'text' | 'element') => {
      if (type !== 'text') return null;
      const segment = map.segments.find((s) => s.node.getKey() === key);
      return segment ? segment.start + offset : null;
    };
    const a = toOffset(selection.anchor.key, selection.anchor.offset, selection.anchor.type);
    const b = toOffset(selection.focus.key, selection.focus.offset, selection.focus.type);
    if (a === null || b === null) return;
    range = { start: Math.min(a, b), end: Math.max(a, b) };
  });
  return range;
}

export function selectPlainTextRange(
  map: PlainTextMap,
  offset: number,
  length: number,
): void {
  if (length <= 0) return;

  const startSegment = map.segments.find((s) => offset >= s.start && offset < s.end);
  if (!startSegment) return;

  const endPos = offset + length;
  const endSegment =
    map.segments.find((s) => endPos > s.start && endPos <= s.end) ??
    map.segments[map.segments.length - 1];

  const sel = $createRangeSelection();
  sel.anchor.set(startSegment.node.getKey(), offset - startSegment.start, 'text');
  sel.focus.set(
    endSegment.node.getKey(),
    Math.min(endPos - endSegment.start, endSegment.node.getTextContent().length),
    'text',
  );
  $setSelection(sel);
}

export function applyPlainTextEditInEditor(
  editor: LexicalEditor,
  offset: number,
  length: number,
  replacement: string,
  expected?: string,
): boolean {
  let applied = false;
  editor.update(() => {
    const map = buildPlainTextMap();
    applied = applyPlainTextEdit(map, offset, length, replacement, expected);
  });
  return applied;
}

export function selectPlainTextRangeInEditor(
  editor: LexicalEditor,
  offset: number,
  length: number,
): void {
  editor.update(() => {
    const map = buildPlainTextMap();
    selectPlainTextRange(map, offset, length);
  });
}
