import { BUSINESS_TEMPLATES } from './business';
import { PERSONAL_TEMPLATES, ACADEMIC_TEMPLATES, PRODUCTIVITY_TEMPLATES, FINANCE_TEMPLATES, LEGAL_TEMPLATES, CREATIVE_TEMPLATES } from './personal';
import { MARKETING_TEMPLATES } from './marketing';
import { EXTRA_TEMPLATES } from './extra';
import type { DocumentTemplate, TemplateCategory } from './types';

export type { DocumentTemplate, TemplateCategory } from './types';

export const DOCUMENT_TEMPLATES: DocumentTemplate[] = [
  ...BUSINESS_TEMPLATES,
  ...MARKETING_TEMPLATES,
  ...PERSONAL_TEMPLATES,
  ...ACADEMIC_TEMPLATES,
  ...PRODUCTIVITY_TEMPLATES,
  ...FINANCE_TEMPLATES,
  ...LEGAL_TEMPLATES,
  ...CREATIVE_TEMPLATES,
  ...EXTRA_TEMPLATES,
];

export function getTemplateById(id: string): DocumentTemplate | undefined {
  return DOCUMENT_TEMPLATES.find((t) => t.id === id);
}

export const TEMPLATE_CATEGORIES: { id: TemplateCategory; label: string }[] = [
  { id: 'business', label: 'Business' },
  { id: 'finance', label: 'Finance' },
  { id: 'academic', label: 'Education' },
  { id: 'personal', label: 'Personal' },
  { id: 'legal', label: 'Legal' },
  { id: 'marketing', label: 'Marketing' },
  { id: 'creative', label: 'Creative' },
  { id: 'productivity', label: 'Productivity' },
];

export interface TemplatePack {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  templateIds: string[];
}

export const TEMPLATE_PACKS: TemplatePack[] = [
  {
    id: 'business-pack',
    name: 'Business Pack',
    description: 'Proposals, invoices, reports, contracts, and letterheads.',
    category: 'business',
    templateIds: ['proposal', 'invoice', 'report', 'contract', 'letterhead', 'business-plan', 'business-letter'],
  },
  {
    id: 'finance-pack',
    name: 'Finance Pack',
    description: 'Quotes, invoices, statements, expense reports, and credits.',
    category: 'finance',
    templateIds: ['quote', 'estimate', 'purchase-order', 'receipt', 'credit-note', 'statement-of-account', 'expense-report', 'payment-reminder', 'budget-planner', 'invoice'],
  },
  {
    id: 'career-pack',
    name: 'Personal & Career Pack',
    description: 'Modern CVs, cover letters, and personal statements.',
    category: 'personal',
    templateIds: ['resume', 'cover-letter', 'personal-statement'],
  },
  {
    id: 'academic-pack',
    name: 'Education Pack',
    description: 'Research papers, assignments, and thesis documents.',
    category: 'academic',
    templateIds: ['academic-paper', 'assignment', 'thesis', 'book-chapter'],
  },
  {
    id: 'legal-pack',
    name: 'Legal Pack',
    description: 'NDAs, employment agreements, policies, and terms.',
    category: 'legal',
    templateIds: ['nda', 'employment-agreement', 'privacy-policy', 'terms-of-service', 'sla-agreement', 'vendor-agreement', 'contract', 'compliance-policy', 'legal-letter'],
  },
  {
    id: 'marketing-pack',
    name: 'Marketing Pack',
    description: 'Newsletters, one-pagers, case studies, and media kits.',
    category: 'marketing',
    templateIds: ['newsletter', 'one-pager', 'case-study', 'media-kit', 'email-campaign', 'product-sheet', 'brochure', 'flyer', 'press-release'],
  },
  {
    id: 'productivity-pack',
    name: 'Productivity Pack',
    description: 'Meeting minutes, project plans, and to-do lists.',
    category: 'productivity',
    templateIds: ['meeting-notes', 'project-plan', 'todo-list', 'sprint-retrospective', 'report'],
  },
  {
    id: 'creative-pack',
    name: 'Creative Pack',
    description: 'Manuscripts, scripts, storyboards, and book chapters.',
    category: 'creative',
    templateIds: ['manuscript', 'screenplay', 'storyboard', 'book-chapter'],
  },
];

export function getTemplatesForPack(packId: string): DocumentTemplate[] {
  const pack = TEMPLATE_PACKS.find((p) => p.id === packId);
  if (!pack) return [];
  return pack.templateIds
    .map((id) => getTemplateById(id))
    .filter((t): t is DocumentTemplate => Boolean(t));
}

export const PREMIUM_TEMPLATE_COUNT = DOCUMENT_TEMPLATES.filter((t) => t.premium).length;
export const TEMPLATE_COUNT = DOCUMENT_TEMPLATES.length;
export const TEMPLATE_CATEGORY_COUNT = TEMPLATE_CATEGORIES.length;
