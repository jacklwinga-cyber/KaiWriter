import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useEffect, useRef } from 'react';
import { TOGGLE_FIND_REPLACE_COMMAND } from './FindReplacePlugin';

interface KeyboardShortcutsPluginProps {
  /** F7, as in Word: open Spelling & Grammar. */
  onProofread?: () => void;
  /** Alt+F7 (Option+F7): open Rewrite for the selection. */
  onRewrite?: () => void;
}

export function KeyboardShortcutsPlugin({ onProofread, onRewrite }: KeyboardShortcutsPluginProps = {}) {
  const [editor] = useLexicalComposerContext();
  const handlers = useRef({ onProofread, onRewrite });
  useEffect(() => {
    handlers.current = { onProofread, onRewrite };
  }, [onProofread, onRewrite]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'F7' && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
        const handler = event.altKey ? handlers.current.onRewrite : handlers.current.onProofread;
        if (handler) {
          event.preventDefault();
          handler();
        }
        return;
      }

      const mod = event.metaKey || event.ctrlKey;
      if (!mod) return;

      if (event.key === 'f' || event.key === 'F') {
        event.preventDefault();
        editor.dispatchCommand(TOGGLE_FIND_REPLACE_COMMAND, undefined);
      }

      if (event.key === 's' || event.key === 'S') {
        event.preventDefault();
        // Auto-save handles persistence; prevent browser save dialog
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [editor]);

  return null;
}
