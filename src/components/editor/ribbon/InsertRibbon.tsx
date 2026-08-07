import { useRef, useState } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { INSERT_TABLE_COMMAND } from '@lexical/table';
import { Image as ImageIcon, Table as TableIcon, FileSignature } from 'lucide-react';
import styles from '../../layout/MainLayout.module.css';
import { INSERT_IMAGE_COMMAND } from '../plugins/ImagesPlugin';
import { SignatureModal } from '../../ui/Modals';

// 10 MB original file → ~13.3 MB base64 — reasonable upper bound for IDB storage
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export function InsertRibbon() {
  const [editor] = useLexicalComposerContext();
  const [isSignatureOpen, setIsSignatureOpen] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  // ── Hidden file input lives OUTSIDE the clickable button div so that the
  //    programmatic .click() it receives does NOT bubble back up to that div
  //    and re-trigger another .click() (double-open kills the file picker).
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleInsertTable = () => {
    editor.dispatchCommand(INSERT_TABLE_COMMAND, { columns: '3', rows: '3', includeHeaders: true });
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImageError(null);
    const file = e.target.files?.[0];
    // Reset so the same file can be re-selected later
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!file) return;

    if (file.size > MAX_IMAGE_BYTES) {
      setImageError(`Image too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 10 MB.`);
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => {
      setImageError('Could not read the image file. Please try another.');
    };
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        editor.dispatchCommand(INSERT_IMAGE_COMMAND, {
          altText: file.name,
          src: reader.result,
        });
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className={styles.ribbonToolbar}>
      {/*
        Hidden input is a direct child of ribbonToolbar, NOT inside the
        largeToolBtn div — this prevents click-event bubbling from looping
        back to the trigger and killing the file picker.
      */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleImageUpload}
      />

      <div className={styles.compactRibbonGroup}>
        <div
          className={styles.largeToolBtn}
          onClick={() => {
            setImageError(null);
            fileInputRef.current?.click();
          }}
          title="Insert picture from file"
        >
          <ImageIcon size={24} style={{ color: 'var(--brand-primary)' }} />
          <span>Picture</span>
        </div>

        <div className={styles.largeToolBtn} onClick={handleInsertTable} title="Insert 3×3 table">
          <TableIcon size={24} style={{ color: 'var(--brand-primary)' }} />
          <span>Table</span>
        </div>

        <div className={styles.largeToolBtn} onClick={() => setIsSignatureOpen(true)} title="Draw or type a signature">
          <FileSignature size={24} style={{ color: 'var(--accent-success)' }} />
          <span>Signature</span>
        </div>
      </div>

      {imageError && (
        <div style={{
          marginLeft: '12px',
          padding: '4px 10px',
          background: 'var(--bg-error, #fef2f2)',
          color: 'var(--text-error, #dc2626)',
          borderRadius: '4px',
          fontSize: '12px',
          alignSelf: 'center',
        }}>
          {imageError}
        </div>
      )}

      <SignatureModal
        isOpen={isSignatureOpen}
        onClose={() => setIsSignatureOpen(false)}
        onInsert={(dataUrl) =>
          editor.dispatchCommand(INSERT_IMAGE_COMMAND, { src: dataUrl, altText: 'Signature' })
        }
      />
    </div>
  );
}
