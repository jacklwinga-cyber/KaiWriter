import { Sparkles, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthProvider';
import styles from './LegacyPinProBanner.module.css';

interface LegacyPinProBannerProps {
  onSignIn: () => void;
}

export function LegacyPinProBanner({ onSignIn }: LegacyPinProBannerProps) {
  const { legacyPinProNotice, dismissLegacyPinProNotice, isSupabaseEnabled } = useAuth();

  if (!legacyPinProNotice) return null;

  return (
    <div className={styles.banner} role="status">
      <Sparkles size={18} className={styles.icon} aria-hidden />
      <div className={styles.content}>
        <strong className={styles.title}>{legacyPinProNotice.title}</strong>
        <p className={styles.body}>{legacyPinProNotice.body}</p>
      </div>
      <div className={styles.actions}>
        {isSupabaseEnabled && (
          <button type="button" className={styles.primaryBtn} onClick={onSignIn}>
            Sign in
          </button>
        )}
        <button type="button" className={styles.dismissBtn} onClick={dismissLegacyPinProNotice} aria-label="Dismiss">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
