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
import { DOCUMENT_UPDATED_EVENT, type DocumentUpdatedDetail } from '../../../lib/syncOutbox';

const DEBOUNCE_MS = 800;
/** Update tag for content loaded from another device, so it isn't saved back as a local edit. */
const REMOTE_UPDATE_TAG = 'kaiwriter-remote-update';

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

  // Latest editor content not yet persisted to IDB; null when everything is saved.
  // Recovery snapshots are only written while this is set, so a clean document
  // never leaves a snapshot behind that would trigger a false recovery banner.
  const unsavedContentRef = useRef<string | null>(null);

  // Set when another device's version arrived while this editor had unsaved
  // edits. The next save is then sent against the old cloud base, so the push
  // detects the conflict and keeps both versions instead of overwriting one.
  const divergedBaseRef = useRef<{ base: number | undefined } | null>(null);

  // Content as last loaded or saved. Lexical fires a dirty update when the
  // editor mounts even though nothing changed; saving that would bump
  // lastModified on every open and upload stale content to the cloud.
  const savedContentRef = useRef<string | null>(null);
  useEffect(() => {
    savedContentRef.current = JSON.stringify(editor.getEditorState().toJSON());
  }, [editor, documentId]);

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
    if (divergedBaseRef.current) {
      doc.cloudLastModified = divergedBaseRef.current.base;
      divergedBaseRef.current = null;
    }
    try {
      await saveDocument(doc);
      if (isProRef.current) {
        void maybeAutoSaveVersion(documentId, nameRef.current, content);
      }
      savedContentRef.current = content;
      // Clear crash-recovery snapshot once the latest edit is safely persisted
      if (unsavedContentRef.current === content) {
        unsavedContentRef.current = null;
        clearRecoverySnapshot(documentId);
      }
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
    return () => {
      current.flushPending();
      unsavedContentRef.current = null;
    };
  }, [persistFn]);

  // ── Register editor update listener ──
  useEffect(() => {
    return editor.registerUpdateListener(({ editorState, dirtyElements, dirtyLeaves, tags }) => {
      if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return;
      if (tags.has(REMOTE_UPDATE_TAG)) return;
      const content = JSON.stringify(editorState.toJSON());
      if (unsavedContentRef.current === null && content === savedContentRef.current) return;
      setSaveStatus('saving');
      unsavedContentRef.current = content;
      debouncedPersist.current?.(content);
    });
  }, [editor, setSaveStatus]);

  // ── Live updates from the user's other devices ──
  useEffect(() => {
    const onDocumentUpdated = (event: Event) => {
      const detail = (event as CustomEvent<DocumentUpdatedDetail>).detail;
      if (detail.id !== documentId) return;
      if (unsavedContentRef.current !== null) {
        divergedBaseRef.current ??= { base: detail.previousBase };
        return;
      }
      try {
        editor.setEditorState(editor.parseEditorState(detail.content), { tag: REMOTE_UPDATE_TAG });
        savedContentRef.current = JSON.stringify(editor.getEditorState().toJSON());
      } catch (err) {
        console.error('[KaiWriter] could not load the updated document:', err);
      }
    };
    window.addEventListener(DOCUMENT_UPDATED_EVENT, onDocumentUpdated);
    return () => window.removeEventListener(DOCUMENT_UPDATED_EVENT, onDocumentUpdated);
  }, [editor, documentId]);

  // ── beforeunload: flush debounce immediately, write localStorage emergency backup ──
  useEffect(() => {
    const handleBeforeUnload = () => {
      const content = unsavedContentRef.current;
      if (content === null) return;
      // Flush the queued (or previously failed) IDB write (best-effort async)
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
  }, [documentId]);

  // ── 30-second crash-recovery interval ──
  useEffect(() => {
    const interval = setInterval(() => {
      const content = unsavedContentRef.current;
      if (content === null) return;
      saveRecoverySnapshot({
        documentId,
        name: nameRef.current,
        content,
        savedAt: Date.now(),
        snapshotAt: Date.now(),
      });
    }, RECOVERY_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [documentId]);

  return null;
}
