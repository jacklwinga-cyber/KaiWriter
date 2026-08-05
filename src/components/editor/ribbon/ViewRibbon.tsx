import { BookOpen, Maximize, ZoomIn, MessageSquare, SpellCheck } from 'lucide-react';
import styles from '../../layout/MainLayout.module.css';

interface ViewRibbonProps {
  onOpenNavigation?: () => void;
  onOpenComments?: () => void;
  onOpenProofread?: () => void;
  onToggleFocus?: () => void;
  isFocusMode?: boolean;
}

export function ViewRibbon({ onOpenNavigation, onOpenComments, onOpenProofread, onToggleFocus, isFocusMode }: ViewRibbonProps) {
  return (
    <div className={styles.ribbonToolbar}>
      <div className={styles.compactRibbonGroup}>
        <div className={styles.largeToolBtn} onClick={onOpenNavigation}>
          <BookOpen size={24} />
          <span>Navigation</span>
        </div>
        <div className={styles.largeToolBtn} onClick={onOpenComments}>
          <MessageSquare size={24} />
          <span>Comments</span>
        </div>
        <div className={styles.largeToolBtn} onClick={onOpenProofread}>
          <SpellCheck size={24} />
          <span>Proofread</span>
        </div>
        <div className={styles.largeToolBtn} onClick={onToggleFocus}>
          <Maximize size={24} />
          <span>{isFocusMode ? 'Exit Focus' : 'Focus'}</span>
        </div>
      </div>
      <div className={styles.compactRibbonGroup} style={{ borderRight: 'none' }}>
        <div className={styles.largeToolBtn} onClick={() => document.documentElement.style.setProperty('--editor-zoom', '1')}>
          <ZoomIn size={24} />
          <span>100% Zoom</span>
        </div>
      </div>
    </div>
  );
}
