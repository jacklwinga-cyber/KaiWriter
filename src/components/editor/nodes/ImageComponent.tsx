import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useLexicalNodeSelection } from '@lexical/react/useLexicalNodeSelection';
import { mergeRegister } from '@lexical/utils';
import {
  $getNodeByKey,
  $getSelection,
  $isNodeSelection,
  CLICK_COMMAND,
  COMMAND_PRIORITY_LOW,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
} from 'lexical';
import type { NodeKey } from 'lexical';
import { useCallback, useEffect, useRef } from 'react';

export default function ImageComponent({
  src,
  altText,
  nodeKey,
  width,
  height,
  maxWidth,
}: {
  altText: string;
  height: 'inherit' | number;
  maxWidth: number;
  nodeKey: NodeKey;
  src: string;
  width: 'inherit' | number;
}) {
  const [editor] = useLexicalComposerContext();
  const [isSelected, setSelected, clearSelection] = useLexicalNodeSelection(nodeKey);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const onDelete = useCallback(
    (payload: KeyboardEvent) => {
      if (isSelected && $isNodeSelection($getSelection())) {
        const event: KeyboardEvent = payload;
        event.preventDefault();
        const node = $getNodeByKey(nodeKey);
        if (node) {
          node.remove();
        }
        return true;
      }
      return false;
    },
    [isSelected, nodeKey],
  );

  const onClick = useCallback(
    (payload: MouseEvent) => {
      if (payload.target === imageRef.current) {
        clearSelection();
        setSelected(true);
        return true;
      }
      return false;
    },
    [isSelected, setSelected, clearSelection],
  );

  useEffect(() => {
    return mergeRegister(
      editor.registerCommand(CLICK_COMMAND, onClick, COMMAND_PRIORITY_LOW),
      editor.registerCommand(KEY_DELETE_COMMAND, onDelete, COMMAND_PRIORITY_LOW),
      editor.registerCommand(KEY_BACKSPACE_COMMAND, onDelete, COMMAND_PRIORITY_LOW),
    );
  }, [editor, onClick, onDelete]);

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <img
        ref={imageRef}
        src={src}
        alt={altText}
        style={{
          width,
          height,
          maxWidth,
          outline: isSelected ? '2px solid var(--brand-primary)' : 'none',
          cursor: 'pointer',
          borderRadius: '4px',
          boxShadow: isSelected ? 'var(--shadow-glow)' : 'none',
        }}
      />
    </div>
  );
}
