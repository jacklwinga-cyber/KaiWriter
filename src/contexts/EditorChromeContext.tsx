import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  UNDO_COMMAND,
  REDO_COMMAND,
  CAN_UNDO_COMMAND,
  CAN_REDO_COMMAND,
  COMMAND_PRIORITY_LOW,
} from 'lexical';

export type SaveStatus = 'saved' | 'saving' | 'unsaved';

interface EditorChromeContextValue {
  canUndo: boolean;
  canRedo: boolean;
  saveStatus: SaveStatus;
  undo: () => void;
  redo: () => void;
  setSaveStatus: (status: SaveStatus) => void;
}

const EditorChromeContext = createContext<EditorChromeContextValue | null>(null);

export function EditorChromeProvider({ children }: { children: React.ReactNode }) {
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [editorRef, setEditorRef] = useState<ReturnType<typeof useLexicalComposerContext>[0] | null>(null);

  const undo = useCallback(() => {
    editorRef?.dispatchCommand(UNDO_COMMAND, undefined);
  }, [editorRef]);

  const redo = useCallback(() => {
    editorRef?.dispatchCommand(REDO_COMMAND, undefined);
  }, [editorRef]);

  return (
    <EditorChromeContext.Provider value={{ canUndo, canRedo, saveStatus, undo, redo, setSaveStatus }}>
      <EditorChromeRegistrar
        onEditor={(editor) => setEditorRef(editor)}
        onCanUndoChange={setCanUndo}
        onCanRedoChange={setCanRedo}
      />
      {children}
    </EditorChromeContext.Provider>
  );
}

function EditorChromeRegistrar({
  onEditor,
  onCanUndoChange,
  onCanRedoChange,
}: {
  onEditor: (editor: ReturnType<typeof useLexicalComposerContext>[0]) => void;
  onCanUndoChange: (v: boolean) => void;
  onCanRedoChange: (v: boolean) => void;
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    onEditor(editor);
  }, [editor, onEditor]);

  useEffect(() => {
    return editor.registerCommand(
      CAN_UNDO_COMMAND,
      (payload) => {
        onCanUndoChange(payload);
        return false;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor, onCanUndoChange]);

  useEffect(() => {
    return editor.registerCommand(
      CAN_REDO_COMMAND,
      (payload) => {
        onCanRedoChange(payload);
        return false;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor, onCanRedoChange]);

  return null;
}

export function useEditorChrome() {
  const ctx = useContext(EditorChromeContext);
  if (!ctx) {
    throw new Error('useEditorChrome must be used within EditorChromeProvider');
  }
  return ctx;
}

/** Optional hook for components outside LexicalComposer (returns null). */
export function useEditorChromeOptional() {
  return useContext(EditorChromeContext);
}
