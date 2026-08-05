interface SerializedNode {
  type: string;
  children?: SerializedNode[];
  text?: string;
  format?: number;
  tag?: string;
  listType?: 'bullet' | 'number';
}

const FORMAT_BOLD = 1;
const FORMAT_ITALIC = 2;
const FORMAT_UNDERLINE = 8;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function wrapFormattedText(content: string, format = 0): string {
  let html = escapeHtml(content);
  if (format & FORMAT_BOLD) html = `<strong>${html}</strong>`;
  if (format & FORMAT_ITALIC) html = `<em>${html}</em>`;
  if (format & FORMAT_UNDERLINE) html = `<u>${html}</u>`;
  return html;
}

function inlineChildren(nodes: SerializedNode[] = []): string {
  return nodes
    .map((node) => {
      if (node.type === 'text') return wrapFormattedText(node.text ?? '', node.format);
      if (node.type === 'linebreak') return '<br />';
      if (node.children?.length) return inlineChildren(node.children);
      return '';
    })
    .join('');
}

function blockToHtml(node: SerializedNode): string {
  const inner = inlineChildren(node.children);

  switch (node.type) {
    case 'heading':
      return `<${node.tag ?? 'h2'}>${inner || '&nbsp;'}</${node.tag ?? 'h2'}>`;
    case 'paragraph':
      return `<p>${inner || '&nbsp;'}</p>`;
    case 'listitem':
      return `<li>${inner || '&nbsp;'}</li>`;
    case 'list': {
      const tag = node.listType === 'number' ? 'ol' : 'ul';
      const items = (node.children ?? []).map(blockToHtml).join('');
      return `<${tag}>${items}</${tag}>`;
    }
    default:
      if (node.children?.length) return node.children.map(blockToHtml).join('');
      return '';
  }
}

export interface LexicalPreviewOptions {
  /** Limit blocks for gallery thumbnails (performance). */
  maxBlocks?: number;
}

/**
 * Renders Lexical editor JSON as HTML for template gallery previews.
 */
export function lexicalToPreviewHtml(
  editorStateJson: string | unknown,
  options: LexicalPreviewOptions = {},
): string {
  const root = (typeof editorStateJson === 'string'
    ? JSON.parse(editorStateJson)
    : editorStateJson) as { root?: SerializedNode };

  const children = root.root?.children ?? [];
  const maxBlocks = options.maxBlocks ?? children.length;
  const slice = maxBlocks > 0 ? children.slice(0, maxBlocks) : children;

  return slice.map(blockToHtml).join('');
}
