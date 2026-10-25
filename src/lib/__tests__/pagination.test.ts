import { describe, it, expect } from 'vitest';
import { computePageBreaks } from '../pagination';
import { fillHeaderFooterText, normalizePageSetup, pageInches, showsHeaderFooter } from '../pageSetup';

const block = (top: number, bottom: number, isPageBreak = false) => ({ top, bottom, isPageBreak });

describe('computePageBreaks', () => {
  it('has no breaks when everything fits on one page', () => {
    expect(computePageBreaks([block(0, 100), block(110, 300)], 500)).toEqual([]);
  });

  it('moves a block that does not fit to the next page', () => {
    expect(computePageBreaks([block(0, 400), block(410, 600)], 500)).toEqual([410]);
  });

  it('splits a block taller than a page at the page height', () => {
    expect(computePageBreaks([block(0, 1200)], 500)).toEqual([500, 1000]);
  });

  it('starts a new page after a manual page break', () => {
    expect(computePageBreaks([block(0, 50), block(60, 74, true), block(84, 150)], 500)).toEqual([74]);
  });
});

describe('pageSetup', () => {
  it('fills in defaults and rejects unknown values', () => {
    const setup = normalizePageSetup({ pageSize: 'Tabloid' as never, margins: 'Wide' });
    expect(setup).toMatchObject({ pageSize: 'Letter', margins: 'Wide', orientation: 'Portrait', pageNumbers: 'none' });
  });

  it('swaps width and height for landscape', () => {
    expect(pageInches(normalizePageSetup({ pageSize: 'A4', orientation: 'Landscape' }))).toEqual({
      width: 11.69,
      height: 8.27,
      margin: 1,
    });
  });

  it('replaces header/footer tokens', () => {
    expect(fillHeaderFooterText('{title} — page {page} of {pages}', { page: 2, pages: 5, title: 'Plan' })).toBe(
      'Plan — page 2 of 5',
    );
  });

  it('hides the header and footer on page 1 with a different first page', () => {
    const setup = normalizePageSetup({ differentFirstPage: true });
    expect(showsHeaderFooter(setup, 1)).toBe(false);
    expect(showsHeaderFooter(setup, 2)).toBe(true);
  });
});
