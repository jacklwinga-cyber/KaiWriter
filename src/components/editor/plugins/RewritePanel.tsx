import { useEffect, useMemo, useRef, useState } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { Check, Copy, Info, Loader2, RefreshCw, Sparkles, TextCursorInput, X } from 'lucide-react';
import assistStyles from './WritingAssistSidebar.module.css';
import {
  MAX_REWRITE_CHARS,
  REWRITE_STYLE_LABELS,
  REWRITE_STYLES,
  requestRewrite,
  RewriteError,
  textForRewrite,
  type QuotaInfo,
  type RewriteStyle,
} from '../../../lib/aiRewrite';
import { isAbort } from '../../../lib/writingAssist';
import { getPlainTextFromEditor, getSelectionPlainTextRange, selectPlainTextRangeInEditor } from '../../../lib/plainTextMap';
import { diffStats, diffWords } from '../../../lib/wordDiff';
import { $insertRewriteAfterRange, $replaceRangeWithRewrite, rewriteParagraphs } from '../rewriteApply';

interface RewritePanelProps {
  accessToken: string | null;
  languageCode: string;
  /** Whether the user allowed sending text to online services. */
  onlineAllowed: boolean;
  onAllowOnline: () => void;
  trackChanges: boolean;
  author: string;
}

interface Pending {
  start: number;
  end: number;
  /** Plain text of the range when it was sent (to check it hasn't changed). */
  expected: string;
  /** Text as sent to the model. */
  sent: string;
  style: RewriteStyle;
}

interface Result extends Pending {
  rewrite: string;
  unchanged: boolean;
}

const countWords = (text: string) => (text.match(/[\p{L}\p{N}]+/gu) ?? []).length;
const STALE = 'The selected text has changed since it was rewritten. Select it again and choose a style.';

export function RewritePanel({ accessToken, languageCode, onlineAllowed, onAllowOnline, trackChanges, author }: RewritePanelProps) {
  const [editor] = useLexicalComposerContext();
  const [selectionWords, setSelectionWords] = useState(0);
  const [loading, setLoading] = useState<Pending | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [quota, setQuota] = useState<QuotaInfo | null>(null);
  const inFlight = useRef<AbortController | null>(null);

  // How much is selected (refreshed shortly after selection or text changes).
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const measure = () => {
      const range = getSelectionPlainTextRange(editor);
      setSelectionWords(range ? countWords(getPlainTextFromEditor(editor).slice(range.start, range.end)) : 0);
    };
    measure();
    // Braces matter: Lexical treats a listener's return value as a cleanup function.
    const unregister = editor.registerUpdateListener(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(measure, 150);
    });
    return () => {
      if (timer) clearTimeout(timer);
      unregister();
    };
  }, [editor]);

  useEffect(() => () => inFlight.current?.abort(), []);

  const run = async (style: RewriteStyle, target?: Pending) => {
    setError(null);
    setNotice(null);
    let pending = target ? { ...target, style } : null;
    if (!pending) {
      const range = getSelectionPlainTextRange(editor);
      const expected = range ? getPlainTextFromEditor(editor).slice(range.start, range.end) : '';
      const sent = textForRewrite(expected);
      if (!range || !sent) {
        setError('Select the text you want to rewrite first.');
        return;
      }
      pending = { start: range.start, end: range.end, expected, sent, style };
    }
    if (pending.sent.length > MAX_REWRITE_CHARS) {
      setError(`Rewriting works on up to ${MAX_REWRITE_CHARS.toLocaleString('en-US')} characters at a time. Select a shorter passage.`);
      return;
    }

    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    setLoading(pending);
    setResult(null);
    try {
      const reply = await requestRewrite(pending.sent, style, {
        accessToken,
        language: languageCode,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setQuota(reply.quota);
      setResult({ ...pending, rewrite: reply.rewrite, unchanged: reply.unchanged });
    } catch (err) {
      if (controller.signal.aborted || isAbort(err)) return;
      if (err instanceof RewriteError) {
        if (err.quota) setQuota(err.quota);
        setError(err.message);
      } else {
        setError('Rewriting failed unexpectedly. Try again.');
      }
    } finally {
      if (inFlight.current === controller) {
        inFlight.current = null;
        setLoading(null);
      }
    }
  };

  const cancel = () => {
    inFlight.current?.abort();
    inFlight.current = null;
    setLoading(null);
  };

  const apply = (how: 'replace' | 'insert') => {
    if (!result) return;
    const paragraphs = rewriteParagraphs(result.rewrite);
    const track = trackChanges ? { author, date: Date.now() } : undefined;
    let applied = false;
    editor.update(() => {
      applied = how === 'replace'
        ? $replaceRangeWithRewrite(result.start, result.end, result.expected, paragraphs, track)
        : $insertRewriteAfterRange(result.start, result.end, result.expected, paragraphs, track);
    });
    if (!applied) {
      setError(STALE);
      return;
    }
    setResult(null);
    setNotice(how === 'replace'
      ? `Replaced.${trackChanges ? ' Recorded as a tracked change.' : ''} Undo with Ctrl+Z / ⌘Z.`
      : `Inserted below the selection.${trackChanges ? ' Recorded as a tracked change.' : ''}`);
    editor.focus();
  };

  const copy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.rewrite);
      setNotice('Copied to the clipboard.');
    } catch {
      setError('Couldn’t copy to the clipboard.');
    }
  };

  const diff = useMemo(() => (result ? diffWords(result.sent, result.rewrite) : []), [result]);
  const stats = useMemo(() => diffStats(diff), [diff]);

  return (
    <>
      <div className={assistStyles.controls}>
        <p className={assistStyles.manualHint} style={{ margin: 0 }}>
          <TextCursorInput size={12} />
          {selectionWords > 0
            ? ` ${selectionWords} word${selectionWords === 1 ? '' : 's'} selected. Choose how to rewrite it:`
            : ' Select text in the document, then choose how to rewrite it.'}
        </p>
        <div className={assistStyles.styleGrid}>
          {REWRITE_STYLES.map((style) => (
            <button
              key={style}
              type="button"
              className={assistStyles.styleBtn}
              disabled={!!loading || !onlineAllowed}
              onClick={() => void run(style)}
            >
              {REWRITE_STYLE_LABELS[style]}
            </button>
          ))}
        </div>
      </div>

      {!onlineAllowed && (
        <div className={assistStyles.manualHint} role="note" style={{ display: 'block', margin: '8px 12px', lineHeight: 1.4 }}>
          <p style={{ margin: '0 0 6px' }}>
            <Info size={12} /> Rewriting sends only the text you select to Kai AI. Nothing is sent until you allow online checks.
          </p>
          <button type="button" className={assistStyles.scopeBtn} onClick={onAllowOnline}>Allow online checks</button>
        </div>
      )}

      {loading && (
        <div className={assistStyles.manualHint} style={{ margin: '8px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Loader2 size={14} className={assistStyles.spin} /> {REWRITE_STYLE_LABELS[loading.style]}…
          <button type="button" className={assistStyles.scopeBtn} style={{ flex: 'none', marginLeft: 'auto' }} onClick={cancel}>Cancel</button>
        </div>
      )}

      {error && <p className={assistStyles.error}>{error}</p>}
      {notice && !error && <p className={assistStyles.manualHint} style={{ margin: '4px 12px' }}><Check size={12} /> {notice}</p>}

      {result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '8px 12px' }} aria-label="Rewrite preview">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ fontSize: 12 }}><Sparkles size={12} /> {REWRITE_STYLE_LABELS[result.style]}</strong>
            <span className={assistStyles.manualHint} style={{ margin: 0 }}>
              {result.unchanged ? 'No changes suggested' : `+${stats.inserted} / −${stats.deleted} words`}
            </span>
          </div>
          <p className={assistStyles.diff} data-testid="rewrite-diff">
            {diff.map((part, i) =>
              part.type === 'insert' ? <ins key={i}>{part.text}</ins>
              : part.type === 'delete' ? <del key={i}>{part.text}</del>
              : <span key={i}>{part.text}</span>,
            )}
          </p>
          <div className={assistStyles.actionRow}>
            {!result.unchanged && (
              <button type="button" className={assistStyles.runBtn} style={{ flex: 'none' }} onClick={() => apply('replace')}>
                <Check size={14} /> Replace
              </button>
            )}
            <button type="button" className={assistStyles.scopeBtn} style={{ flex: 'none' }} onClick={() => apply('insert')}>Insert below</button>
            <button type="button" className={assistStyles.scopeBtn} style={{ flex: 'none' }} onClick={() => void copy()}>
              <Copy size={12} /> Copy
            </button>
            <button type="button" className={assistStyles.scopeBtn} style={{ flex: 'none' }} onClick={() => void run(result.style, result)}>
              <RefreshCw size={12} /> Try again
            </button>
            <button type="button" className={assistStyles.scopeBtn} style={{ flex: 'none' }} onClick={() => { setResult(null); selectPlainTextRangeInEditor(editor, result.start, result.end - result.start); }}>
              <X size={12} /> Discard
            </button>
          </div>
        </div>
      )}

      {quota && (
        <p className={assistStyles.manualHint} style={{ margin: '4px 12px' }}>
          <Info size={12} /> {quota.remaining} of {quota.limit} AI requests left today.
        </p>
      )}
      <p className={assistStyles.manualHint} style={{ margin: '4px 12px' }}>
        <Info size={12} /> AI can make mistakes. Check the rewrite before replacing your text.
      </p>
    </>
  );
}
