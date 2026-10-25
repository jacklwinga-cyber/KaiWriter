import { useEffect, useRef } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { copyToClipboard } from '@lexical/clipboard';
import { mergeRegister } from '@lexical/utils';
import {
  $addUpdateTag,
  $getSelection,
  $isRangeSelection,
  HISTORY_MERGE_TAG,
  BEFORE_INPUT_COMMAND,
  COMMAND_PRIORITY_EDITOR,
  COMMAND_PRIORITY_HIGH,
  CONTROLLED_TEXT_INSERTION_COMMAND,
  CUT_COMMAND,
  DELETE_CHARACTER_COMMAND,
  DELETE_LINE_COMMAND,
  DELETE_WORD_COMMAND,
  PASTE_COMMAND,
  REMOVE_TEXT_COMMAND,
} from 'lexical';
import {
  $acceptChange,
  $deleteTracked,
  $findAdjacentChange,
  $getAllChanges,
  $getChangesAtSelection,
  $insertTrackedText,
  $markRangeDeleted,
  $rejectChange,
  $selectChange,
  ACCEPT_CHANGE_COMMAND,
  NAVIGATE_CHANGE_COMMAND,
  REJECT_CHANGE_COMMAND,
  type ChangeTarget,
  type TrackedChange,
} from '../trackChanges';

interface TrackChangesPluginProps {
  /** Record edits as tracked changes. Accept/reject work either way. */
  enabled: boolean;
  author: string;
  onChangeCount?: (count: number) => void;
}

/** Text an input event inserts, if it is a plain text insertion we should track. */
function insertedText(event: InputEvent): string | null {
  if (event.inputType === 'insertText' || event.inputType === 'insertReplacementText' || event.inputType === 'insertFromYank') {
    const text = event.data ?? event.dataTransfer?.getData('text/plain') ?? null;
    return text && text !== '\n' ? text : null;
  }
  return null;
}

export function TrackChangesPlugin({ enabled, author, onChangeCount }: TrackChangesPluginProps) {
  const [editor] = useLexicalComposerContext();
  const settings = useRef({ enabled, author });
  useEffect(() => {
    settings.current = { enabled, author };
  }, [enabled, author]);

  // Tracked editing: only while enabled.
  useEffect(() => {
    const info = () => ({ author: settings.current.author, date: Date.now() });
    const tracking = () => settings.current.enabled;
    // Like normal typing, keystrokes in quick succession form one undo step.
    let lastInsertAt = 0;

    const insertText = (text: string, targetRange: StaticRange | null) => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return false;
      if (targetRange && !targetRange.collapsed) selection.applyDOMRange(targetRange);
      const now = Date.now();
      if (selection.isCollapsed() && now - lastInsertAt < 1000) $addUpdateTag(HISTORY_MERGE_TAG);
      lastInsertAt = now;
      $insertTrackedText(selection, text, info());
      return true;
    };

    const deleteWith = (granularity: 'character' | 'word' | 'lineboundary') => (isBackward: boolean) => {
      if (!tracking()) return false;
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return false; // e.g. an image is selected: delete normally
      lastInsertAt = 0;
      $deleteTracked(selection, isBackward, granularity, info());
      return true;
    };

    return mergeRegister(
      editor.registerCommand(
        BEFORE_INPUT_COMMAND,
        (event) => {
          if (!tracking() || editor.isComposing()) return false;
          const text = insertedText(event);
          if (text === null) return false;
          event.preventDefault();
          return insertText(text, event.getTargetRanges?.()[0] ?? null);
        },
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        CONTROLLED_TEXT_INSERTION_COMMAND,
        (payload) => {
          if (!tracking() || editor.isComposing()) return false;
          const text = typeof payload === 'string' ? payload : insertedText(payload);
          if (!text) return false;
          return insertText(text, null);
        },
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(DELETE_CHARACTER_COMMAND, deleteWith('character'), COMMAND_PRIORITY_HIGH),
      editor.registerCommand(DELETE_WORD_COMMAND, deleteWith('word'), COMMAND_PRIORITY_HIGH),
      editor.registerCommand(DELETE_LINE_COMMAND, deleteWith('lineboundary'), COMMAND_PRIORITY_HIGH),
      editor.registerCommand(
        REMOVE_TEXT_COMMAND,
        () => {
          if (!tracking()) return false;
          const selection = $getSelection();
          if (!$isRangeSelection(selection) || selection.isCollapsed()) return false;
          $markRangeDeleted(selection, info(), true);
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        CUT_COMMAND,
        (event) => {
          if (!tracking()) return false;
          const selection = $getSelection();
          if (!$isRangeSelection(selection) || selection.isCollapsed()) return false;
          const clipboardEvent = event instanceof ClipboardEvent ? event : null;
          void copyToClipboard(editor, clipboardEvent).then(() => {
            editor.update(() => {
              const current = $getSelection();
              if ($isRangeSelection(current)) $markRangeDeleted(current, info(), true);
            });
          });
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        PASTE_COMMAND,
        (event) => {
          if (!tracking()) return false;
          const text = event instanceof ClipboardEvent ? event.clipboardData?.getData('text/plain') : null;
          if (!text) return false;
          event.preventDefault();
          // Pasted while tracking: inserted as tracked plain text, line by line.
          editor.update(() => {
            text.replace(/\r\n?/g, '\n').split('\n').forEach((line, i) => {
              const selection = $getSelection();
              if (!$isRangeSelection(selection)) return;
              if (i > 0) selection.insertParagraph();
              const current = $getSelection();
              if (line && $isRangeSelection(current)) $insertTrackedText(current, line, info());
            });
          });
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
    );
  }, [editor]);

  // Reviewing: accept / reject / navigate.
  useEffect(() => {
    const review = (apply: (change: TrackedChange) => void) => (target: ChangeTarget) => {
      if (target === 'all') {
        $getAllChanges().forEach(apply);
        return true;
      }
      let changes = $getChangesAtSelection();
      if (!changes.length) {
        // Nothing at the cursor: act on the next change, like Word.
        const next = $findAdjacentChange('next');
        changes = next ? [next] : [];
      }
      changes.forEach(apply);
      const next = $findAdjacentChange('next');
      if (next) $selectChange(next);
      return true;
    };
    return mergeRegister(
      editor.registerCommand(ACCEPT_CHANGE_COMMAND, review($acceptChange), COMMAND_PRIORITY_EDITOR),
      editor.registerCommand(REJECT_CHANGE_COMMAND, review($rejectChange), COMMAND_PRIORITY_EDITOR),
      editor.registerCommand(
        NAVIGATE_CHANGE_COMMAND,
        (direction) => {
          const change = $findAdjacentChange(direction);
          if (change) $selectChange(change);
          return true;
        },
        COMMAND_PRIORITY_EDITOR,
      ),
    );
  }, [editor]);

  useEffect(() => {
    if (!onChangeCount) return;
    const report = () => editor.getEditorState().read(() => onChangeCount($getAllChanges().length));
    report();
    return editor.registerUpdateListener(report);
  }, [editor, onChangeCount]);

  return null;
}
