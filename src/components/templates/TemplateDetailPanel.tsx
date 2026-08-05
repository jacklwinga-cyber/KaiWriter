import { Eye, Lock, Sparkles } from 'lucide-react';
import type { DocumentTemplate } from '../../data/templates';
import { TEMPLATE_CATEGORIES } from '../../data/templates';
import { hasSampleContent } from '../../data/templateSamples';
import { TemplateDocumentPreview } from './TemplateDocumentPreview';
import styles from './TemplateDetailPanel.module.css';

interface TemplateDetailPanelProps {
  template: DocumentTemplate;
  isPro: boolean;
  onPreviewFullscreen?: () => void;
  onUpgrade?: () => void;
}

export function TemplateDetailPanel({
  template,
  isPro,
  onPreviewFullscreen,
  onUpgrade,
}: TemplateDetailPanelProps) {
  const categoryLabel = TEMPLATE_CATEGORIES.find((c) => c.id === template.category)?.label ?? template.category;
  const locked = Boolean(template.premium && !isPro);
  const hasSample = hasSampleContent(template.id);

  return (
    <aside className={styles.panel}>
      <div className={styles.previewFrame}>
        <TemplateDocumentPreview
          templateId={template.id}
          category={template.category}
          density="detail"
          showSampleLabel={false}
        />
        <button
          type="button"
          className={styles.expandBtn}
          onClick={onPreviewFullscreen}
          title="Full-size preview"
        >
          <Eye size={14} />
          Expand
        </button>
      </div>

      <div className={styles.meta}>
        <div className={styles.metaTop}>
          <div>
            <p className={styles.eyebrow}>{categoryLabel}</p>
            <h2 className={styles.title}>{template.name}</h2>
          </div>
          {template.premium && (
            <span className={styles.proBadge}>Pro</span>
          )}
        </div>

        <p className={styles.description}>{template.description}</p>

        <p className={styles.previewNote}>
          {hasSample
            ? 'This is realistic sample content — your document will start with the same structure and placeholders you can replace.'
            : 'Structure preview shows headings, sections, and placeholder fields exactly as they appear in the editor.'}
        </p>

        {template.features && template.features.length > 0 && (
          <div className={styles.featuresBlock}>
            <p className={styles.featuresLabel}>What's included</p>
            <ul className={styles.features}>
              {template.features.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
          </div>
        )}

        {locked && (
          <button type="button" className={styles.upgradeHint} onClick={onUpgrade}>
            <Lock size={14} />
            Pro template — upgrade to create
            <Sparkles size={14} />
          </button>
        )}
      </div>
    </aside>
  );
}
