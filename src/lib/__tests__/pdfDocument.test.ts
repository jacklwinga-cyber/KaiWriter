import { describe, it, expect } from 'vitest';
import type { Content, ContentText, DynamicContent } from 'pdfmake/interfaces';
import { collectImageSources, lexicalToPdfDefinition } from '../pdfDocument';

const text = (t: string, format = 0) => ({ type: 'text', text: t, format });
const paragraph = (...children: object[]) => ({ type: 'paragraph', children });
const doc = (...children: object[]) => ({ root: { type: 'root', children } });

function render(fn: DynamicContent | Content | undefined, page: number, pages: number): string {
  const out = typeof fn === 'function' ? fn(page, pages, { width: 612, height: 792, orientation: 'portrait' }) : fn;
  return JSON.stringify(out ?? '');
}

describe('lexicalToPdfDefinition', () => {
  it('uses the page size and margins from page setup', () => {
    const def = lexicalToPdfDefinition(doc(paragraph(text('Hi'))), {
      title: 'T',
      pageSetup: { pageSize: 'A4', orientation: 'Landscape', margins: 'Narrow', pageNumbers: 'none' },
    });
    expect(def.pageSize).toEqual({ width: 11.69 * 72, height: 8.27 * 72 });
    expect(def.pageMargins).toEqual([36, 36, 36, 36]);
  });

  it('maps text formatting, headings and manual page breaks', () => {
    const def = lexicalToPdfDefinition(
      doc(
        { type: 'heading', tag: 'h1', children: [text('Title')] },
        paragraph(text('bold', 1), text(' italic', 2), text(' under', 8)),
        { type: 'page-break' },
        paragraph(text('Next page')),
      ),
      { title: 'T' },
    );
    const content = def.content as ContentText[];
    expect(content[0]).toMatchObject({ fontSize: 24, bold: true });
    expect((content[1].text as ContentText[])[0]).toMatchObject({ text: 'bold', bold: true });
    expect((content[1].text as ContentText[])[1]).toMatchObject({ italics: true });
    expect((content[1].text as ContentText[])[2]).toMatchObject({ decoration: 'underline' });
    expect(content[2]).toMatchObject({ pageBreak: 'after' });
  });

  it('builds lists, nested lists and tables with spans', () => {
    const def = lexicalToPdfDefinition(
      doc(
        {
          type: 'list',
          listType: 'number',
          children: [
            { type: 'listitem', children: [text('one')] },
            { type: 'listitem', children: [{ type: 'list', listType: 'bullet', children: [{ type: 'listitem', children: [text('nested')] }] }] },
          ],
        },
        {
          type: 'table',
          children: [
            { type: 'tablerow', children: [{ type: 'tablecell', headerState: 1, colSpan: 2, children: [paragraph(text('Head'))] }] },
            { type: 'tablerow', children: [{ type: 'tablecell', headerState: 0, children: [paragraph(text('a'))] }, { type: 'tablecell', headerState: 0, children: [paragraph(text('b'))] }] },
          ],
        },
      ),
      { title: 'T' },
    );
    const [list, table] = def.content as unknown as Array<Record<string, unknown>>;
    expect((list.ol as unknown[]).length).toBe(2);
    expect((list.ol as Array<Record<string, unknown>>)[1]).toMatchObject({ listType: 'none' });
    const t = table.table as { body: unknown[][]; headerRows: number; widths: unknown[] };
    expect(t.widths).toHaveLength(2);
    expect(t.body[0]).toHaveLength(2); // colSpan placeholder
    expect(t.headerRows).toBe(1);
  });

  it('puts header text, footer text and page numbers on each page, except page 1 when asked', () => {
    const def = lexicalToPdfDefinition(doc(paragraph(text('x'))), {
      title: 'Plan',
      pageSetup: {
        pageSize: 'Letter', orientation: 'Portrait', margins: 'Normal',
        headerText: '{title}', footerText: 'Confidential', pageNumbers: 'footer-center', differentFirstPage: true,
      },
    });
    expect(render(def.header, 1, 3)).toBe('""');
    expect(render(def.header, 2, 3)).toContain('Plan');
    expect(render(def.footer, 2, 3)).toContain('Confidential');
    expect(render(def.footer, 2, 3)).toContain('Page 2 of 3');
  });

  it('leaves out text deleted under track changes', () => {
    const def = lexicalToPdfDefinition(
      doc(paragraph(text('keep '), { type: 'tracked-delete', children: [text('gone')] }, { type: 'tracked-insert', children: [text('new')] })),
      { title: 'T' },
    );
    const json = JSON.stringify(def.content);
    expect(json).toContain('keep ');
    expect(json).toContain('new');
    expect(json).not.toContain('gone');
  });

  it('replaces images it cannot embed with their alt text', () => {
    const state = doc({ type: 'image', src: 'https://example.com/a.webp', altText: 'Chart' });
    expect(collectImageSources(state)).toEqual(['https://example.com/a.webp']);
    const def = lexicalToPdfDefinition(state, { title: 'T', images: { 'https://example.com/a.webp': null } });
    expect(JSON.stringify(def.content)).toContain('[Image: Chart]');
  });
});
