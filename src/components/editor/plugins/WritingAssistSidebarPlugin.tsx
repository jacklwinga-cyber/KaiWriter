import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getSelection, $isRangeSelection, $isTextNode } from 'lexical';
import {
  CheckCircle2, Loader2, SpellCheck, Lightbulb, X, ChevronRight, RefreshCw,
} from 'lucide-react';
import styles from '../../layout/MainLayout.module.css';
import assistStyles from './WritingAssistSidebar.module.css';
import { useAuth } from '../../../contexts/AuthProvider';
import { useEditorPreferences } from '../../../contexts/EditorPreferencesContext';
import {
  analyzeWriting,
  countIssuesByKind,
  ISSUE_KIND_LABELS,
  type WritingIssue,
  type WritingIssueKind,
} from '../../../lib/writingAssist';
import {
  applyPlainTextEditInEditor,
  getPlainTextFromEditor,
  getSelectedPlainText,
  selectPlainTextRangeInEditor,
} from '../../../lib/plainTextMap';

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
  const [lastChecked, setLastChecked] = useState<number | null>(null);
  const autoRan = useRef(false);

  const visibleIssues = useMemo(() => {
    const filtered = issues.filter((issue) => !dismissed.has(issue.id));
    if (tab === 'grammar') {
      return filtered.filter((issue) =>
        issue.kind === 'grammar' || issue.kind === 'spelling' || issue.kind === 'punctuation',
      );
    }
    return filtered.filter((issue) => issue.kind === 'style' || issue.kind === 'clarity' || issue.source === 'ai');
  }, [issues, dismissed, tab]);

  const counts = useMemo(() => countIssuesByKind(issues.filter((i) => !dismissed.has(i.id))), [issues, dismissed]);

  const runCheck = useCallback(async (nextScope: CheckScope = scope, nextTab: AssistTab = tab) => {
    setLoading(true);
    setError(null);
    setScope(nextScope);

    try {
      const text =
        nextScope === 'selection'
          ? getSelectedPlainText(editor)
          : getPlainTextFromEditor(editor);

      if (!text.trim()) {
        setIssues([]);
        setError(nextScope === 'selection' ? 'Select some text to proofread.' : 'Document is empty.');
        return;
      }

      const results = await analyzeWriting(text, {
        includeSuggestions: nextTab === 'suggestions' || nextTab === 'grammar',
        accessToken,
        languageCode: languageToolCode,
        disabled: disableSpellCheck,
      });
      setIssues(results);
      setDismissed(new Set());
      setLastChecked(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not run proofread.');
    } finally {
      setLoading(false);
    }
  }, [editor, scope, tab, accessToken, languageToolCode, disableSpellCheck]);

  useEffect(() => {
    if (!autoRun || autoRan.current) return;
    autoRan.current = true;
    void runCheck('document', initialTab);
  }, [autoRun, initialTab, runCheck]);

  const handleApply = (issue: WritingIssue, suggestion: string) => {
    const replacement = suggestion || issue.suggestions[0];
    if (!replacement && issue.kind !== 'clarity') return;

    if (scope === 'document') {
      applyPlainTextEditInEditor(editor, issue.offset, issue.length, replacement);
    } else {
      editor.update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;
        for (const node of selection.getNodes()) {
          if (!$isTextNode(node)) continue;
          const content = node.getTextContent();
          const idx = content.indexOf(issue.original);
          if (idx === -1) continue;
          node.setTextContent(
            `${content.slice(0, idx)}${replacement}${content.slice(idx + issue.original.length)}`,
          );
          return;
        }
      });
    }

    setIssues((prev) => prev.filter((i) => i.id !== issue.id));
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

      {error && <p className={assistStyles.error}>{error}</p>}

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
