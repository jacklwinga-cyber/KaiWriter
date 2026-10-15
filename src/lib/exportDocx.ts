import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  LevelFormat,
  Header,
  Footer,
  ImageRun,
  PageBreak,
  PageNumber,
  PageOrientation,
  InsertedTextRun,
  DeletedTextRun,
  type ParagraphChild,
} from 'docx';
import type { DocumentBranding } from './branding';
import { hasBranding } from './branding';
import { normalizePageSetup, pageInches, type PageSetup } from './pageSetup';

/** Lexical text format bit flags */
const F_BOLD = 1;
const F_ITALIC = 2;
const F_STRIKE = 4;
const F_UNDERLINE = 8;

interface SerializedNode {
  type: string;
  author?: string;
  date?: number;
  children?: SerializedNode[];
  text?: string;
  format?: number | string;
  tag?: string;
  listType?: string;
  direction?: string | null;
  indent?: number;
  src?: string;
  altText?: string;
  headerState?: number;
}

function alignmentFromFormat(format: string | number | undefined): (typeof AlignmentType)[keyof typeof AlignmentType] | undefined {
  if (format === 'center') return AlignmentType.CENTER;
  if (format === 'right' || format === 'end') return AlignmentType.RIGHT;
  if (format === 'justify') return AlignmentType.JUSTIFIED;
  return undefined;
}

let revisionId = 0;

function runOptions(child: SerializedNode) {
  const fmt = typeof child.format === 'number' ? child.format : 0;
  return {
    text: child.text ?? '',
    bold: Boolean(fmt & F_BOLD),
    italics: Boolean(fmt & F_ITALIC),
    strike: Boolean(fmt & F_STRIKE),
    underline: fmt & F_UNDERLINE ? {} : undefined,
  };
}

/** Text runs for a block's inline children; tracked changes become Word revisions. */
function textRunsFromChildren(
  children: SerializedNode[] | undefined,
  revision?: { kind: 'insert' | 'delete'; author: string; date: string },
): ParagraphChild[] {
  if (!children?.length) return [new TextRun('')];

  const runs: ParagraphChild[] = [];
  for (const child of children) {
    if (child.type === 'text') {
      if (!revision) runs.push(new TextRun(runOptions(child)));
      else {
        const options = { ...runOptions(child), id: ++revisionId, author: revision.author, date: revision.date };
        runs.push(revision.kind === 'insert' ? new InsertedTextRun(options) : new DeletedTextRun(options));
      }
    } else if (child.type === 'linebreak') {
      runs.push(new TextRun({ break: 1 }));
    } else if (child.type === 'tracked-insert' || child.type === 'tracked-delete') {
      runs.push(
        ...textRunsFromChildren(child.children, {
          kind: child.type === 'tracked-insert' ? 'insert' : 'delete',
          author: child.author || 'Unknown',
          date: new Date(child.date ?? Date.now()).toISOString(),
        }),
      );
    } else if (child.children?.length) {
      runs.push(...textRunsFromChildren(child.children, revision)); // links and other inline wrappers
    }
  }
  return runs.length ? runs : [new TextRun('')];
}

function headingLevel(tag: string | undefined): (typeof HeadingLevel)[keyof typeof HeadingLevel] {
  switch (tag) {
    case 'h1': return HeadingLevel.HEADING_1;
    case 'h2': return HeadingLevel.HEADING_2;
    case 'h3': return HeadingLevel.HEADING_3;
    case 'h4': return HeadingLevel.HEADING_4;
    case 'h5': return HeadingLevel.HEADING_5;
    case 'h6': return HeadingLevel.HEADING_6;
    default: return HeadingLevel.HEADING_1;
  }
}

function convertListItems(items: SerializedNode[], listType: string, level = 0): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  for (const item of items) {
    if (item.type !== 'listitem') continue;

    const inlineChildren = item.children?.filter((c) => c.type !== 'list' && c.type !== 'paragraph' && c.type !== 'heading') ?? [];
    const nestedLists = item.children?.filter((c) => c.type === 'list') ?? [];
    const blockChildren = item.children?.filter((c) => c.type === 'paragraph' || c.type === 'heading') ?? [];

    let runs: ParagraphChild[];
    if (blockChildren.length) {
      runs = blockChildren.flatMap((b) => textRunsFromChildren(b.children));
    } else {
      runs = textRunsFromChildren(inlineChildren.length ? inlineChildren : item.children);
    }

    const isNumbered = listType === 'number';

    paragraphs.push(
      new Paragraph({
        children: runs,
        alignment: alignmentFromFormat(item.format),
        ...(isNumbered
          ? { numbering: { reference: 'kw-numbered', level } }
          : { bullet: { level } }),
      }),
    );

    for (const nested of nestedLists) {
      paragraphs.push(...convertListItems(nested.children ?? [], nested.listType ?? 'bullet', level + 1));
    }
  }
  return paragraphs;
}

function convertBlock(node: SerializedNode): (Paragraph | Table)[] {
  switch (node.type) {
    case 'paragraph':
      return [
        new Paragraph({
          children: textRunsFromChildren(node.children),
          alignment: alignmentFromFormat(node.format),
        }),
      ];

    case 'heading':
      return [
        new Paragraph({
          heading: headingLevel(node.tag),
          children: textRunsFromChildren(node.children),
          alignment: alignmentFromFormat(node.format),
        }),
      ];

    case 'quote':
      return (node.children ?? []).flatMap(convertBlock);

    case 'list':
      return convertListItems(node.children ?? [], node.listType ?? 'bullet');

    case 'table':
      return [convertTable(node)];

    case 'page-break':
      return [new Paragraph({ children: [new PageBreak()] })];

    case 'image':
      return [
        new Paragraph({
          children: [new TextRun({ text: `[Image: ${node.altText || 'embedded image'}]`, italics: true })],
        }),
      ];

    default:
      if (node.children?.length) {
        return node.children.flatMap(convertBlock);
      }
      return [];
  }
}

function convertTable(node: SerializedNode): Table {
  const rows = (node.children ?? [])
    .filter((c) => c.type === 'tablerow')
    .map((row) => {
      const cells = (row.children ?? [])
        .filter((c) => c.type === 'tablecell')
        .map((cell) => {
          const cellBlocks = (cell.children ?? []).flatMap(convertBlock);
          return new TableCell({
            children: cellBlocks.length ? cellBlocks : [new Paragraph('')],
            width: { size: 2000, type: WidthType.DXA },
          });
        });
      return new TableRow({ children: cells });
    });

  return new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } });
}

function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function hexColor(color?: string): string | undefined {
  if (!color) return undefined;
  return color.replace('#', '').toUpperCase();
}

function brandingHeaderParagraph(branding: DocumentBranding): Paragraph {
  const runs: (TextRun | ImageRun)[] = [];
  if (branding.logoDataUrl) {
    try {
      const isPng = branding.logoDataUrl.includes('image/png');
      runs.push(
        new ImageRun({
          type: isPng ? 'png' : 'jpg',
          data: dataUrlToUint8Array(branding.logoDataUrl),
          transformation: { width: 80, height: 40 },
        }),
      );
    } catch {
      // skip invalid logo data
    }
  }
  if (branding.companyName) {
    runs.push(
      new TextRun({
        text: branding.logoDataUrl ? `  ${branding.companyName}` : branding.companyName,
        bold: true,
        size: 28,
        color: hexColor(branding.primaryColor),
      }),
    );
  }
  return new Paragraph({ children: runs.length ? runs : [new TextRun('')] });
}

/** Header/footer text with {page}, {pages}, {title} and {date} turned into Word fields or text. */
function headerFooterRuns(text: string, title: string): TextRun[] {
  const parts = text.split(/(\{(?:page|pages|title|date)\})/i).filter(Boolean);
  return parts.map((part) => {
    switch (part.toLowerCase()) {
      case '{page}': return new TextRun({ children: [PageNumber.CURRENT], size: 18 });
      case '{pages}': return new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18 });
      case '{title}': return new TextRun({ text: title, size: 18 });
      case '{date}': return new TextRun({ text: new Date().toLocaleDateString(), size: 18 });
      default: return new TextRun({ text: part, size: 18 });
    }
  });
}

function pageNumberParagraph(position: PageSetup['pageNumbers']): Paragraph {
  return new Paragraph({
    alignment: position === 'footer-center' ? AlignmentType.CENTER : AlignmentType.RIGHT,
    children: [
      new TextRun({ children: ['Page ', PageNumber.CURRENT, ' of ', PageNumber.TOTAL_PAGES], size: 18 }),
    ],
  });
}

function buildHeader(setup: PageSetup, title: string, branding?: DocumentBranding | null): Header | undefined {
  const paragraphs: Paragraph[] = [];
  if (branding && (branding.companyName || branding.logoDataUrl)) paragraphs.push(brandingHeaderParagraph(branding));
  if (setup.headerText) paragraphs.push(new Paragraph({ children: headerFooterRuns(setup.headerText, title) }));
  if (setup.pageNumbers === 'header-right') paragraphs.push(pageNumberParagraph(setup.pageNumbers));
  return paragraphs.length ? new Header({ children: paragraphs }) : undefined;
}

function buildFooter(setup: PageSetup, title: string, branding?: DocumentBranding | null): Footer | undefined {
  const paragraphs: Paragraph[] = [];
  if (branding?.headerText?.trim()) {
    paragraphs.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: branding.headerText, size: 18, color: hexColor(branding.primaryColor) })],
      }),
    );
  }
  if (setup.footerText) paragraphs.push(new Paragraph({ children: headerFooterRuns(setup.footerText, title) }));
  if (setup.pageNumbers === 'footer-center' || setup.pageNumbers === 'footer-right') {
    paragraphs.push(pageNumberParagraph(setup.pageNumbers));
  }
  return paragraphs.length ? new Footer({ children: paragraphs }) : undefined;
}

/** Convert Lexical editorState.toJSON() output to a DOCX Blob. */
export async function lexicalToDocxBlob(
  editorStateJson: unknown,
  title = 'Document',
  branding?: DocumentBranding | null,
  pageSetup?: PageSetup | null,
): Promise<Blob> {
  const setup = normalizePageSetup(pageSetup);
  const inches = pageInches({ ...setup, orientation: 'Portrait' });
  const twips = (value: number) => Math.round(value * 1440);
  const brand = branding && hasBranding(branding) ? branding : null;
  const header = buildHeader(setup, title, brand);
  const footer = buildFooter(setup, title, brand);
  // "Different first page": an empty first-page header/footer.
  const firstHeader = setup.differentFirstPage ? new Header({ children: [new Paragraph('')] }) : undefined;
  const firstFooter = setup.differentFirstPage ? new Footer({ children: [new Paragraph('')] }) : undefined;
  const root = (editorStateJson as { root?: SerializedNode }).root;
  const blocks = (root?.children ?? []).flatMap(convertBlock);

  const doc = new Document({
    title,
    numbering: {
      config: [
        {
          reference: 'kw-numbered',
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: '%1.',
              alignment: AlignmentType.START,
            },
            {
              level: 1,
              format: LevelFormat.LOWER_LETTER,
              text: '%2.',
              alignment: AlignmentType.START,
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          titlePage: Boolean(setup.differentFirstPage),
          page: {
            size: {
              width: twips(inches.width),
              height: twips(inches.height),
              orientation: setup.orientation === 'Landscape' ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT,
            },
            margin: {
              top: twips(inches.margin),
              right: twips(inches.margin),
              bottom: twips(inches.margin),
              left: twips(inches.margin),
            },
          },
        },
        headers: header || firstHeader ? { default: header ?? new Header({ children: [] }), first: firstHeader } : undefined,
        footers: footer || firstFooter ? { default: footer ?? new Footer({ children: [] }), first: firstFooter } : undefined,
        children: blocks.length ? blocks : [new Paragraph('')],
      },
    ],
  });

  return Packer.toBlob(doc);
}
