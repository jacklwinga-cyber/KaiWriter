import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  SpellCheck, Lightbulb, BookOpenCheck, Sparkles, FileDiff, Check, X, CheckCheck, XCircle, ChevronLeft, ChevronRight,
} from 'lucide-react';
import styles from '../../layout/MainLayout.module.css';
import { ACCEPT_CHANGE_COMMAND, NAVIGATE_CHANGE_COMMAND, REJECT_CHANGE_COMMAND } from '../trackChanges';

interface ReviewRibbonProps {
  onProofread?: () => void;
  onWritingSuggestions?: () => void;
  onKaiAssist?: () => void;
  trackChanges?: boolean;
  onToggleTrackChanges?: () => void;
  changeCount?: number;
}

export function ReviewRibbon({
  onProofread,
  onWritingSuggestions,
  onKaiAssist,
  trackChanges = false,
  onToggleTrackChanges,
  changeCount = 0,
}: ReviewRibbonProps) {
  const [editor] = useLexicalComposerContext();
  const noChanges = changeCount === 0;

  return (
    <div className={styles.ribbonToolbar}>
      <div className={styles.compactRibbonGroup}>
        <button type="button" className={styles.largeToolBtn} onClick={onKaiAssist}>
          <Sparkles size={24} />
          <span>Kai Assist</span>
        </button>
        <button type="button" className={styles.largeToolBtn} onClick={onProofread}>
          <SpellCheck size={24} />
          <span>Spelling &amp; Grammar</span>
        </button>
        <button type="button" className={styles.largeToolBtn} onClick={onWritingSuggestions}>
          <Lightbulb size={24} />
          <span>Writing Suggestions</span>
        </button>
        <button type="button" className={styles.largeToolBtn} onClick={onProofread}>
          <BookOpenCheck size={24} />
          <span>Proofread</span>
        </button>
      </div>

      <div className={styles.compactRibbonGroup}>
        <button
          type="button"
          className={styles.largeToolBtn}
          onClick={onToggleTrackChanges}
          aria-pressed={trackChanges}
          title={trackChanges ? 'Stop tracking changes' : 'Track insertions and deletions so they can be reviewed'}
          style={trackChanges ? { background: 'var(--brand-primary)', color: '#fff', borderRadius: '6px' } : undefined}
        >
          <FileDiff size={24} />
          <span>Track Changes{trackChanges ? ': On' : ''}</span>
        </button>
        <span style={{ alignSelf: 'center', fontSize: '11px', color: 'var(--text-secondary)', minWidth: '64px', textAlign: 'center' }}>
          {changeCount} change{changeCount === 1 ? '' : 's'}
        </span>
      </div>

      <div className={styles.compactRibbonGroup} style={{ borderRight: 'none' }}>
        <button type="button" className={styles.largeToolBtn} disabled={noChanges} title="Previous change"
          onClick={() => editor.dispatchCommand(NAVIGATE_CHANGE_COMMAND, 'previous')}>
          <ChevronLeft size={24} />
          <span>Previous</span>
        </button>
        <button type="button" className={styles.largeToolBtn} disabled={noChanges} title="Next change"
          onClick={() => editor.dispatchCommand(NAVIGATE_CHANGE_COMMAND, 'next')}>
          <ChevronRight size={24} />
          <span>Next</span>
        </button>
        <button type="button" className={styles.largeToolBtn} disabled={noChanges} title="Accept the selected change and move to the next"
          onClick={() => editor.dispatchCommand(ACCEPT_CHANGE_COMMAND, 'current')}>
          <Check size={24} style={{ color: 'var(--accent-success)' }} />
          <span>Accept</span>
        </button>
        <button type="button" className={styles.largeToolBtn} disabled={noChanges} title="Reject the selected change and move to the next"
          onClick={() => editor.dispatchCommand(REJECT_CHANGE_COMMAND, 'current')}>
          <X size={24} style={{ color: '#d14343' }} />
          <span>Reject</span>
        </button>
        <button type="button" className={styles.largeToolBtn} disabled={noChanges} title="Accept all changes"
          onClick={() => editor.dispatchCommand(ACCEPT_CHANGE_COMMAND, 'all')}>
          <CheckCheck size={24} style={{ color: 'var(--accent-success)' }} />
          <span>Accept All</span>
        </button>
        <button type="button" className={styles.largeToolBtn} disabled={noChanges} title="Reject all changes"
          onClick={() => editor.dispatchCommand(REJECT_CHANGE_COMMAND, 'all')}>
          <XCircle size={24} style={{ color: '#d14343' }} />
          <span>Reject All</span>
        </button>
      </div>
    </div>
  );
}
