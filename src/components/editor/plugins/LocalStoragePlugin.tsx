import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useEffect, useCallback } from 'react';

// Debounce helper to avoid saving on every keystroke
function debounce(func: Function, wait: number) {
  let timeout: ReturnType<typeof setTimeout> | null;
  return function executedFunction(...args: any[]) {
    const later = () => {
      clearTimeout(timeout as any);
      func(...args);
    };
    clearTimeout(timeout as any);
    timeout = setTimeout(later, wait);
  };
}

export function LocalStoragePlugin({ namespace }: { namespace: string }) {
  const [editor] = useLexicalComposerContext();

  const saveState = useCallback(
    debounce((stateString: string) => {
      localStorage.setItem(namespace, stateString);
    }, 1000),
    [namespace]
  );

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState, dirtyElements, dirtyLeaves }) => {
      // Don't save if there are no real document changes
      if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return;
      
      const serializedState = JSON.stringify(editorState.toJSON());
      let meta = { id: namespace, name: 'Untitled Document', lastModified: Date.now(), content: serializedState };
      try {
        const existing = localStorage.getItem(namespace);
        if (existing) {
          const parsed = JSON.parse(existing);
          if (parsed.name) meta.name = parsed.name;
        }
      } catch (e) {}
      saveState(JSON.stringify(meta));
    });
  }, [editor, saveState]);

  return null;
}
