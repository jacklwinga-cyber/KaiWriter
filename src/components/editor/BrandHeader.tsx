import type { DocumentBranding } from '../../lib/branding';
import { hasBranding, DEFAULT_BRAND_COLOR } from '../../lib/branding';
import styles from './Editor.module.css';

export function BrandHeader({ branding }: { branding?: DocumentBranding | null }) {
  if (!hasBranding(branding)) return null;

  const color = branding?.primaryColor ?? DEFAULT_BRAND_COLOR;

  return (
    <div className={styles.brandHeader} style={{ borderBottomColor: color }}>
      {branding?.logoDataUrl && (
        <img src={branding.logoDataUrl} alt="" className={styles.brandLogo} />
      )}
      <div className={styles.brandMeta}>
        {branding?.companyName && (
          <div className={styles.brandCompany} style={{ color }}>{branding.companyName}</div>
        )}
        {branding?.headerText && (
          <div className={styles.brandTagline}>{branding.headerText}</div>
        )}
      </div>
    </div>
  );
}
