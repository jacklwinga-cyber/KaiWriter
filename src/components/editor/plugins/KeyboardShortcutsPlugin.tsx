import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useEffect } from 'react';
import { TOGGLE_FIND_REPLACE_COMMAND } from './FindReplacePlugin';

export function KeyboardShortcutsPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
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
