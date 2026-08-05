import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useEffect, useState } from 'react';
import { $getRoot } from 'lexical';
import { $isHeadingNode } from '@lexical/rich-text';
import { Search, X } from 'lucide-react';
import styles from '../../layout/MainLayout.module.css';

import type { HeadingTagType } from '@lexical/rich-text';

type HeadingEntry = {
  key: string;
  text: string;
  tag: HeadingTagType;
};

export function NavigationSidebarPlugin({ onClose }: { onClose?: () => void }) {
  const [editor] = useLexicalComposerContext();
  const [headings, setHeadings] = useState<HeadingEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [navTab, setNavTab] = useState('Headings');

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const root = $getRoot();
        const extracted: HeadingEntry[] = [];
        
        // Traverse to find HeadingNodes
        // Note: A simple DFS to keep order
        const traverse = (node: any) => {
          if ($isHeadingNode(node)) {
            extracted.push({
              key: node.getKey(),
              text: node.getTextContent(),
              tag: node.getTag(),
            });
          }
          if (node.getChildren) {
            node.getChildren().forEach(traverse);
          }
        };
        
        root.getChildren().forEach(traverse);
        setHeadings(extracted);
      });
    });
  }, [editor]);

  const scrollToHeading = (key: string) => {
    const domElement = editor.getElementByKey(key);
    if (domElement) {
      domElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const filteredHeadings = headings.filter(h => h.text.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className={styles.navigationPane}>
      <div className={styles.paneHeader}>
        <span>Navigation</span>
        <X size={16} color="var(--text-secondary)" style={{ cursor: 'pointer' }} onClick={onClose} />
      </div>
      <div className={styles.paneContent}>
        <div className={styles.searchBox}>
          <Search size={14} color="var(--text-secondary)" />
          <input 
            type="text" 
            placeholder="Search document headings..." 
            className={styles.searchInput} 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className={styles.navTabs}>
          <div className={`${styles.navTab} ${navTab === 'Headings' ? styles.navTabActive : ''}`} onClick={() => setNavTab('Headings')}>Headings</div>
          <div className={`${styles.navTab} ${navTab === 'Pages' ? styles.navTabActive : ''}`} onClick={() => setNavTab('Pages')}>Pages</div>
          <div className={`${styles.navTab} ${navTab === 'Results' ? styles.navTabActive : ''}`} onClick={() => setNavTab('Results')}>Results</div>
        </div>
        
        {navTab === 'Headings' && (
          filteredHeadings.length === 0 ? (
            <div style={{ padding: '16px', fontSize: '12px', color: 'var(--text-secondary)', textAlign: 'center' }}>
              No headings found matching your search.
            </div>
          ) : (
            <>{filteredHeadings.map((heading) => {
              const indentLevel = heading.tag === 'h1' ? 0 : heading.tag === 'h2' ? 1 : 2;
              const isH1 = heading.tag === 'h1';
              
              return (
                <div 
                  key={heading.key}
                  onClick={() => scrollToHeading(heading.key)}
                  className={styles.headingItem}
                  style={{ 
                    paddingLeft: `${16 + (indentLevel * 12)}px`,
                    cursor: 'pointer',
                    color: isH1 ? 'var(--brand-primary)' : 'inherit',
                    fontWeight: isH1 ? 600 : 400
                  }}
                >
                  {isH1 && <span style={{ marginRight: '8px', fontSize: '10px' }}>▼</span>}
                  <span style={{ fontSize: isH1 ? '12px' : '11px' }}>{heading.text || 'Empty Heading'}</span>
                </div>
              );
            })}</>
          )
        )}
        
        {navTab === 'Pages' && (
          <div style={{ padding: '16px', fontSize: '12px', color: 'var(--text-secondary)', textAlign: 'center' }}>
            Page thumbnails are not available in web view.
          </div>
        )}
        
        {navTab === 'Results' && (
          <div style={{ padding: '16px', fontSize: '12px', color: 'var(--text-secondary)', textAlign: 'center' }}>
            Use the Find tool (Ctrl+F) to search text within the document.
          </div>
        )}
      </div>
    </div>
  );
}
