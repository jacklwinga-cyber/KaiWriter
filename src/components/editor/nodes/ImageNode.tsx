import type {
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  EditorConfig,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from 'lexical';

import { DecoratorNode } from 'lexical';
import React, { Suspense } from 'react';

const ImageComponent = React.lazy(() => import('./ImageComponent'));

// ── Types ──────────────────────────────────────────────────────────────────

export type ImageAlignment = 'inline' | 'left' | 'center' | 'right';

export interface ImagePayload {
  altText: string;
  height?: number;
  key?: NodeKey;
  maxWidth?: number;
  src: string;
  width?: number;
  alignment?: ImageAlignment;
}

export type SerializedImageNode = Spread<
  {
    altText: string;
    height?: number;
    maxWidth?: number;
    src: string;
    width?: number;
    alignment?: ImageAlignment;
    type: 'image';
    version: 1;
  },
  SerializedLexicalNode
>;

// ── Node ───────────────────────────────────────────────────────────────────

export class ImageNode extends DecoratorNode<React.ReactNode> {
  __src: string;
  __altText: string;
  __width: 'inherit' | number;
  __height: 'inherit' | number;
  __maxWidth: number;
  __alignment: ImageAlignment;

  static getType(): string {
    return 'image';
  }

  static clone(node: ImageNode): ImageNode {
    return new ImageNode(
      node.__src,
      node.__altText,
      node.__maxWidth,
      node.__width,
      node.__height,
      node.__alignment,
      node.__key,
    );
  }

  static importJSON(serializedNode: SerializedImageNode): ImageNode {
    const { altText, height, width, maxWidth, src, alignment } = serializedNode;
    return $createImageNode({ altText, height, maxWidth, src, width, alignment });
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement('img');
    element.setAttribute('src', this.__src);
    element.setAttribute('alt', this.__altText);
    element.setAttribute('width', String(this.__width));
    element.setAttribute('height', String(this.__height));
    if (this.__alignment !== 'inline') {
      element.setAttribute('data-alignment', this.__alignment);
    }
    return { element };
  }

  static importDOM(): DOMConversionMap | null {
    return {
      img: (_node: Node) => ({
        conversion: convertImageElement,
        priority: 0,
      }),
    };
  }

  constructor(
    src: string,
    altText: string,
    maxWidth: number,
    width?: 'inherit' | number,
    height?: 'inherit' | number,
    alignment?: ImageAlignment,
    key?: NodeKey,
  ) {
    super(key);
    this.__src = src;
    this.__altText = altText;
    this.__maxWidth = maxWidth;
    this.__width = width || 'inherit';
    this.__height = height || 'inherit';
    this.__alignment = alignment ?? 'inline';
  }

  exportJSON(): SerializedImageNode {
    return {
      altText: this.getAltText(),
      height: this.__height === 'inherit' ? 0 : this.__height,
      maxWidth: this.__maxWidth,
      src: this.getSrc(),
      width: this.__width === 'inherit' ? 0 : this.__width,
      alignment: this.__alignment,
      type: 'image',
      version: 1,
    };
  }

  // ── Getters ───────────────────────────────────────────────────────────────

  getSrc(): string { return this.__src; }
  getAltText(): string { return this.__altText; }
  getAlignment(): ImageAlignment { return this.__alignment; }

  // ── Setters (must be called inside editor.update()) ───────────────────────

  setAlignment(alignment: ImageAlignment): this {
    const wr = this.getWritable();
    wr.__alignment = alignment;
    return wr;
  }

  setDimensions(width: number | 'inherit', height: number | 'inherit'): this {
    const wr = this.getWritable();
    wr.__width = width;
    wr.__height = height;
    return wr;
  }

  setSrc(src: string): this {
    const wr = this.getWritable();
    wr.__src = src;
    return wr;
  }

  // ── DOM ───────────────────────────────────────────────────────────────────

  /** Apply float / centering styles to the outer wrapper span. */
  private _applyAlignmentStyle(el: HTMLElement): void {
    const a = this.__alignment;
    // Reset first
    el.style.float = '';
    el.style.marginLeft = '';
    el.style.marginRight = '';
    el.style.marginBottom = '';

    switch (a) {
      case 'left':
        el.style.display = 'block';
        el.style.float = 'left';
        el.style.marginRight = '12px';
        el.style.marginBottom = '8px';
        break;
      case 'right':
        el.style.display = 'block';
        el.style.float = 'right';
        el.style.marginLeft = '12px';
        el.style.marginBottom = '8px';
        break;
      case 'center':
        el.style.display = 'block';
        el.style.marginLeft = 'auto';
        el.style.marginRight = 'auto';
        break;
      default: // 'inline'
        el.style.display = 'inline-block';
        break;
    }
  }

  createDOM(config: EditorConfig): HTMLElement {
    const span = document.createElement('span');
    const className = config.theme.image;
    if (className !== undefined) span.className = className;
    this._applyAlignmentStyle(span);
    return span;
  }

  updateDOM(prevNode: ImageNode, dom: HTMLElement): false {
    // Re-apply alignment style whenever the node changes
    if (prevNode.__alignment !== this.__alignment) {
      this._applyAlignmentStyle(dom);
    }
    return false; // reuse existing DOM element
  }

  decorate(): React.ReactNode {
    return (
      <Suspense fallback={null}>
        <ImageComponent
          src={this.__src}
          altText={this.__altText}
          width={this.__width}
          height={this.__height}
          maxWidth={this.__maxWidth}
          nodeKey={this.getKey()}
          alignment={this.__alignment}
        />
      </Suspense>
    );
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

export function $createImageNode({
  altText,
  height,
  maxWidth = 500,
  src,
  width,
  alignment,
  key,
}: ImagePayload): ImageNode {
  return new ImageNode(src, altText, maxWidth, width, height, alignment, key);
}

export function $isImageNode(
  node: LexicalNode | null | undefined,
): node is ImageNode {
  return node instanceof ImageNode;
}

function convertImageElement(domNode: Node): null | DOMConversionOutput {
  if (domNode instanceof HTMLImageElement) {
    const { alt: altText, src, width, height } = domNode;
    const node = $createImageNode({ altText, height, src, width });
    return { node };
  }
  return null;
}
