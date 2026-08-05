import { SpellCheck, Lightbulb, BookOpenCheck, Sparkles } from 'lucide-react';
import styles from '../../layout/MainLayout.module.css';

interface ReviewRibbonProps {
  onProofread?: () => void;
  onWritingSuggestions?: () => void;
  onKaiAssist?: () => void;
}

export function ReviewRibbon({ onProofread, onWritingSuggestions, onKaiAssist }: ReviewRibbonProps) {
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
    </div>
  );
}
