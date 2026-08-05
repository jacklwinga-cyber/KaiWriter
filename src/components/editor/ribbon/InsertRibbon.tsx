import { useRef } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { INSERT_TABLE_COMMAND } from '@lexical/table';
import { Image as ImageIcon, Table as TableIcon, FileSignature } from 'lucide-react';
import styles from '../../layout/MainLayout.module.css';
import { INSERT_IMAGE_COMMAND } from '../plugins/ImagesPlugin';
import { SignatureModal } from '../../ui/Modals';
import { useState } from 'react';

export function InsertRibbon() {
  const [editor] = useLexicalComposerContext();
  const [isSignatureOpen, setIsSignatureOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleInsertTable = () => {
    editor.dispatchCommand(INSERT_TABLE_COMMAND, { columns: '3', rows: '3', includeHeaders: true });
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        editor.dispatchCommand(INSERT_IMAGE_COMMAND, { altText: file.name, src: reader.result });
      }
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className={styles.ribbonToolbar}>
      <div className={styles.compactRibbonGroup}>
        <div className={styles.largeToolBtn} onClick={() => fileInputRef.current?.click()}>
          <ImageIcon size={24} style={{ color: 'var(--brand-primary)' }} />
          <span>Picture</span>
          <input type="file" accept="image/*" style={{ display: 'none' }} ref={fileInputRef} onChange={handleImageUpload} />
        </div>
        <div className={styles.largeToolBtn} onClick={handleInsertTable}>
          <TableIcon size={24} style={{ color: 'var(--brand-primary)' }} />
          <span>Table</span>
        </div>
        <div className={styles.largeToolBtn} onClick={() => setIsSignatureOpen(true)}>
          <FileSignature size={24} style={{ color: 'var(--accent-success)' }} />
          <span>Signature</span>
        </div>
      </div>

      <SignatureModal
        isOpen={isSignatureOpen}
        onClose={() => setIsSignatureOpen(false)}
        onInsert={(dataUrl) => editor.dispatchCommand(INSERT_IMAGE_COMMAND, { src: dataUrl, altText: 'Signature' })}
      />
    </div>
  );
}
