import { describe, it, expect } from 'vitest';
import {
  buildParagraphStyle,
  parseParagraphStyle,
  applyParagraphStyleToDOM,
  clearParagraphStyleOnDOM,
  isParagraphFormatEmpty,
  DEFAULT_PARAGRAPH_FORMAT,
  type ParagraphFormat,
} from '../paragraphFormat';

// ── parseParagraphStyle ───────────────────────────────────────────────────────

describe('parseParagraphStyle', () => {
  it('returns zeroes for an empty string', () => {
    expect(parseParagraphStyle('')).toEqual(DEFAULT_PARAGRAPH_FORMAT);
  });

  it('parses all five properties', () => {
    const css = 'margin-top: 12px; margin-bottom: 6px; margin-left: 36px; margin-right: 18px; text-indent: 18px';
    expect(parseParagraphStyle(css)).toEqual<ParagraphFormat>({
      spaceBefore: 12,
      spaceAfter:  6,
      indentLeft:  36,
      indentRight: 18,
      firstLine:   18,
    });
  });

  it('parses a hanging indent (negative text-indent)', () => {
    const css = 'margin-left: 36px; text-indent: -36px';
    const fmt = parseParagraphStyle(css);
    expect(fmt.indentLeft).toBe(36);
    expect(fmt.firstLine).toBe(-36);
  });

  it('ignores unknown CSS properties', () => {
    const css = 'color: red; margin-top: 8px; font-size: 14px';
    const fmt = parseParagraphStyle(css);
    expect(fmt.spaceBefore).toBe(8);
    expect(fmt.indentLeft).toBe(0); // untouched
  });

  it('is case-insensitive for property names', () => {
    const css = 'MARGIN-TOP: 10px';
    expect(parseParagraphStyle(css).spaceBefore).toBe(10);
  });

  it('handles decimal pixel values', () => {
    const css = 'margin-top: 11.5px';
    expect(parseParagraphStyle(css).spaceBefore).toBe(11.5);
  });

  it('returns 0 for malformed pixel values', () => {
    const css = 'margin-top: auto; margin-bottom: inherit';
    const fmt = parseParagraphStyle(css);
    expect(fmt.spaceBefore).toBe(0);
    expect(fmt.spaceAfter).toBe(0);
  });
});

// ── buildParagraphStyle ───────────────────────────────────────────────────────

describe('buildParagraphStyle', () => {
  it('returns empty string when format is empty and no existing style', () => {
    expect(buildParagraphStyle({})).toBe('');
  });

  it('sets margin-top for spaceBefore', () => {
    const css = buildParagraphStyle({ spaceBefore: 12 });
    expect(css).toContain('margin-top: 12px');
  });

  it('sets margin-bottom for spaceAfter', () => {
    const css = buildParagraphStyle({ spaceAfter: 6 });
    expect(css).toContain('margin-bottom: 6px');
  });

  it('sets text-indent for firstLine indent', () => {
    const css = buildParagraphStyle({ firstLine: 36 });
    expect(css).toContain('text-indent: 36px');
  });

  it('sets negative text-indent for hanging indent', () => {
    const css = buildParagraphStyle({ firstLine: -36, indentLeft: 36 });
    expect(css).toContain('text-indent: -36px');
    expect(css).toContain('margin-left: 36px');
  });

  it('removes a property when its value is 0', () => {
    const existing = 'margin-top: 12px; margin-bottom: 6px';
    const css = buildParagraphStyle({ spaceBefore: 0 }, existing);
    expect(css).not.toContain('margin-top');
    expect(css).toContain('margin-bottom: 6px');
  });

  it('preserves unrelated CSS properties in existing style', () => {
    const existing = 'color: red; margin-top: 8px';
    const css = buildParagraphStyle({ spaceAfter: 4 }, existing);
    expect(css).toContain('color: red');
    expect(css).toContain('margin-top: 8px');
    expect(css).toContain('margin-bottom: 4px');
  });
});

// ── round-trip ────────────────────────────────────────────────────────────────

describe('round-trip', () => {
  it('parseParagraphStyle(buildParagraphStyle(fmt)) === fmt for non-zero values', () => {
    const original: ParagraphFormat = {
      spaceBefore: 12,
      spaceAfter:  6,
      indentLeft:  36,
      indentRight: 0,
      firstLine:   -36,
    };
    const css = buildParagraphStyle(original);
    expect(parseParagraphStyle(css)).toEqual(original);
  });

  it('round-trips the default (all zeros)', () => {
    const css = buildParagraphStyle(DEFAULT_PARAGRAPH_FORMAT);
    expect(parseParagraphStyle(css)).toEqual(DEFAULT_PARAGRAPH_FORMAT);
  });
});

// ── applyParagraphStyleToDOM ──────────────────────────────────────────────────

describe('applyParagraphStyleToDOM', () => {
  function makeEl(): HTMLElement {
    return document.createElement('p');
  }

  it('sets marginTop from spaceBefore', () => {
    const el = makeEl();
    applyParagraphStyleToDOM(el, 'margin-top: 16px');
    expect(el.style.marginTop).toBe('16px');
  });

  it('clears marginTop when spaceBefore is 0', () => {
    const el = makeEl();
    el.style.marginTop = '16px';
    applyParagraphStyleToDOM(el, '');
    expect(el.style.marginTop).toBe('');
  });

  it('does not touch textAlign (Lexical-managed)', () => {
    const el = makeEl();
    el.style.textAlign = 'center'; // set by Lexical reconciler
    applyParagraphStyleToDOM(el, 'margin-top: 8px');
    expect(el.style.textAlign).toBe('center'); // preserved
  });

  it('sets all five paragraph properties at once', () => {
    const el = makeEl();
    applyParagraphStyleToDOM(
      el,
      'margin-top: 8px; margin-bottom: 4px; margin-left: 36px; margin-right: 18px; text-indent: -36px',
    );
    expect(el.style.marginTop).toBe('8px');
    expect(el.style.marginBottom).toBe('4px');
    expect(el.style.marginLeft).toBe('36px');
    expect(el.style.marginRight).toBe('18px');
    expect(el.style.textIndent).toBe('-36px');
  });
});

// ── clearParagraphStyleOnDOM ──────────────────────────────────────────────────

describe('clearParagraphStyleOnDOM', () => {
  it('clears all five paragraph-owned properties', () => {
    const el = document.createElement('p');
    el.style.marginTop    = '8px';
    el.style.marginBottom = '4px';
    el.style.marginLeft   = '36px';
    el.style.marginRight  = '18px';
    el.style.textIndent   = '-36px';
    clearParagraphStyleOnDOM(el);
    expect(el.style.marginTop).toBe('');
    expect(el.style.marginBottom).toBe('');
    expect(el.style.marginLeft).toBe('');
    expect(el.style.marginRight).toBe('');
    expect(el.style.textIndent).toBe('');
  });

  it('does not clear unrelated properties', () => {
    const el = document.createElement('p');
    el.style.color = 'red';
    el.style.textAlign = 'center';
    clearParagraphStyleOnDOM(el);
    expect(el.style.color).toBe('red');
    expect(el.style.textAlign).toBe('center');
  });
});

// ── isParagraphFormatEmpty ────────────────────────────────────────────────────

describe('isParagraphFormatEmpty', () => {
  it('returns true for default format', () => {
    expect(isParagraphFormatEmpty(DEFAULT_PARAGRAPH_FORMAT)).toBe(true);
  });

  it('returns false when any value is non-zero', () => {
    expect(isParagraphFormatEmpty({ ...DEFAULT_PARAGRAPH_FORMAT, spaceBefore: 1 })).toBe(false);
    expect(isParagraphFormatEmpty({ ...DEFAULT_PARAGRAPH_FORMAT, firstLine: -36 })).toBe(false);
  });
});
