/**
 * Realistic template gallery thumbnails (PNG/WebP in public/templates/previews/).
 * Add or replace files named {template-id}.png — then register the id here.
 * Recommended size: 440×568 px (8.5×11 aspect) for sharpest retina display.
 */
export const TEMPLATE_PREVIEW_IMAGES: Record<string, string> = {
  resume: '/templates/previews/resume.png',
  'cover-letter': '/templates/previews/cover-letter.png',
  'personal-statement': '/templates/previews/cover-letter.png',
  planner: '/templates/previews/planner.png',
  'meeting-notes': '/templates/previews/meeting-notes.png',
  proposal: '/templates/previews/proposal.png',
  'business-plan': '/templates/previews/business-plan.png',
  report: '/templates/previews/report.png',
  invoice: '/templates/previews/invoice.png',
  quote: '/templates/previews/invoice.png',
  estimate: '/templates/previews/invoice.png',
  'business-letter': '/templates/previews/business-letter.png',
  letterhead: '/templates/previews/letterhead.png',
  contract: '/templates/previews/contract.png',
  nda: '/templates/previews/contract.png',
  'academic-paper': '/templates/previews/academic-paper.png',
  assignment: '/templates/previews/academic-paper.png',
  newsletter: '/templates/previews/newsletter.png',
  brochure: '/templates/previews/brochure.png',
  flyer: '/templates/previews/flyer.png',
  journal: '/templates/previews/journal.png',
  certificate: '/templates/previews/certificate.png',
};

export function getTemplatePreviewImage(templateId: string): string | undefined {
  return TEMPLATE_PREVIEW_IMAGES[templateId];
}

/** Optional override on a template record takes precedence. */
export function resolveTemplatePreviewImage(
  templateId: string,
  previewImage?: string,
): string | undefined {
  return previewImage ?? getTemplatePreviewImage(templateId);
}
