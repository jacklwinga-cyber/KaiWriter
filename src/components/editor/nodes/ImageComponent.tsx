/**
 * ImageComponent.tsx
 *
 * Features added beyond the original:
 *  • Resize  — 8 drag handles (corners lock aspect ratio, edges free)
 *  • Align   — floating toolbar: inline / float-left / center / float-right
 *  • Crop    — drag-select region on the image → canvas crop → updates src
 */

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
import { useCallback, useEffect, useRef, useState } from 'react';
import { AlignCenter, AlignLeft, AlignRight, Check, Crop, Move, X } from 'lucide-react';
import { $isImageNode, type ImageAlignment } from './ImageNode';

// ── Constants ──────────────────────────────────────────────────────────────

const MIN_PX = 40;

// ── Types ──────────────────────────────────────────────────────────────────

type HandlePos = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

interface ResizeOrigin {
  handle: HandlePos;
  mouseX: number;
  mouseY: number;
  startW: number;
  startH: number;
}

interface Point { x: number; y: number }

// ── Resize handle position → CSS ───────────────────────────────────────────

function resizeHandleStyle(pos: HandlePos): React.CSSProperties {
  const mid = 'calc(50% - 5px)';
  const e = -6;
  const positions: Record<HandlePos, React.CSSProperties> = {
    nw: { top: e, left: e,   cursor: 'nw-resize' },
    n:  { top: e, left: mid, cursor: 'n-resize'  },
    ne: { top: e, right: e,  cursor: 'ne-resize' },
    e:  { top: mid, right: e,  cursor: 'e-resize'  },
    se: { bottom: e, right: e,  cursor: 'se-resize' },
    s:  { bottom: e, left: mid, cursor: 's-resize'  },
    sw: { bottom: e, left: e,   cursor: 'sw-resize' },
    w:  { top: mid, left: e,    cursor: 'w-resize'  },
  };
  return {
    position: 'absolute', width: 11, height: 11,
    background: '#ffffff',
    border: '2px solid var(--brand-primary, #6c63ff)',
    borderRadius: 3, zIndex: 10, boxSizing: 'border-box',
    ...positions[pos],
  };
}

// ── Canvas crop helper ─────────────────────────────────────────────────────

async function cropImageDataURL(
  imgEl: HTMLImageElement,
  displayX: number, displayY: number,
  displayW: number, displayH: number,
): Promise<string> {
  const scaleX = imgEl.naturalWidth  / imgEl.offsetWidth;
  const scaleY = imgEl.naturalHeight / imgEl.offsetHeight;
  const canvas = document.createElement('canvas');
  canvas.width  = Math.max(1, Math.round(displayW * scaleX));
  canvas.height = Math.max(1, Math.round(displayH * scaleY));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2D context');
  ctx.drawImage(
    imgEl,
    displayX * scaleX, displayY * scaleY,
    displayW * scaleX, displayH * scaleY,
    0, 0, canvas.width, canvas.height,
  );
  return canvas.toDataURL('image/png');
}

// ── Toolbar button helper ──────────────────────────────────────────────────

function ToolbarBtn({
  title, active, disabled, onClick, children,
}: {
  title: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onMouseDown={e => { e.preventDefault(); if (!disabled) onClick(); }}
      style={{
        display: 'flex', alignItems: 'center', gap: 3,
        padding: '3px 6px', border: 'none', borderRadius: 4, cursor: disabled ? 'default' : 'pointer',
        fontSize: 12,
        background: active
          ? 'var(--brand-primary, #6c63ff)'
          : 'transparent',
        color: disabled
          ? 'var(--text-muted, #555)'
          : active
            ? '#fff'
            : 'var(--text-secondary, #aaa)',
        transition: 'background 0.15s',
      }}
    >
      {children}
    </button>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function ImageComponent({
  src, altText, nodeKey, width, height, maxWidth,
  alignment: initialAlignment = 'inline',
}: {
  altText: string;
  height: 'inherit' | number;
  maxWidth: number;
  nodeKey: NodeKey;
  src: string;
  width: 'inherit' | number;
  alignment?: ImageAlignment;
}) {
  const [editor] = useLexicalComposerContext();
  const [isSelected, setSelected, clearSelection] = useLexicalNodeSelection(nodeKey);
  const imgRef = useRef<HTMLImageElement>(null);

  // Local display dimensions — committed to the node on resize-end or crop
  const [dispW, setDispW] = useState<number | 'inherit'>(width);
  const [dispH, setDispH] = useState<number | 'inherit'>(height);
  const [alignment, setAlignment] = useState<ImageAlignment>(initialAlignment);

  // Sync if the node's stored values change externally
  useEffect(() => setDispW(width),            [width]);
  useEffect(() => setDispH(height),           [height]);
  useEffect(() => setAlignment(initialAlignment), [initialAlignment]);

  // Refs so window-level handlers can read current values in closures
  const dispWRef = useRef(dispW);
  const dispHRef = useRef(dispH);
  useEffect(() => { dispWRef.current = dispW; }, [dispW]);
  useEffect(() => { dispHRef.current = dispH; }, [dispH]);

  // ── Delete ────────────────────────────────────────────────────────────────

  const onDelete = useCallback((e: KeyboardEvent) => {
    if (isSelected && $isNodeSelection($getSelection())) {
      e.preventDefault();
      $getNodeByKey(nodeKey)?.remove();
      return true;
    }
    return false;
  }, [isSelected, nodeKey]);

  // ── Click (Lexical selection) ─────────────────────────────────────────────

  const onClick = useCallback((e: MouseEvent) => {
    if (e.target === imgRef.current) {
      clearSelection();
      setSelected(true);
      return true;
    }
    return false;
  }, [clearSelection, setSelected]);

  useEffect(() => mergeRegister(
    editor.registerCommand(CLICK_COMMAND,        onClick,   COMMAND_PRIORITY_LOW),
    editor.registerCommand(KEY_DELETE_COMMAND,   onDelete,  COMMAND_PRIORITY_LOW),
    editor.registerCommand(KEY_BACKSPACE_COMMAND, onDelete, COMMAND_PRIORITY_LOW),
  ), [editor, onClick, onDelete]);

  // ── Resize ────────────────────────────────────────────────────────────────

  const resizeOriginRef = useRef<ResizeOrigin | null>(null);

  const startResize = useCallback((e: React.MouseEvent, handle: HandlePos) => {
    e.preventDefault();
    e.stopPropagation();
    const w = imgRef.current?.offsetWidth  ?? (typeof dispW === 'number' ? dispW : 300);
    const h = imgRef.current?.offsetHeight ?? (typeof dispH === 'number' ? dispH : 200);
    resizeOriginRef.current = { handle, mouseX: e.clientX, mouseY: e.clientY, startW: w, startH: h };
  }, [dispW, dispH]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const o = resizeOriginRef.current;
      if (!o) return;
      const dx = e.clientX - o.mouseX;
      const dy = e.clientY - o.mouseY;
      const ar = o.startH > 0 ? o.startW / o.startH : 1;
      let w = o.startW, h = o.startH;
      switch (o.handle) {
        case 'e':  w = Math.max(MIN_PX, o.startW + dx); break;
        case 'w':  w = Math.max(MIN_PX, o.startW - dx); break;
        case 's':  h = Math.max(MIN_PX, o.startH + dy); break;
        case 'n':  h = Math.max(MIN_PX, o.startH - dy); break;
        // Corners: lock aspect ratio
        case 'se': w = Math.max(MIN_PX, o.startW + dx); h = Math.round(w / ar); break;
        case 'sw': w = Math.max(MIN_PX, o.startW - dx); h = Math.round(w / ar); break;
        case 'ne': w = Math.max(MIN_PX, o.startW + dx); h = Math.round(w / ar); break;
        case 'nw': w = Math.max(MIN_PX, o.startW - dx); h = Math.round(w / ar); break;
      }
      setDispW(w);
      setDispH(h);
    };

    const onUp = () => {
      if (!resizeOriginRef.current) return;
      resizeOriginRef.current = null;
      const w = dispWRef.current;
      const h = dispHRef.current;
      editor.update(() => {
        const node = $getNodeByKey(nodeKey);
        if ($isImageNode(node)) node.setDimensions(w, h);
      });
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
    };
  }, [editor, nodeKey]);

  // ── Alignment ─────────────────────────────────────────────────────────────

  const applyAlignment = useCallback((next: ImageAlignment) => {
    setAlignment(next);
    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if ($isImageNode(node)) node.setAlignment(next);
    });
  }, [editor, nodeKey]);

  // ── Crop ──────────────────────────────────────────────────────────────────

  const [cropMode, setCropMode]       = useState(false);
  const [cropStart, setCropStart]     = useState<Point | null>(null);
  const [cropEnd,   setCropEnd]       = useState<Point | null>(null);
  const [applying,  setApplying]      = useState(false);

  const cropRect = (() => {
    if (!cropStart || !cropEnd) return null;
    const x = Math.min(cropStart.x, cropEnd.x);
    const y = Math.min(cropStart.y, cropEnd.y);
    const w = Math.abs(cropEnd.x - cropStart.x);
    const h = Math.abs(cropEnd.y - cropStart.y);
    return (w > 4 && h > 4) ? { x, y, w, h } : null;
  })();

  const applyCrop = async () => {
    if (!cropRect || !imgRef.current) return;
    setApplying(true);
    try {
      const newSrc = await cropImageDataURL(
        imgRef.current,
        cropRect.x, cropRect.y, cropRect.w, cropRect.h,
      );
      editor.update(() => {
        const node = $getNodeByKey(nodeKey);
        if ($isImageNode(node)) {
          node.setSrc(newSrc);
          node.setDimensions(Math.round(cropRect.w), Math.round(cropRect.h));
        }
      });
      setCropMode(false);
      setCropStart(null);
      setCropEnd(null);
    } catch {
      // silently ignore — original image unchanged
    } finally {
      setApplying(false);
    }
  };

  const cancelCrop = () => {
    setCropMode(false);
    setCropStart(null);
    setCropEnd(null);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const showHandles = isSelected && !cropMode;

  return (
    <div style={{ position: 'relative', display: 'inline-block', userSelect: 'none' }}>

      {/* ── Floating toolbar ─────────────────────────────────────────────── */}
      {isSelected && !cropMode && (
        <div
          onMouseDown={e => e.preventDefault()} // keep editor focus
          style={{
            position: 'absolute', bottom: '100%', left: '50%',
            transform: 'translateX(-50%)',
            marginBottom: 6,
            display: 'flex', alignItems: 'center', gap: 1,
            background: 'var(--bg-surface, #1e1e2e)',
            border: '1px solid var(--border-color, #333)',
            borderRadius: 6, padding: '2px 4px',
            boxShadow: '0 2px 10px rgba(0,0,0,0.4)',
            zIndex: 20, whiteSpace: 'nowrap',
          }}
        >
          <ToolbarBtn title="Inline"      active={alignment === 'inline'} onClick={() => applyAlignment('inline')}>
            <Move size={13} />
          </ToolbarBtn>
          <ToolbarBtn title="Float left"  active={alignment === 'left'}   onClick={() => applyAlignment('left')}>
            <AlignLeft size={13} />
          </ToolbarBtn>
          <ToolbarBtn title="Center"      active={alignment === 'center'} onClick={() => applyAlignment('center')}>
            <AlignCenter size={13} />
          </ToolbarBtn>
          <ToolbarBtn title="Float right" active={alignment === 'right'}  onClick={() => applyAlignment('right')}>
            <AlignRight size={13} />
          </ToolbarBtn>

          {/* Divider */}
          <div style={{ width: 1, height: 18, background: 'var(--border-color, #444)', margin: '0 3px' }} />

          {/* Dimensions readout */}
          {typeof dispW === 'number' && typeof dispH === 'number' && (
            <span style={{ fontSize: 11, color: 'var(--text-muted, #666)', padding: '0 4px' }}>
              {dispW} × {dispH}
            </span>
          )}

          <div style={{ width: 1, height: 18, background: 'var(--border-color, #444)', margin: '0 3px' }} />

          <ToolbarBtn title="Crop" onClick={() => setCropMode(true)}>
            <Crop size={13} /> <span style={{ fontSize: 11 }}>Crop</span>
          </ToolbarBtn>
        </div>
      )}

      {/* ── Crop toolbar ─────────────────────────────────────────────────── */}
      {cropMode && (
        <div
          onMouseDown={e => e.preventDefault()}
          style={{
            position: 'absolute', bottom: '100%', left: '50%',
            transform: 'translateX(-50%)',
            marginBottom: 6,
            display: 'flex', alignItems: 'center', gap: 4,
            background: 'var(--bg-surface, #1e1e2e)',
            border: '1px solid var(--border-color, #333)',
            borderRadius: 6, padding: '3px 8px',
            boxShadow: '0 2px 10px rgba(0,0,0,0.4)',
            zIndex: 20, whiteSpace: 'nowrap',
            fontSize: 12, color: 'var(--text-secondary, #aaa)',
          }}
        >
          <span>Drag to select crop area</span>
          <ToolbarBtn
            title="Apply crop"
            active
            disabled={!cropRect || applying}
            onClick={() => void applyCrop()}
          >
            <Check size={13} /> Apply
          </ToolbarBtn>
          <ToolbarBtn title="Cancel crop" onClick={cancelCrop}>
            <X size={13} /> Cancel
          </ToolbarBtn>
        </div>
      )}

      {/* ── Crop overlay (on top of the image) ───────────────────────────── */}
      {cropMode && (
        <div
          style={{ position: 'absolute', inset: 0, zIndex: 8, cursor: 'crosshair' }}
          onMouseDown={e => {
            e.preventDefault();
            const r = e.currentTarget.getBoundingClientRect();
            setCropStart({ x: e.clientX - r.left, y: e.clientY - r.top });
            setCropEnd(null);
          }}
          onMouseMove={e => {
            if (!cropStart) return;
            const r = e.currentTarget.getBoundingClientRect();
            setCropEnd({ x: e.clientX - r.left, y: e.clientY - r.top });
          }}
          onMouseUp={() => { /* cropRect is already live */ }}
        >
          {cropRect && (
            <>
              {/* Four darkened strips around the selection */}
              {/* Top */}
              <div style={{ position: 'absolute', left: 0, top: 0, right: 0, height: cropRect.y,
                background: 'rgba(0,0,0,0.5)', pointerEvents: 'none' }} />
              {/* Bottom */}
              <div style={{ position: 'absolute', left: 0, top: cropRect.y + cropRect.h, right: 0, bottom: 0,
                background: 'rgba(0,0,0,0.5)', pointerEvents: 'none' }} />
              {/* Left */}
              <div style={{ position: 'absolute', left: 0, top: cropRect.y, width: cropRect.x, height: cropRect.h,
                background: 'rgba(0,0,0,0.5)', pointerEvents: 'none' }} />
              {/* Right */}
              <div style={{ position: 'absolute', left: cropRect.x + cropRect.w, top: cropRect.y,
                right: 0, height: cropRect.h,
                background: 'rgba(0,0,0,0.5)', pointerEvents: 'none' }} />
              {/* Dashed selection border */}
              <div style={{
                position: 'absolute',
                left: cropRect.x, top: cropRect.y,
                width: cropRect.w, height: cropRect.h,
                border: '2px dashed rgba(255,255,255,0.9)',
                boxSizing: 'border-box', pointerEvents: 'none',
              }} />
              {/* Size label */}
              <div style={{
                position: 'absolute',
                left: cropRect.x + cropRect.w / 2,
                top: cropRect.y + cropRect.h / 2,
                transform: 'translate(-50%,-50%)',
                color: '#fff', fontSize: 11,
                background: 'rgba(0,0,0,0.55)', borderRadius: 4,
                padding: '1px 5px', pointerEvents: 'none',
              }}>
                {Math.round(cropRect.w)} × {Math.round(cropRect.h)}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── The image ────────────────────────────────────────────────────── */}
      <img
        ref={imgRef}
        src={src}
        alt={altText}
        draggable={false}
        style={{
          display: 'block',
          width:    typeof dispW === 'number' ? dispW    : undefined,
          height:   typeof dispH === 'number' ? dispH   : undefined,
          maxWidth: dispW === 'inherit'        ? maxWidth : undefined,
          outline:  isSelected && !cropMode
            ? '2px solid var(--brand-primary, #6c63ff)'
            : 'none',
          boxShadow: isSelected && !cropMode
            ? '0 0 0 4px rgba(108,99,255,0.15)'
            : 'none',
          borderRadius: 4,
          cursor: cropMode ? 'crosshair' : 'pointer',
          pointerEvents: cropMode ? 'none' : 'auto',
        }}
      />

      {/* ── Resize handles ───────────────────────────────────────────────── */}
      {showHandles && (
        (['nw','n','ne','e','se','s','sw','w'] as HandlePos[]).map(pos => (
          <div key={pos} style={resizeHandleStyle(pos)} onMouseDown={e => startResize(e, pos)} />
        ))
      )}
    </div>
  );
}
