import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getRoot, $createRangeSelection, $setSelection, $isRangeSelection, $getSelection } from 'lexical';
import { useState, useCallback, useEffect } from 'react';
import { createCommand, COMMAND_PRIORITY_LOW } from 'lexical';
import type { LexicalCommand } from 'lexical';
import { Search, X } from 'lucide-react';

export const TOGGLE_FIND_REPLACE_COMMAND: LexicalCommand<void> = createCommand();

export function FindReplacePlugin() {
  const [editor] = useLexicalComposerContext();
  const [isOpen, setIsOpen] = useState(false);
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');

  useEffect(() => {
    return editor.registerCommand(
      TOGGLE_FIND_REPLACE_COMMAND,
      () => {
        setIsOpen((open) => !open);
        return true;
      },
      COMMAND_PRIORITY_LOW
    );
  }, [editor]);

  const handleFindNext = useCallback(() => {
    if (!findText) return;

    editor.update(() => {
      const selection = $getSelection();
      let startNodeKey = null;
      let startOffset = 0;
      
      if ($isRangeSelection(selection)) {
        startNodeKey = selection.focus.key;
        startOffset = Math.max(selection.focus.offset, selection.anchor.offset);
      }
      
      const textNodes = $getRoot().getAllTextNodes();
      
      let foundMatch = null;
      let passedCursor = !startNodeKey; 
      
      for (let i = 0; i < 2; i++) { 
        for (const node of textNodes) {
          if (!passedCursor) {
            if (node.getKey() === startNodeKey) {
              passedCursor = true;
            }
          }
          
          if (passedCursor) {
            const content = node.getTextContent();
            const searchIndex = (node.getKey() === startNodeKey && i === 0) ? startOffset : 0;
            const index = content.toLowerCase().indexOf(findText.toLowerCase(), searchIndex);
            
            if (index !== -1) {
              foundMatch = { key: node.getKey(), index };
              break;
            }
          }
        }
        if (foundMatch) break;
        passedCursor = true;
        startNodeKey = null;
      }
      
      if (foundMatch) {
        const sel = $createRangeSelection();
        sel.anchor.set(foundMatch.key, foundMatch.index, 'text');
        sel.focus.set(foundMatch.key, foundMatch.index + findText.length, 'text');
        $setSelection(sel);
      } else {
        alert('No matches found.');
      }
    });
  }, [editor, findText]);

  const handleReplace = useCallback(() => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection) && !selection.isCollapsed()) {
        const text = selection.getTextContent();
        if (text.toLowerCase() === findText.toLowerCase()) {
          selection.insertText(replaceText);
          handleFindNext(); // Auto advance
        } else {
          handleFindNext();
        }
      } else {
        handleFindNext();
      }
    });
  }, [editor, findText, replaceText, handleFindNext]);

  const handleReplaceAll = useCallback(() => {
    if (!findText) return;
    editor.update(() => {
      const textNodes = $getRoot().getAllTextNodes();
      let count = 0;
      for (const node of textNodes) {
        const content = node.getTextContent();
        if (content.toLowerCase().includes(findText.toLowerCase())) {
          // Splitting and rejoining with replaceText is a naive but effective way for Replace All
          const regex = new RegExp(findText, 'gi');
          const newContent = content.replace(regex, replaceText);
          node.setTextContent(newContent);
          count++;
        }
      }
      alert(`Replaced ${count} occurrences.`);
    });
  }, [editor, findText, replaceText]);

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'absolute',
      top: '20px',
      right: '20px',
      backgroundColor: 'var(--bg-secondary)',
      border: '1px solid var(--border-color)',
      borderRadius: '8px',
      padding: '16px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
      zIndex: 100,
      width: '300px',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: '14px', color: 'var(--text-primary)' }}>Find & Replace</h3>
        <button onClick={() => setIsOpen(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
          <X size={16} />
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-primary)', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
        <Search size={14} color="var(--text-muted)" />
        <input 
          type="text" 
          placeholder="Find" 
          value={findText}
          onChange={(e) => setFindText(e.target.value)}
          style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', outline: 'none', flex: 1, fontSize: '12px' }}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-primary)', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
        <input 
          type="text" 
          placeholder="Replace with" 
          value={replaceText}
          onChange={(e) => setReplaceText(e.target.value)}
          style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', outline: 'none', flex: 1, fontSize: '12px' }}
        />
      </div>

      <div style={{ display: 'flex', gap: '8px' }}>
        <button onClick={handleFindNext} style={{ flex: 1, background: 'var(--brand-gradient)', color: 'white', border: 'none', padding: '6px', borderRadius: 'var(--radius-sm)', fontSize: '12px', cursor: 'pointer', fontWeight: 600 }}>
          Find Next
        </button>
        <button onClick={handleReplace} style={{ flex: 1, background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', padding: '6px', borderRadius: '4px', fontSize: '12px', cursor: 'pointer' }}>
          Replace
        </button>
        <button onClick={handleReplaceAll} style={{ flex: 1, background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', padding: '6px', borderRadius: '4px', fontSize: '12px', cursor: 'pointer' }}>
          Replace All
        </button>
      </div>
    </div>
  );
}
