/**
 * Track changes: inline wrappers around text that was inserted or deleted while
 * change tracking was on. Deleted text stays in the document (shown struck
 * through) until someone accepts or rejects the change.
 */
import {
  $applyNodeReplacement,
  ElementNode,
  type DOMConversionMap,
  type DOMConversionOutput,
  type DOMExportOutput,
  type EditorConfig,
  type LexicalNode,
  type NodeKey,
  type SerializedElementNode,
  type Spread,
} from 'lexical';

export interface ChangeInfo {
  author: string;
  /** Unix ms. */
  date: number;
}

export type SerializedTrackedChangeNode = Spread<ChangeInfo, SerializedElementNode>;

function describe(kind: 'Inserted' | 'Deleted', info: ChangeInfo): string {
  const when = new Date(info.date).toLocaleString();
  return `${kind} by ${info.author || 'Unknown'} · ${when}`;
}

abstract class TrackedChangeNode extends ElementNode {
  __author: string;
  __date: number;

  constructor(info: ChangeInfo, key?: NodeKey) {
    super(key);
    this.__author = info.author;
    this.__date = info.date;
  }

  getInfo(): ChangeInfo {
    const self = this.getLatest();
    return { author: self.__author, date: self.__date };
  }

  exportJSON(): SerializedTrackedChangeNode {
    return { ...super.exportJSON(), author: this.__author, date: this.__date };
  }

  updateDOM(prev: this, dom: HTMLElement): boolean {
    if (prev.__author !== this.__author || prev.__date !== this.__date) {
      dom.title = describe(this.getType() === 'tracked-insert' ? 'Inserted' : 'Deleted', this.getInfo());
    }
    return false;
  }

  isInline(): true {
    return true;
  }

  canBeEmpty(): false {
    return false;
  }

  // Typing next to a change (with tracking off) must not become part of it.
  canInsertTextBefore(): false {
    return false;
  }

  canInsertTextAfter(): false {
    return false;
  }

  extractWithChild(): boolean {
    return true;
  }
}

function infoFromElement(element: HTMLElement): ChangeInfo {
  const date = Date.parse(element.getAttribute('datetime') ?? '');
  return { author: element.getAttribute('data-author') ?? element.getAttribute('cite') ?? '', date: Number.isNaN(date) ? Date.now() : date };
}

export class TrackedInsertNode extends TrackedChangeNode {
  /** Type-level marker so TypeScript can tell the two change kinds apart. */
  declare readonly __changeKind: 'insert';

  static getType(): string {
    return 'tracked-insert';
  }

  static clone(node: TrackedInsertNode): TrackedInsertNode {
    return new TrackedInsertNode({ author: node.__author, date: node.__date }, node.__key);
  }

  static importJSON(json: SerializedTrackedChangeNode): TrackedInsertNode {
    return $createTrackedInsertNode({ author: json.author, date: json.date }).updateFromJSON(json);
  }

  static importDOM(): DOMConversionMap | null {
    return {
      ins: () => ({
        conversion: (element: HTMLElement): DOMConversionOutput => ({ node: $createTrackedInsertNode(infoFromElement(element)) }),
        priority: 1,
      }),
    };
  }

  createDOM(config: EditorConfig): HTMLElement {
    const element = document.createElement('ins');
    element.className = config.theme.trackedInsert ?? 'kw-tracked-insert';
    element.title = describe('Inserted', this.getInfo());
    return element;
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement('ins');
    element.setAttribute('data-author', this.__author);
    element.setAttribute('datetime', new Date(this.__date).toISOString());
    return { element };
  }
}

export class TrackedDeleteNode extends TrackedChangeNode {
  declare readonly __changeKind: 'delete';

  static getType(): string {
    return 'tracked-delete';
  }

  static clone(node: TrackedDeleteNode): TrackedDeleteNode {
    return new TrackedDeleteNode({ author: node.__author, date: node.__date }, node.__key);
  }

  static importJSON(json: SerializedTrackedChangeNode): TrackedDeleteNode {
    return $createTrackedDeleteNode({ author: json.author, date: json.date }).updateFromJSON(json);
  }

  static importDOM(): DOMConversionMap | null {
    return {
      del: () => ({
        conversion: (element: HTMLElement): DOMConversionOutput => ({ node: $createTrackedDeleteNode(infoFromElement(element)) }),
        priority: 1,
      }),
    };
  }

  createDOM(config: EditorConfig): HTMLElement {
    const element = document.createElement('del');
    element.className = config.theme.trackedDelete ?? 'kw-tracked-delete';
    element.title = describe('Deleted', this.getInfo());
    return element;
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement('del');
    element.setAttribute('data-author', this.__author);
    element.setAttribute('datetime', new Date(this.__date).toISOString());
    return { element };
  }
}

export function $createTrackedInsertNode(info: ChangeInfo): TrackedInsertNode {
  return $applyNodeReplacement(new TrackedInsertNode(info));
}

export function $createTrackedDeleteNode(info: ChangeInfo): TrackedDeleteNode {
  return $applyNodeReplacement(new TrackedDeleteNode(info));
}

export function $isTrackedInsertNode(node: LexicalNode | null | undefined): node is TrackedInsertNode {
  return node instanceof TrackedInsertNode;
}

export function $isTrackedDeleteNode(node: LexicalNode | null | undefined): node is TrackedDeleteNode {
  return node instanceof TrackedDeleteNode;
}

export function $isTrackedChangeNode(node: LexicalNode | null | undefined): node is TrackedInsertNode | TrackedDeleteNode {
  return $isTrackedInsertNode(node) || $isTrackedDeleteNode(node);
}
