/**
 * NavigationSidebarPlugin.tsx — P2-A document outline / navigation
 *
 * Changes from original:
 *  1. Initial load: reads headings from current editorState on mount
 *     (not only on subsequent edits via registerUpdateListener)
 *  2. No `any` — uses $isElementNode + typed LexicalNode traversal
 *  3. All h1–h6 indent levels via headingIndentDepth()
 *  4. Two distinct empty states:
 *       • document has no headings → instructional prompt
 *       • has headings but none match search → "No headings match …"
 *  5. Scroll-based active section highlighting via .headingItemActive
 */

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useCallback, useEffect, useState } from 'react';
import { $getRoot, $isElementNode, type LexicalNode } from 'lexical';
import { $isHeadingNode } from '@lexical/rich-text';
import { Search, X } from 'lucide-react';
import styles from '../../layout/MainLayout.module.css';
import { type OutlineEntry, headingIndentDepth } from '../../../lib/outlineStore';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract outline entries from inside a live Lexical editorState.read() call.
 * Must be called within an active read context.
 */
function extractOutlineLive(): OutlineEntry[] {
  const root = $getRoot();
  const entries: OutlineEntry[] = [];

  function traverse(node: LexicalNode): void {
    if ($isHeadingNode(node)) {
      const tag = node.getTag();          // 'h1' | 'h2' | … | 'h6'
      const level = parseInt(tag.slice(1), 10);
      entries.push({
        key: node.getKey(),
        text: node.getTextContent(),
        tag: tag as OutlineEntry['tag'],
        level,
      });
      return;  // headings cannot contain nested headings
    }
    if ($isElementNode(node)) {
      node.getChildren().forEach(traverse);
    }
  }

  root.getChildren().forEach(traverse);
  return entries;
}

/** Walk up the DOM to find the nearest scrollable ancestor. */
function getScrollParent(el: Element): Element {
  let node: Element | null = el.parentElement;
  while (node && node !== document.documentElement) {
    const { overflow, overflowY } = getComputedStyle(node);
    if (/auto|scroll/.test(overflow + overflowY)) return node;
    node = node.parentElement;
  }
  return document.documentElement;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NavigationSidebarPlugin({ onClose }: { onClose?: () => void }) {
  const [editor] = useLexicalComposerContext();
  const [outline, setOutline] = useState<OutlineEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [navTab, setNavTab] = useState<'Headings' | 'Pages' | 'Results'>('Headings');
  const [activeKey, setActiveKey] = useState<string | null>(null);

  // ── 1. Initial load + live updates ──────────────────────────────────────

  useEffect(() => {
    // Read current state immediately so headings appear on mount
    editor.getEditorState().read(() => {
      setOutline(extractOutlineLive());
    });

    // Keep in sync with every subsequent change
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        setOutline(extractOutlineLive());
      });
    });
  }, [editor]);

  // ── 2. Scroll-based active-section tracking ──────────────────────────────

  useEffect(() => {
    const editorEl = editor.getRootElement();
    if (!editorEl) return;

    const scrollContainer = getScrollParent(editorEl);

    const updateActive = () => {
      const containerTop =
        scrollContainer === document.documentElement
          ? 0
          : scrollContainer.getBoundingClientRect().top;

      // The heading whose top edge most recently crossed the 80px threshold
      const threshold = containerTop + 80;
      let nextActive: string | null = null;

      for (const entry of outline) {
        const el = editor.getElementByKey(entry.key);
        if (!el) continue;
        if (el.getBoundingClientRect().top <= threshold) {
          nextActive = entry.key;
        }
      }

      setActiveKey(nextActive);
    };

    scrollContainer.addEventListener('scroll', updateActive, { passive: true });
    updateActive(); // set initial active on mount

    return () => scrollContainer.removeEventListener('scroll', updateActive);
  }, [editor, outline]);

  // ── 3. Navigate on click ─────────────────────────────────────────────────

  const scrollToHeading = useCallback(
    (key: string) => {
      const el = editor.getElementByKey(key);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setActiveKey(key);
      }
    },
    [editor],
  );

  // ── 4. Filtered view ─────────────────────────────────────────────────────

  const trimmedQuery = searchQuery.trim();
  const filteredOutline = trimmedQuery
    ? outline.filter(h => h.text.toLowerCase().includes(trimmedQuery.toLowerCase()))
    : outline;

  // ── 5. Render helpers ────────────────────────────────────────────────────

  const renderHeadingsTab = () => {
    // Case A: document has no headings at all → instructional prompt
    if (outline.length === 0) {
      return (
        <div className={styles.outlineEmpty}>
          <div className={styles.outlineEmptyIcon}>=</div>
          <div>Add headings (H1, H2, H3) to navigate your document.</div>
        </div>
      );
    }

    // Case B: has headings, but none match the current search filter
    if (filteredOutline.length === 0) {
      return (
        <div className={styles.outlineEmpty}>
          No headings match &ldquo;{searchQuery}&rdquo;
        </div>
      );
    }

    // Case C: render the matching entries
    return (
      <>
        {filteredOutline.map(entry => {
          const indent   = headingIndentDepth(entry.level);
          const isActive = entry.key === activeKey;
          const isH1     = entry.level === 1;

          return (
            <div
              key={entry.key}
              role="button"
              tabIndex={0}
              onClick={() => scrollToHeading(entry.key)}
              onKeyDown={e => e.key === 'Enter' && scrollToHeading(entry.key)}
              className={`${styles.headingItem} ${isActive ? styles.headingItemActive : ''}`}
              style={{
                paddingLeft: `${16 + indent * 12}px`,
                cursor: 'pointer',
                color: isH1 ? 'var(--brand-primary)' : 'inherit',
                fontWeight: isH1 ? 600 : 400,
              }}
              title={entry.text || `Empty H${entry.level} heading`}
            >
              {isH1 && <span style={{ marginRight: '8px', fontSize: '10px' }}>v</span>}
              <span style={{ fontSize: isH1 ? '12px' : '11px' }}>
                {entry.text || <em style={{ opacity: 0.5 }}>Empty heading</em>}
              </span>
            </div>
          );
        })}
      </>
    );
  };

  // ── 6. Full render ───────────────────────────────────────────────────────

  return (
    <div className={styles.navigationPane}>
      <div className={styles.paneHeader}>
        <span>Navigation</span>
        <X
          size={16}
          color="var(--text-secondary)"
          style={{ cursor: 'pointer' }}
          onClick={onClose}
        />
      </div>

      <div className={styles.paneContent}>
        <div className={styles.searchBox}>
          <Search size={14} color="var(--text-secondary)" />
          <input
            type="text"
            placeholder="Search document headings..."
            className={styles.searchInput}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>

        <div className={styles.navTabs}>
          {(['Headings', 'Pages', 'Results'] as const).map(tab => (
            <div
              key={tab}
              className={`${styles.navTab} ${navTab === tab ? styles.navTabActive : ''}`}
              onClick={() => setNavTab(tab)}
            >
              {tab}
            </div>
          ))}
        </div>

        {navTab === 'Headings' && renderHeadingsTab()}

        {navTab === 'Pages' && (
          <div className={styles.outlineEmpty}>
            Page thumbnails are not available in web view.
          </div>
        )}

        {navTab === 'Results' && (
          <div className={styles.outlineEmpty}>
            Use the Find tool (Ctrl+F) to search text within the document.
          </div>
        )}
      </div>
    </div>
  );
}
