import { File, SplitSquareHorizontal, RectangleHorizontal, Palette, Lock } from 'lucide-react';
import styles from '../../layout/MainLayout.module.css';

interface LayoutRibbonProps {
  pageSize: string;
  setPageSize: (s: string) => void;
  orientation: string;
  setOrientation: (s: string) => void;
  margins: string;
  setMargins: (s: string) => void;
  onOpenBranding?: () => void;
  isPro?: boolean;
  onRequestUpgrade?: () => void;
}

export function LayoutRibbon({
  pageSize,
  setPageSize,
  orientation,
  setOrientation,
  margins,
  setMargins,
  onOpenBranding,
  isPro,
  onRequestUpgrade,
}: LayoutRibbonProps) {
  return (
    <div className={styles.ribbonToolbar}>
      <div className={styles.compactRibbonGroup}>
        <div className={styles.ribbonColumn}>
          <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Page size</label>
          <select className={styles.toolbarSelect} value={pageSize} onChange={(e) => setPageSize(e.target.value)}>
            <option value="Letter">Letter (8.5 × 11)</option>
            <option value="A4">A4</option>
          </select>
        </div>
        <div className={styles.ribbonColumn}>
          <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Orientation</label>
          <select className={styles.toolbarSelect} value={orientation} onChange={(e) => setOrientation(e.target.value)}>
            <option value="Portrait">Portrait</option>
            <option value="Landscape">Landscape</option>
          </select>
        </div>
        <div className={styles.ribbonColumn}>
          <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Margins</label>
          <select className={styles.toolbarSelect} value={margins} onChange={(e) => setMargins(e.target.value)}>
            <option value="Normal">Normal</option>
            <option value="Narrow">Narrow</option>
            <option value="Wide">Wide</option>
          </select>
        </div>
      </div>
      <div className={styles.compactRibbonGroup} style={{ borderRight: 'none' }}>
        <div
          className={styles.largeToolBtn}
          title="Document branding"
          onClick={() => (isPro ? onOpenBranding?.() : onRequestUpgrade?.())}
          style={{ position: 'relative' }}
        >
          <Palette size={24} />
          <span>Branding</span>
          {!isPro && <Lock size={10} style={{ position: 'absolute', top: 8, right: 8, opacity: 0.7 }} />}
        </div>
        <div className={styles.largeToolBtn} title="Page size">
          <File size={24} />
          <span>Size</span>
        </div>
        <div className={styles.largeToolBtn} title="Orientation">
          <RectangleHorizontal size={24} />
          <span>Orientation</span>
        </div>
        <div className={styles.largeToolBtn} title="Margins">
          <SplitSquareHorizontal size={24} />
          <span>Margins</span>
        </div>
      </div>
    </div>
  );
}
