import { describe, it, expect } from 'vitest';
import { lexicalToPdfBlob } from '../exportPdf';

async function blobText(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.readAsBinaryString(blob);
  });
}

describe('lexicalToPdfBlob', () => {
  it('renders a multi-page PDF', async () => {
    const paragraph = (t: string) => ({ type: 'paragraph', children: [{ type: 'text', text: t, format: 0 }] });
    const state = { root: { type: 'root', children: [paragraph('Page one'), { type: 'page-break' }, paragraph('Page two')] } };
    const blob = await lexicalToPdfBlob(state, 'Test', null, {
      pageSize: 'Letter', orientation: 'Portrait', margins: 'Normal', pageNumbers: 'footer-center',
    });
    expect(blob.type).toBe('application/pdf');
    const raw = await blobText(blob);
    expect(raw.startsWith('%PDF')).toBe(true);
    expect(raw).toMatch(/\/Type \/Pages[\s\S]*?\/Count 2/);
  }, 20_000);
});
