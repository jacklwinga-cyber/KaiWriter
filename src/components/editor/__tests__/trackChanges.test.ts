import { describe, it, expect } from 'vitest';
import {
  $createParagraphNode,
  $createRangeSelection,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $setSelection,
  createEditor,
  type LexicalEditor,
  type TextNode,
} from 'lexical';
import { EDITOR_NODES } from '../nodes/editorNodes';
import {
  $acceptChange,
  $getAllChanges,
  $insertTrackedText,
  $markRangeDeleted,
  $rejectChange,
} from '../trackChanges';

const ME = { author: 'Ana', date: 1_000 };

function setup(text: string): { editor: LexicalEditor; key: string } {
  const editor = createEditor({ nodes: EDITOR_NODES, onError: (e) => { throw e; } });
  let key = '';
  editor.update(() => {
    const t = $createTextNode(text);
    key = t.getKey();
    $getRoot().append($createParagraphNode().append(t));
  }, { discrete: true });
  return { editor, key };
}

function select(key: string, start: number, end = start) {
  const s = $createRangeSelection();
  s.anchor.set(key, start, 'text');
  s.focus.set(key, end, 'text');
  $setSelection(s);
  return s;
}

/** Render the paragraph as text with [+inserted+] and [-deleted-] markers. */
function markup(editor: LexicalEditor): string {
  const json = editor.getEditorState().toJSON() as unknown as { root: { children: Array<{ children: Array<{ type: string; text?: string; children?: Array<{ text?: string }> }> }> } };
  return json.root.children[0].children
    .map((n) => {
      const inner = n.children?.map((c) => c.text ?? '').join('') ?? '';
      if (n.type === 'tracked-insert') return `[+${inner}+]`;
      if (n.type === 'tracked-delete') return `[-${inner}-]`;
      return n.text ?? '';
    })
    .join('');
}

function run(editor: LexicalEditor, fn: () => void) {
  editor.update(fn, { discrete: true });
}

describe('track changes', () => {
  it('wraps typed text in an insertion and keeps extending it', () => {
    const { editor, key } = setup('Hello world');
    run(editor, () => $insertTrackedText(select(key, 5), ',', ME));
    run(editor, () => {
      const s = $getSelection();
      if ($isRangeSelection(s)) $insertTrackedText(s, ' dear', ME);
    });
    expect(markup(editor)).toBe('Hello[+, dear+] world');
  });

  it('marks deleted text instead of removing it', () => {
    const { editor, key } = setup('Hello cruel world');
    run(editor, () => $markRangeDeleted(select(key, 6, 12), ME, true));
    expect(markup(editor)).toBe('Hello [-cruel -]world');
  });

  it('replaces a selection with a deletion followed by an insertion', () => {
    const { editor, key } = setup('The cat sat');
    run(editor, () => $insertTrackedText(select(key, 4, 7), 'dog', ME));
    expect(markup(editor)).toBe('The [-cat-][+dog+] sat');
  });

  it('deleting your own pending insertion removes it outright', () => {
    const { editor, key } = setup('ab');
    run(editor, () => $insertTrackedText(select(key, 1), 'XYZ', ME));
    run(editor, () => {
      const ins = $getAllChanges()[0];
      const text = ins.getFirstDescendant() as TextNode;
      const s = $createRangeSelection();
      s.anchor.set(text.getKey(), 0, 'text');
      s.focus.set(text.getKey(), 3, 'text');
      $setSelection(s);
      $markRangeDeleted(s, ME, true);
    });
    expect(markup(editor)).toBe('ab');
  });

  it('joins consecutive deletions by the same author', () => {
    const { editor, key } = setup('abcdef');
    run(editor, () => $markRangeDeleted(select(key, 3, 4), ME, true)); // d
    run(editor, () => {
      // c, typed as a second backspace: select the character before the deletion
      const first = $getRoot().getFirstDescendant() as TextNode;
      const s = $createRangeSelection();
      s.anchor.set(first.getKey(), 3, 'text');
      s.focus.set(first.getKey(), 2, 'text');
      $setSelection(s);
      $markRangeDeleted(s, ME, true);
    });
    expect(markup(editor)).toBe('ab[-cd-]ef');
  });

  it('accepts and rejects changes', () => {
    const { editor, key } = setup('The cat sat');
    run(editor, () => $insertTrackedText(select(key, 4, 7), 'dog', ME));

    const accepted = createEditor({ nodes: EDITOR_NODES, onError: (e) => { throw e; } });
    accepted.setEditorState(accepted.parseEditorState(JSON.stringify(editor.getEditorState().toJSON())));
    run(accepted, () => $getAllChanges().forEach($acceptChange));
    expect(markup(accepted)).toBe('The dog sat');

    run(editor, () => $getAllChanges().forEach($rejectChange));
    expect(markup(editor)).toBe('The cat sat');
  });

  it('round-trips changes through JSON with author and date', () => {
    const { editor, key } = setup('Hi');
    run(editor, () => $insertTrackedText(select(key, 2), '!', { author: 'Ben', date: 42 }));
    const json = JSON.stringify(editor.getEditorState().toJSON());
    expect(json).toContain('"type":"tracked-insert"');
    expect(json).toContain('"author":"Ben"');
    const copy = createEditor({ nodes: EDITOR_NODES, onError: (e) => { throw e; } });
    copy.setEditorState(copy.parseEditorState(json));
    expect(markup(copy)).toBe('Hi[+!+]');
  });
});
