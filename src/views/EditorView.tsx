import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useEffect, useMemo, useState } from 'react';
import { Navigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthProvider';
import {
  downloadBlob,
  downloadText,
  exportFilename,
  lexicalToPlainText,
} from '../lib/exportPlainText';
import { ProUpgradeModal, VersionHistoryModal, BrandSettingsModal } from '../components/ui/Modals';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import { TableCellNode, TableNode, TableRowNode } from '@lexical/table';
import { ListItemNode, ListNode } from '@lexical/list';
import { AutoLinkNode, LinkNode } from '@lexical/link';

import { ImageNode } from '../components/editor/nodes/ImageNode';
import { MainLayout } from '../components/layout/MainLayout';
import { EditorCanvas } from '../components/editor/EditorCanvas';
import { ToolbarPlugin } from '../components/editor/ToolbarPlugin';
import { StylesSidebarPlugin } from '../components/editor/plugins/StylesSidebarPlugin';
import { FindReplacePlugin } from '../components/editor/plugins/FindReplacePlugin';
import { StatusBarPlugin } from '../components/editor/plugins/StatusBarPlugin';
import { NavigationSidebarPlugin } from '../components/editor/plugins/NavigationSidebarPlugin';
import { DocumentSavePlugin } from '../components/editor/plugins/DocumentSavePlugin';
import { KeyboardShortcutsPlugin } from '../components/editor/plugins/KeyboardShortcutsPlugin';
import { EditorChromeProvider, useEditorChrome } from '../contexts/EditorChromeContext';
import { CommentsSidebarPlugin } from '../components/editor/plugins/CommentsSidebarPlugin';
import { WritingAssistSidebarPlugin } from '../components/editor/plugins/WritingAssistSidebarPlugin';
import { BrandHeader } from '../components/editor/BrandHeader';
import type { DocumentBranding } from '../lib/branding';
import { getTemplateById, getTemplateContent } from '../data/templates';
import { EditorPreferencesProvider, useEditorPreferences } from '../contexts/EditorPreferencesContext';
import { KaiAssistModal } from '../components/ui/KaiAssistModal';
import {
  applyTemplateAssistToEditor,
  countPlaceholdersInEditor,
  requestTemplateAssist,
} from '../lib/aiTemplateAssist';
import { getPlainTextFromEditor } from '../lib/plainTextMap';
import { getDocument, migrateFromLocalStorage, saveDocument, updateDocumentName } from '../lib/documentStore';
import editorStyles from '../components/editor/Editor.module.css';

const editorTheme = {
  paragraph: editorStyles.paragraph,
  text: {
    bold: editorStyles.textBold,
    italic: editorStyles.textItalic,
    underline: editorStyles.textUnderline,
    strikethrough: editorStyles.textStrikethrough,
  },
  list: {
    ul: editorStyles.ul,
    ol: editorStyles.ol,
    listitem: editorStyles.listitem,
    nested: { listitem: editorStyles.nestedListItem },
    listitemChecked: editorStyles.listItemChecked,
    listitemUnchecked: editorStyles.listItemUnchecked,
  },
  table: editorStyles.table,
  tableCell: editorStyles.tableCell,
  tableCellHeader: editorStyles.tableCellHeader,
  tableRow: editorStyles.tableRow,
  image: editorStyles.image,
};

const EDITOR_NODES = [
  HeadingNode, QuoteNode, ListNode, ListItemNode,
  LinkNode, AutoLinkNode, TableNode, TableCellNode, TableRowNode, ImageNode,
];

function EditorWorkspace({
  documentId,
  templateId,
  initialEditorState,
  initialName,
  initialBranding,
}: {
  documentId: string;
  templateId?: string;
  initialEditorState?: string;
  initialName: string;
  initialBranding?: DocumentBranding;
}) {
  const [activeTab, setActiveTab] = useState('Home');
  const [documentName, setDocumentName] = useState(initialName);
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [pageSize, setPageSize] = useState('Letter');
  const [orientation, setOrientation] = useState('Portrait');
  const [margins, setMargins] = useState('Normal');

  const isLandscape = orientation === 'Landscape';
  const widthInches = pageSize === 'A4' ? 8.27 : 8.5;
  const heightInches = pageSize === 'A4' ? 11.69 : 11;
  const actualWidth = isLandscape ? heightInches : widthInches;
  const actualHeight = isLandscape ? widthInches : heightInches;
  const pageWidth = `${actualWidth * 96}px`;
  const pageHeight = `${actualHeight * 96}px`;
  const pagePadding = margins === 'Narrow' ? '48px' : margins === 'Wide' ? '144px' : '96px';

  const initialConfig = useMemo(() => ({
    namespace: 'KaiWriter',
    theme: editorTheme,
    editorState: initialEditorState,
    nodes: EDITOR_NODES,
    onError: (error: Error) => console.error(error),
  }), [initialEditorState]);

  const handleNameChange = (newName: string) => {
    setDocumentName(newName);
    void updateDocumentName(documentId, newName);
  };

  return (
    <EditorPreferencesProvider>
      <LexicalComposer initialConfig={initialConfig} key={documentId}>
        <EditorChromeProvider>
          <EditorLayout
          activeTab={activeTab}
          onTabChange={setActiveTab}
          documentName={documentName}
          onNameChange={handleNameChange}
          documentId={documentId}
          templateId={templateId}
          pageSize={pageSize}
          setPageSize={setPageSize}
          orientation={orientation}
          setOrientation={setOrientation}
          margins={margins}
          setMargins={setMargins}
          isLeftSidebarOpen={isLeftSidebarOpen}
          setIsLeftSidebarOpen={setIsLeftSidebarOpen}
          isRightSidebarOpen={isRightSidebarOpen}
          setIsRightSidebarOpen={setIsRightSidebarOpen}
          isFocusMode={isFocusMode}
          setIsFocusMode={setIsFocusMode}
          pageWidth={pageWidth}
          pageHeight={pageHeight}
          pagePadding={pagePadding}
          initialBranding={initialBranding}
        />
        </EditorChromeProvider>
      </LexicalComposer>
    </EditorPreferencesProvider>
  );
}

function EditorLayout({
  activeTab, onTabChange, documentName, onNameChange, documentId, templateId,
  pageSize, setPageSize, orientation, setOrientation, margins, setMargins,
  isLeftSidebarOpen, setIsLeftSidebarOpen, isRightSidebarOpen, setIsRightSidebarOpen,
  isFocusMode, setIsFocusMode, pageWidth, pageHeight, pagePadding, initialBranding,
}: {
  activeTab: string;
  onTabChange: (tab: string) => void;
  documentName: string;
  onNameChange: (name: string) => void;
  documentId: string;
  templateId?: string;
  pageSize: string;
  setPageSize: (s: string) => void;
  orientation: string;
  setOrientation: (s: string) => void;
  margins: string;
  setMargins: (s: string) => void;
  isLeftSidebarOpen: boolean;
  setIsLeftSidebarOpen: (v: boolean) => void;
  isRightSidebarOpen: boolean;
  setIsRightSidebarOpen: (v: boolean) => void;
  isFocusMode: boolean;
  setIsFocusMode: (v: boolean) => void;
  pageWidth: string;
  pageHeight: string;
  pagePadding: string;
  initialBranding?: DocumentBranding;
}) {
  const [editor] = useLexicalComposerContext();
  const { isPro, accessToken } = useAuth();
  const { zoom, viewMode } = useEditorPreferences();
  const { canUndo, canRedo, undo, redo, saveStatus } = useEditorChrome();
  const [isUpgradeOpen, setIsUpgradeOpen] = useState(false);
  const [isVersionHistoryOpen, setIsVersionHistoryOpen] = useState(false);
  const [isBrandSettingsOpen, setIsBrandSettingsOpen] = useState(false);
  const [isKaiAssistOpen, setIsKaiAssistOpen] = useState(false);
  const [showAssistBanner, setShowAssistBanner] = useState(true);
  const [placeholderCount, setPlaceholderCount] = useState(0);
  const [branding, setBranding] = useState<DocumentBranding | undefined>(initialBranding);
  const templateMeta = templateId ? getTemplateById(templateId) : undefined;
  const [leftPane, setLeftPane] = useState<'navigation' | 'comments' | 'writing'>('navigation');
  const [writingAssistSession, setWritingAssistSession] = useState(0);
  const [writingAssistTab, setWritingAssistTab] = useState<'grammar' | 'suggestions'>('grammar');
  const [writingAssistAutoRun, setWritingAssistAutoRun] = useState(false);

  const openWritingAssist = (tab: 'grammar' | 'suggestions', autoRun = true) => {
    setWritingAssistTab(tab);
    setWritingAssistAutoRun(autoRun);
    setWritingAssistSession((n) => n + 1);
    setLeftPane('writing');
    setIsLeftSidebarOpen(true);
    onTabChange('Review');
  };

  useEffect(() => {
    const updatePlaceholders = () => {
      setPlaceholderCount(countPlaceholdersInEditor(editor));
    };
    updatePlaceholders();
    return editor.registerUpdateListener(updatePlaceholders);
  }, [editor]);

  useEffect(() => {
    if (!templateId) return;
    const key = `kai-assist-offered-${documentId}`;
    if (sessionStorage.getItem(key)) return;
    const count = countPlaceholdersInEditor(editor);
    if (templateId === 'storyboard' || count >= 6) {
      setIsKaiAssistOpen(true);
      sessionStorage.setItem(key, '1');
    }
  }, [templateId, documentId, editor]);

  const persistDocument = async (content: string, nextBranding = branding) => {
    await saveDocument({
      id: documentId,
      name: documentName,
      lastModified: Date.now(),
      content,
      templateId,
      branding: nextBranding,
    });
  };

  const handleKaiAssistGenerate = async (brief: string) => {
    const plainText = getPlainTextFromEditor(editor);
    const result = await requestTemplateAssist({
      templateId,
      brief,
      plainText,
      accessToken,
    });
    applyTemplateAssistToEditor(editor, result);
    const content = JSON.stringify(editor.getEditorState().toJSON());
    await persistDocument(content);
    setShowAssistBanner(false);
  };

  const handleExportDocx = async () => {
    if (!isPro) {
      setIsUpgradeOpen(true);
      return;
    }
    const { lexicalToDocxBlob } = await import('../lib/exportDocx');
    const json = editor.getEditorState().toJSON();
    const blob = await lexicalToDocxBlob(json, documentName, branding);
    downloadBlob(blob, exportFilename(documentName, 'docx'));
  };

  const handleExportTxt = () => {
    const json = editor.getEditorState().toJSON();
    downloadText(lexicalToPlainText(json), exportFilename(documentName, 'txt'));
  };

  const handleExportPdf = () => {
    window.print();
  };

  const handleRestoreVersion = (content: string) => {
    const state = editor.parseEditorState(content);
    editor.setEditorState(state);
    void persistDocument(content);
  };

  const handleSaveBranding = (next: DocumentBranding) => {
    setBranding(next);
    const content = JSON.stringify(editor.getEditorState().toJSON());
    void persistDocument(content, next);
  };

  const currentContent = JSON.stringify(editor.getEditorState().toJSON());

  const leftSidebar = isLeftSidebarOpen && !isFocusMode ? (
    leftPane === 'comments' ? (
      <CommentsSidebarPlugin
        documentId={documentId}
        onClose={() => setIsLeftSidebarOpen(false)}
      />
    ) : leftPane === 'writing' ? (
      <WritingAssistSidebarPlugin
        key={writingAssistSession}
        initialTab={writingAssistTab}
        autoRun={writingAssistAutoRun}
        onClose={() => setIsLeftSidebarOpen(false)}
      />
    ) : (
      <NavigationSidebarPlugin onClose={() => setIsLeftSidebarOpen(false)} />
    )
  ) : null;

  return (
    <>
      <MainLayout
        activeTab={activeTab}
        onTabChange={onTabChange}
        documentName={documentName}
        onNameChange={onNameChange}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undo}
        onRedo={redo}
        saveStatus={saveStatus}
        isPro={isPro}
        onExportDocx={() => void handleExportDocx()}
        onExportTxt={handleExportTxt}
        onExportPdf={handleExportPdf}
        onRequestUpgrade={() => setIsUpgradeOpen(true)}
        onOpenVersionHistory={() => setIsVersionHistoryOpen(true)}
        toolbar={
          <ToolbarPlugin
            activeTab={activeTab}
            pageSize={pageSize}
            setPageSize={setPageSize}
            orientation={orientation}
            setOrientation={setOrientation}
            margins={margins}
            setMargins={setMargins}
            onOpenStyles={() => setIsRightSidebarOpen(true)}
            onOpenNavigation={() => {
              setLeftPane('navigation');
              setIsLeftSidebarOpen(true);
            }}
            onOpenComments={() => {
              setLeftPane('comments');
              setIsLeftSidebarOpen(true);
            }}
            onOpenProofread={() => openWritingAssist('grammar', true)}
            onOpenWritingSuggestions={() => openWritingAssist('suggestions', true)}
            onOpenKaiAssist={() => setIsKaiAssistOpen(true)}
            onOpenBranding={() => setIsBrandSettingsOpen(true)}
            isPro={isPro}
            onRequestUpgrade={() => setIsUpgradeOpen(true)}
            isFocusMode={isFocusMode}
            onToggleFocus={() => {
              setIsFocusMode(!isFocusMode);
              if (!isFocusMode) {
                setIsLeftSidebarOpen(false);
                setIsRightSidebarOpen(false);
              }
            }}
          />
        }
        rightSidebar={isRightSidebarOpen && !isFocusMode ? <StylesSidebarPlugin onClose={() => setIsRightSidebarOpen(false)} /> : null}
        leftSidebar={leftSidebar}
        statusBar={(
          <StatusBarPlugin
            isFocusMode={isFocusMode}
            onToggleFocus={() => {
              setIsFocusMode(!isFocusMode);
              if (!isFocusMode) {
                setIsLeftSidebarOpen(false);
                setIsRightSidebarOpen(false);
              }
            }}
          />
        )}
      >
        <div
          className={`${editorStyles.editorScrollInner} ${viewMode === 'web' ? editorStyles.editorScrollInnerWeb : ''} ${viewMode === 'read' ? editorStyles.editorScrollInnerRead : ''}`}
          style={{
            '--page-width': pageWidth,
            '--page-min-height': pageHeight,
            '--page-padding': pagePadding,
            '--editor-zoom': String(zoom / 100),
          } as React.CSSProperties}
        >
          {showAssistBanner && placeholderCount >= 3 && (
            <div className={editorStyles.assistBanner}>
              <p>
                This template has <strong>{placeholderCount}</strong> fields to fill.
                {templateMeta?.name ? ` (${templateMeta.name})` : ''}
                {' '}Use <strong>Kai Assist</strong> on the Review tab to auto-fill text
                {templateId === 'storyboard' ? ' and generate storyboard images' : ''}.
              </p>
              <button type="button" onClick={() => setIsKaiAssistOpen(true)}>Open Kai Assist</button>
              <button type="button" className={editorStyles.assistDismiss} onClick={() => setShowAssistBanner(false)}>Dismiss</button>
            </div>
          )}
          <div
            className={`${editorStyles.pageStack} ${viewMode === 'web' ? editorStyles.pageStackWeb : ''}`}
            data-page-stack
          >
            <BrandHeader branding={branding} />
            <EditorCanvas />
          </div>
        </div>
      </MainLayout>
      <DocumentSavePlugin documentId={documentId} documentName={documentName} templateId={templateId} isPro={isPro} branding={branding} />
      <FindReplacePlugin />
      <KeyboardShortcutsPlugin />
      <ProUpgradeModal isOpen={isUpgradeOpen} onClose={() => setIsUpgradeOpen(false)} />
      <VersionHistoryModal
        isOpen={isVersionHistoryOpen}
        onClose={() => setIsVersionHistoryOpen(false)}
        documentId={documentId}
        documentName={documentName}
        isPro={isPro}
        currentContent={currentContent}
        onRestore={handleRestoreVersion}
        onRequestUpgrade={() => {
          setIsVersionHistoryOpen(false);
          setIsUpgradeOpen(true);
        }}
      />
      <BrandSettingsModal
        isOpen={isBrandSettingsOpen}
        onClose={() => setIsBrandSettingsOpen(false)}
        branding={branding ?? {}}
        isPro={isPro}
        onSave={handleSaveBranding}
        onRequestUpgrade={() => {
          setIsBrandSettingsOpen(false);
          setIsUpgradeOpen(true);
        }}
      />
      <KaiAssistModal
        isOpen={isKaiAssistOpen}
        templateName={templateMeta?.name}
        placeholderCount={placeholderCount}
        onClose={() => setIsKaiAssistOpen(false)}
        onGenerate={handleKaiAssistGenerate}
      />
    </>
  );
}

export function EditorView() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const { user, isCloudAccount } = useAuth();
  const templateId = searchParams.get('template') ?? undefined;
  const populateMode = searchParams.get('populate') === 'sample' ? 'sample' : 'placeholders';

  const [loading, setLoading] = useState(true);
  const [initialEditorState, setInitialEditorState] = useState<string | undefined>();
  const [initialName, setInitialName] = useState('Untitled Document');
  const [initialBranding, setInitialBranding] = useState<DocumentBranding | undefined>();

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      await migrateFromLocalStorage();
      const saved = await getDocument(id);
      if (cancelled) return;

      if (isCloudAccount && user?.id) {
        const { mergeCommentsFromCloud } = await import('../lib/cloudSync');
        await mergeCommentsFromCloud(user.id, id);
      }

      if (saved?.content) {
        setInitialEditorState(saved.content);
        setInitialName(saved.name);
        setInitialBranding(saved.branding);
      } else if (templateId) {
        const template = getTemplateById(templateId);
        if (template) {
          const content = getTemplateContent(templateId, populateMode) ?? template.content;
          setInitialEditorState(content);
          setInitialName(template.defaultDocumentName);
          await saveDocument({
            id,
            name: template.defaultDocumentName,
            lastModified: Date.now(),
            content,
            templateId,
          });
        }
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [id, templateId, populateMode, isCloudAccount, user?.id]);

  if (!id) return <Navigate to="/app" replace />;

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text-secondary)' }}>
        Loading document…
      </div>
    );
  }

  return (
    <EditorWorkspace
      documentId={id}
      templateId={templateId}
      initialEditorState={initialEditorState}
      initialName={initialName}
      initialBranding={initialBranding}
    />
  );
}
