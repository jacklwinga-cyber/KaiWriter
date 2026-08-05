import { useCallback, useEffect, useRef, useState } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  SELECTION_CHANGE_COMMAND,
  FORMAT_TEXT_COMMAND,
  FORMAT_ELEMENT_COMMAND,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_CRITICAL,
  $createParagraphNode,
  INDENT_CONTENT_COMMAND,
  OUTDENT_CONTENT_COMMAND,
} from 'lexical';
import { $patchStyleText, $setBlocksType } from '@lexical/selection';
import {
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  REMOVE_LIST_COMMAND,
  $isListNode,
  ListNode,
} from '@lexical/list';
import { $createHeadingNode } from '@lexical/rich-text';
import type { HeadingTagType } from '@lexical/rich-text';
import { $getNearestNodeOfType } from '@lexical/utils';
import {
  Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, ClipboardPaste, Scissors, Copy, Strikethrough,
  Subscript, Superscript, IndentDecrease, IndentIncrease, ArrowDownUp,
  Brush, ChevronDown, ChevronUp,
} from 'lucide-react';
import styles from '../../layout/MainLayout.module.css';

const FONT_FAMILIES = [
  { label: 'Inter', value: 'Inter, sans-serif' },
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Times New Roman', value: '"Times New Roman", Times, serif' },
  { label: 'Courier New', value: '"Courier New", Courier, monospace' },
];
const FONT_SIZES = ['11', '12', '14', '16', '18', '24', '32'];

interface HomeRibbonProps {
  onOpenStyles?: () => void;
}

export function HomeRibbon({ onOpenStyles }: HomeRibbonProps) {
  const [editor] = useLexicalComposerContext();
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [isUnderline, setIsUnderline] = useState(false);
  const [isStrikethrough, setIsStrikethrough] = useState(false);
  const [isSubscript, setIsSubscript] = useState(false);
  const [isSuperscript, setIsSuperscript] = useState(false);
  const [blockType, setBlockType] = useState('paragraph');
  const [fontFamily, setFontFamily] = useState('Inter, sans-serif');
  const [fontSize, setFontSize] = useState('14');
  const [lineHeight, setLineHeight] = useState('1.5');
  const fontInputRef = useRef<HTMLInputElement>(null);

  const $updateToolbar = useCallback(() => {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) {
      setIsBold(selection.hasFormat('bold'));
      setIsItalic(selection.hasFormat('italic'));
      setIsUnderline(selection.hasFormat('underline'));
      setIsStrikethrough(selection.hasFormat('strikethrough'));
      setIsSubscript(selection.hasFormat('subscript'));
      setIsSuperscript(selection.hasFormat('superscript'));

      const anchorNode = selection.anchor.getNode();
      const element = anchorNode.getKey() === 'root' ? anchorNode : anchorNode.getTopLevelElementOrThrow();
      if ($isListNode(element)) {
        const parentList = $getNearestNodeOfType(anchorNode, ListNode);
        setBlockType(parentList ? parentList.getListType() : element.getListType());
      } else {
        setBlockType(element.getType() || 'paragraph');
      }
    }
  }, []);

  useEffect(() => {
    return editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      () => { $updateToolbar(); return false; },
      COMMAND_PRIORITY_CRITICAL,
    );
  }, [editor, $updateToolbar]);

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => { $updateToolbar(); });
    });
  }, [editor, $updateToolbar]);

  const applyStyleText = useCallback((s: Record<string, string>) => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) $patchStyleText(selection, s);
    });
  }, [editor]);

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

  const handleLineSpacing = () => {
    const nextSpacing = lineHeight === '1' ? '1.5' : lineHeight === '1.5' ? '2' : '1';
    setLineHeight(nextSpacing);
    applyStyleText({ 'line-height': nextSpacing });
  };

  const handleClipboard = (action: 'cut' | 'copy' | 'paste') => {
    if (action === 'paste') {
      navigator.clipboard.readText().then((t) => {
        editor.update(() => {
          const selection = $getSelection();
          if (selection) selection.insertText(t);
        });
      });
    } else {
      document.execCommand(action);
    }
  };

  const formatAlign = (alignment: 'left' | 'center' | 'right' | 'justify') => {
    editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, alignment);
  };

  const handleCustomFontUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fontName = file.name.split('.')[0];
    const reader = new FileReader();
    reader.onload = async (ev) => {
      if (ev.target?.result instanceof ArrayBuffer) {
        try {
          const font = new FontFace(fontName, ev.target.result);
          await font.load();
          document.fonts.add(font);
          const value = `"${fontName}", sans-serif`;
          setFontFamily(value);
          applyStyleText({ 'font-family': value });
        } catch {
          alert('Failed to load custom font.');
        }
      }
    };
    reader.readAsArrayBuffer(file);
    if (fontInputRef.current) fontInputRef.current.value = '';
  };

  return (
    <div className={styles.ribbonToolbar}>
      <div className={styles.compactRibbonGroup}>
        <div className={styles.largeToolBtn} onClick={() => handleClipboard('paste')}>
          <ClipboardPaste size={20} />
          <span style={{ fontSize: '10px' }}>Paste</span>
        </div>
        <div className={styles.ribbonColumn}>
          <button type="button" className={styles.toolbarBtn} onClick={() => handleClipboard('cut')}><Scissors size={14} /></button>
          <button type="button" className={styles.toolbarBtn} onClick={() => handleClipboard('copy')}><Copy size={14} /></button>
        </div>
      </div>

      <div className={styles.compactRibbonGroup}>
        <div className={styles.ribbonColumn}>
          <div className={styles.compactRibbonRow}>
            <select className={styles.toolbarSelect} style={{ width: '120px' }} value={fontFamily}
              onChange={(e) => {
                if (e.target.value === 'UPLOAD_NEW') fontInputRef.current?.click();
                else { setFontFamily(e.target.value); applyStyleText({ 'font-family': e.target.value }); }
              }}>
              {FONT_FAMILIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              <option value="UPLOAD_NEW">Upload font…</option>
            </select>
            <input type="file" ref={fontInputRef} style={{ display: 'none' }} accept=".ttf,.otf,.woff,.woff2" onChange={handleCustomFontUpload} />
            <select className={styles.toolbarSelect} style={{ width: '50px' }} value={fontSize}
              onChange={(e) => { setFontSize(e.target.value); applyStyleText({ 'font-size': `${e.target.value}px` }); }}>
              {FONT_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <button type="button" className={styles.toolbarBtn} onClick={() => {
              const next = Math.min(parseInt(fontSize, 10) + 2, 72).toString();
              setFontSize(next); applyStyleText({ 'font-size': `${next}px` });
            }}><span style={{ fontSize: '13px' }}>A<ChevronUp size={10} /></span></button>
            <button type="button" className={styles.toolbarBtn} onClick={() => {
              const next = Math.max(parseInt(fontSize, 10) - 2, 8).toString();
              setFontSize(next); applyStyleText({ 'font-size': `${next}px` });
            }}><span style={{ fontSize: '13px' }}>A<ChevronDown size={10} /></span></button>
          </div>
          <div className={styles.compactRibbonRow}>
            <button type="button" onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold')} className={`${styles.toolbarBtn} ${isBold ? styles.toolbarBtnActive : ''}`}><Bold size={14} /></button>
            <button type="button" onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic')} className={`${styles.toolbarBtn} ${isItalic ? styles.toolbarBtnActive : ''}`}><Italic size={14} /></button>
            <button type="button" onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'underline')} className={`${styles.toolbarBtn} ${isUnderline ? styles.toolbarBtnActive : ''}`}><Underline size={14} /></button>
            <button type="button" onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'strikethrough')} className={`${styles.toolbarBtn} ${isStrikethrough ? styles.toolbarBtnActive : ''}`}><Strikethrough size={14} /></button>
            <button type="button" onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'subscript')} className={`${styles.toolbarBtn} ${isSubscript ? styles.toolbarBtnActive : ''}`}><Subscript size={14} /></button>
            <button type="button" onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'superscript')} className={`${styles.toolbarBtn} ${isSuperscript ? styles.toolbarBtnActive : ''}`}><Superscript size={14} /></button>
          </div>
        </div>
      </div>

      <div className={styles.compactRibbonGroup}>
        <div className={styles.ribbonColumn}>
          <div className={styles.compactRibbonRow}>
            <button type="button" className={`${styles.toolbarBtn} ${blockType === 'bullet' ? styles.toolbarBtnActive : ''}`}
              onClick={() => blockType !== 'bullet' ? editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined) : editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined)}>
              <List size={14} />
            </button>
            <button type="button" className={`${styles.toolbarBtn} ${blockType === 'number' ? styles.toolbarBtnActive : ''}`}
              onClick={() => blockType !== 'number' ? editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined) : editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined)}>
              <ListOrdered size={14} />
            </button>
            <button type="button" className={styles.toolbarBtn} onClick={() => editor.dispatchCommand(OUTDENT_CONTENT_COMMAND, undefined)}><IndentDecrease size={14} /></button>
            <button type="button" className={styles.toolbarBtn} onClick={() => editor.dispatchCommand(INDENT_CONTENT_COMMAND, undefined)}><IndentIncrease size={14} /></button>
          </div>
          <div className={styles.compactRibbonRow}>
            <button type="button" className={styles.toolbarBtn} onClick={() => formatAlign('left')}><AlignLeft size={14} /></button>
            <button type="button" className={styles.toolbarBtn} onClick={() => formatAlign('center')}><AlignCenter size={14} /></button>
            <button type="button" className={styles.toolbarBtn} onClick={() => formatAlign('right')}><AlignRight size={14} /></button>
            <button type="button" className={styles.toolbarBtn} onClick={() => formatAlign('justify')}><AlignJustify size={14} /></button>
            <button type="button" className={styles.toolbarBtn} onClick={handleLineSpacing} title="Line spacing"><ArrowDownUp size={14} /></button>
          </div>
        </div>
      </div>

      <div className={styles.compactRibbonGroup}>
        <div className={styles.styleGallery}>
          <div className={`${styles.styleGalleryItem} ${blockType === 'paragraph' ? styles.styleGalleryItemActive : ''}`} onClick={formatParagraph}>
            <span className={styles.styleGalleryPreview}>AaBbCc</span>
            <span className={styles.styleGalleryName}>Normal</span>
          </div>
          <div className={`${styles.styleGalleryItem} ${blockType === 'h1' ? styles.styleGalleryItemActive : ''}`} onClick={() => formatHeading('h1')}>
            <span className={styles.styleGalleryPreview} style={{ fontWeight: 600, color: 'var(--brand-primary)' }}>Heading 1</span>
          </div>
          <div className={`${styles.styleGalleryItem} ${blockType === 'h2' ? styles.styleGalleryItemActive : ''}`} onClick={() => formatHeading('h2')}>
            <span className={styles.styleGalleryPreview} style={{ color: 'var(--brand-primary)' }}>Heading 2</span>
          </div>
        </div>
        <div className={styles.largeToolBtn} onClick={onOpenStyles}>
          <Brush size={20} style={{ color: 'var(--brand-primary)' }} />
          <span style={{ fontSize: '9px' }}>Styles</span>
        </div>
      </div>
    </div>
  );
}
