import { describe, it, expect } from 'vitest';
import { computeLiveIssues, ignoreKey, issueAtOffset, MAX_LIVE_TEXT_CHARS } from '../liveProofread';

describe('liveProofread', () => {
  const text = 'My favorite color is gray. We will utilize it.';

  it('finds offline issues for the document language', () => {
    const issues = computeLiveIssues(text, 'en-GB', [], new Set());
    expect(issues.map((i) => i.original)).toEqual(expect.arrayContaining(['favorite', 'color', 'gray', 'utilize']));
    expect(issues.every((i) => i.source === 'local')).toBe(true);
  });

  it('respects the personal dictionary and ignored issues', () => {
    const color = computeLiveIssues(text, 'en-GB', [], new Set()).find((i) => i.original === 'color')!;
    const issues = computeLiveIssues(text, 'en-GB', ['gray'], new Set([ignoreKey(color)]));
    expect(issues.map((i) => i.original)).not.toContain('gray');
    expect(issues.map((i) => i.original)).not.toContain('color');
    expect(issues.map((i) => i.original)).toContain('favorite');
  });

  it('skips empty and very large documents', () => {
    expect(computeLiveIssues('   ', 'en-US', [], new Set())).toEqual([]);
    expect(computeLiveIssues('utilize '.repeat(MAX_LIVE_TEXT_CHARS / 8 + 1), 'en-US', [], new Set())).toEqual([]);
  });

  it('finds the issue under the caret, including just after the word', () => {
    const issues = [
      { offset: 3, length: 8 },
      { offset: 20, length: 4 },
      { offset: 20, length: 10 },
    ];
    expect(issueAtOffset(issues, 5)).toEqual(issues[0]);
    expect(issueAtOffset(issues, 11)).toEqual(issues[0]); // caret right after the word
    expect(issueAtOffset(issues, 15)).toBeNull();
    expect(issueAtOffset(issues, 22)).toEqual(issues[1]); // most specific of the overlapping two
  });
});
