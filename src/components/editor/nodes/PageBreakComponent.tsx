import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useLexicalNodeSelection } from '@lexical/react/useLexicalNodeSelection';
import { mergeRegister } from '@lexical/utils';
import {
  $getNodeByKey,
  CLICK_COMMAND,
  COMMAND_PRIORITY_LOW,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
  type NodeKey,
} from 'lexical';
import styles from '../Editor.module.css';

export function PageBreakComponent({ nodeKey }: { nodeKey: NodeKey }) {
  const [editor] = useLexicalComposerContext();
  const [isSelected, setSelected, clearSelection] = useLexicalNodeSelection(nodeKey);

  useEffect(() => {
    const removeIfSelected = (event: KeyboardEvent) => {
      if (!isSelected) return false;
      event.preventDefault();
      editor.update(() => $getNodeByKey(nodeKey)?.remove());
      return true;
    };
    return mergeRegister(
      editor.registerCommand(
        CLICK_COMMAND,
        (event: MouseEvent) => {
          const element = editor.getElementByKey(nodeKey);
          if (element && element.contains(event.target as Node)) {
            if (!event.shiftKey) clearSelection();
            setSelected(!isSelected);
            return true;
          }
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(KEY_DELETE_COMMAND, removeIfSelected, COMMAND_PRIORITY_LOW),
      editor.registerCommand(KEY_BACKSPACE_COMMAND, removeIfSelected, COMMAND_PRIORITY_LOW),
    );
  }, [editor, nodeKey, isSelected, setSelected, clearSelection]);

  return (
    <div className={`${styles.pageBreak} ${isSelected ? styles.pageBreakSelected : ''}`} contentEditable={false}>
      <span>Page break</span>
    </div>
  );
}
