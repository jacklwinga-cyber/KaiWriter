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

export interface PlainTextMap {
  text: string;
  segments: Array<{ node: TextNode; start: number; end: number }>;
}

/** Builds plain text aligned with {@link lexicalToPlainText} offset semantics. */
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

export function applyPlainTextEdit(
  map: PlainTextMap,
  offset: number,
  length: number,
  replacement: string,
): boolean {
  if (length <= 0 && !replacement) return false;

  const segment = map.segments.find((s) => offset >= s.start && offset < s.end);
  if (!segment) return false;

  const localStart = offset - segment.start;
  const nodeLength = segment.end - segment.start;
  const localEnd = Math.min(localStart + length, nodeLength);
  const content = segment.node.getTextContent();
  segment.node.setTextContent(`${content.slice(0, localStart)}${replacement}${content.slice(localEnd)}`);
  return true;
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
): boolean {
  let applied = false;
  editor.update(() => {
    const map = buildPlainTextMap();
    applied = applyPlainTextEdit(map, offset, length, replacement);
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
