import { describe, it, expect } from 'vitest';
import { diffStats, diffWords, type DiffPart } from '../wordDiff';

const side = (parts: DiffPart[], skip: DiffPart['type']) => parts.filter((p) => p.type !== skip).map((p) => p.text).join('');

describe('diffWords', () => {
  it('marks changed words and keeps the rest', () => {
    const parts = diffWords('The very confidential plan is simple.', 'The confidential plan is really simple.');
    expect(parts).toEqual([
      { type: 'same', text: 'The ' },
      { type: 'delete', text: 'very ' },
      { type: 'same', text: 'confidential plan is' },
      { type: 'insert', text: ' really' },
      { type: 'same', text: ' simple.' },
    ]);
    expect(diffStats(parts)).toEqual({ inserted: 1, deleted: 1 });
  });

  it('always reconstructs both texts', () => {
    const cases: Array<[string, string]> = [
      ['', 'New text.'],
      ['Old text.', ''],
      ['Same.', 'Same.'],
      ['We utilize tools, don’t we?', 'We use tools — don’t we?'],
      ['One.\n\nTwo.', 'Two.\n\nOne.'],
    ];
    for (const [before, after] of cases) {
      const parts = diffWords(before, after);
      expect(side(parts, 'insert')).toBe(before);
      expect(side(parts, 'delete')).toBe(after);
    }
  });

  it('falls back to a whole replacement for very long, very different texts', () => {
    const before = Array.from({ length: 3000 }, (_, i) => `a${i}`).join(' ');
    const after = Array.from({ length: 3000 }, (_, i) => `b${i}`).join(' ');
    const parts = diffWords(before, after);
    expect(parts.map((p) => p.type)).toEqual(['delete', 'insert']);
    expect(side(parts, 'insert')).toBe(before);
  });
});
