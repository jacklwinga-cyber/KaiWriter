/** Helpers to build Lexical serialized editor states for templates. */

type TextNode = {
  detail: number;
  format: number;
  mode: 'normal';
  style: string;
  text: string;
  type: 'text';
  version: 1;
};

type BlockNode = {
  children: (TextNode | BlockNode)[];
  direction: 'ltr';
  format: string;
  indent: number;
  type: string;
  version: 1;
  tag?: string;
  listType?: 'bullet' | 'number';
  value?: number;
  textFormat?: number;
  textStyle?: string;
};

function text(content: string, format = 0, style = ''): TextNode {
  return {
    detail: 0,
    format,
    mode: 'normal',
    style,
    text: content,
    type: 'text',
    version: 1,
  };
}

function paragraph(...children: TextNode[]): BlockNode {
  return {
    children,
    direction: 'ltr',
    format: '',
    indent: 0,
    type: 'paragraph',
    version: 1,
    textFormat: 0,
    textStyle: '',
  };
}

function heading(tag: 'h1' | 'h2' | 'h3', content: string): BlockNode {
  return {
    children: [text(content)],
    direction: 'ltr',
    format: '',
    indent: 0,
    type: 'heading',
    tag,
    version: 1,
  };
}

function bulletItem(content: string): BlockNode {
  return {
    children: [text(content)],
    direction: 'ltr',
    format: '',
    indent: 0,
    type: 'listitem',
    version: 1,
    value: 1,
  };
}

function bulletList(...items: string[]): BlockNode {
  return {
    children: items.map(bulletItem),
    direction: 'ltr',
    format: '',
    indent: 0,
    type: 'list',
    listType: 'bullet',
    version: 1,
  };
}

export function buildEditorState(...blocks: BlockNode[]): string {
  return JSON.stringify({
    root: {
      children: blocks,
      direction: 'ltr',
      format: '',
      indent: 0,
      type: 'root',
      version: 1,
    },
  });
}

export const lexicalBuilder = {
  text,
  paragraph,
  heading,
  bulletList,
  buildEditorState,
};
