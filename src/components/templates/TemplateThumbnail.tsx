import { useState } from 'react';
import type { TemplateCategory } from '../../data/templates';
import { hasTemplatePreviewContent } from '../../lib/templatePreviewContent';
import { resolveTemplatePreviewImage } from '../../data/templatePreviews';
import { TemplateDocumentPreview } from './TemplateDocumentPreview';
import styles from './TemplateThumbnail.module.css';

/* ── Legacy wireframe mocks (fallback when no content) ── */

function Bar({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`${styles.bar} ${className}`} {...props} />;
}

function Bullet() {
  return (
    <div className={styles.bulletRow}>
      <span className={styles.bulletDot} />
      <span className={styles.bulletLine} />
    </div>
  );
}

function Body({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`${styles.bodyPad} ${className}`}>{children}</div>;
}

function GenericPreview() {
  return (
    <div className={styles.previewRoot}>
      <Body>
        <Bar className={`${styles.barTitle} ${styles.barMed}`} />
        <div className={styles.gapSm} />
        <Bar className={styles.barFull} /><Bar className={styles.barFull} /><Bar className={styles.barMed} />
        <div className={styles.gapSm} />
        <Bullet /><Bullet />
      </Body>
    </div>
  );
}

export function TemplateThumbnail({
  templateId,
  category = 'business',
  previewImage,
}: {
  templateId: string;
  category?: TemplateCategory;
  previewImage?: string;
}) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const src = resolveTemplatePreviewImage(templateId, previewImage);

  if (src && !photoFailed) {
    return (
      <div className={`${styles.previewRoot} ${styles.previewPhotoWrap}`}>
        <img
          src={src}
          alt=""
          className={styles.previewPhoto}
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setPhotoFailed(true)}
        />
      </div>
    );
  }

  if (hasTemplatePreviewContent(templateId)) {
    return (
      <TemplateDocumentPreview
        templateId={templateId}
        category={category}
        density="thumb"
        showSampleLabel={false}
      />
    );
  }

  return <GenericPreview />;
}
