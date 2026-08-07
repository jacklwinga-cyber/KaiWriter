/**
 * ParagraphFormatPlugin.tsx
 *
 * Registers a Lexical mutation listener for ParagraphNode.
 *
 * WHY this plugin exists
 * ──────────────────────
 * Lexical's ParagraphNode.createDOM() and updateDOM() do NOT apply the node's
 * __style field to the DOM element. The Lexical reconciler only manages
 * textAlign (via FORMAT_ELEMENT_COMMAND) and paddingInlineStart (via
 * INDENT_CONTENT_COMMAND) on paragraph elements.
 *
 * We store paragraph format data (margin/text-indent) in ElementNode.__style
 * for correct serialisation, undo/redo, and copy semantics. This plugin
 * bridges that state to the DOM by applying only the five CSS properties we
 * own via individual style assignments (NOT setAttribute), so Lexical's own
 * textAlign / paddingInlineStart are left untouched.
 */

import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getNodeByKey, ParagraphNode } from 'lexical';
import { $isParagraphNode } from 'lexical';
import { applyParagraphStyleToDOM, clearParagraphStyleOnDOM } from '../../../lib/paragraphFormat';

export function ParagraphFormatPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerMutationListener(
      ParagraphNode,
      (mutatedNodes) => {
        editor.getEditorState().read(() => {
          for (const [nodeKey, mutation] of mutatedNodes) {
            if (mutation === 'destroyed') continue;

            const node = $getNodeByKey(nodeKey);
            if (!node || !$isParagraphNode(node)) continue;

            const styleStr = node.getStyle();
            const dom = editor.getElementByKey(nodeKey) as HTMLElement | null;
            if (!dom) continue;

            if (styleStr) {
              applyParagraphStyleToDOM(dom, styleStr);
            } else {
              clearParagraphStyleOnDOM(dom);
            }
          }
        });
      },
      { skipInitialization: false },
    );
  }, [editor]);

  return null;
}
