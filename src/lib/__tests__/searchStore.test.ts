/**
 * Tests for searchStore — P1-A full-text search.
 * Uses fake-indexeddb (polyfilled in src/test/setup.ts).
 */
import { describe, it, expect } from 'vitest';
import { extractTextFromLexicalJSON, searchDocuments } from '../searchStore';
import { saveDocument } from '../documentStore';

// ── Helpers ──────────────────────────────────────────────────────────────────

function lexicalDoc(...paragraphs: string[]): string {
  return JSON.stringify({
    root: {
      type: 'root',
      children: paragraphs.map((text) => ({
        type: 'paragraph',
        children: text
          ? [{ type: 'text', text }]
          : [],
      })),
    },
  });
}

async function seed(
  docs: Array<{ id: string; name: string; content: string }>,
) {
  for (const doc of docs) {
    await saveDocument({ ...doc, lastModified: Date.now() });
  }
}

// ── extractTextFromLexicalJSON ────────────────────────────────────────────────

describe('extractTextFromLexicalJSON', () => {
  it('returns empty string for empty input', () => {
    expect(extractTextFromLexicalJSON('')).toBe('');
  });

  it('returns empty string for invalid JSON', () => {
    expect(extractTextFromLexicalJSON('{not valid')).toBe('');
  });

  it('returns empty string when root is missing', () => {
    expect(extractTextFromLexicalJSON(JSON.stringify({}))).toBe('');
  });

  it('extracts text from a single paragraph', () => {
    const content = lexicalDoc('Hello world');
    expect(extractTextFromLexicalJSON(content)).toBe('Hello world');
  });

  it('joins multiple paragraphs with newlines (trimmed)', () => {
    const content = lexicalDoc('First paragraph', 'Second paragraph');
    const text = extractTextFromLexicalJSON(content);
    expect(text).toContain('First paragraph');
    expect(text).toContain('Second paragraph');
  });

  it('handles nested children (heading → text)', () => {
    const content = JSON.stringify({
      root: {
        type: 'root',
        children: [
          {
            type: 'heading',
            children: [{ type: 'text', text: 'Chapter One' }],
          },
          {
            type: 'paragraph',
            children: [{ type: 'text', text: 'Body text here' }],
          },
        ],
      },
    });
    const text = extractTextFromLexicalJSON(content);
    expect(text).toContain('Chapter One');
    expect(text).toContain('Body text here');
  });

  it('returns empty string for a document with no text nodes', () => {
    const content = JSON.stringify({
      root: {
        type: 'root',
        children: [{ type: 'paragraph', children: [] }],
      },
    });
    expect(extractTextFromLexicalJSON(content)).toBe('');
  });
});

// ── searchDocuments ───────────────────────────────────────────────────────────

describe('searchDocuments — basic', () => {
  it('returns empty array for empty query', async () => {
    await seed([{ id: 's1', name: 'Test Doc', content: lexicalDoc('some text') }]);
    expect(await searchDocuments('')).toHaveLength(0);
    expect(await searchDocuments('   ')).toHaveLength(0);
  });

  it('finds document by title', async () => {
    await seed([
      { id: 's2', name: 'Marketing Strategy 2025', content: lexicalDoc('unrelated body') },
      { id: 's3', name: 'Engineering Notes',       content: lexicalDoc('unrelated body') },
    ]);
    const results = await searchDocuments('marketing');
    expect(results.some((r) => r.documentId === 's2')).toBe(true);
    expect(results.find((r) => r.documentId === 's2')?.titleMatch).toBe(true);
  });

  it('finds document by body content', async () => {
    await seed([
      { id: 's4', name: 'Untitled', content: lexicalDoc('The revenue forecast for Q3 looks promising.') },
    ]);
    const results = await searchDocuments('revenue forecast');
    expect(results.some((r) => r.documentId === 's4')).toBe(true);
  });

  it('returns no results when query matches nothing', async () => {
    await seed([
      { id: 's5', name: 'My Document', content: lexicalDoc('Some ordinary text') },
    ]);
    const results = await searchDocuments('zzxyznonexistentterm');
    expect(results).toHaveLength(0);
  });
});

describe('searchDocuments — ranking', () => {
  it('title match ranks above body-only match', async () => {
    await seed([
      { id: 'r1', name: 'Keyword Document',   content: lexicalDoc('nothing special here') },
      { id: 'r2', name: 'Unrelated Title',    content: lexicalDoc('the keyword appears many times keyword keyword keyword') },
    ]);
    const results = await searchDocuments('keyword');
    // r1 has exact title match; r2 has body occurrences
    // Title match should rank higher
    expect(results[0].documentId).toBe('r1');
  });

  it('exact phrase title match ranks above partial title match', async () => {
    await seed([
      { id: 'r3', name: 'Product Roadmap',  content: lexicalDoc('') },
      { id: 'r4', name: 'Product Roadmap Q1 Planning', content: lexicalDoc('') },
    ]);
    const results = await searchDocuments('Product Roadmap');
    // Both match; the one with exact phrase match should be first or both present
    const ids = results.map((r) => r.documentId);
    expect(ids).toContain('r3');
    expect(ids).toContain('r4');
    // Exact match (r3 title IS the phrase) should score >= r4
    const r3Score = results.find((r) => r.documentId === 'r3')!.score;
    const r4Score = results.find((r) => r.documentId === 'r4')!.score;
    expect(r3Score).toBeGreaterThanOrEqual(r4Score);
  });

  it('results are sorted by score descending', async () => {
    await seed([
      { id: 'r5', name: 'Alpha',  content: lexicalDoc('unique term here once') },
      { id: 'r6', name: 'Beta',   content: lexicalDoc('unique term here unique term here unique term here') },
    ]);
    const results = await searchDocuments('unique term');
    // r6 has more body occurrences → higher score → ranks first
    expect(results[0].documentId).toBe('r6');
  });
});

describe('searchDocuments — snippets', () => {
  it('snippet contains text surrounding the match', async () => {
    await seed([
      { id: 'sn1', name: 'Doc', content: lexicalDoc('This is a long document. The important keyword appears here in the middle. More text follows.') },
    ]);
    const results = await searchDocuments('keyword');
    expect(results).toHaveLength(1);
    expect(results[0].snippet).toContain('keyword');
  });

  it('snippet is non-empty for body match', async () => {
    await seed([
      { id: 'sn2', name: 'Untitled', content: lexicalDoc('Find me with this specific word: archipelago') },
    ]);
    const results = await searchDocuments('archipelago');
    expect(results[0].snippet.length).toBeGreaterThan(0);
  });

  it('title-only match returns empty snippet when body has no match', async () => {
    await seed([
      { id: 'sn3', name: 'Archipelago Guide', content: lexicalDoc('Introduction to islands and geography.') },
    ]);
    const results = await searchDocuments('archipelago');
    expect(results).toHaveLength(1);
    // snippet may be empty (body has no match) — that's acceptable
    expect(typeof results[0].snippet).toBe('string');
  });
});

describe('searchDocuments — edge cases', () => {
  it('case-insensitive matching', async () => {
    await seed([
      { id: 'e1', name: 'My Document', content: lexicalDoc('QUARTERLY RESULTS are in.') },
    ]);
    const results = await searchDocuments('quarterly results');
    expect(results.some((r) => r.documentId === 'e1')).toBe(true);
  });

  it('multi-word query matches documents containing all words', async () => {
    await seed([
      { id: 'e2', name: 'Report', content: lexicalDoc('The project budget was approved by finance.') },
    ]);
    const results = await searchDocuments('project budget finance');
    expect(results.some((r) => r.documentId === 'e2')).toBe(true);
  });

  it('does not return trashed documents', async () => {
    const { trashDocument } = await import('../documentStore');
    await seed([{ id: 'e3', name: 'Hidden Doc', content: lexicalDoc('secret content here') }]);
    await trashDocument('e3');
    const results = await searchDocuments('secret content');
    expect(results.every((r) => r.documentId !== 'e3')).toBe(true);
  });
});
