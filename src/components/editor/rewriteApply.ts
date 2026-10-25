/**
 * Putting an AI rewrite into the document (run inside editor.update()).
 *
 * Both operations first check that the text at the range is still what was
 * sent for rewriting, so a rewrite never lands on text that changed in the
 * meantime. With track changes on, the replaced text is marked deleted and
 * the new text marked inserted, so the rewrite can be reviewed like any edit.
 */
import {
  $createParagraphNode,
  $createTextNode,
  $getSelection,
  $isRangeSelection,
  type RangeSelection,
} from 'lexical';
import { $findMatchingParent } from '@lexical/utils';
import { buildPlainTextMap, selectPlainTextRange } from '../../lib/plainTextMap';
import { $insertTrackedText } from './trackChanges';
import { $createTrackedInsertNode, $isTrackedInsertNode, type ChangeInfo } from './nodes/TrackedChangeNodes';

/** Split rewrite text into paragraphs (blank lines or single line breaks), dropping empty ones. */
export function rewriteParagraphs(text: string): string[] {
  return text.split(/\n+/).map((p) => p.trim()).filter(Boolean);
}

function currentRangeSelection(): RangeSelection | null {
  const selection = $getSelection();
  return $isRangeSelection(selection) ? selection : null;
}

/**
 * Replace plain-text range [start, end) with `paragraphs`. Returns false,
 * changing nothing, if the text there is no longer `expected`.
 */
export function $replaceRangeWithRewrite(
  start: number,
  end: number,
  expected: string,
  paragraphs: string[],
  track?: ChangeInfo,
): boolean {
  if (!paragraphs.length || end <= start) return false;
  const map = buildPlainTextMap();
  if (map.text.slice(start, end) !== expected) return false;
  // Leave out paragraph breaks at either end of the range (a selection that
  // starts at the end of a paragraph, or ends at the start of the next one).
  const from = start + (expected.length - expected.replace(/^\n+/, '').length);
  const to = start + expected.replace(/\n+$/, '').length;
  if (to <= from || !map.segments.some((s) => from >= s.start && from < s.end)) return false;
  selectPlainTextRange(map, from, to - from);
  let selection = currentRangeSelection();
  if (!selection || selection.isCollapsed()) return false;

  for (let i = 0; i < paragraphs.length; i += 1) {
    if (!selection) return false;
    if (i > 0) {
      selection.insertParagraph();
      selection = currentRangeSelection();
      if (!selection) return false;
    }
    if (track) {
      $insertTrackedText(selection, paragraphs[i], track);
      // Step out of the insertion so a paragraph split happens between inline nodes.
      const after = currentRangeSelection();
      const insertion = after && $findMatchingParent(after.anchor.getNode(), $isTrackedInsertNode);
      if (insertion && i < paragraphs.length - 1) insertion.selectNext(0, 0);
    } else {
      selection.insertText(paragraphs[i]);
    }
    selection = currentRangeSelection();
  }
  return true;
}

/**
 * Insert `paragraphs` as new paragraphs after the block that contains the
 * end of plain-text range [start, end) (e.g. a summary below the selection).
 * Returns false if the text at the range is no longer `expected`.
 */
export function $insertRewriteAfterRange(
  start: number,
  end: number,
  expected: string,
  paragraphs: string[],
  track?: ChangeInfo,
): boolean {
  if (!paragraphs.length || end <= start) return false;
  const map = buildPlainTextMap();
  if (map.text.slice(start, end) !== expected) return false;
  const lastChar = start + expected.replace(/\n+$/, '').length;
  const segment = [...map.segments].reverse().find((s) => s.start < lastChar);
  if (!segment) return false;

  let after = segment.node.getTopLevelElementOrThrow();
  for (const text of paragraphs) {
    const paragraph = $createParagraphNode();
    const node = $createTextNode(text);
    if (track) paragraph.append($createTrackedInsertNode(track).append(node));
    else paragraph.append(node);
    after.insertAfter(paragraph);
    after = paragraph;
  }
  after.selectEnd();
  return true;
}
