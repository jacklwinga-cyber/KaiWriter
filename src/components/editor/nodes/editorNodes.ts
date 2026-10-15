import type { Klass, LexicalNode } from 'lexical';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import { TableCellNode, TableNode, TableRowNode } from '@lexical/table';
import { ListItemNode, ListNode } from '@lexical/list';
import { AutoLinkNode, LinkNode } from '@lexical/link';
import { ImageNode } from './ImageNode';
import { PageBreakNode } from './PageBreakNode';
import { TrackedDeleteNode, TrackedInsertNode } from './TrackedChangeNodes';

/** Every node type a KaiWriter document can contain. */
export const EDITOR_NODES: Array<Klass<LexicalNode>> = [
  HeadingNode, QuoteNode, ListNode, ListItemNode,
  LinkNode, AutoLinkNode, TableNode, TableCellNode, TableRowNode, ImageNode, PageBreakNode,
  TrackedInsertNode, TrackedDeleteNode,
];
