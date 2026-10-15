/**
 * Converts a Lexical editor state (editorState.toJSON()) into a pdfmake
 * document definition: selectable text, real page breaks, page size and
 * margins from the document's page setup, and a header/footer with page
 * numbers on every page.
 *
 * Pure (no pdfmake runtime import) so it can be unit-tested; exportPdf.ts
 * renders the definition.
 */
import type { Content, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces';
import type { DocumentBranding } from './branding';
import {
  fillHeaderFooterText,
  normalizePageSetup,
  pagePoints,
  showsHeaderFooter,
  type PageSetup,
} from './pageSetup';

interface SerializedNode {
  type: string;
  children?: SerializedNode[];
  text?: string;
  format?: number | string;
  style?: string;
  tag?: string;
  listType?: string;
  checked?: boolean;
  indent?: number;
  url?: string;
  src?: string;
  altText?: string;
  width?: number | 'inherit';
  height?: number | 'inherit';
  alignment?: string;
  headerState?: number;
  colSpan?: number;
  rowSpan?: number;
  backgroundColor?: string | null;
}

type Inline = Exclude<Content, string> & { text: string | Inline[] };

export interface PdfOptions {
  title: string;
  pageSetup?: PageSetup | null;
  branding?: DocumentBranding | null;
  /**
   * Image sources resolved to PNG/JPEG data URLs (pdfmake supports only those).
   * Missing or null entries are replaced by their alt text.
   */
  images?: Record<string, string | null>;
}

const F_BOLD = 1;
const F_ITALIC = 2;
const F_STRIKE = 4;
const F_UNDERLINE = 8;
const F_CODE = 16;
const F_SUBSCRIPT = 32;
const F_SUPERSCRIPT = 64;
const F_HIGHLIGHT = 128;

const BASE_FONT_SIZE = 12; // editor body text is 16px = 12pt
const HEADING_SIZES: Record<string, number> = { h1: 24, h2: 20, h3: 16, h4: 14, h5: 12, h6: 11 };
const PX_TO_PT = 0.75;

/** Picks font size, colors and font family out of a Lexical inline style string. */
function parseInlineStyle(style: string | undefined): Partial<Inline> {
  if (!style) return {};
  const result: Record<string, unknown> = {};
  for (const declaration of style.split(';')) {
    const [rawProp, ...rest] = declaration.split(':');
    const prop = rawProp?.trim().toLowerCase();
    const value = rest.join(':').trim();
    if (!prop || !value) continue;
    if (prop === 'font-size') {
      const n = parseFloat(value);
      if (!Number.isNaN(n)) result.fontSize = value.endsWith('pt') ? n : n * PX_TO_PT;
    } else if (prop === 'color') {
      result.color = value;
    } else if (prop === 'background-color') {
      result.background = value;
    }
  }
  return result as Partial<Inline>;
}

function alignment(format: SerializedNode['format']): 'left' | 'center' | 'right' | 'justify' | undefined {
  if (format === 'center' || format === 'right' || format === 'justify') return format;
  if (format === 'end') return 'right';
  return undefined;
}

function inlineContent(nodes: SerializedNode[] | undefined, link?: string): Inline[] {
  const out: Inline[] = [];
  for (const node of nodes ?? []) {
    switch (node.type) {
      case 'text': {
        const fmt = typeof node.format === 'number' ? node.format : 0;
        const decoration: Array<'underline' | 'lineThrough'> = [];
        if (fmt & F_UNDERLINE || link) decoration.push('underline');
        if (fmt & F_STRIKE) decoration.push('lineThrough');
        const run: Inline = {
          text: node.text ?? '',
          ...(fmt & F_BOLD ? { bold: true } : {}),
          ...(fmt & F_ITALIC ? { italics: true } : {}),
          ...(decoration.length ? { decoration: decoration.length === 1 ? decoration[0] : decoration } : {}),
          ...(fmt & F_CODE ? { background: '#f1f1f1', color: '#c7254e' } : {}),
          ...(fmt & F_HIGHLIGHT ? { background: '#fff3a3' } : {}),
          ...(fmt & F_SUBSCRIPT ? { sub: true } : {}),
          ...(fmt & F_SUPERSCRIPT ? { sup: true } : {}),
          ...(link ? { link, color: '#1a56db' } : {}),
          ...parseInlineStyle(node.style),
        } as Inline;
        out.push(run);
        break;
      }
      case 'linebreak':
        out.push({ text: '\n' } as Inline);
        break;
      case 'tab':
        out.push({ text: '    ' } as Inline);
        break;
      case 'link':
      case 'autolink':
        out.push(...inlineContent(node.children, node.url ?? link));
        break;
      case 'tracked-delete':
        // Deleted text pending review is not part of the document's current text.
        break;
      default:
        if (node.children) out.push(...inlineContent(node.children, link));
        else if (node.text) out.push({ text: node.text } as Inline);
    }
  }
  return out;
}

/** pdfmake renders an empty text array as a zero-height line; keep blank paragraphs visible. */
function paragraphText(inlines: Inline[]): Inline[] | string {
  return inlines.length && inlines.some((i) => i.text !== '') ? inlines : ' ';
}

function indentMargin(node: SerializedNode, bottom: number): [number, number, number, number] {
  return [(node.indent ?? 0) * 24, 0, 0, bottom];
}

class Converter {
  private readonly contentWidth: number;
  private readonly images: Record<string, string | null>;

  constructor(contentWidth: number, images: Record<string, string | null>) {
    this.contentWidth = contentWidth;
    this.images = images;
  }

  blocks(nodes: SerializedNode[] | undefined): Content[] {
    const out: Content[] = [];
    for (const node of nodes ?? []) {
      if (node.type === 'page-break') {
        out.push({ text: '', pageBreak: 'after' });
        continue;
      }
      const block = this.block(node);
      if (block) out.push(block);
    }
    return out;
  }

  private block(node: SerializedNode): Content | null {
    switch (node.type) {
      case 'paragraph':
        return {
          text: paragraphText(inlineContent(node.children)),
          alignment: alignment(node.format),
          margin: indentMargin(node, 6),
        } as Content;
      case 'heading': {
        const size = HEADING_SIZES[node.tag ?? 'h1'] ?? 16;
        return {
          text: paragraphText(inlineContent(node.children)),
          fontSize: size,
          bold: true,
          alignment: alignment(node.format),
          margin: [(node.indent ?? 0) * 24, size * 0.5, 0, size * 0.3],
          headlineLevel: Number((node.tag ?? 'h1').slice(1)) || 1,
        } as Content;
      }
      case 'quote':
        return {
          text: paragraphText(inlineContent(node.children)),
          italics: true,
          color: '#555555',
          margin: [24, 0, 24, 8],
        } as Content;
      case 'code':
        return {
          table: {
            widths: ['*'],
            body: [[{ text: inlineContent(node.children).map((i) => i.text).join(''), fontSize: 10, preserveLeadingSpaces: true }]],
          },
          layout: 'noBorders',
          fillColor: '#f4f4f4',
          margin: [0, 0, 0, 8],
        } as Content;
      case 'list':
        return { ...(this.list(node) as object), margin: [0, 0, 0, 6] } as Content;
      case 'table':
        return this.table(node);
      case 'image':
        return this.image(node);
      case 'horizontalrule':
        return {
          canvas: [{ type: 'line', x1: 0, y1: 0, x2: this.contentWidth, y2: 0, lineWidth: 0.5, lineColor: '#bbbbbb' }],
          margin: [0, 6, 0, 10],
        } as Content;
      default: {
        const children = node.children ?? [];
        if (!children.length) return null;
        // Unknown element: render block children as a stack, inline children as text.
        const isInline = children.every((c) => c.type === 'text' || c.type === 'linebreak' || c.type === 'link');
        return isInline
          ? ({ text: paragraphText(inlineContent(children)), margin: [0, 0, 0, 6] } as Content)
          : ({ stack: this.blocks(children) } as Content);
      }
    }
  }

  private list(node: SerializedNode): Content {
    const isCheck = node.listType === 'check';
    const items: Content[] = [];
    for (const item of node.children ?? []) {
      if (item.type !== 'listitem') continue;
      const nested = (item.children ?? []).filter((c) => c.type === 'list');
      const inline = (item.children ?? []).filter((c) => c.type !== 'list');
      if (nested.length && !inline.length) {
        // Lexical nests a list in its own list item; don't give that item a marker.
        for (const list of nested) items.push({ ...(this.list(list) as object), listType: 'none' } as unknown as Content);
        continue;
      }
      const prefix = isCheck ? (item.checked ? '[x] ' : '[ ] ') : '';
      const text: Content = { text: [{ text: prefix } as Inline, ...inlineContent(inline)] } as Content;
      items.push(nested.length ? { stack: [text, ...nested.map((l) => this.list(l))] } : text);
    }
    if (node.listType === 'number') return { ol: items } as Content;
    return { ul: items, ...(isCheck ? { type: 'none' } : {}) } as Content;
  }

  private table(node: SerializedNode): Content {
    const rows = (node.children ?? []).filter((r) => r.type === 'tablerow');
    // Lay cells out on a grid so row/column spans get the placeholder cells pdfmake requires.
    const grid: TableCell[][] = [];
    let columns = 0;
    let headerRows = 0;
    rows.forEach((row, r) => {
      grid[r] ??= [];
      let c = 0;
      let isHeaderRow = true;
      for (const cell of (row.children ?? []).filter((x) => x.type === 'tablecell')) {
        while (grid[r][c] !== undefined) c++;
        const colSpan = Math.max(1, cell.colSpan ?? 1);
        const rowSpan = Math.max(1, cell.rowSpan ?? 1);
        const isHeader = (cell.headerState ?? 0) > 0;
        // Header row = every cell has the ROW header bit (1).
        if (!((cell.headerState ?? 0) & 1)) isHeaderRow = false;
        const stack = this.blocks(cell.children);
        grid[r][c] = {
          stack: stack.length ? stack : [{ text: ' ' }],
          ...(colSpan > 1 ? { colSpan } : {}),
          ...(rowSpan > 1 ? { rowSpan } : {}),
          ...(isHeader ? { bold: true, fillColor: '#f2f2f2' } : {}),
          ...(cell.backgroundColor ? { fillColor: cell.backgroundColor } : {}),
        } as TableCell;
        for (let dr = 0; dr < rowSpan; dr++) {
          grid[r + dr] ??= [];
          for (let dc = 0; dc < colSpan; dc++) {
            if (dr || dc) grid[r + dr][c + dc] = {} as TableCell;
          }
        }
        c += colSpan;
      }
      columns = Math.max(columns, grid[r].length);
      if (isHeaderRow && headerRows === r) headerRows = r + 1;
    });
    const body = grid.slice(0, rows.length).map((row) =>
      Array.from({ length: columns }, (_, i) => row[i] ?? ({ text: '' } as TableCell)),
    );
    if (!body.length || !columns) return { text: '' };
    return {
      table: { headerRows: Math.min(headerRows, body.length - 1), widths: Array(columns).fill('*'), body },
      layout: {
        hLineWidth: () => 0.5,
        vLineWidth: () => 0.5,
        hLineColor: () => '#bfbfbf',
        vLineColor: () => '#bfbfbf',
        paddingLeft: () => 5,
        paddingRight: () => 5,
        paddingTop: () => 4,
        paddingBottom: () => 2,
      },
      margin: [0, 2, 0, 10],
    } as Content;
  }

  private image(node: SerializedNode): Content {
    const src = node.src ? this.images[node.src] ?? (/^data:image\/(png|jpe?g);/i.test(node.src) ? node.src : null) : null;
    if (!src) {
      return { text: `[Image: ${node.altText || 'embedded image'}]`, italics: true, color: '#777777', margin: [0, 0, 0, 6] };
    }
    const widthPt = typeof node.width === 'number' ? node.width * PX_TO_PT : this.contentWidth;
    const align = node.alignment === 'center' || node.alignment === 'right' ? node.alignment : 'left';
    return { image: src, width: Math.min(widthPt, this.contentWidth), alignment: align, margin: [0, 4, 0, 8] } as Content;
  }
}

function headerFooterLine(left: string, right: string, center: string, margin: number, top: boolean): Content {
  return {
    columns: [
      { text: left, alignment: 'left', width: '*' },
      { text: center, alignment: 'center', width: '*' },
      { text: right, alignment: 'right', width: '*' },
    ],
    fontSize: 9,
    color: '#666666',
    margin: top ? [margin, margin / 2 - 6, margin, 0] : [margin, 0, margin, 0],
  } as Content;
}

export function lexicalToPdfDefinition(editorStateJson: unknown, options: PdfOptions): TDocumentDefinitions {
  const setup = normalizePageSetup(options.pageSetup);
  const page = pagePoints(setup);
  const contentWidth = page.width - page.margin * 2;
  const root = (editorStateJson as { root?: SerializedNode }).root;
  const converter = new Converter(contentWidth, options.images ?? {});
  const content = converter.blocks(root?.children);
  const branding = options.branding;
  const title = options.title;

  const pageNumberText = (current: number, total: number) => `Page ${current} of ${total}`;

  const header = (current: number, total: number): Content => {
    if (!showsHeaderFooter(setup, current)) return '';
    const left = setup.headerText ? fillHeaderFooterText(setup.headerText, { page: current, pages: total, title }) : '';
    const brand = [branding?.companyName].filter(Boolean).join('');
    const right = setup.pageNumbers === 'header-right' ? pageNumberText(current, total) : '';
    if (!left && !right && !brand) return '';
    const line = headerFooterLine(left || brand, right, left && brand ? brand : '', page.margin, true);
    return line;
  };

  const footer = (current: number, total: number): Content => {
    if (!showsHeaderFooter(setup, current)) return '';
    const left = [
      setup.footerText ? fillHeaderFooterText(setup.footerText, { page: current, pages: total, title }) : '',
      branding?.headerText?.trim() ?? '',
    ].filter(Boolean).join(' · ');
    const numbers = pageNumberText(current, total);
    const center = setup.pageNumbers === 'footer-center' ? numbers : '';
    const right = setup.pageNumbers === 'footer-right' ? numbers : '';
    if (!left && !center && !right) return '';
    return headerFooterLine(left, right, center, page.margin, false);
  };

  return {
    info: { title },
    pageSize: { width: page.width, height: page.height },
    pageMargins: [page.margin, page.margin, page.margin, page.margin],
    header,
    footer,
    content: content.length ? content : [{ text: '' }],
    defaultStyle: { font: 'Roboto', fontSize: BASE_FONT_SIZE, lineHeight: 1.25 },
  };
}

/** Every image source in the document, so exportPdf can resolve them before rendering. */
export function collectImageSources(editorStateJson: unknown): string[] {
  const sources = new Set<string>();
  const walk = (node: SerializedNode | undefined) => {
    if (!node) return;
    if (node.type === 'image' && node.src) sources.add(node.src);
    node.children?.forEach(walk);
  };
  walk((editorStateJson as { root?: SerializedNode }).root);
  return [...sources];
}
