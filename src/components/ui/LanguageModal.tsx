import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { PROOFING_LOCALES } from '../../lib/editorPreferences';
import { useEditorPreferences } from '../../contexts/EditorPreferencesContext';
import styles from './LanguageModal.module.css';

interface LanguageModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function LanguageModal({ isOpen, onClose }: LanguageModalProps) {
  const {
    localeId,
    setLocaleId,
    detectLanguageAutomatically,
    setDetectLanguageAutomatically,
    disableSpellCheck,
    setDisableSpellCheck,
  } = useEditorPreferences();
  const [query, setQuery] = useState('');
  const [draftLocale, setDraftLocale] = useState(localeId);
  const [draftDetect, setDraftDetect] = useState(detectLanguageAutomatically);
  const [draftDisableSpell, setDraftDisableSpell] = useState(disableSpellCheck);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return PROOFING_LOCALES;
    return PROOFING_LOCALES.filter((l) => l.label.toLowerCase().includes(q));
  }, [query]);

  if (!isOpen) return null;

  const handleOk = () => {
    setLocaleId(draftLocale);
    setDetectLanguageAutomatically(draftDetect);
    setDisableSpellCheck(draftDisableSpell);
    onClose();
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <header className={styles.header}>
          <h2>Language</h2>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>

        <div className={styles.body}>
          <p className={styles.label}>Mark selected text as:</p>
          <input
            type="search"
            className={styles.search}
            placeholder="Search languages…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className={styles.list} role="listbox">
            {filtered.map((locale) => (
              <button
                key={locale.id}
                type="button"
                role="option"
                aria-selected={draftLocale === locale.id}
                className={`${styles.localeRow} ${draftLocale === locale.id ? styles.localeRowActive : ''}`}
                onClick={() => setDraftLocale(locale.id)}
              >
                {locale.label}
              </button>
            ))}
          </div>

          <p className={styles.hint}>
            Spelling and grammar tools use dictionaries for the selected language when available.
          </p>

          <label className={styles.checkRow}>
            <input
              type="checkbox"
              checked={draftDisableSpell}
              onChange={(e) => setDraftDisableSpell(e.target.checked)}
            />
            Do not check spelling or grammar
          </label>
          <label className={styles.checkRow}>
            <input
              type="checkbox"
              checked={draftDetect}
              onChange={(e) => setDraftDetect(e.target.checked)}
            />
            Detect language automatically
          </label>
        </div>

        <footer className={styles.footer}>
          <button type="button" className={styles.secondaryBtn} onClick={onClose}>Cancel</button>
          <button type="button" className={styles.primaryBtn} onClick={handleOk}>OK</button>
        </footer>
      </div>
    </div>
  );
}
