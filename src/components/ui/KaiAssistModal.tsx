import { useState } from 'react';
import { Sparkles, X, Loader2, ImageIcon } from 'lucide-react';
import styles from './KaiAssistModal.module.css';

interface KaiAssistModalProps {
  isOpen: boolean;
  templateName?: string;
  placeholderCount: number;
  onClose: () => void;
  onGenerate: (brief: string) => Promise<void>;
}

export function KaiAssistModal({
  isOpen,
  templateName,
  placeholderCount,
  onClose,
  onGenerate,
}: KaiAssistModalProps) {
  const [brief, setBrief] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleGenerate = async () => {
    if (!brief.trim()) {
      setError('Describe what you are making — e.g. "30-second coffee brand launch video".');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await onGenerate(brief.trim());
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate content.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Kai Assist</p>
            <h2>Fill template with AI</h2>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>

        <div className={styles.body}>
          {templateName && (
            <p className={styles.templateName}>
              Template: <strong>{templateName}</strong>
            </p>
          )}
          <p className={styles.intro}>
            Not sure what this template is for? Tell Kai what you are creating and we will fill
            {' '}
            <strong>{placeholderCount}</strong>
            {' '}
            placeholder fields
            {templateName?.toLowerCase().includes('storyboard') ? ' and generate storyboard frame images' : ''}.
          </p>

          <label className={styles.label} htmlFor="kai-assist-brief">
            What are you making?
          </label>
          <textarea
            id="kai-assist-brief"
            className={styles.textarea}
            rows={4}
            placeholder='e.g. "Storyboard for a 30s SaaS product launch video — dashboard demo, happy customer, pricing CTA"'
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
          />

          <div className={styles.features}>
            <span><Sparkles size={14} /> Fills [placeholders] with sensible text</span>
            <span><ImageIcon size={14} /> Storyboards get AI sketch previews per frame</span>
          </div>

          {error && <p className={styles.error}>{error}</p>}
        </div>

        <footer className={styles.footer}>
          <button type="button" className={styles.secondaryBtn} onClick={onClose}>Cancel</button>
          <button type="button" className={styles.primaryBtn} disabled={loading} onClick={() => void handleGenerate()}>
            {loading ? <Loader2 size={16} className={styles.spin} /> : <Sparkles size={16} />}
            {loading ? 'Generating…' : 'Generate & fill'}
          </button>
        </footer>
      </div>
    </div>
  );
}
