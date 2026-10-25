import { describe, it, expect } from 'vitest';
import { analyzeReadability, countSyllables } from '../readability';

describe('readability', () => {
  it('estimates syllables for common words', () => {
    const cases: Array<[string, number]> = [
      ['cat', 1], ['table', 2], ['readability', 5], ['make', 1], ['created', 3], ['beautiful', 3], ['the', 1], ['every', 2],
    ];
    for (const [word, expected] of cases) {
      expect(Math.abs(countSyllables(word) - expected)).toBeLessThanOrEqual(1);
    }
    expect(countSyllables('cat')).toBe(1);
    expect(countSyllables('table')).toBe(2);
  });

  it('counts words, sentences and paragraphs', () => {
    const stats = analyzeReadability('The cat sat. The dog ran!\n\nIs it time? Yes');
    expect(stats).toMatchObject({ words: 10, sentences: 4, paragraphs: 2 });
  });

  it('does not score very short text', () => {
    const stats = analyzeReadability('Too short to score.');
    expect(stats.readingEase).toBeNull();
    expect(stats.gradeLevel).toBeNull();
    expect(stats.readingMinutes).toBe(1);
  });

  it('scores simple text as easier than dense text', () => {
    const simple = 'The cat sat on the mat. It was a warm day. The sun was out. We had tea in the yard. Then we went home. It was fun. We ate cake and read a book. Then we slept.';
    const dense = 'Notwithstanding considerable institutional reluctance, the organisation subsequently implemented comprehensive administrative restructuring, fundamentally reconfiguring interdepartmental communication methodologies and substantially reorganising operational responsibilities throughout international subsidiaries.';
    const a = analyzeReadability(simple);
    const b = analyzeReadability(dense.repeat(1));
    expect(a.readingEase).toBeGreaterThan(80);
    expect(a.band).toMatch(/easy/i);
    expect(analyzeReadability(`${dense} ${dense}`).readingEase ?? 100).toBeLessThan(20);
    expect(b.longSentences).toBe(0); // 24 words: just under the 25-word threshold
    expect(analyzeReadability(`${'word '.repeat(25)}end.`).longSentences).toBe(1);
  });

  it('handles empty text', () => {
    expect(analyzeReadability('')).toMatchObject({ words: 0, sentences: 0, readingMinutes: 0, readingEase: null });
  });
});
