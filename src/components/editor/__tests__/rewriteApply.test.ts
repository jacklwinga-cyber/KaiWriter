import { describe, it, expect } from 'vitest';
import { $createParagraphNode, $createTextNode, $getRoot, createEditor, type LexicalEditor } from 'lexical';
import { EDITOR_NODES } from '../nodes/editorNodes';
import { $insertRewriteAfterRange, $replaceRangeWithRewrite, rewriteParagraphs } from '../rewriteApply';
import { buildPlainTextMap } from '../../../lib/plainTextMap';

const ME = { author: 'Ana', date: 1_000 };

/** Paragraphs given as arrays of [text, bold?] runs. */
function setup(paragraphs: Array<Array<[string, boolean?]>>): LexicalEditor {
  const editor = createEditor({ nodes: EDITOR_NODES, onError: (e) => { throw e; } });
  editor.update(() => {
    for (const runs of paragraphs) {
      const p = $createParagraphNode();
      for (const [text, bold] of runs) {
        const t = $createTextNode(text);
        if (bold) t.toggleFormat('bold');
        p.append(t);
      }
      $getRoot().append(p);
    }
  }, { discrete: true });
  return editor;
}

function plain(editor: LexicalEditor): string {
  let text = '';
  editor.getEditorState().read(() => {
    text = buildPlainTextMap().text;
  });
  return text;
}

/** Each paragraph as text with [+inserted+] and [-deleted-] markers. */
function markup(editor: LexicalEditor): string[] {
  const json = editor.getEditorState().toJSON() as unknown as {
    root: { children: Array<{ children: Array<{ type: string; text?: string; children?: Array<{ text?: string }> }> }> };
  };
  return json.root.children.map((p) => p.children
    .map((n) => {
      const inner = n.children?.map((c) => c.text ?? '').join('') ?? '';
      if (n.type === 'tracked-insert') return `[+${inner}+]`;
      if (n.type === 'tracked-delete') return `[-${inner}-]`;
      return n.text ?? '';
    })
    .join(''));
}

function apply(editor: LexicalEditor, fn: () => boolean): boolean {
  let ok = false;
  editor.update(() => {
    ok = fn();
  }, { discrete: true });
  return ok;
}

describe('rewriteParagraphs', () => {
  it('splits on line breaks and drops empty paragraphs', () => {
    expect(rewriteParagraphs('One.\n\n\nTwo.\n')).toEqual(['One.', 'Two.']);
  });
});

describe('$replaceRangeWithRewrite', () => {
  it('replaces part of a paragraph', () => {
    const editor = setup([[['The very confidential plan is very simple. Next sentence.']]]);
    const expected = 'The very confidential plan is very simple.';
    expect(apply(editor, () => $replaceRangeWithRewrite(0, expected.length, expected, ['The plan is simple.']))).toBe(true);
    expect(plain(editor)).toBe('The plan is simple. Next sentence.\n');
  });

  it('replaces text spanning formatted runs', () => {
    const editor = setup([[['Start ', false], ['bold bit', true], [' end.', false]]]);
    const expected = 'Start bold bit end.';
    expect(apply(editor, () => $replaceRangeWithRewrite(0, expected.length, expected, ['Rewritten.']))).toBe(true);
    expect(plain(editor)).toBe('Rewritten.\n');
  });

  it('replaces several paragraphs, including a selection that ends at the next paragraph', () => {
    const editor = setup([[['First para.']], [['Second para.']], [['Keep me.']]]);
    const expected = 'First para.\nSecond para.\n';
    expect(apply(editor, () => $replaceRangeWithRewrite(0, expected.length, expected, ['One.', 'Two.', 'Three.']))).toBe(true);
    expect(plain(editor)).toBe('One.\nTwo.\nThree.\nKeep me.\n');
  });

  it('refuses when the text changed since it was rewritten', () => {
    const editor = setup([[['Hello there.']]]);
    expect(apply(editor, () => $replaceRangeWithRewrite(0, 12, 'Hello where.', ['Hi.']))).toBe(false);
    expect(apply(editor, () => $replaceRangeWithRewrite(0, 1, '\n', ['Hi.']))).toBe(false);
    expect(plain(editor)).toBe('Hello there.\n');
  });

  it('records the rewrite as a tracked change when track changes is on', () => {
    const editor = setup([[['The very plan works.']]]);
    const expected = 'The very plan';
    expect(apply(editor, () => $replaceRangeWithRewrite(0, expected.length, expected, ['The plan'], ME))).toBe(true);
    expect(markup(editor)).toEqual(['[-The very plan-][+The plan+] works.']);
    expect(plain(editor)).toBe('The plan works.\n');
  });

  it('tracks a multi-paragraph rewrite', () => {
    const editor = setup([[['Alpha beta.']]]);
    expect(apply(editor, () => $replaceRangeWithRewrite(0, 11, 'Alpha beta.', ['Alpha.', 'Beta.'], ME))).toBe(true);
    expect(markup(editor)).toEqual(['[-Alpha beta.-][+Alpha.+]', '[+Beta.+]']);
  });
});

describe('$insertRewriteAfterRange', () => {
  it('adds the rewrite as new paragraphs after the selection', () => {
    const editor = setup([[['Long first.']], [['Long second.']], [['After.']]]);
    const expected = 'Long first.\nLong second.';
    expect(apply(editor, () => $insertRewriteAfterRange(0, expected.length, expected, ['Summary.']))).toBe(true);
    expect(plain(editor)).toBe('Long first.\nLong second.\nSummary.\nAfter.\n');
  });

  it('tracks the insertion and checks the text first', () => {
    const editor = setup([[['Text.']]]);
    expect(apply(editor, () => $insertRewriteAfterRange(0, 5, 'Nope.', ['X.'], ME))).toBe(false);
    expect(apply(editor, () => $insertRewriteAfterRange(0, 5, 'Text.', ['Short.'], ME))).toBe(true);
    expect(markup(editor)).toEqual(['Text.', '[+Short.+]']);
  });
});
