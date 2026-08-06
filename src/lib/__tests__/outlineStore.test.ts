/**
 * Tests for outlineStore — P2-A document outline extraction.
 * Pure JSON-based; no Lexical runtime or IDB required.
 */
import { describe, it, expect } from 'vitest';
import { extractOutlineFromJSON, headingIndentDepth } from '../outlineStore';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Build a minimal serialised Lexical state with arbitrary top-level nodes. */
function lexicalState(children: object[]): string {
  return JSON.stringify({ root: { type: 'root', children } });
}

function heading(tag: string, text: string, key = `key-${tag}-${text}`): object {
  return {
    type: 'heading',
    tag,
    __key: key,
    children: [{ type: 'text', text, __key: `${key}-text` }],
  };
}

function paragraph(text: string): object {
  return {
    type: 'paragraph',
    children: [{ type: 'text', text }],
  };
}

// ---------------------------------------------------------------------------
// extractOutlineFromJSON — edge cases
// ---------------------------------------------------------------------------

describe('extractOutlineFromJSON — edge cases', () => {
  it('returns [] for empty string', () => {
    expect(extractOutlineFromJSON('')).toEqual([]);
  });

  it('returns [] for invalid JSON', () => {
    expect(extractOutlineFromJSON('{not valid json')).toEqual([]);
  });

  it('returns [] when root is missing', () => {
    expect(extractOutlineFromJSON(JSON.stringify({}))).toEqual([]);
  });

  it('returns [] for a document with no headings', () => {
    const content = lexicalState([paragraph('Just a paragraph.')]);
    expect(extractOutlineFromJSON(content)).toEqual([]);
  });

  it('handles an empty root children array', () => {
    const content = lexicalState([]);
    expect(extractOutlineFromJSON(content)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Single heading
// ---------------------------------------------------------------------------

describe('extractOutlineFromJSON — single heading', () => {
  it('extracts a single h1', () => {
    const content = lexicalState([heading('h1', 'Introduction')]);
    const result = extractOutlineFromJSON(content);
    expect(result).toHaveLength(1);
    expect(result[0].tag).toBe('h1');
    expect(result[0].level).toBe(1);
    expect(result[0].text).toBe('Introduction');
  });

  it('extracts a single h3 with correct level', () => {
    const content = lexicalState([heading('h3', 'Subsection')]);
    const result = extractOutlineFromJSON(content);
    expect(result[0].tag).toBe('h3');
    expect(result[0].level).toBe(3);
  });

  it('preserves the node key', () => {
    const content = lexicalState([heading('h2', 'Chapter', 'node-42')]);
    const result = extractOutlineFromJSON(content);
    expect(result[0].key).toBe('node-42');
  });

  it('handles an empty heading (blank text)', () => {
    const content = lexicalState([heading('h1', '')]);
    const result = extractOutlineFromJSON(content);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Multiple heading levels
// ---------------------------------------------------------------------------

describe('extractOutlineFromJSON — multiple heading levels', () => {
  it('supports all heading levels h1–h6', () => {
    const content = lexicalState([
      heading('h1', 'Title'),
      heading('h2', 'Section'),
      heading('h3', 'Subsection'),
      heading('h4', 'Sub-subsection'),
      heading('h5', 'Deep'),
      heading('h6', 'Deepest'),
    ]);
    const result = extractOutlineFromJSON(content);
    expect(result).toHaveLength(6);
    expect(result.map((e) => e.level)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(result.map((e) => e.tag)).toEqual(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
  });

  it('ignores nodes with unrecognised tag values', () => {
    // A node that says type: heading but has an invalid/unknown tag
    const content = JSON.stringify({
      root: {
        type: 'root',
        children: [
          { type: 'heading', tag: 'h7', children: [{ type: 'text', text: 'Ghost' }] },
          heading('h2', 'Real Heading'),
        ],
      },
    });
    const result = extractOutlineFromJSON(content);
    // h7 is not a valid HeadingLevel → ignored
    expect(result).toHaveLength(1);
    expect(result[0].tag).toBe('h2');
  });
});

// ---------------------------------------------------------------------------
// Document ordering
// ---------------------------------------------------------------------------

describe('extractOutlineFromJSON — document ordering', () => {
  it('preserves the order of headings as they appear in the document', () => {
    const content = lexicalState([
      heading('h1', 'First'),
      paragraph('Some body text.'),
      heading('h2', 'Second'),
      paragraph('More text.'),
      heading('h1', 'Third'),
    ]);
    const result = extractOutlineFromJSON(content);
    expect(result.map((e) => e.text)).toEqual(['First', 'Second', 'Third']);
  });

  it('non-heading nodes between headings do not affect order', () => {
    const content = lexicalState([
      heading('h1', 'Alpha'),
      paragraph('Paragraph A'),
      paragraph('Paragraph B'),
      heading('h2', 'Beta'),
      heading('h3', 'Gamma'),
    ]);
    const result = extractOutlineFromJSON(content);
    expect(result.map((e) => e.text)).toEqual(['Alpha', 'Beta', 'Gamma']);
  });
});

// ---------------------------------------------------------------------------
// Duplicate heading text
// ---------------------------------------------------------------------------

describe('extractOutlineFromJSON — duplicate heading text', () => {
  it('returns both entries when two headings share the same text', () => {
    const content = lexicalState([
      heading('h2', 'Overview', 'key-a'),
      heading('h2', 'Overview', 'key-b'),
    ]);
    const result = extractOutlineFromJSON(content);
    expect(result).toHaveLength(2);
    // Both have the same text but different keys
    expect(result[0].key).toBe('key-a');
    expect(result[1].key).toBe('key-b');
    expect(result[0].text).toBe('Overview');
    expect(result[1].text).toBe('Overview');
  });
});

// ---------------------------------------------------------------------------
// Malformed / unsupported nodes — must not throw
// ---------------------------------------------------------------------------

describe('extractOutlineFromJSON — malformed nodes', () => {
  it('handles nodes with missing children field', () => {
    const content = JSON.stringify({
      root: {
        type: 'root',
        children: [
          { type: 'paragraph' }, // no children key
          heading('h1', 'Safe'),
        ],
      },
    });
    expect(() => extractOutlineFromJSON(content)).not.toThrow();
    expect(extractOutlineFromJSON(content)).toHaveLength(1);
  });

  it('handles null children values gracefully', () => {
    const content = JSON.stringify({
      root: {
        type: 'root',
        children: [null, heading('h1', 'Still works')],
      },
    });
    // null children treated as skipped — should not throw
    expect(() => extractOutlineFromJSON(content)).not.toThrow();
  });

  it('handles deeply nested content that is not a heading', () => {
    const content = lexicalState([
      {
        type: 'table',
        children: [
          {
            type: 'tablerow',
            children: [
              {
                type: 'tablecell',
                children: [{ type: 'text', text: 'Cell text' }],
              },
            ],
          },
        ],
      },
      heading('h1', 'After Table'),
    ]);
    const result = extractOutlineFromJSON(content);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('After Table');
  });

  it('extracts text from headings with multiple inline children (bold, italic)', () => {
    // Heading with bold + normal text children
    const content = JSON.stringify({
      root: {
        type: 'root',
        children: [
          {
            type: 'heading',
            tag: 'h2',
            __key: 'h-1',
            children: [
              { type: 'text', text: 'Hello ', __key: 't1' },
              { type: 'text', text: 'World', __key: 't2', format: 1 }, // bold
            ],
          },
        ],
      },
    });
    const result = extractOutlineFromJSON(content);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('Hello World');
  });
});

// ---------------------------------------------------------------------------
// headingIndentDepth
// ---------------------------------------------------------------------------

describe('headingIndentDepth', () => {
  it('h1 (level 1) → depth 0', () => expect(headingIndentDepth(1)).toBe(0));
  it('h2 (level 2) → depth 1', () => expect(headingIndentDepth(2)).toBe(1));
  it('h3 (level 3) → depth 2', () => expect(headingIndentDepth(3)).toBe(2));
  it('h6 (level 6) → depth 5', () => expect(headingIndentDepth(6)).toBe(5));
  it('level 0 (invalid) → depth 0 (clamped)', () => expect(headingIndentDepth(0)).toBe(0));
  it('negative level → depth 0 (clamped)',     () => expect(headingIndentDepth(-1)).toBe(0));
});
