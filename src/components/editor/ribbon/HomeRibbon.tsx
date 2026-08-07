/**
 * HomeRibbon.tsx — P3-A-i typography completion
 *
 * Added vs original:
 *  • Text colour picker (20 swatches + custom input)
 *  • Highlight colour picker (12 swatches + remove)
 *  • Clear formatting button
 *  • Alignment active-state tracking (correct highlight on current paragraph)
 *  • Line-spacing dropdown: 1.0 / 1.15 / 1.5 / 2.0
 *  • Expanded styles gallery: Normal / H1–H4 / Quote / Checklist
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  SELECTION_CHANGE_COMMAND,
  FORMAT_TEXT_COMMAND,
  FORMAT_ELEMENT_COMMAND,
  $getSelection,
  $isRangeSelection,
  $isElementNode,
  COMMAND_PRIORITY_CRITICAL,
  $createParagraphNode,
  INDENT_CONTENT_COMMAND,
  OUTDENT_CONTENT_COMMAND,
} from 'lexical';
import type { ElementFormatType } from 'lexical';
import { $patchStyleText, $setBlocksType } from '@lexical/selection';
import {
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  INSERT_CHECK_LIST_COMMAND,
  REMOVE_LIST_COMMAND,
  $isListNode,
  ListNode,
} from '@lexical/list';
import { $createQuoteNode } from '@lexical/rich-text';
import { $createHeadingNode } from '@lexical/rich-text';
import type { HeadingTagType } from '@lexical/rich-text';
import { $getNearestNodeOfType } from '@lexical/utils';
import {
  Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, ListChecks, ClipboardPaste, Scissors, Copy, Strikethrough,
  Subscript, Superscript, IndentDecrease, IndentIncrease, RemoveFormatting,
  ChevronDown, ChevronUp, Baseline, Highlighter, Brush,
} from 'lucide-react';
import styles from '../../layout/MainLayout.module.css';

// ── Colour presets ─────────────────────────────────────────────────────────

const TEXT_COLORS = [
  '#000000', '#1e293b', '#374151', '#6b7280', '#9ca3af',
  '#ffffff', '#f1f5f9', '#e2e8f0', '#cbd5e1', '#94a3b8',
  '#dc2626', '#ea580c', '#d97706', '#65a30d', '#059669',
  '#0891b2', '#2563eb', '#7c3aed', '#db2777', '#be185d',
];

const HIGHLIGHT_COLORS = [
  '#fef08a', '#bbf7d0', '#bae6fd', '#fecaca',
  '#fed7aa', '#e9d5ff', '#fbcfe8', '#a5f3fc',
  '#fde68a', '#d9f99d', '#ccfbf1', '#f0abfc',
];

// ── Font catalogue ─────────────────────────────────────────────────────────

const FONT_FAMILIES = [
  { label: 'Inter',           value: 'Inter, sans-serif' },
  { label: 'Arial',           value: 'Arial, sans-serif' },
  { label: 'Georgia',         value: 'Georgia, serif' },
  { label: 'Times New Roman', value: '"Times New Roman", Times, serif' },
  { label: 'Courier New',     value: '"Courier New", Courier, monospace' },
  { label: 'Trebuchet MS',    value: '"Trebuchet MS", sans-serif' },
  { label: 'Verdana',         value: 'Verdana, sans-serif' },
];

const FONT_SIZES = ['8', '9', '10', '11', '12', '14', '16', '18', '20', '24', '28', '32', '36', '48', '72'];

const LINE_SPACINGS = [
  { label: '1.0',  value: '1' },
  { label: '1.15', value: '1.15' },
  { label: '1.5',  value: '1.5' },
  { label: '2.0',  value: '2' },
];

// ── Colour swatch ──────────────────────────────────────────────────────────

function ColorSwatch({
  color, selected, onClick,
}: { color: string; selected: boolean; onClick: () => void }) {
  const isTransparent = color === 'transparent';
  return (
    <button
      type="button"
      title={isTransparent ? 'Remove' : color}
      onClick={onClick}
      style={{
        width: 18, height: 18, padding: 0, border: 'none', borderRadius: 2,
        cursor: 'pointer', flexShrink: 0, boxSizing: 'border-box',
        outline: selected ? '2px solid var(--brand-primary)' : '1px solid rgba(128,128,128,0.3)',
        background: isTransparent
          ? 'repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%) 0 0 / 6px 6px'
          : color,
      }}
    />
  );
}

// ── Colour picker popover ──────────────────────────────────────────────────

function ColorPickerPopover({
  colors, value, onSelect, showRemove = false,
}: {
  colors: string[];
  value: string;
  onSelect: (c: string) => void;
  showRemove?: boolean;
}) {
  return (
    <div style={{
      position: 'absolute', top: '100%', left: 0, zIndex: 200,
      background: 'var(--bg-surface, #1e1e2e)',
      border: '1px solid var(--border-color, #333)',
      borderRadius: 6, padding: 8,
      boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
      display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 18px)', gap: 3 }}>
        {colors.map(c => (
          <ColorSwatch key={c} color={c} selected={value === c} onClick={() => onSelect(c)} />
        ))}
        {showRemove && (
          <ColorSwatch color="transparent" selected={false} onClick={() => onSelect('transparent')} />
        )}
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
        <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>Custom</span>
        <input
          type="color"
          value={!value || value === 'transparent' ? '#000000' : value}
          onChange={e => onSelect(e.target.value)}
          style={{ width: 28, height: 18, cursor: 'pointer', border: 'none', padding: 0, background: 'none' }}
        />
      </label>
    </div>
  );
}

// ── HomeRibbon ─────────────────────────────────────────────────────────────

interface HomeRibbonProps {
  onOpenStyles?: () => void;
}

export function HomeRibbon({ onOpenStyles }: HomeRibbonProps) {
  const [editor] = useLexicalComposerContext();

  // ── Format state ───────────────────────────────────────────────────────
  const [isBold,          setIsBold]          = useState(false);
  const [isItalic,        setIsItalic]        = useState(false);
  const [isUnderline,     setIsUnderline]     = useState(false);
  const [isStrikethrough, setIsStrikethrough] = useState(false);
  const [isSubscript,     setIsSubscript]     = useState(false);
  const [isSuperscript,   setIsSuperscript]   = useState(false);
  const [blockType,       setBlockType]       = useState('paragraph');
  const [activeAlignment, setActiveAlignment] = useState<ElementFormatType>('left');
  const [fontFamily,      setFontFamily]      = useState('Inter, sans-serif');
  const [fontSize,        setFontSize]        = useState('14');
  const [lineHeight,      setLineHeight]      = useState('1.5');
  const [textColor,       setTextColor]       = useState('#000000');
  const [highlightColor,  setHighlightColor]  = useState('');
  const [openPicker,      setOpenPicker]      = useState<'text' | 'highlight' | 'spacing' | null>(null);

  const fontInputRef   = useRef<HTMLInputElement>(null);
  const pickerRef      = useRef<HTMLDivElement>(null);

  // Close any open picker when clicking outside
  useEffect(() => {
    if (!openPicker) return;
    const handler = (e: MouseEvent) => {
      if (!pickerRef.current?.contains(e.target as Node)) setOpenPicker(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openPicker]);

  // ── Toolbar state sync ─────────────────────────────────────────────────
  const $updateToolbar = useCallback(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return;

    setIsBold(selection.hasFormat('bold'));
    setIsItalic(selection.hasFormat('italic'));
    setIsUnderline(selection.hasFormat('underline'));
    setIsStrikethrough(selection.hasFormat('strikethrough'));
    setIsSubscript(selection.hasFormat('subscript'));
    setIsSuperscript(selection.hasFormat('superscript'));

    const anchorNode = selection.anchor.getNode();
    const element =
      anchorNode.getKey() === 'root'
        ? anchorNode
        : anchorNode.getTopLevelElementOrThrow();

    // Block type
    if ($isListNode(element)) {
      const parentList = $getNearestNodeOfType(anchorNode, ListNode);
      setBlockType(parentList ? parentList.getListType() : element.getListType());
    } else {
      setBlockType(element.getType() || 'paragraph');
    }

    // Alignment — read from element node format
    if ($isElementNode(element)) {
      setActiveAlignment(element.getFormatType() || 'left');
    }
  }, []);

  useEffect(() => editor.registerCommand(
    SELECTION_CHANGE_COMMAND,
    () => { $updateToolbar(); return false; },
    COMMAND_PRIORITY_CRITICAL,
  ), [editor, $updateToolbar]);

  useEffect(() => editor.registerUpdateListener(({ editorState }) => {
    editorState.read(() => $updateToolbar());
  }), [editor, $updateToolbar]);

  // ── Helpers ────────────────────────────────────────────────────────────
  const applyStyleText = useCallback((s: Record<string, string>) => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) $patchStyleText(selection, s);
    });
  }, [editor]);

  const applyTextColor = (color: string) => {
    setTextColor(color);
    setOpenPicker(null);
    applyStyleText({ color });
  };

  const applyHighlight = (color: string) => {
    setHighlightColor(color);
    setOpenPicker(null);
    applyStyleText({ 'background-color': color === 'transparent' ? '' : color });
  };

  const applyLineSpacing = (value: string) => {
    setLineHeight(value);
    setOpenPicker(null);
    applyStyleText({ 'line-height': value });
  };

  const clearFormatting = () => {
    editor.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      // Reset block to paragraph
      $setBlocksType(selection, () => $createParagraphNode());
      // Clear inline styles on text nodes
      selection.getNodes().forEach(node => {
        if ('setFormat' in node && typeof (node as any).setFormat === 'function') {
          (node as any).setFormat(0);
        }
        if ('setStyle' in node && typeof (node as any).setStyle === 'function') {
          (node as any).setStyle('');
        }
      });
    });
  };

  const formatBlock = (tag: HeadingTagType | 'paragraph' | 'quote' | 'bullet' | 'number' | 'check') => {
    editor.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      if (tag === 'paragraph') {
        $setBlocksType(selection, () => $createParagraphNode());
      } else if (tag === 'quote') {
        $setBlocksType(selection, () => $createQuoteNode());
      } else if (tag === 'bullet') {
        editor.dispatchCommand(blockType === 'bullet' ? REMOVE_LIST_COMMAND : INSERT_UNORDERED_LIST_COMMAND, undefined);
      } else if (tag === 'number') {
        editor.dispatchCommand(blockType === 'number' ? REMOVE_LIST_COMMAND : INSERT_ORDERED_LIST_COMMAND, undefined);
      } else if (tag === 'check') {
        editor.dispatchCommand(blockType === 'check' ? REMOVE_LIST_COMMAND : INSERT_CHECK_LIST_COMMAND, undefined);
      } else {
        $setBlocksType(selection, () => $createHeadingNode(tag));
      }
    });
  };

  const handleClipboard = (action: 'cut' | 'copy' | 'paste') => {
    if (action === 'paste') {
      navigator.clipboard.readText().then(t => {
        editor.update(() => {
          const sel = $getSelection();
          if (sel) sel.insertText(t);
        });
      });
    } else {
      document.execCommand(action);
    }
  };

  const handleCustomFontUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fontName = file.name.replace(/\.[^.]+$/, '');
    const reader = new FileReader();
    reader.onload = async ev => {
      if (ev.target?.result instanceof ArrayBuffer) {
        try {
          const font = new FontFace(fontName, ev.target.result);
          await font.load();
          document.fonts.add(font);
          const value = `"${fontName}", sans-serif`;
          setFontFamily(value);
          applyStyleText({ 'font-family': value });
        } catch {
          // Font load failed — ignore silently
        }
      }
    };
    reader.readAsArrayBuffer(file);
    if (fontInputRef.current) fontInputRef.current.value = '';
  };

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className={styles.ribbonToolbar}>

      {/* ── Clipboard ─────────────────────────────────────────────────── */}
      <div className={styles.compactRibbonGroup}>
        <div className={styles.largeToolBtn} onClick={() => handleClipboard('paste')} title="Paste">
          <ClipboardPaste size={20} />
          <span style={{ fontSize: '10px' }}>Paste</span>
        </div>
        <div className={styles.ribbonColumn}>
          <button type="button" className={styles.toolbarBtn} onClick={() => handleClipboard('cut')}   title="Cut">  <Scissors size={14} /></button>
          <button type="button" className={styles.toolbarBtn} onClick={() => handleClipboard('copy')}  title="Copy"> <Copy     size={14} /></button>
        </div>
      </div>

      {/* ── Font ──────────────────────────────────────────────────────── */}
      <div className={styles.compactRibbonGroup}>
        <div className={styles.ribbonColumn}>
          <div className={styles.compactRibbonRow}>
            {/* Font family */}
            <select
              className={styles.toolbarSelect}
              style={{ width: 120 }}
              value={fontFamily}
              onChange={e => {
                if (e.target.value === '__UPLOAD__') { fontInputRef.current?.click(); return; }
                setFontFamily(e.target.value);
                applyStyleText({ 'font-family': e.target.value });
              }}
            >
              {FONT_FAMILIES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              <option value="__UPLOAD__">Upload font…</option>
            </select>
            <input ref={fontInputRef} type="file" accept=".ttf,.otf,.woff,.woff2"
              style={{ display: 'none' }} onChange={handleCustomFontUpload} />

            {/* Font size */}
            <select
              className={styles.toolbarSelect}
              style={{ width: 52 }}
              value={fontSize}
              onChange={e => { setFontSize(e.target.value); applyStyleText({ 'font-size': `${e.target.value}px` }); }}
            >
              {FONT_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>

            {/* Increment / decrement */}
            <button type="button" className={styles.toolbarBtn} title="Increase font size"
              onClick={() => {
                const next = Math.min(+fontSize + 2, 96).toString();
                setFontSize(next); applyStyleText({ 'font-size': `${next}px` });
              }}>
              <span style={{ fontSize: 12, display: 'flex', alignItems: 'center' }}>A<ChevronUp size={9} /></span>
            </button>
            <button type="button" className={styles.toolbarBtn} title="Decrease font size"
              onClick={() => {
                const next = Math.max(+fontSize - 2, 6).toString();
                setFontSize(next); applyStyleText({ 'font-size': `${next}px` });
              }}>
              <span style={{ fontSize: 12, display: 'flex', alignItems: 'center' }}>A<ChevronDown size={9} /></span>
            </button>
          </div>

          {/* ── Inline format row ──────────────────────────────────── */}
          <div className={styles.compactRibbonRow}>
            <button type="button" title="Bold (Ctrl+B)"
              className={`${styles.toolbarBtn} ${isBold          ? styles.toolbarBtnActive : ''}`}
              onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold')}>          <Bold          size={14} /></button>
            <button type="button" title="Italic (Ctrl+I)"
              className={`${styles.toolbarBtn} ${isItalic        ? styles.toolbarBtnActive : ''}`}
              onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic')}>        <Italic        size={14} /></button>
            <button type="button" title="Underline (Ctrl+U)"
              className={`${styles.toolbarBtn} ${isUnderline     ? styles.toolbarBtnActive : ''}`}
              onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'underline')}>     <Underline     size={14} /></button>
            <button type="button" title="Strikethrough"
              className={`${styles.toolbarBtn} ${isStrikethrough ? styles.toolbarBtnActive : ''}`}
              onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'strikethrough')}> <Strikethrough size={14} /></button>
            <button type="button" title="Subscript"
              className={`${styles.toolbarBtn} ${isSubscript     ? styles.toolbarBtnActive : ''}`}
              onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'subscript')}>     <Subscript     size={14} /></button>
            <button type="button" title="Superscript"
              className={`${styles.toolbarBtn} ${isSuperscript   ? styles.toolbarBtnActive : ''}`}
              onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'superscript')}>   <Superscript   size={14} /></button>

            {/* ── Text colour ──────────────────────────────────────── */}
            <div style={{ position: 'relative' }} ref={openPicker === 'text' ? pickerRef : undefined}>
              <button
                type="button"
                title="Text colour"
                className={styles.toolbarBtn}
                onClick={() => setOpenPicker(p => p === 'text' ? null : 'text')}
                style={{ flexDirection: 'column', alignItems: 'center', gap: 1, padding: '2px 4px' }}
              >
                <Baseline size={13} />
                <span style={{ width: 14, height: 3, borderRadius: 1, background: textColor || '#000' }} />
              </button>
              {openPicker === 'text' && (
                <ColorPickerPopover colors={TEXT_COLORS} value={textColor} onSelect={applyTextColor} />
              )}
            </div>

            {/* ── Highlight colour ─────────────────────────────────── */}
            <div style={{ position: 'relative' }} ref={openPicker === 'highlight' ? pickerRef : undefined}>
              <button
                type="button"
                title="Highlight colour"
                className={styles.toolbarBtn}
                onClick={() => setOpenPicker(p => p === 'highlight' ? null : 'highlight')}
                style={{ flexDirection: 'column', alignItems: 'center', gap: 1, padding: '2px 4px' }}
              >
                <Highlighter size={13} />
                <span style={{
                  width: 14, height: 3, borderRadius: 1,
                  background: highlightColor || 'transparent',
                  border: highlightColor ? 'none' : '1px solid var(--border-color)',
                }} />
              </button>
              {openPicker === 'highlight' && (
                <ColorPickerPopover colors={HIGHLIGHT_COLORS} value={highlightColor}
                  onSelect={applyHighlight} showRemove />
              )}
            </div>

            {/* Clear formatting */}
            <button type="button" title="Clear formatting"
              className={styles.toolbarBtn} onClick={clearFormatting}>
              <RemoveFormatting size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Paragraph ─────────────────────────────────────────────────── */}
      <div className={styles.compactRibbonGroup}>
        <div className={styles.ribbonColumn}>
          <div className={styles.compactRibbonRow}>
            <button type="button" title="Bullet list"
              className={`${styles.toolbarBtn} ${blockType === 'bullet' ? styles.toolbarBtnActive : ''}`}
              onClick={() => formatBlock('bullet')}><List size={14} /></button>
            <button type="button" title="Numbered list"
              className={`${styles.toolbarBtn} ${blockType === 'number' ? styles.toolbarBtnActive : ''}`}
              onClick={() => formatBlock('number')}><ListOrdered size={14} /></button>
            <button type="button" title="Checklist"
              className={`${styles.toolbarBtn} ${blockType === 'check' ? styles.toolbarBtnActive : ''}`}
              onClick={() => formatBlock('check')}><ListChecks size={14} /></button>
            <button type="button" title="Decrease indent"
              className={styles.toolbarBtn}
              onClick={() => editor.dispatchCommand(OUTDENT_CONTENT_COMMAND, undefined)}><IndentDecrease size={14} /></button>
            <button type="button" title="Increase indent"
              className={styles.toolbarBtn}
              onClick={() => editor.dispatchCommand(INDENT_CONTENT_COMMAND, undefined)}><IndentIncrease size={14} /></button>
          </div>

          <div className={styles.compactRibbonRow}>
            <button type="button" title="Align left"
              className={`${styles.toolbarBtn} ${activeAlignment === 'left'    || activeAlignment === '' ? styles.toolbarBtnActive : ''}`}
              onClick={() => editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'left')}>    <AlignLeft    size={14} /></button>
            <button type="button" title="Centre"
              className={`${styles.toolbarBtn} ${activeAlignment === 'center'  ? styles.toolbarBtnActive : ''}`}
              onClick={() => editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'center')}>  <AlignCenter  size={14} /></button>
            <button type="button" title="Align right"
              className={`${styles.toolbarBtn} ${activeAlignment === 'right'   ? styles.toolbarBtnActive : ''}`}
              onClick={() => editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'right')}>   <AlignRight   size={14} /></button>
            <button type="button" title="Justify"
              className={`${styles.toolbarBtn} ${activeAlignment === 'justify' ? styles.toolbarBtnActive : ''}`}
              onClick={() => editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'justify')}> <AlignJustify size={14} /></button>

            {/* ── Line spacing dropdown ─────────────────────────── */}
            <div style={{ position: 'relative' }} ref={openPicker === 'spacing' ? pickerRef : undefined}>
              <button
                type="button"
                title={`Line spacing: ${lineHeight}`}
                className={styles.toolbarBtn}
                onClick={() => setOpenPicker(p => p === 'spacing' ? null : 'spacing')}
                style={{ gap: 1 }}
              >
                <span style={{ fontSize: 11, fontWeight: 500 }}>{lineHeight}×</span>
              </button>
              {openPicker === 'spacing' && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, zIndex: 200,
                  background: 'var(--bg-surface, #1e1e2e)',
                  border: '1px solid var(--border-color, #333)',
                  borderRadius: 6, overflow: 'hidden',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                  minWidth: 80,
                }}>
                  {LINE_SPACINGS.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => applyLineSpacing(opt.value)}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left',
                        padding: '6px 12px', border: 'none', cursor: 'pointer',
                        fontSize: 13,
                        background: lineHeight === opt.value
                          ? 'var(--brand-primary, #6c63ff)'
                          : 'transparent',
                        color: lineHeight === opt.value
                          ? '#fff'
                          : 'var(--text-primary)',
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Styles gallery ────────────────────────────────────────────── */}
      <div className={styles.compactRibbonGroup}>
        <div className={styles.styleGallery}>
          {[
            { tag: 'paragraph', label: 'Normal',    preview: 'AaBb',      previewStyle: { fontSize: 12 } },
            { tag: 'h1',        label: 'Heading 1', preview: 'Heading 1', previewStyle: { fontWeight: 700, fontSize: 14, color: 'var(--brand-primary)' } },
            { tag: 'h2',        label: 'Heading 2', preview: 'Heading 2', previewStyle: { fontWeight: 600, fontSize: 13, color: 'var(--brand-primary)' } },
            { tag: 'h3',        label: 'Heading 3', preview: 'Heading 3', previewStyle: { fontWeight: 600, fontSize: 12 } },
            { tag: 'h4',        label: 'Heading 4', preview: 'Heading 4', previewStyle: { fontWeight: 500, fontSize: 11, textTransform: 'uppercase' as const, letterSpacing: '0.04em' } },
            { tag: 'quote',     label: 'Quote',     preview: '"Quote"',   previewStyle: { fontStyle: 'italic', fontSize: 11, borderLeft: '2px solid var(--brand-primary)', paddingLeft: 4 } },
          ].map(({ tag, label, preview, previewStyle }) => (
            <div
              key={tag}
              className={`${styles.styleGalleryItem} ${blockType === (tag === 'paragraph' ? 'paragraph' : tag) ? styles.styleGalleryItemActive : ''}`}
              onClick={() => formatBlock(tag as HeadingTagType | 'paragraph' | 'quote' | 'bullet' | 'number' | 'check')}
              title={label}
            >
              <span className={styles.styleGalleryPreview} style={previewStyle}>{preview}</span>
              <span className={styles.styleGalleryName}>{label}</span>
            </div>
          ))}
        </div>
        <div className={styles.largeToolBtn} onClick={onOpenStyles} title="Open styles panel">
          <Brush size={20} style={{ color: 'var(--brand-primary)' }} />
          <span style={{ fontSize: '9px' }}>Styles</span>
        </div>
      </div>
    </div>
  );
}
