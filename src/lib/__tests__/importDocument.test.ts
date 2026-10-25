import { describe, it, expect } from 'vitest';
import {
  Document,
  ExternalHyperlink,
  HeadingLevel,
  Packer,
  PageBreak,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
} from 'docx';
import { importDocumentFile, UnsupportedFileError } from '../importDocument';
import { lexicalToDocxBlob } from '../exportDocx';

interface Node {
  type: string;
  text?: string;
  format?: number;
  tag?: string;
  listType?: string;
  url?: string;
  children?: Node[];
}

function flatten(node: Node): Node[] {
  return [node, ...(node.children ?? []).flatMap(flatten)];
}

async function importBytes(bytes: Uint8Array | ArrayBuffer, name: string) {
  const result = await importDocumentFile(new File([bytes as BlobPart], name));
  const root = (JSON.parse(result.content) as { root: Node }).root;
  return { ...result, root, all: flatten(root) };
}

describe('importDocumentFile — Word documents', () => {
  it('keeps headings, formatting, lists, tables, links and page breaks', async () => {
    const docx = new Document({
      numbering: { config: [{ reference: 'num', levels: [{ level: 0, format: 'decimal', text: '%1.' }] }] },
      sections: [
        {
          children: [
            new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('Project Plan')] }),
            new Paragraph({
              children: [
                new TextRun({ text: 'Bold', bold: true }),
                new TextRun(' and '),
                new TextRun({ text: 'underlined', underline: {} }),
                new TextRun(' with a '),
                new ExternalHyperlink({ link: 'https://example.com', children: [new TextRun('link')] }),
              ],
            }),
            new Paragraph({ text: 'First bullet', bullet: { level: 0 } }),
            new Paragraph({ text: 'Step one', numbering: { reference: 'num', level: 0 } }),
            new Table({
              rows: [
                new TableRow({ children: [new TableCell({ children: [new Paragraph('A1')] }), new TableCell({ children: [new Paragraph('B1')] })] }),
              ],
            }),
            new Paragraph({ children: [new PageBreak()] }),
            new Paragraph('After the break'),
          ],
        },
      ],
    });
    const { name, all } = await importBytes(await Packer.toBuffer(docx), 'Project Plan.docx');

    expect(name).toBe('Project Plan');
    expect(all.find((n) => n.type === 'heading')).toMatchObject({ tag: 'h1' });
    expect(all.find((n) => n.text === 'Bold')?.format).toBe(1);
    expect(all.find((n) => n.text === 'underlined')?.format).toBe(8);
    expect(all.find((n) => n.type === 'link')).toMatchObject({ url: 'https://example.com' });
    expect(all.filter((n) => n.type === 'list').map((n) => n.listType).sort()).toEqual(['bullet', 'number']);
    expect(all.filter((n) => n.type === 'tablecell')).toHaveLength(2);
    expect(all.some((n) => n.type === 'page-break')).toBe(true);
    expect(all.some((n) => n.text === 'After the break')).toBe(true);
  });

  it('round-trips a document exported by KaiWriter', async () => {
    const original = {
      root: {
        type: 'root',
        children: [
          { type: 'heading', tag: 'h2', children: [{ type: 'text', text: 'Summary', format: 0 }] },
          { type: 'paragraph', children: [{ type: 'text', text: 'Italic words', format: 2 }] },
        ],
      },
    };
    const blob = await lexicalToDocxBlob(original, 'Summary');
    const bytes = await new Promise<ArrayBuffer>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.readAsArrayBuffer(blob);
    });
    const { all } = await importBytes(bytes, 'Summary.docx');
    expect(all.find((n) => n.type === 'heading')).toMatchObject({ tag: 'h2' });
    expect(all.find((n) => n.text === 'Italic words')?.format).toBe(2);
  });
});

describe('importDocumentFile — other formats', () => {
  it('opens plain text as one paragraph per line', async () => {
    const { root } = await importBytes(new TextEncoder().encode('Line one\nLine two'), 'notes.txt');
    expect(root.children?.map((p) => p.children?.[0]?.text)).toEqual(['Line one', 'Line two']);
  });

  it('opens HTML, wrapping loose text in paragraphs', async () => {
    const { root } = await importBytes(new TextEncoder().encode('Loose <b>text</b><h2>Heading</h2>'), 'page.html');
    expect(root.children?.map((n) => n.type)).toEqual(['paragraph', 'heading']);
  });

  it('explains how to convert old .doc files', async () => {
    await expect(importDocumentFile(new File(['x'], 'old.doc'))).rejects.toBeInstanceOf(UnsupportedFileError);
  });
});
