/**
 * navigationSidebar.helpers.test.ts — P2-A targeted tests
 *
 * These tests cover the behaviours that changed in the NavigationSidebarPlugin
 * refactor without requiring a Lexical or React mount context:
 *
 *   1–3. Filter logic: no query / matching / non-matching
 *   4–5. Empty-state branching: outline.length === 0 vs filteredOutline.length === 0
 *   6–8. h4/h5/h6 indent pixels — the old plugin mapped all h3+ to depth 2;
 *         these verify the corrected headingIndentDepth() values used for
 *         paddingLeft calculation.
 */
import { describe, it, expect } from 'vitest';
import { type OutlineEntry, headingIndentDepth } from '../../../../lib/outlineStore';

// ---------------------------------------------------------------------------
// Helpers (inline the filter expression from the plugin for pure testing)
// ---------------------------------------------------------------------------

function applyFilter(outline: OutlineEntry[], query: string): OutlineEntry[] {
  const trimmed = query.trim();
  return trimmed
    ? outline.filter(h => h.text.toLowerCase().includes(trimmed.toLowerCase()))
    : outline;
}

function pickEmptyState(
  outline: OutlineEntry[],
  filtered: OutlineEntry[],
): 'none' | 'no-headings' | 'no-match' {
  if (outline.length === 0) return 'no-headings';
  if (filtered.length === 0) return 'no-match';
  return 'none';
}

function makeEntry(tag: OutlineEntry['tag'], text: string): OutlineEntry {
  const level = parseInt(tag.slice(1), 10);
  return { key: `key-${tag}`, text, tag, level };
}

// ---------------------------------------------------------------------------
// 1–3. Filter logic
// ---------------------------------------------------------------------------

describe('NavigationSidebarPlugin — filter logic', () => {
  const outline: OutlineEntry[] = [
    makeEntry('h1', 'Introduction'),
    makeEntry('h2', 'Background'),
    makeEntry('h3', 'Related Work'),
  ];

  it('empty query returns all headings (no filter applied)', () => {
    expect(applyFilter(outline, '')).toHaveLength(3);
    expect(applyFilter(outline, '   ')).toHaveLength(3); // whitespace-only also skipped
  });

  it('query matches a case-insensitive subset of headings', () => {
    const result = applyFilter(outline, 'INTRO');
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('Introduction');
  });

  it('query that matches nothing returns an empty array', () => {
    expect(applyFilter(outline, 'zzz-not-found')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 4–5. Empty-state branching
// ---------------------------------------------------------------------------

describe('NavigationSidebarPlugin — empty state selection', () => {
  it('outline.length === 0 → "no-headings" (instructional empty state)', () => {
    expect(pickEmptyState([], [])).toBe('no-headings');
  });

  it('outline has headings but none match filter → "no-match" state', () => {
    const outline = [makeEntry('h1', 'Intro')];
    const filtered = applyFilter(outline, 'zzz');
    expect(pickEmptyState(outline, filtered)).toBe('no-match');
  });
});

// ---------------------------------------------------------------------------
// 6–8. h4/h5/h6 pixel indent — corrected from old plugin (all mapped to depth 2)
// ---------------------------------------------------------------------------

describe('NavigationSidebarPlugin — h4/h5/h6 indent pixel values', () => {
  // paddingLeft formula: 16 + headingIndentDepth(level) * 12

  it('h4 (level 4) uses depth 3 → 52px paddingLeft', () => {
    const px = 16 + headingIndentDepth(4) * 12;
    expect(headingIndentDepth(4)).toBe(3);
    expect(px).toBe(52);
  });

  it('h5 (level 5) uses depth 4 → 64px paddingLeft', () => {
    const px = 16 + headingIndentDepth(5) * 12;
    expect(headingIndentDepth(5)).toBe(4);
    expect(px).toBe(64);
  });

  it('h6 (level 6) uses depth 5 → 76px paddingLeft', () => {
    const px = 16 + headingIndentDepth(6) * 12;
    expect(headingIndentDepth(6)).toBe(5);
    expect(px).toBe(76);
  });
});
