/**
 * Track changes editing operations (run inside editor.update()).
 *
 * With tracking on, typed text is wrapped in a TrackedInsertNode and deleted
 * text is wrapped in a TrackedDeleteNode instead of being removed. Deleting
 * text that is itself a pending insertion just removes it, as in Word.
 *
 * Paragraph structure (Enter, joining paragraphs) and formatting changes are
 * not tracked.
 */
import { $dfs, $findMatchingParent } from '@lexical/utils';
import {
  $createRangeSelection,
  $createTextNode,
  $getSelection,
  $isElementNode,
  $isLineBreakNode,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
  createCommand,
  type ElementNode,
  type LexicalCommand,
  type LexicalNode,
  type RangeSelection,
} from 'lexical';
import {
  $createTrackedDeleteNode,
  $createTrackedInsertNode,
  $isTrackedChangeNode,
  $isTrackedDeleteNode,
  $isTrackedInsertNode,
  type ChangeInfo,
  type TrackedDeleteNode,
  type TrackedInsertNode,
} from './nodes/TrackedChangeNodes';

export type TrackedChange = TrackedInsertNode | TrackedDeleteNode;

function trackedAncestor(node: LexicalNode): TrackedChange | null {
  return $findMatchingParent(node, $isTrackedChangeNode) as TrackedChange | null;
}

/** The block (paragraph, heading, list item…) a node sits in. */
function blockOf(node: LexicalNode): ElementNode | null {
  return $findMatchingParent(node, (n) => $isElementNode(n) && !n.isInline()) as ElementNode | null;
}

/**
 * Mark the selected text as deleted. Afterwards the selection is collapsed
 * before the deleted text (collapseToStart) or after it.
 */
export function $markRangeDeleted(selection: RangeSelection, info: ChangeInfo, collapseToStart: boolean): void {
  if (selection.isCollapsed()) return;
  const leaves = selection.extract().filter((n) => $isTextNode(n) || $isLineBreakNode(n));
  const deleteNodes: TrackedDeleteNode[] = [];

  for (const leaf of leaves) {
    const change = trackedAncestor(leaf);
    if ($isTrackedDeleteNode(change)) {
      deleteNodes.push(change);
      continue;
    }
    if ($isTrackedInsertNode(change)) continue; // removed in the second pass

    const prev = leaf.getPreviousSibling();
    if ($isTrackedDeleteNode(prev) && prev.getInfo().author === info.author) {
      prev.append(leaf);
      deleteNodes.push(prev);
    } else {
      const del = $createTrackedDeleteNode(info);
      leaf.insertBefore(del);
      del.append(leaf);
      deleteNodes.push(del);
    }
    // Join with a following deletion by the same author.
    const del = deleteNodes[deleteNodes.length - 1];
    const next = del.getNextSibling();
    if ($isTrackedDeleteNode(next) && next.getInfo().author === info.author) {
      del.append(...next.getChildren());
      next.remove();
    }
  }

  // Deleting a pending insertion removes it outright.
  for (const leaf of leaves) {
    const change = trackedAncestor(leaf);
    if (!$isTrackedInsertNode(change) || !leaf.isAttached()) continue;
    leaf.remove();
    if (change.getChildrenSize() === 0) change.remove();
  }

  const attached = deleteNodes.filter((n) => n.isAttached());
  if (!attached.length) return; // only inserted text was removed; Lexical already moved the caret
  if (collapseToStart) attached[0].selectPrevious();
  else attached[attached.length - 1].selectNext(0, 0);
}

/** The node right before a collapsed caret, if any. */
function nodeBeforeCaret(selection: RangeSelection): LexicalNode | null {
  const { anchor } = selection;
  const node = anchor.getNode();
  if (anchor.type === 'text') return anchor.offset === 0 ? node.getPreviousSibling() : null;
  return $isElementNode(node) ? node.getChildAtIndex(anchor.offset - 1) : null;
}

/** Insert text as a tracked insertion (replacing, i.e. deleting, any selected text). */
export function $insertTrackedText(selection: RangeSelection, text: string, info: ChangeInfo): void {
  if (!text) return;
  if (!selection.isCollapsed()) {
    $markRangeDeleted(selection, info, false);
    const next = $getSelection();
    if (!$isRangeSelection(next)) return;
    selection = next;
  }

  const anchorNode = selection.anchor.getNode();
  const change = trackedAncestor(anchorNode);

  // Typing inside a pending insertion just extends it. (selection.insertText
  // would put text typed at its end outside it: change nodes refuse text after them.)
  if ($isTrackedInsertNode(change) && $isTextNode(anchorNode) && selection.anchor.type === 'text') {
    anchorNode.spliceText(selection.anchor.offset, 0, text, true);
    return;
  }
  // Never type into deleted text: continue after it.
  if ($isTrackedDeleteNode(change)) {
    change.selectNext(0, 0);
    const next = $getSelection();
    if (!$isRangeSelection(next)) return;
    selection = next;
  }

  // Right after our own insertion: extend it.
  const before = nodeBeforeCaret(selection);
  if ($isTrackedInsertNode(before) && before.getInfo().author === info.author) {
    const last = before.getLastDescendant();
    if ($isTextNode(last)) {
      last.spliceText(last.getTextContentSize(), 0, text, true);
      return;
    }
  }

  const textNode = $createTextNode(text);
  textNode.setFormat(selection.format);
  textNode.setStyle(selection.style);
  const insertion = $createTrackedInsertNode(info);
  insertion.append(textNode);
  selection.insertNodes([insertion]);
  textNode.select(text.length, text.length);
}

/**
 * Tracked Backspace/Delete: extends the caret by one unit and marks that text
 * deleted. At the start/end of a paragraph the caret just moves to the
 * neighbouring paragraph (joining paragraphs isn't tracked).
 */
export function $deleteTracked(
  selection: RangeSelection,
  isBackward: boolean,
  granularity: 'character' | 'word' | 'lineboundary',
  info: ChangeInfo,
): void {
  if (selection.isCollapsed()) {
    selection.modify('extend', isBackward, granularity);
    if (selection.isCollapsed()) return;
    const anchorBlock = blockOf(selection.anchor.getNode());
    const focusBlock = blockOf(selection.focus.getNode());
    if (anchorBlock !== focusBlock) {
      const point = selection.focus;
      const moved = $createRangeSelection();
      moved.anchor.set(point.key, point.offset, point.type);
      moved.focus.set(point.key, point.offset, point.type);
      $setSelection(moved);
      return;
    }
  }
  $markRangeDeleted(selection, info, isBackward);
}

function unwrap(node: TrackedChange): void {
  for (const child of node.getChildren()) node.insertBefore(child);
  node.remove();
}

export function $acceptChange(node: TrackedChange): void {
  if ($isTrackedInsertNode(node)) unwrap(node);
  else node.remove();
}

export function $rejectChange(node: TrackedChange): void {
  if ($isTrackedInsertNode(node)) node.remove();
  else unwrap(node);
}

/** All pending changes, in document order. */
export function $getAllChanges(): TrackedChange[] {
  return $dfs()
    .map(({ node }) => node)
    .filter($isTrackedChangeNode) as TrackedChange[];
}

/** Changes touching the selection (or containing the caret). */
export function $getChangesAtSelection(): TrackedChange[] {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return [];
  const found = new Map<string, TrackedChange>();
  for (const node of [selection.anchor.getNode(), ...selection.getNodes()]) {
    const change = $isTrackedChangeNode(node) ? node : trackedAncestor(node);
    if (change) found.set(change.getKey(), change);
  }
  return [...found.values()];
}

/** Select the whole text of a change, so the next accept/reject applies to it. */
export function $selectChange(change: TrackedChange): void {
  const first = change.getFirstDescendant();
  const last = change.getLastDescendant();
  if (!$isTextNode(first) || !$isTextNode(last)) {
    change.select(0, change.getChildrenSize());
    return;
  }
  const selection = $createRangeSelection();
  selection.anchor.set(first.getKey(), 0, 'text');
  selection.focus.set(last.getKey(), last.getTextContentSize(), 'text');
  $setSelection(selection);
}

/** The change after (or before) the caret, wrapping around the document. */
export function $findAdjacentChange(direction: 'next' | 'previous'): TrackedChange | null {
  const changes = $getAllChanges();
  if (!changes.length) return null;
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return changes[0];
  const caret = (direction === 'next' ? (selection.isBackward() ? selection.anchor : selection.focus) : (selection.isBackward() ? selection.focus : selection.anchor)).getNode();
  const current = trackedAncestor(caret);
  if (direction === 'next') {
    return changes.find((c) => c !== current && caret.isBefore(c)) ?? changes[0];
  }
  const before = changes.filter((c) => c !== current && c.isBefore(caret) && !caret.isBefore(c));
  return before[before.length - 1] ?? changes[changes.length - 1];
}

export type ChangeTarget = 'current' | 'all';

/** Accept the change(s) at the selection ('current') or every change ('all'). */
export const ACCEPT_CHANGE_COMMAND: LexicalCommand<ChangeTarget> = createCommand('ACCEPT_CHANGE_COMMAND');
export const REJECT_CHANGE_COMMAND: LexicalCommand<ChangeTarget> = createCommand('REJECT_CHANGE_COMMAND');
/** Select the next/previous change. */
export const NAVIGATE_CHANGE_COMMAND: LexicalCommand<'next' | 'previous'> = createCommand('NAVIGATE_CHANGE_COMMAND');
