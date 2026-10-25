import { describe, it, expect } from 'vitest';
import { applyEditsToText, rebaseRanges, selectNonOverlapping } from '../suggestionOffsets';

describe('suggestionOffsets', () => {
  it('shifts later ranges and drops overlapping ones after an edit', () => {
    const ranges = [
      { id: 'before', offset: 0, length: 3 },
      { id: 'overlap', offset: 6, length: 4 },
      { id: 'after', offset: 12, length: 2 },
    ];
    const rebased = rebaseRanges(ranges, { offset: 5, length: 3 }, 6);
    expect(rebased).toEqual([
      { id: 'before', offset: 0, length: 3 },
      { id: 'after', offset: 15, length: 2 },
    ]);
  });

  it('picks a conflict-free set for accept-all', () => {
    const chosen = selectNonOverlapping([
      { offset: 10, length: 5 },
      { offset: 0, length: 4 },
      { offset: 12, length: 2 },
      { offset: 4, length: 2 },
    ]);
    expect(chosen.map((r) => r.offset)).toEqual([0, 4, 10]);
  });

  it('applying edits one at a time with rebasing equals applying them all at once', () => {
    const text = 'Teh quick brwon fox jumpd over teh dog.';
    const edits = [
      { offset: 0, length: 3, original: 'Teh', replacement: 'The' },
      { offset: 10, length: 5, original: 'brwon', replacement: 'brown' },
      { offset: 20, length: 5, original: 'jumpd', replacement: 'jumped' },
      { offset: 31, length: 3, original: 'teh', replacement: 'the' },
    ];
    const batch = applyEditsToText(text, edits);
    expect(batch).toEqual({ text: 'The quick brown fox jumped over the dog.', applied: 4 });

    // One by one, in an arbitrary order, rebasing the rest each time.
    let current = text;
    let pending = [edits[2], edits[0], edits[3], edits[1]];
    while (pending.length) {
      const [edit, ...rest] = pending;
      expect(current.slice(edit.offset, edit.offset + edit.length)).toBe(edit.original);
      current = current.slice(0, edit.offset) + edit.replacement + current.slice(edit.offset + edit.length);
      pending = rebaseRanges(rest, edit, edit.replacement.length);
    }
    expect(current).toBe(batch.text);
  });

  it('skips an edit whose text no longer matches', () => {
    expect(applyEditsToText('Hello world', [{ offset: 0, length: 5, original: 'Howdy', replacement: 'Hi' }])).toEqual({
      text: 'Hello world',
      applied: 0,
    });
  });
});
