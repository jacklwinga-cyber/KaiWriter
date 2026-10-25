/**
 * Opens Word (.docx), HTML and plain-text files as KaiWriter documents.
 *
 * .docx files go through mammoth (Word → semantic HTML: headings, lists,
 * tables, bold/italic/underline/strike, links, images, page breaks), then
 * Lexical's HTML importer turns the HTML into editor content.
 */
import { $generateNodesFromDOM } from '@lexical/html';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isDecoratorNode,
  $isElementNode,
  createEditor,
  type LexicalNode,
} from 'lexical';
import { EDITOR_NODES } from '../components/editor/nodes/editorNodes';

export class UnsupportedFileError extends Error {}

export interface ImportedDocument {
  name: string;
  /** Serialized Lexical editor state. */
  content: string;
  /** Conversion notes from mammoth (e.g. unsupported Word features), for display. */
  warnings: string[];
}

// mammoth drops underline unless asked, and only maps Word page breaks when told to.
const DOCX_STYLE_MAP = [
  'u => u',
  "br[type='page'] => hr.page-break",
  "p[style-name='Title'] => h1:fresh",
  "p[style-name='Subtitle'] => h2:fresh",
  "p[style-name='Quote'] => blockquote > p:fresh",
  "p[style-name='Intense Quote'] => blockquote > p:fresh",
];

function fileBaseName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').trim() || 'Untitled Document';
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Plain text → one paragraph per line. */
export function plainTextToHtml(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => `<p>${escapeHtml(line) || '<br>'}</p>`)
    .join('');
}

/** Turns HTML into a serialized Lexical editor state using KaiWriter's node set. */
export function htmlToEditorState(html: string): string {
  const editor = createEditor({
    namespace: 'KaiWriterImport',
    nodes: EDITOR_NODES,
    onError: (error) => {
      throw error;
    },
  });
  const dom = new DOMParser().parseFromString(html, 'text/html');

  editor.update(
    () => {
      const root = $getRoot();
      root.clear();
      let pendingInline: LexicalNode[] = [];
      const flushInline = () => {
        if (!pendingInline.length) return;
        const paragraph = $createParagraphNode();
        paragraph.append(...pendingInline);
        root.append(paragraph);
        pendingInline = [];
      };
      for (const node of $generateNodesFromDOM(editor, dom)) {
        // The root only accepts block nodes; wrap stray text/inline nodes in paragraphs.
        const isBlock = ($isElementNode(node) || $isDecoratorNode(node)) && !node.isInline();
        if (isBlock) {
          flushInline();
          root.append(node);
        } else {
          pendingInline.push(node);
        }
      }
      flushInline();
      if (root.getChildrenSize() === 0) root.append($createParagraphNode().append($createTextNode('')));
    },
    { discrete: true },
  );

  return JSON.stringify(editor.getEditorState().toJSON());
}

async function docxToHtml(data: ArrayBuffer): Promise<{ html: string; warnings: string[] }> {
  const mammoth = await import('mammoth');
  // mammoth's browser build reads `arrayBuffer`; its Node build (used by tests) reads `buffer`.
  const NodeBuffer = (globalThis as { Buffer?: { from(data: ArrayBuffer): unknown } }).Buffer;
  const input = { arrayBuffer: data, ...(NodeBuffer ? { buffer: NodeBuffer.from(data) } : {}) };
  const result = await mammoth.convertToHtml(input as { arrayBuffer: ArrayBuffer }, { styleMap: DOCX_STYLE_MAP });
  return {
    html: result.value,
    warnings: result.messages.filter((m) => m.type === 'warning').map((m) => m.message),
  };
}

function readFile(file: File, as: 'text' | 'arrayBuffer'): Promise<string | ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file'));
    reader.onload = () => resolve(reader.result as string | ArrayBuffer);
    if (as === 'text') reader.readAsText(file);
    else reader.readAsArrayBuffer(file);
  });
}

export async function importDocumentFile(file: File): Promise<ImportedDocument> {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  const name = fileBaseName(file.name);

  if (extension === 'docx') {
    const { html, warnings } = await docxToHtml((await readFile(file, 'arrayBuffer')) as ArrayBuffer);
    return { name, content: htmlToEditorState(html), warnings };
  }
  if (extension === 'html' || extension === 'htm') {
    return { name, content: htmlToEditorState((await readFile(file, 'text')) as string), warnings: [] };
  }
  if (['txt', 'text', 'md', 'markdown'].includes(extension)) {
    return { name, content: htmlToEditorState(plainTextToHtml((await readFile(file, 'text')) as string)), warnings: [] };
  }
  if (extension === 'doc') {
    throw new UnsupportedFileError(
      'Older Word files (.doc) can’t be opened. In Word, use File ▸ Save As ▸ Word Document (.docx), then open that file.',
    );
  }
  throw new UnsupportedFileError('KaiWriter can open Word (.docx), text (.txt, .md) and web page (.html) files.');
}
