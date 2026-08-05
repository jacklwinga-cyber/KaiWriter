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
} from 'docx';
import type { DocumentBranding } from './branding';
import { hasBranding } from './branding';

/** Lexical text format bit flags */
const F_BOLD = 1;
const F_ITALIC = 2;
const F_STRIKE = 4;
const F_UNDERLINE = 8;

interface SerializedNode {
  type: string;
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

function textRunsFromChildren(children: SerializedNode[] | undefined): TextRun[] {
  if (!children?.length) return [new TextRun('')];

  const runs: TextRun[] = [];
  for (const child of children) {
    if (child.type === 'text') {
      const fmt = typeof child.format === 'number' ? child.format : 0;
      runs.push(
        new TextRun({
          text: child.text ?? '',
          bold: Boolean(fmt & F_BOLD),
          italics: Boolean(fmt & F_ITALIC),
          strike: Boolean(fmt & F_STRIKE),
          underline: fmt & F_UNDERLINE ? {} : undefined,
        }),
      );
    } else if (child.type === 'linebreak') {
      runs.push(new TextRun({ break: 1 }));
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

    const inlineChildren = item.children?.filter((c) => c.type === 'text' || c.type === 'linebreak') ?? [];
    const nestedLists = item.children?.filter((c) => c.type === 'list') ?? [];
    const blockChildren = item.children?.filter((c) => c.type === 'paragraph' || c.type === 'heading') ?? [];

    let runs: TextRun[];
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

function buildBrandingHeader(branding: DocumentBranding): Header {
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
  return new Header({
    children: [new Paragraph({ children: runs.length ? runs : [new TextRun('')] })],
  });
}

function buildBrandingFooter(branding: DocumentBranding): Footer | undefined {
  if (!branding.headerText?.trim()) return undefined;
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: branding.headerText,
            size: 18,
            color: hexColor(branding.primaryColor),
          }),
        ],
      }),
    ],
  });
}

/** Convert Lexical editorState.toJSON() output to a DOCX Blob. */
export async function lexicalToDocxBlob(
  editorStateJson: unknown,
  title = 'Document',
  branding?: DocumentBranding | null,
): Promise<Blob> {
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
        properties: {},
        headers: branding && hasBranding(branding) ? { default: buildBrandingHeader(branding) } : undefined,
        footers: branding && hasBranding(branding) ? { default: buildBrandingFooter(branding) } : undefined,
        children: blocks.length ? blocks : [new Paragraph('')],
      },
    ],
  });

  return Packer.toBlob(doc);
}
