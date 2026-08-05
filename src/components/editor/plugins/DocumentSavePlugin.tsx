import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useEffect, useCallback } from 'react';
import { useEditorChrome } from '../../../contexts/EditorChromeContext';
import { saveDocument, type StoredDocument } from '../../../lib/documentStore';
import { maybeAutoSaveVersion } from '../../../lib/versionStore';

function debounce<T extends (...args: Parameters<T>) => void>(func: T, wait: number) {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

interface DocumentSavePluginProps {
  documentId: string;
  documentName: string;
  templateId?: string;
  isPro?: boolean;
  branding?: import('../../../lib/branding').DocumentBranding;
}

export function DocumentSavePlugin({ documentId, documentName, templateId, isPro = false, branding }: DocumentSavePluginProps) {
  const [editor] = useLexicalComposerContext();
  const { setSaveStatus } = useEditorChrome();

  const persist = useCallback(
    debounce(async (content: string) => {
      const doc: StoredDocument = {
        id: documentId,
        name: documentName,
        lastModified: Date.now(),
        content,
        templateId,
        branding,
      };
      await saveDocument(doc);
      if (isPro) {
        void maybeAutoSaveVersion(documentId, documentName, content);
      }
      setSaveStatus('saved');
    }, 800),
    [documentId, documentName, templateId, setSaveStatus, isPro, branding],
  );

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState, dirtyElements, dirtyLeaves }) => {
      if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return;
      setSaveStatus('saving');
      const serialized = JSON.stringify(editorState.toJSON());
      void persist(serialized);
    });
  }, [editor, persist, setSaveStatus]);

  return null;
}
