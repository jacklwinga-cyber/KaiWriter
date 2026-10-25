/**
 * Per-document page setup: paper size, orientation, margins, header, footer
 * and page numbers. Stored on the document (and synced) so a document looks
 * and exports the same on every device.
 */

export type PageSizeName = 'Letter' | 'A4' | 'Legal';
export type Orientation = 'Portrait' | 'Landscape';
export type MarginsName = 'Normal' | 'Narrow' | 'Wide';
export type PageNumberPosition = 'none' | 'footer-center' | 'footer-right' | 'header-right';

export interface PageSetup {
  pageSize: PageSizeName;
  orientation: Orientation;
  margins: MarginsName;
  /** Header text; supports {page}, {pages}, {title} and {date}. */
  headerText?: string;
  /** Footer text; supports the same tokens as headerText. */
  footerText?: string;
  pageNumbers: PageNumberPosition;
  /** Leave the header, footer and page number off the first page (e.g. a cover page). */
  differentFirstPage?: boolean;
}

export const DEFAULT_PAGE_SETUP: PageSetup = {
  pageSize: 'Letter',
  orientation: 'Portrait',
  margins: 'Normal',
  pageNumbers: 'none',
};

/** Paper sizes in inches (portrait). */
const PAPER_INCHES: Record<PageSizeName, { width: number; height: number }> = {
  Letter: { width: 8.5, height: 11 },
  A4: { width: 8.27, height: 11.69 },
  Legal: { width: 8.5, height: 14 },
};

const MARGIN_INCHES: Record<MarginsName, number> = {
  Narrow: 0.5,
  Normal: 1,
  Wide: 1.5,
};

export function normalizePageSetup(setup?: Partial<PageSetup> | null): PageSetup {
  const merged = { ...DEFAULT_PAGE_SETUP, ...(setup ?? {}) };
  if (!(merged.pageSize in PAPER_INCHES)) merged.pageSize = DEFAULT_PAGE_SETUP.pageSize;
  if (!(merged.margins in MARGIN_INCHES)) merged.margins = DEFAULT_PAGE_SETUP.margins;
  if (merged.orientation !== 'Landscape') merged.orientation = 'Portrait';
  return merged;
}

/** Page width, height and margin in inches, with orientation applied. */
export function pageInches(setup: PageSetup): { width: number; height: number; margin: number } {
  const paper = PAPER_INCHES[setup.pageSize] ?? PAPER_INCHES.Letter;
  const landscape = setup.orientation === 'Landscape';
  return {
    width: landscape ? paper.height : paper.width,
    height: landscape ? paper.width : paper.height,
    margin: MARGIN_INCHES[setup.margins] ?? 1,
  };
}

/** Same as pageInches, in CSS pixels (96 per inch). */
export function pagePixels(setup: PageSetup): { width: number; height: number; margin: number } {
  const { width, height, margin } = pageInches(setup);
  return { width: width * 96, height: height * 96, margin: margin * 96 };
}

/** Same as pageInches, in PDF points (72 per inch). */
export function pagePoints(setup: PageSetup): { width: number; height: number; margin: number } {
  const { width, height, margin } = pageInches(setup);
  return { width: width * 72, height: height * 72, margin: margin * 72 };
}

export interface HeaderFooterContext {
  page: number;
  pages: number;
  title: string;
  date?: Date;
}

/** Replace {page}, {pages}, {title} and {date} in header/footer text. */
export function fillHeaderFooterText(text: string, ctx: HeaderFooterContext): string {
  const date = (ctx.date ?? new Date()).toLocaleDateString();
  return text
    .replace(/\{page\}/gi, String(ctx.page))
    .replace(/\{pages\}/gi, String(ctx.pages))
    .replace(/\{title\}/gi, ctx.title)
    .replace(/\{date\}/gi, date);
}

/** Whether headers, footers and page numbers appear on this page. */
export function showsHeaderFooter(setup: PageSetup, page: number): boolean {
  return !(setup.differentFirstPage && page === 1);
}
