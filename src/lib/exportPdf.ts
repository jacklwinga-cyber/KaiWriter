/**
 * Renders a document to a real PDF (selectable text, page numbers, headers and
 * footers) with pdfmake. Loaded on demand so pdfmake and its fonts stay out of
 * the main bundle.
 */
import * as pdfMakeModule from 'pdfmake/build/pdfmake';
import robotoFonts from 'pdfmake/build/fonts/Roboto';
import type { DocumentBranding } from './branding';
import type { PageSetup } from './pageSetup';
import { collectImageSources, lexicalToPdfDefinition } from './pdfDocument';

type PdfMake = typeof import('pdfmake/build/pdfmake');
const pdfMake: PdfMake = ((pdfMakeModule as unknown as { default?: PdfMake }).default ?? pdfMakeModule) as PdfMake;
pdfMake.addFontContainer(robotoFonts);

const SUPPORTED_DATA_URL = /^data:image\/(png|jpe?g);base64,/i;

/** pdfmake embeds only PNG/JPEG data; convert anything else via a canvas, or give up (null). */
async function toEmbeddableImage(src: string): Promise<string | null> {
  if (SUPPORTED_DATA_URL.test(src)) return src;
  try {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('image failed to load'));
      image.src = src;
    });
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth || 1;
    canvas.height = image.naturalHeight || 1;
    canvas.getContext('2d')?.drawImage(image, 0, 0);
    return canvas.toDataURL('image/png');
  } catch {
    return null; // unreachable or cross-origin image: exported as its alt text
  }
}

export async function lexicalToPdfBlob(
  editorStateJson: unknown,
  title: string,
  branding?: DocumentBranding | null,
  pageSetup?: PageSetup | null,
): Promise<Blob> {
  const sources = collectImageSources(editorStateJson);
  const resolved = await Promise.all(sources.map(toEmbeddableImage));
  const images = Object.fromEntries(sources.map((src, i) => [src, resolved[i]]));

  const definition = lexicalToPdfDefinition(editorStateJson, { title, branding, pageSetup, images });
  const buffer = await pdfMake.createPdf(definition).getBuffer();
  return new Blob([buffer as unknown as BlobPart], { type: 'application/pdf' });
}
