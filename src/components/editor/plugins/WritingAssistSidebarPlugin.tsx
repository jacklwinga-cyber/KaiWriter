import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  CheckCircle2, Loader2, SpellCheck, Lightbulb, X, ChevronRight, RefreshCw, CheckCheck, Info,
} from 'lucide-react';
import styles from '../../layout/MainLayout.module.css';
import assistStyles from './WritingAssistSidebar.module.css';
import { useAuth } from '../../../contexts/AuthProvider';
import { useEditorPreferences } from '../../../contexts/EditorPreferencesContext';
import {
  analyzeWriting,
  countIssuesByKind,
  describeSourceProblems,
  ISSUE_KIND_LABELS,
  type WritingIssue,
  type WritingIssueKind,
} from '../../../lib/writingAssist';
import {
  applyPlainTextEditInEditor,
  applyPlainTextEditsInEditor,
  getPlainTextFromEditor,
  getSelectionPlainTextRange,
  selectPlainTextRangeInEditor,
} from '../../../lib/plainTextMap';
import { rebaseRanges, selectNonOverlapping } from '../../../lib/suggestionOffsets';

/** Remembered choice about sending text to the online checkers (LanguageTool, Kai AI). */
const ONLINE_CONSENT_KEY = 'kaiwriter-proofread-online-consent';
type OnlineConsent = 'granted' | 'denied' | null;

function readConsent(): OnlineConsent {
  try {
    const value = localStorage.getItem(ONLINE_CONSENT_KEY);
    return value === 'granted' || value === 'denied' ? value : null;
  } catch {
    return null;
  }
}

function writeConsent(value: 'granted' | 'denied') {
  try {
    localStorage.setItem(ONLINE_CONSENT_KEY, value);
  } catch {
    // remembered for this session only
  }
}

const isGrammarKind = (issue: WritingIssue) =>
  issue.kind === 'grammar' || issue.kind === 'spelling' || issue.kind === 'punctuation';

type CheckScope = 'document' | 'selection';
type AssistTab = 'grammar' | 'suggestions';

interface WritingAssistSidebarPluginProps {
  onClose?: () => void;
  initialTab?: AssistTab;
  autoRun?: boolean;
}

export function WritingAssistSidebarPlugin({
  onClose,
  initialTab = 'grammar',
  autoRun = false,
}: WritingAssistSidebarPluginProps) {
  const [editor] = useLexicalComposerContext();
  const { accessToken } = useAuth();
  const { languageToolCode, disableSpellCheck } = useEditorPreferences();
  const [tab, setTab] = useState<AssistTab>(initialTab);
  const [scope, setScope] = useState<CheckScope>('document');
  const [issues, setIssues] = useState<WritingIssue[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notices, setNotices] = useState<string[]>([]);
  const [lastChecked, setLastChecked] = useState<number | null>(null);
  const [consent, setConsent] = useState<OnlineConsent>(readConsent);
  const autoRan = useRef(false);
  const inFlight = useRef<AbortController | null>(null);

  // Cancel a running check when the panel closes.
  useEffect(() => () => inFlight.current?.abort(), []);

  const visibleIssues = useMemo(() => {
    const filtered = issues.filter((issue) => !dismissed.has(issue.id));
    if (tab === 'grammar') return filtered.filter(isGrammarKind);
    return filtered.filter((issue) => issue.kind === 'style' || issue.kind === 'clarity' || issue.source === 'ai');
  }, [issues, dismissed, tab]);

  const counts = useMemo(() => countIssuesByKind(issues.filter((i) => !dismissed.has(i.id))), [issues, dismissed]);

  const runCheck = useCallback(async (
    nextScope: CheckScope = scope,
    nextTab: AssistTab = tab,
    allowRemote: boolean = consent === 'granted',
  ) => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    setLoading(true);
    setError(null);
    setNotices([]);
    setScope(nextScope);

    try {
      // Offsets are always relative to the whole document, so a check of a
      // selection can be applied with the same code as a whole-document check.
      const fullText = getPlainTextFromEditor(editor);
      let base = 0;
      let text = fullText;
      if (nextScope === 'selection') {
        const range = getSelectionPlainTextRange(editor);
        if (!range) {
          setIssues([]);
          setError('Select some text to proofread.');
          return;
        }
        base = range.start;
        text = fullText.slice(range.start, range.end);
      }

      if (!text.trim()) {
        setIssues([]);
        setError(nextScope === 'selection' ? 'Select some text to proofread.' : 'Document is empty.');
        return;
      }

      const { issues: found, sources } = await analyzeWriting(text, {
        includeSuggestions: nextTab === 'suggestions' || nextTab === 'grammar',
        accessToken,
        languageCode: languageToolCode,
        disabled: disableSpellCheck,
        allowRemote,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setIssues(found.map((issue) => ({ ...issue, id: `${issue.id}@${base}`, offset: issue.offset + base })));
      setNotices(describeSourceProblems(sources));
      setDismissed(new Set());
      setLastChecked(Date.now());
    } catch (err) {
      if (controller.signal.aborted) return; // superseded by a newer check
      setError(err instanceof Error ? err.message : 'Could not run proofread.');
    } finally {
      if (inFlight.current === controller) {
        inFlight.current = null;
        setLoading(false);
      }
    }
  }, [editor, scope, tab, accessToken, languageToolCode, disableSpellCheck, consent]);

  useEffect(() => {
    if (!autoRun || autoRan.current) return;
    autoRan.current = true;
    void runCheck('document', initialTab);
  }, [autoRun, initialTab, runCheck]);

  const chooseConsent = (value: 'granted' | 'denied') => {
    writeConsent(value);
    setConsent(value);
    if (value === 'granted') void runCheck(scope, tab, true);
  };

  const STALE_MESSAGE = 'That text has changed since it was checked. Run the check again to refresh suggestions.';

  const handleApply = (issue: WritingIssue, suggestion: string) => {
    const replacement = suggestion || issue.suggestions[0];
    if (!replacement) return;

    const applied = applyPlainTextEditInEditor(editor, issue.offset, issue.length, replacement, issue.original);
    if (!applied) {
      setError(STALE_MESSAGE);
      setIssues((prev) => prev.filter((i) => i.id !== issue.id));
      return;
    }
    // Shift the remaining suggestions past the edit; drop any that overlapped it.
    setIssues((prev) => rebaseRanges(prev.filter((i) => i.id !== issue.id), issue, replacement.length));
  };

  const acceptAllCandidates = useMemo(
    () => selectNonOverlapping(visibleIssues.filter((i) => isGrammarKind(i) && i.suggestions.length > 0)),
    [visibleIssues],
  );

  const handleAcceptAll = () => {
    const edits = acceptAllCandidates.map((issue) => ({ ...issue, replacement: issue.suggestions[0] }));
    const applied = applyPlainTextEditsInEditor(editor, edits);
    const appliedIds = new Set(applied.map((e) => e.id));
    setIssues((prev) => {
      // Rebase in document order, last edit first, so each shift uses pre-edit offsets.
      let remaining = prev.filter((i) => !appliedIds.has(i.id));
      for (const edit of [...applied].sort((a, b) => b.offset - a.offset)) {
        remaining = rebaseRanges(remaining, edit, edit.replacement.length);
      }
      return remaining;
    });
    if (applied.length < edits.length) setError(STALE_MESSAGE);
  };

  const handleFocus = (issue: WritingIssue) => {
    selectPlainTextRangeInEditor(editor, issue.offset, issue.length);
  };

  const handleDismiss = (issueId: string) => {
    setDismissed((prev) => new Set(prev).add(issueId));
  };

  const grammarCount = counts.grammar + counts.spelling + counts.punctuation;
  const suggestionCount = counts.style + counts.clarity;

  return (
    <div className={styles.navigationPane}>
      <div className={styles.paneHeader}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <SpellCheck size={16} />
          <span>Review &amp; Proofread</span>
        </div>
        {onClose && (
          <button type="button" className={styles.paneCloseBtn} onClick={onClose}>
            <X size={16} />
          </button>
        )}
      </div>

      <div className={assistStyles.tabs}>
        <button
          type="button"
          className={`${assistStyles.tab} ${tab === 'grammar' ? assistStyles.tabActive : ''}`}
          onClick={() => setTab('grammar')}
        >
          Grammar
          {grammarCount > 0 && <span className={assistStyles.tabBadge}>{grammarCount}</span>}
        </button>
        <button
          type="button"
          className={`${assistStyles.tab} ${tab === 'suggestions' ? assistStyles.tabActive : ''}`}
          onClick={() => setTab('suggestions')}
        >
          Suggestions
          {suggestionCount > 0 && <span className={assistStyles.tabBadge}>{suggestionCount}</span>}
        </button>
      </div>

      <div className={assistStyles.controls}>
        <div className={assistStyles.scopeRow}>
          <button
            type="button"
            className={`${assistStyles.scopeBtn} ${scope === 'document' ? assistStyles.scopeBtnActive : ''}`}
            onClick={() => setScope('document')}
          >
            Whole document
          </button>
          <button
            type="button"
            className={`${assistStyles.scopeBtn} ${scope === 'selection' ? assistStyles.scopeBtnActive : ''}`}
            onClick={() => setScope('selection')}
          >
            Selection
          </button>
        </div>
        <button
          type="button"
          className={assistStyles.runBtn}
          disabled={loading}
          onClick={() => void runCheck(scope, tab)}
        >
          {loading ? <Loader2 size={14} className={assistStyles.spin} /> : <RefreshCw size={14} />}
          {tab === 'grammar' ? 'Check grammar & spelling' : 'Get writing suggestions'}
        </button>
      </div>

      {consent === null && (
        <div className={assistStyles.manualHint} role="note" style={{ display: 'block', margin: '8px 12px', lineHeight: 1.4 }}>
          <p style={{ margin: '0 0 6px' }}>
            <Info size={12} /> Grammar and spelling checks send the text you check to LanguageTool (languagetool.org);
            AI suggestions send it to Kai AI. Offline checks never leave this device.
          </p>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" className={assistStyles.scopeBtn} onClick={() => chooseConsent('granted')}>Allow online checks</button>
            <button type="button" className={assistStyles.scopeBtn} onClick={() => chooseConsent('denied')}>Offline only</button>
          </div>
        </div>
      )}

      {error && <p className={assistStyles.error}>{error}</p>}
      {notices.map((notice) => (
        <p key={notice} className={assistStyles.manualHint} style={{ margin: '4px 12px' }}>
          <Info size={12} /> {notice}
        </p>
      ))}
      {consent === 'denied' && (
        <button type="button" className={assistStyles.scopeBtn} style={{ margin: '4px 12px' }} onClick={() => chooseConsent('granted')}>
          Turn on online checks
        </button>
      )}

      {tab === 'grammar' && acceptAllCandidates.length > 1 && (
        <button type="button" className={assistStyles.runBtn} style={{ margin: '4px 12px' }} onClick={handleAcceptAll}>
          <CheckCheck size={14} /> Accept all {acceptAllCandidates.length} fixes
        </button>
      )}

      {!loading && lastChecked && visibleIssues.length === 0 && !error && (
        <div className={assistStyles.emptyGood}>
          <CheckCircle2 size={20} />
          <p>{tab === 'grammar' ? 'No grammar or spelling issues found.' : 'No writing suggestions right now.'}</p>
        </div>
      )}

      <div className={assistStyles.issueList}>
        {visibleIssues.map((issue) => (
          <IssueCard
            key={issue.id}
            issue={issue}
            onFocus={() => handleFocus(issue)}
            onApply={(suggestion) => handleApply(issue, suggestion)}
            onDismiss={() => handleDismiss(issue.id)}
          />
        ))}
      </div>
    </div>
  );
}

function IssueCard({
  issue,
  onFocus,
  onApply,
  onDismiss,
}: {
  issue: WritingIssue;
  onFocus: () => void;
  onApply: (suggestion: string) => void;
  onDismiss: () => void;
}) {
  return (
    <article className={assistStyles.issueCard}>
      <div className={assistStyles.issueHeader}>
        <KindBadge kind={issue.kind} />
        <button type="button" className={assistStyles.dismissBtn} onClick={onDismiss} aria-label="Dismiss">
          <X size={12} />
        </button>
      </div>
      <p className={assistStyles.issueMessage}>{issue.message}</p>
      <button type="button" className={assistStyles.contextBtn} onClick={onFocus}>
        “{issue.original || issue.context}”
        <ChevronRight size={12} />
      </button>
      {issue.suggestions.length > 0 ? (
        <div className={assistStyles.suggestions}>
          {issue.suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              className={assistStyles.suggestionBtn}
              onClick={() => onApply(suggestion)}
            >
              {suggestion}
            </button>
          ))}
        </div>
      ) : issue.kind === 'clarity' ? (
        <p className={assistStyles.manualHint}>
          <Lightbulb size={12} /> Revise manually — select the text to edit.
        </p>
      ) : null}
    </article>
  );
}

function KindBadge({ kind }: { kind: WritingIssueKind }) {
  return <span className={`${assistStyles.kindBadge} ${assistStyles[`kind_${kind}`]}`}>{ISSUE_KIND_LABELS[kind]}</span>;
}
