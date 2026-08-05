import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useCallback, useEffect, useState } from 'react';
import {
  SELECTION_CHANGE_COMMAND, FORMAT_TEXT_COMMAND, $getSelection, $isRangeSelection, COMMAND_PRIORITY_CRITICAL, $createParagraphNode, $isTextNode
} from 'lexical';
import { $setBlocksType } from '@lexical/selection';
import { $createHeadingNode } from '@lexical/rich-text';
import type { HeadingTagType } from '@lexical/rich-text';
import { $isListNode, ListNode } from '@lexical/list';
import { $getNearestNodeOfType } from '@lexical/utils';
import { X } from 'lucide-react';
import styles from '../../layout/MainLayout.module.css';

export function StylesSidebarPlugin({ onClose }: { onClose?: () => void }) {
  const [editor] = useLexicalComposerContext();
  const [blockType, setBlockType] = useState('paragraph');

  const $updateToolbar = useCallback(() => {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) {
      const anchorNode = selection.anchor.getNode();
      const element = anchorNode.getKey() === 'root' ? anchorNode : anchorNode.getTopLevelElementOrThrow();
      if (element !== null) {
        if ($isListNode(element)) {
          const parentList = $getNearestNodeOfType(anchorNode, ListNode);
          setBlockType(parentList ? parentList.getListType() : element.getListType());
        } else {
          setBlockType(element.getType() || 'paragraph');
        }
      }
    }
  }, [editor]);

  useEffect(() => {
    return editor.registerCommand(SELECTION_CHANGE_COMMAND, () => { $updateToolbar(); return false; }, COMMAND_PRIORITY_CRITICAL);
  }, [editor, $updateToolbar]);

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => { editorState.read(() => { $updateToolbar(); }); });
  }, [editor, $updateToolbar]);

  const formatHeading = (headingSize: HeadingTagType) => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        $setBlocksType(selection, () => $createHeadingNode(headingSize));
      }
    });
  };

  const formatParagraph = () => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        $setBlocksType(selection, () => $createParagraphNode());
      }
    });
  };

  const formatEmphasis = () => {
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic');
  };

  const clearFormatting = () => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        $setBlocksType(selection, () => $createParagraphNode());
        // Lexical clear formatting approach:
        const nodes = selection.getNodes();
        nodes.forEach((node) => {
          if ($isTextNode(node)) {
            node.setFormat(0);
            node.setStyle('');
          }
        });
      }
    });
  };

  const styleNames: Record<string, string> = {
    'paragraph': 'Normal',
    'h1': 'Heading 1',
    'h2': 'Heading 2',
    'h3': 'Title'
  };

  return (
    <div className={styles.stylesPane}>
      <div className={styles.paneHeader}>
        <span>Styles</span>
        <X size={16} color="var(--text-secondary)" style={{ cursor: 'pointer' }} onClick={onClose} />
      </div>
      <div className={styles.paneContent}>
        <div style={{ marginBottom: '16px' }}>
          <div style={{ color: 'var(--text-secondary)', marginBottom: '8px' }}>Current style:</div>
          <div className={styles.styleItem}>{styleNames[blockType] || 'Normal'}</div>
        </div>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          <button className={styles.toolbarBtn} style={{ border: '1px solid var(--border-color)', flex: 1 }}>New Style...</button>
          <button className={styles.toolbarBtn} style={{ border: '1px solid var(--border-color)', flex: 1 }} onClick={clearFormatting}>Clear</button>
        </div>
        <div style={{ color: 'var(--text-secondary)', marginBottom: '8px' }}>Apply a style:</div>
        
        <div className={`${styles.styleItem} ${blockType === 'paragraph' ? styles.styleItemActive : ''}`} onClick={formatParagraph}>
          Normal
        </div>
        <div className={styles.styleItem} onClick={clearFormatting}>
          No Spacing
        </div>
        <div className={`${styles.styleItem} ${blockType === 'h1' ? styles.styleItemActive : ''}`} style={{ color: 'var(--brand-primary)', fontWeight: 600 }} onClick={() => formatHeading('h1')}>
          Heading 1
        </div>
        <div className={`${styles.styleItem} ${blockType === 'h2' ? styles.styleItemActive : ''}`} style={{ color: 'var(--brand-primary)', fontWeight: 600 }} onClick={() => formatHeading('h2')}>
          Heading 2
        </div>
        <div className={`${styles.styleItem} ${blockType === 'h3' ? styles.styleItemActive : ''}`} style={{ fontWeight: 600, fontSize: '16px' }} onClick={() => formatHeading('h3')}>
          Title
        </div>
        <div className={styles.styleItem} style={{ fontStyle: 'italic' }} onClick={formatEmphasis}>
          Emphasis
        </div>
      </div>
    </div>
  );
}
