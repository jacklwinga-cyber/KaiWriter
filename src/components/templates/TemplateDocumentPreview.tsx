import { useMemo } from 'react';
import type { TemplateCategory } from '../../data/templates';
import { lexicalToPreviewHtml } from '../../lib/lexicalPreviewHtml';
import { getTemplatePreviewContent } from '../../lib/templatePreviewContent';
import { hasSampleContent } from '../../data/templateSamples';
import styles from './TemplateDocumentPreview.module.css';

export type PreviewDensity = 'thumb' | 'detail' | 'full';

const MAX_BLOCKS: Record<PreviewDensity, number> = {
  thumb: 14,
  detail: 24,
  full: 0,
};

interface TemplateDocumentPreviewProps {
  templateId: string;
  category?: TemplateCategory;
  density?: PreviewDensity;
  showSampleLabel?: boolean;
}

export function TemplateDocumentPreview({
  templateId,
  category = 'business',
  density = 'thumb',
  showSampleLabel = density === 'thumb',
}: TemplateDocumentPreviewProps) {
  const html = useMemo(() => {
    const content = getTemplatePreviewContent(templateId);
    if (!content) return '';
    return lexicalToPreviewHtml(content, {
      maxBlocks: MAX_BLOCKS[density],
    });
  }, [templateId, density]);

  if (!html) return null;

  const isSample = hasSampleContent(templateId);

  return (
    <div className={`${styles.page} ${styles[density]} ${styles[category]}`}>
      <div className={styles.scaler}>
        <article className={styles.sheet}>
          <div className={styles.content} dangerouslySetInnerHTML={{ __html: html }} />
        </article>
      </div>
      {density === 'thumb' && <div className={styles.fadeBottom} aria-hidden />}
      {showSampleLabel && (
        <span className={styles.sampleLabel}>{isSample ? 'Sample preview' : 'Structure preview'}</span>
      )}
    </div>
  );
}
