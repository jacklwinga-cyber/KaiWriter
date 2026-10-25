import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { X } from 'lucide-react';
import {
  applyPlainTextEditInEditor,
  buildPlainTextMap,
  getCaretPlainOffset,
  getPlainTextFromEditor,
  piecesForRanges,
} from '../../../lib/plainTextMap';
import { computeLiveIssues, ignoreKey, issueAtOffset, LIVE_DEBOUNCE_MS } from '../../../lib/liveProofread';
import {
  addDictionaryWord,
  DICTIONARY_CHANGED_EVENT,
  isValidDictionaryWord,
  loadDictionary,
} from '../../../lib/personalDictionary';
import { rebaseRanges } from '../../../lib/suggestionOffsets';
import type { WritingIssue } from '../../../lib/writingAssist';
import { clearHighlights, LIVE_HIGHLIGHTS, onScrollRepaint, paintHighlights } from '../proofreadHighlights';
import styles from '../Editor.module.css';

interface LiveProofreadPluginProps {
  /** Off when the user turned live checks off, proofreading is disabled, or the Review panel is open. */
  enabled: boolean;
  languageCode: string;
  userId: string | null;
}

interface CardState {
  issue: WritingIssue;
  left: number;
  top: number;
}

/**
 * Proofreads as you type with the offline checks only (nothing leaves the
 * device): underlines issues shortly after typing stops, and shows a small
 * card with fixes when an underlined word is clicked.
 */
export function LiveProofreadPlugin({ enabled, languageCode, userId }: LiveProofreadPluginProps) {
  const [editor] = useLexicalComposerContext();
  const issuesRef = useRef<WritingIssue[]>([]);
  const ignoredRef = useRef<Set<string>>(new Set());
  const dictionaryRef = useRef<string[]>(loadDictionary(userId));
  const [card, setCard] = useState<CardState | null>(null);

  const runCheck = useCallback(() => {
    const text = getPlainTextFromEditor(editor);
    issuesRef.current = computeLiveIssues(text, languageCode, dictionaryRef.current, ignoredRef.current);
    paintHighlights(editor, issuesRef.current, LIVE_HIGHLIGHTS);
  }, [editor, languageCode]);

  // Check shortly after typing stops. Underlines aren't repainted on every
  // keystroke (too slow on long documents); the browser keeps existing ones
  // attached to their text meanwhile.
  useEffect(() => {
    if (!enabled) {
      issuesRef.current = [];
      clearHighlights(LIVE_HIGHLIGHTS);
      return;
    }
    let timer: ReturnType<typeof setTimeout> | null = null;
    runCheck();
    const unregister = editor.registerUpdateListener(({ dirtyElements, dirtyLeaves }) => {
      if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return;
      setCard(null);
      if (timer) clearTimeout(timer);
      timer = setTimeout(runCheck, LIVE_DEBOUNCE_MS);
    });
    const onDictionaryChanged = () => {
      dictionaryRef.current = loadDictionary(userId);
      runCheck();
    };
    window.addEventListener(DICTIONARY_CHANGED_EVENT, onDictionaryChanged);
    const stopScroll = onScrollRepaint(() => paintHighlights(editor, issuesRef.current, LIVE_HIGHLIGHTS));
    return () => {
      if (timer) clearTimeout(timer);
      unregister();
      stopScroll();
      window.removeEventListener(DICTIONARY_CHANGED_EVENT, onDictionaryChanged);
      clearHighlights(LIVE_HIGHLIGHTS);
    };
  }, [editor, enabled, runCheck, userId]);

  // Clicking an underlined word opens its card.
  useEffect(() => {
    if (!enabled) return;
    const root = editor.getRootElement();
    if (!root) return;
    const onClick = () => {
      // Lexical updates the selection after the click; read it on the next tick.
      setTimeout(() => {
        const offset = getCaretPlainOffset(editor);
        const issue = offset === null ? null : issueAtOffset(issuesRef.current, offset);
        if (!issue) {
          setCard(null);
          return;
        }
        const rect = editor.getEditorState().read(() => {
          const piece = piecesForRanges(buildPlainTextMap(), [issue])[0]?.pieces[0];
          const element = piece ? editor.getElementByKey(piece.key) : null;
          let text: Node | null = element;
          while (text && text.nodeType !== Node.TEXT_NODE) text = text.firstChild;
          if (!piece || !text) return null;
          const range = document.createRange();
          range.setStart(text, piece.start);
          range.setEnd(text, Math.min(piece.end, (text as Text).length));
          return range.getBoundingClientRect();
        });
        if (rect) setCard({ issue, left: rect.left, top: rect.bottom + 6 });
      }, 0);
    };
    root.addEventListener('click', onClick);
    return () => root.removeEventListener('click', onClick);
  }, [editor, enabled]);

  useEffect(() => {
    if (!card) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCard(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [card]);

  if (!card || !enabled) return null;
  const { issue } = card;

  const apply = (replacement: string) => {
    if (applyPlainTextEditInEditor(editor, issue.offset, issue.length, replacement, issue.original)) {
      issuesRef.current = rebaseRanges(issuesRef.current.filter((i) => i !== issue), issue, replacement.length);
    }
    setCard(null);
    editor.focus();
  };

  const ignore = () => {
    ignoredRef.current.add(ignoreKey(issue));
    setCard(null);
    runCheck();
  };

  const addToDictionary = () => {
    addDictionaryWord(userId, issue.original); // fires DICTIONARY_CHANGED_EVENT, which re-runs the check
    setCard(null);
  };

  return createPortal(
    <div
      className={styles.liveCard}
      role="dialog"
      aria-label="Proofreading suggestion"
      style={{ left: Math.max(8, Math.min(card.left, window.innerWidth - 300)), top: card.top }}
    >
      <div className={styles.liveCardHeader}>
        <span>{issue.message}</span>
        <button type="button" aria-label="Close" onClick={() => setCard(null)}>
          <X size={12} />
        </button>
      </div>
      <div className={styles.liveCardActions}>
        {issue.suggestions.slice(0, 3).map((suggestion) => (
          <button key={suggestion} type="button" className={styles.liveCardFix} onClick={() => apply(suggestion)}>
            {suggestion}
          </button>
        ))}
        <button type="button" onClick={ignore}>Ignore</button>
        {issue.kind === 'spelling' && isValidDictionaryWord(issue.original) && (
          <button type="button" onClick={addToDictionary}>Add to dictionary</button>
        )}
      </div>
    </div>,
    document.body,
  );
}
