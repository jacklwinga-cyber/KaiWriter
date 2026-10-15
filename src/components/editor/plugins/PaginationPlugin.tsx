import { useEffect, useState } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $insertNodeToNearestRoot, mergeRegister } from '@lexical/utils';
import { COMMAND_PRIORITY_EDITOR, COMMAND_PRIORITY_LOW, KEY_ENTER_COMMAND, SELECTION_CHANGE_COMMAND } from 'lexical';
import { useEditorChromeOptional } from '../../../contexts/EditorChromeContext';
import { $createPageBreakNode, INSERT_PAGE_BREAK_COMMAND } from '../nodes/PageBreakNode';
import { fillHeaderFooterText, pagePixels, showsHeaderFooter, type PageSetup } from '../../../lib/pageSetup';
import { computePageBreaks } from '../../../lib/pagination';
import styles from '../Editor.module.css';

interface PageGuide {
  /** Offset from the top of the page area (editorInner), in unscaled CSS px. */
  top: number;
  /** Number of the page that starts here. */
  page: number;
}

interface Layout {
  guides: PageGuide[];
  pages: number;
}

/**
 * Inserts manual page breaks (Insert ▸ Page Break, Ctrl/Cmd+Enter) and draws
 * where pages end, with the header and footer, on the continuous page.
 */
export function PaginationPlugin({ pageSetup, title }: { pageSetup: PageSetup; title: string }) {
  const [editor] = useLexicalComposerContext();
  const [layout, setLayout] = useState<Layout>({ guides: [], pages: 1 });
  const setPageInfo = useEditorChromeOptional()?.setPageInfo;
  const { margin, height } = pagePixels(pageSetup);
  const contentHeight = height - margin * 2;

  useEffect(() => {
    return mergeRegister(
      editor.registerCommand(
        INSERT_PAGE_BREAK_COMMAND,
        () => {
          $insertNodeToNearestRoot($createPageBreakNode());
          return true;
        },
        COMMAND_PRIORITY_EDITOR,
      ),
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        (event) => {
          if (!event || !(event.ctrlKey || event.metaKey)) return false;
          event.preventDefault();
          return editor.dispatchCommand(INSERT_PAGE_BREAK_COMMAND, undefined);
        },
        COMMAND_PRIORITY_LOW,
      ),
    );
  }, [editor]);

  useEffect(() => {
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const root = editor.getRootElement();
        const container = root?.parentElement;
        if (!root || !container) return;
        const rootRect = root.getBoundingClientRect();
        // Zoom may scale the page; measure in unscaled CSS px.
        const scale = root.offsetWidth ? rootRect.width / root.offsetWidth : 1;
        if (!scale) return;
        const blocks = Array.from(root.children).map((child) => {
          const rect = child.getBoundingClientRect();
          return {
            top: (rect.top - rootRect.top) / scale,
            bottom: (rect.bottom - rootRect.top) / scale,
            isPageBreak: (child as HTMLElement).hasAttribute('data-page-break'),
          };
        });
        const offset = (rootRect.top - container.getBoundingClientRect().top) / scale;
        const breaks = computePageBreaks(blocks, contentHeight);
        const domSelection = window.getSelection();
        let current = 1;
        if (domSelection?.rangeCount && root.contains(domSelection.anchorNode)) {
          const caretRect = domSelection.getRangeAt(0).getBoundingClientRect();
          const caretY = (caretRect.top - rootRect.top) / scale;
          current = 1 + breaks.filter((y) => y <= caretY + 1).length;
        }
        setPageInfo?.({ current, total: breaks.length + 1 });
        setLayout({
          guides: breaks.map((y, i) => ({ top: offset + y, page: i + 2 })),
          pages: breaks.length + 1,
        });
      });
    };

    measure();
    const root = editor.getRootElement();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (root) observer?.observe(root);
    window.addEventListener('resize', measure);
    const unregister = mergeRegister(
      editor.registerUpdateListener(measure),
      editor.registerCommand(SELECTION_CHANGE_COMMAND, () => { measure(); return false; }, COMMAND_PRIORITY_LOW),
    );
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', measure);
      unregister();
    };
  }, [editor, contentHeight, setPageInfo]);

  const headerFor = (page: number) =>
    showsHeaderFooter(pageSetup, page) && pageSetup.headerText
      ? fillHeaderFooterText(pageSetup.headerText, { page, pages: layout.pages, title })
      : '';
  const footerFor = (page: number) =>
    showsHeaderFooter(pageSetup, page) && pageSetup.footerText
      ? fillHeaderFooterText(pageSetup.footerText, { page, pages: layout.pages, title })
      : '';
  const numberFor = (page: number, where: 'header' | 'footer') => {
    if (!showsHeaderFooter(pageSetup, page) || pageSetup.pageNumbers === 'none') return '';
    return pageSetup.pageNumbers.startsWith(where) ? `Page ${page} of ${layout.pages}` : '';
  };
  const numberAlign = pageSetup.pageNumbers === 'footer-center' ? 'center' : 'right';

  const firstHeader = headerFor(1);
  const firstHeaderNumber = numberFor(1, 'header');
  const lastFooter = footerFor(layout.pages);
  const lastFooterNumber = numberFor(layout.pages, 'footer');

  return (
    <div className={styles.paginationLayer} aria-hidden="true" style={{ '--margin': `${margin}px` } as React.CSSProperties}>
      {(firstHeader || firstHeaderNumber) && (
        <div className={styles.pageHeaderPreview}>
          <span>{firstHeader}</span>
          <span>{firstHeaderNumber}</span>
        </div>
      )}
      {layout.guides.map((guide) => (
        <div key={guide.page} className={styles.pageGuide} style={{ top: guide.top }}>
          <span className={styles.pageGuideLabel}>Page {guide.page}</span>
        </div>
      ))}
      {(lastFooter || lastFooterNumber) && (
        <div className={styles.pageFooterPreview} style={{ justifyContent: lastFooter ? 'space-between' : numberAlign === 'center' ? 'center' : 'flex-end' }}>
          {lastFooter && <span>{lastFooter}</span>}
          <span>{lastFooterNumber}</span>
        </div>
      )}
    </div>
  );
}
