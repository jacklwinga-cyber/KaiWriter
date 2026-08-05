export type { DocumentTemplate, TemplateCategory } from './templates/types';
export type { TemplatePack } from './templates/index';
export {
  DOCUMENT_TEMPLATES,
  TEMPLATE_CATEGORIES,
  TEMPLATE_PACKS,
  PREMIUM_TEMPLATE_COUNT,
  TEMPLATE_COUNT,
  TEMPLATE_CATEGORY_COUNT,
  getTemplateById,
  getTemplatesForPack,
} from './templates/index';

import { getTemplateById } from './templates/index';
import { TEMPLATE_SAMPLE_CONTENT } from './templateSamples';

export type TemplateContentMode = 'placeholders' | 'sample';

export function getTemplateContent(id: string, mode: TemplateContentMode = 'placeholders'): string | undefined {
  const template = getTemplateById(id);
  if (!template) return undefined;
  if (mode === 'sample') {
    return TEMPLATE_SAMPLE_CONTENT[id] ?? template.content;
  }
  return template.content;
}
