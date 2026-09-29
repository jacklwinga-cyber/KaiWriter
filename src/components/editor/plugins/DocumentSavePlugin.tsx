import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useEffect, useRef, useCallback } from 'react';
import { useEditorChrome } from '../../../contexts/EditorChromeContext';
import { saveDocument, setOnSyncStatusChange, type StoredDocument } from '../../../lib/documentStore';
import { maybeAutoSaveVersion } from '../../../lib/versionStore';
import {
  clearRecoverySnapshot,
  RECOVERY_INTERVAL_MS,
  saveRecoverySnapshot,
} from '../../../lib/recoveryStore';

import { debounce, type DebouncedFn } from '../../../lib/debounce';

const DEBOUNCE_MS = 800;

interface DocumentSavePluginProps {
  documentId: string;
  documentName: string;
  templateId?: string;
  isPro?: boolean;
  branding?: import('../../../lib/branding').DocumentBranding;
}

export function DocumentSavePlugin({
  documentId,
  documentName,
  templateId,
  isPro = false,
  branding,
}: DocumentSavePluginProps) {
  const [editor] = useLexicalComposerContext();
  const { setSaveStatus, setSyncStatus } = useEditorChrome();

  // ── Stable refs for values that shouldn't re-create the debounce function ──
  // Previously documentName/branding were in the useCallback dep array, so any
  // rename caused the debounced function to be recreated and the timer to reset,
  // silently delaying saves during rename+type sequences.
  const nameRef = useRef(documentName);
  useEffect(() => { nameRef.current = documentName; }, [documentName]);

  const brandingRef = useRef(branding);
  useEffect(() => { brandingRef.current = branding; }, [branding]);

  const isProRef = useRef(isPro);
  useEffect(() => { isProRef.current = isPro; }, [isPro]);

  // ── Register cloud sync status callback (P0-C3) ──
  // Connects documentStore's fire-and-forget cloud push to the UI sync indicator.
  // Cleaned up on unmount so stale callbacks can't update unmounted state.
  useEffect(() => {
    setOnSyncStatusChange(setSyncStatus);
    return () => setOnSyncStatusChange(null);
  }, [setSyncStatus]);

  // ── Core persist function — stable identity, reads fresh values via refs ──
  const persistFn = useCallback(async (content: string) => {
    const doc: StoredDocument = {
      id: documentId,
      name: nameRef.current,
      lastModified: Date.now(),
      content,
      templateId,
      branding: brandingRef.current,
    };
    try {
      await saveDocument(doc);
      if (isProRef.current) {
        void maybeAutoSaveVersion(documentId, nameRef.current, content);
      }
      // Clear crash-recovery snapshot — document is safely persisted
      clearRecoverySnapshot(documentId);
      setSaveStatus('saved');
    } catch (err) {
      console.error('[KaiWriter] autosave failed:', err);
      setSaveStatus('error');
    }
  }, [documentId, templateId, setSaveStatus]);

  // ── Debounced wrapper — stable identity across renders ──
  const debouncedPersist = useRef<DebouncedFn<(content: string) => void> | null>(null);
  useEffect(() => {
    const current = debounce(persistFn, DEBOUNCE_MS);
    debouncedPersist.current = current;
    // When the document changes (persistFn identity) or the editor unmounts, save any
    // queued edit now. Otherwise the stale timer fires later and saves the previous
    // document under the new document's name (nameRef has moved on by then).
    // Cleanups run before the nameRef effect updates, so the old name is still current.
    return () => current.flushPending();
  }, [persistFn]);

  // ── Register editor update listener ──
  useEffect(() => {
    return editor.registerUpdateListener(({ editorState, dirtyElements, dirtyLeaves }) => {
      if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return;
      setSaveStatus('saving');
      const content = JSON.stringify(editorState.toJSON());
      debouncedPersist.current?.(content);
    });
  }, [editor, setSaveStatus]);

  // ── beforeunload: flush debounce immediately, write localStorage emergency backup ──
  useEffect(() => {
    const handleBeforeUnload = () => {
      const state = editor.getEditorState();
      const content = JSON.stringify(state.toJSON());
      // Flush the debounced IDB write (best-effort async)
      debouncedPersist.current?.flush(content);
      // Synchronous localStorage backup survives crashes where async IDB may not
      saveRecoverySnapshot({
        documentId,
        name: nameRef.current,
        content,
        savedAt: Date.now(),
        snapshotAt: Date.now(),
      });
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [editor, documentId]);

  // ── 30-second crash-recovery interval ──
  useEffect(() => {
    const interval = setInterval(() => {
      const state = editor.getEditorState();
      const content = JSON.stringify(state.toJSON());
      saveRecoverySnapshot({
        documentId,
        name: nameRef.current,
        content,
        savedAt: Date.now(),
        snapshotAt: Date.now(),
      });
    }, RECOVERY_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [editor, documentId]);

  return null;
}
