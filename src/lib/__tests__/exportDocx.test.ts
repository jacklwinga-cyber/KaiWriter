import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { lexicalToDocxBlob } from '../exportDocx';

function paragraph(text: string) {
  return { type: 'paragraph', children: [{ type: 'text', text, format: 0 }] };
}

async function documentXml(blob: Blob, part = 'word/document.xml'): Promise<string> {
  const zip = await JSZip.loadAsync(blob);
  return (await zip.file(part)?.async('string')) ?? '';
}

async function allXml(blob: Blob): Promise<string> {
  const zip = await JSZip.loadAsync(blob);
  const parts = await Promise.all(
    Object.keys(zip.files).filter((n) => n.endsWith('.xml')).map((n) => zip.file(n)!.async('string')),
  );
  return parts.join('\n');
}

const state = { root: { children: [paragraph('First page'), { type: 'page-break' }, paragraph('Second page')] } };

describe('lexicalToDocxBlob', () => {
  it('exports manual page breaks', async () => {
    const xml = await documentXml(await lexicalToDocxBlob(state, 'Doc'));
    expect(xml).toContain('w:type="page"');
    expect(xml.indexOf('First page')).toBeLessThan(xml.indexOf('w:type="page"'));
    expect(xml.indexOf('w:type="page"')).toBeLessThan(xml.indexOf('Second page'));
  });

  it('applies page size, orientation and margins', async () => {
    const xml = await documentXml(
      await lexicalToDocxBlob(state, 'Doc', null, { pageSize: 'A4', orientation: 'Landscape', margins: 'Narrow', pageNumbers: 'none' }),
    );
    // A4 landscape: 11.69in × 8.27in, 0.5in margins
    expect(xml).toMatch(/<w:pgSz[^>]*w:w="16834"[^>]*w:h="11909"[^>]*w:orient="landscape"/);
    expect(xml).toMatch(/<w:pgMar[^>]*w:top="720"/);
  });

  it('writes header text, footer text and page number fields', async () => {
    const xml = await allXml(
      await lexicalToDocxBlob(state, 'Quarterly Plan', null, {
        pageSize: 'Letter',
        orientation: 'Portrait',
        margins: 'Normal',
        headerText: '{title}',
        footerText: 'Confidential',
        pageNumbers: 'footer-center',
        differentFirstPage: true,
      }),
    );
    expect(xml).toContain('Quarterly Plan');
    expect(xml).toContain('Confidential');
    expect(xml).toContain('PAGE');
    expect(xml).toContain('NUMPAGES');
    expect(xml).toContain('<w:titlePg');
  });

  it('writes tracked changes as Word revisions and keeps link text', async () => {
    const tracked = {
      root: {
        children: [
          {
            type: 'paragraph',
            children: [
              { type: 'text', text: 'The ', format: 0 },
              { type: 'tracked-delete', author: 'Ana', date: 0, children: [{ type: 'text', text: 'cat', format: 0 }] },
              { type: 'tracked-insert', author: 'Ana', date: 0, children: [{ type: 'text', text: 'dog', format: 0 }] },
              { type: 'link', url: 'https://example.com', children: [{ type: 'text', text: ' see more', format: 0 }] },
            ],
          },
        ],
      },
    };
    const xml = await documentXml(await lexicalToDocxBlob(tracked, 'Doc'));
    expect(xml).toMatch(/<w:del [^>]*w:author="Ana"[\s\S]*?<w:delText[^>]*>cat<\/w:delText>/);
    expect(xml).toMatch(/<w:ins [^>]*w:author="Ana"[\s\S]*?>dog<\/w:t>/);
    expect(xml).toContain(' see more');
  });
});
