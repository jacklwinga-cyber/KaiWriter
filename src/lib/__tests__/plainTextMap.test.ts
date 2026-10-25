import { describe, it, expect } from 'vitest';
import { $createParagraphNode, $createTextNode, $getRoot, createEditor, type LexicalEditor } from 'lexical';
import { EDITOR_NODES } from '../../components/editor/nodes/editorNodes';
import { $createTrackedDeleteNode } from '../../components/editor/nodes/TrackedChangeNodes';
import {
  applyPlainTextEditInEditor,
  applyPlainTextEditsInEditor,
  getPlainTextFromEditor,
} from '../plainTextMap';

function editorWith(build: () => void): LexicalEditor {
  const editor = createEditor({ nodes: EDITOR_NODES, onError: (e) => { throw e; } });
  editor.update(build, { discrete: true });
  return editor;
}

const paragraph = (...parts: Array<[string, number?]>) =>
  $createParagraphNode().append(...parts.map(([text, format]) => $createTextNode(text).setFormat(format ?? 0)));

function flush(editor: LexicalEditor) {
  // Commit the pending update so the next read sees it.
  editor.update(() => {}, { discrete: true });
}

describe('plainTextMap edits', () => {
  it('maps a leading empty paragraph to a leading newline', () => {
    const editor = editorWith(() => $getRoot().append($createParagraphNode(), paragraph(['Teh cat'])));
    const text = getPlainTextFromEditor(editor);
    expect(text).toBe('\nTeh cat\n');
    expect(applyPlainTextEditInEditor(editor, 1, 3, 'The', 'Teh')).toBe(true);
    flush(editor);
    expect(getPlainTextFromEditor(editor)).toBe('\nThe cat\n');
  });

  it('replaces text spanning differently formatted pieces', () => {
    // "recieve" split as "rec" (bold) + "ieve" (plain)
    const editor = editorWith(() => $getRoot().append(paragraph(['We rec', 1], ['ieve it.'])));
    expect(applyPlainTextEditInEditor(editor, 3, 7, 'receive', 'recieve')).toBe(true);
    flush(editor);
    expect(getPlainTextFromEditor(editor)).toBe('We receive it.\n');
  });

  it('refuses an edit whose text changed since the check', () => {
    const editor = editorWith(() => $getRoot().append(paragraph(['Hello world'])));
    expect(applyPlainTextEditInEditor(editor, 0, 5, 'Hi', 'Howdy')).toBe(false);
    flush(editor);
    expect(getPlainTextFromEditor(editor)).toBe('Hello world\n');
  });

  it('refuses an edit that would merge paragraphs', () => {
    const editor = editorWith(() => $getRoot().append(paragraph(['One']), paragraph(['Two'])));
    expect(applyPlainTextEditInEditor(editor, 2, 3, 'X', 'e\nT')).toBe(false);
  });

  it('applies accept-all edits in one update, skipping conflicts and stale ones', () => {
    const editor = editorWith(() => $getRoot().append(paragraph(['Teh quick brwon fox jumpd.'])));
    const applied = applyPlainTextEditsInEditor(editor, [
      { offset: 0, length: 3, original: 'Teh', replacement: 'The' },
      { offset: 10, length: 5, original: 'brwon', replacement: 'brown' },
      { offset: 11, length: 2, original: 'rw', replacement: 'ro' }, // overlaps the previous one
      { offset: 20, length: 5, original: 'jumpx', replacement: 'jumped' }, // stale
    ]);
    flush(editor);
    expect(applied.map((e) => e.original)).toEqual(['brwon', 'Teh']);
    expect(getPlainTextFromEditor(editor)).toBe('The quick brown fox jumpd.\n');
  });

  it('leaves text pending deletion out of the checked text', () => {
    const editor = editorWith(() => {
      const p = paragraph(['Keep ']);
      p.append($createTrackedDeleteNode({ author: 'Ana', date: 0 }).append($createTextNode('gone ')), $createTextNode('this'));
      $getRoot().append(p);
    });
    expect(getPlainTextFromEditor(editor)).toBe('Keep this\n');
  });
});
