import { X } from 'lucide-react';
import type { DocumentTemplate } from '../../data/templates';
import { TemplateDocumentPreview } from './TemplateDocumentPreview';
import styles from './TemplatePreviewModal.module.css';

interface TemplatePreviewModalProps {
  template: DocumentTemplate | null;
  onClose: () => void;
}

export function TemplatePreviewModal({ template, onClose }: TemplatePreviewModalProps) {
  if (!template) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Template preview</p>
            <h2 className={styles.title}>{template.name}</h2>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </header>
        <div className={styles.body}>
          <TemplateDocumentPreview
            templateId={template.id}
            category={template.category}
            density="full"
            showSampleLabel={false}
          />
        </div>
      </div>
    </div>
  );
}
