import { getTemplateById } from '../data/templates';
import { TEMPLATE_SAMPLE_CONTENT } from '../data/templateSamples';

/** Sample text when available; otherwise placeholder structure from the template itself. */
export function getTemplatePreviewContent(templateId: string): string | undefined {
  if (templateId === 'blank') return undefined;
  return TEMPLATE_SAMPLE_CONTENT[templateId] ?? getTemplateById(templateId)?.content;
}

export function hasTemplatePreviewContent(templateId: string): boolean {
  return Boolean(getTemplatePreviewContent(templateId));
}
