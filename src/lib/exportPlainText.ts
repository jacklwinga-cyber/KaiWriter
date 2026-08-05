interface SerializedNode {
  type: string;
  children?: SerializedNode[];
  text?: string;
}

export function lexicalToPlainText(editorStateJson: unknown): string {
  const root = (editorStateJson as { root?: SerializedNode }).root;

  const walk = (node: SerializedNode): string => {
    if (node.type === 'text') return node.text ?? '';
    if (node.type === 'linebreak') return '\n';
    if (node.type === 'paragraph' || node.type === 'heading' || node.type === 'listitem') {
      return `${(node.children ?? []).map(walk).join('')}\n`;
    }
    if (node.type === 'list') return (node.children ?? []).map(walk).join('');
    if (node.children?.length) return node.children.map(walk).join('');
    return '';
  };

  return (root?.children ?? []).map(walk).join('\n').trim();
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function downloadText(content: string, filename: string): void {
  downloadBlob(new Blob([content], { type: 'text/plain;charset=utf-8' }), filename);
}

export function exportFilename(documentName: string, ext: string): string {
  const base = documentName.replace(/[<>:"/\\|?*]+/g, '-').trim() || 'Document';
  return base.toLowerCase().endsWith(`.${ext}`) ? base : `${base}.${ext}`;
}
