import { createElement, type ReactNode } from 'react';
import {
  $applyNodeReplacement,
  createCommand,
  DecoratorNode,
  type DOMConversionMap,
  type DOMConversionOutput,
  type DOMExportOutput,
  type LexicalCommand,
  type LexicalNode,
  type SerializedLexicalNode,
} from 'lexical';
import { PageBreakComponent } from './PageBreakComponent';

export type SerializedPageBreakNode = SerializedLexicalNode;

export const INSERT_PAGE_BREAK_COMMAND: LexicalCommand<void> = createCommand('INSERT_PAGE_BREAK_COMMAND');

function isPageBreakElement(element: HTMLElement): boolean {
  if (element.hasAttribute('data-page-break')) return true;
  if (element.classList.contains('page-break')) return true;
  const style = element.style;
  return style.breakAfter === 'page' || style.breakBefore === 'page'
    || style.pageBreakAfter === 'always' || style.pageBreakBefore === 'always';
}

function convertPageBreakElement(): DOMConversionOutput {
  return { node: $createPageBreakNode() };
}

/** A manual page break: content after it starts on a new page. */
export class PageBreakNode extends DecoratorNode<ReactNode> {
  static getType(): string {
    return 'page-break';
  }

  static clone(node: PageBreakNode): PageBreakNode {
    return new PageBreakNode(node.__key);
  }

  static importJSON(): PageBreakNode {
    return $createPageBreakNode();
  }

  static importDOM(): DOMConversionMap | null {
    const match = (domNode: HTMLElement) =>
      isPageBreakElement(domNode) ? { conversion: convertPageBreakElement, priority: 3 as const } : null;
    return { hr: match, figure: match, div: match, br: match };
  }

  exportJSON(): SerializedPageBreakNode {
    return { ...super.exportJSON(), type: 'page-break', version: 1 };
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement('hr');
    element.setAttribute('data-page-break', 'true');
    element.style.breakAfter = 'page';
    return { element };
  }

  createDOM(): HTMLElement {
    const element = document.createElement('figure');
    element.setAttribute('data-page-break', 'true');
    element.style.margin = '0';
    return element;
  }

  updateDOM(): false {
    return false;
  }

  getTextContent(): string {
    return '\n';
  }

  isInline(): false {
    return false;
  }

  isKeyboardSelectable(): boolean {
    return true;
  }

  decorate(): ReactNode {
    return createElement(PageBreakComponent, { nodeKey: this.__key });
  }
}

export function $createPageBreakNode(): PageBreakNode {
  return $applyNodeReplacement(new PageBreakNode());
}

export function $isPageBreakNode(node: LexicalNode | null | undefined): node is PageBreakNode {
  return node instanceof PageBreakNode;
}
