import { useEffect, useRef, useState } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getRoot } from 'lexical';
import {
  CheckCircle, BookOpen, LayoutTemplate, Maximize2, Minus, Plus, Globe, FileText,
} from 'lucide-react';
import styles from '../../layout/MainLayout.module.css';
import { LanguageModal } from '../../ui/LanguageModal';
import { useEditorPreferences } from '../../../contexts/EditorPreferencesContext';

interface StatusBarPluginProps {
  isFocusMode?: boolean;
  onToggleFocus?: () => void;
}

function estimatePageCount(rootHeightPx: number, pageHeightPx: number): number {
  if (!pageHeightPx) return 1;
  return Math.max(1, Math.ceil(rootHeightPx / pageHeightPx));
}

export function StatusBarPlugin({ isFocusMode = false, onToggleFocus }: StatusBarPluginProps) {
  const [editor] = useLexicalComposerContext();
  const {
    localeLabel,
    zoom,
    setZoom,
    zoomIn,
    zoomOut,
    viewMode,
    setViewMode,
    disableSpellCheck,
  } = useEditorPreferences();

  const [wordCount, setWordCount] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [accessibility, setAccessibility] = useState<'good' | 'review'>('good');
  const sliderRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const updateStats = () => {
      editor.getEditorState().read(() => {
        const textContent = $getRoot().getTextContent();
        const words = textContent.trim().split(/\s+/).filter((word) => word.length > 0);
        setWordCount(words.length);

        const rootEl = editor.getRootElement();
        if (rootEl) {
          const pageEl = rootEl.closest('[data-page-stack]') as HTMLElement | null;
          const pageHeight = pageEl?.offsetHeight ?? 1056;
          const contentHeight = rootEl.scrollHeight + 192;
          setPageCount(estimatePageCount(contentHeight, pageHeight));
        }

        const hasPlaceholder = /\[[^\]]{2,}\]/.test(textContent);
        const hasHeading = rootEl?.querySelector('h1,h2,h3');
        setAccessibility(hasHeading && !hasPlaceholder ? 'good' : hasPlaceholder ? 'review' : 'good');
      });
    };

    updateStats();
    return editor.registerUpdateListener(() => updateStats());
  }, [editor]);

  return (
    <>
      <div className={styles.statusBar}>
        <div className={styles.statusLeft}>
          <span>Page 1 of {pageCount}</span>
          <span>{wordCount} words</span>
          <button type="button" className={styles.statusBtn} onClick={() => setLanguageOpen(true)}>
            {localeLabel}
          </button>
          <div className={styles.statusMeta}>
            <CheckCircle size={14} />
            <span>
              Accessibility: {accessibility === 'good' ? 'Good to go' : 'Review placeholders'}
            </span>
          </div>
          {disableSpellCheck && <span className={styles.statusMuted}>Proofing off</span>}
        </div>

        <div className={styles.statusRight}>
          <button
            type="button"
            className={`${styles.statusIconBtn} ${isFocusMode ? styles.statusIconBtnActive : ''}`}
            title={isFocusMode ? 'Exit Focus' : 'Focus'}
            onClick={onToggleFocus}
          >
            <Maximize2 size={14} />
            <span>Focus</span>
          </button>

          <div className={styles.viewModeGroup}>
            <button
              type="button"
              className={`${styles.statusIconBtn} ${viewMode === 'print' ? styles.statusIconBtnActive : ''}`}
              title="Print Layout"
              onClick={() => setViewMode('print')}
            >
              <BookOpen size={14} />
            </button>
            <button
              type="button"
              className={`${styles.statusIconBtn} ${viewMode === 'web' ? styles.statusIconBtnActive : ''}`}
              title="Web Layout"
              onClick={() => setViewMode('web')}
            >
              <Globe size={14} />
            </button>
            <button
              type="button"
              className={`${styles.statusIconBtn} ${viewMode === 'read' ? styles.statusIconBtnActive : ''}`}
              title="Read Mode"
              onClick={() => setViewMode('read')}
            >
              <FileText size={14} />
            </button>
            <button
              type="button"
              className={styles.statusIconBtn}
              title="Draft view"
              onClick={() => setViewMode('print')}
            >
              <LayoutTemplate size={14} />
            </button>
          </div>

          <div className={styles.zoomGroup}>
            <button type="button" className={styles.zoomBtn} onClick={zoomOut} aria-label="Zoom out">
              <Minus size={14} />
            </button>
            <input
              ref={sliderRef}
              type="range"
              min={50}
              max={200}
              step={5}
              value={zoom}
              className={styles.zoomRange}
              onChange={(e) => setZoom(Number(e.target.value))}
              aria-label="Zoom"
            />
            <button type="button" className={styles.zoomBtn} onClick={zoomIn} aria-label="Zoom in">
              <Plus size={14} />
            </button>
            <button
              type="button"
              className={styles.zoomLabel}
              onClick={() => setZoom(100)}
              title="Reset zoom to 100%"
            >
              {zoom}%
            </button>
          </div>
        </div>
      </div>

      <LanguageModal isOpen={languageOpen} onClose={() => setLanguageOpen(false)} />
    </>
  );
}
