import type { LucideIcon } from 'lucide-react';

export type TemplateCategory =
  | 'business'
  | 'finance'
  | 'academic'
  | 'personal'
  | 'legal'
  | 'marketing'
  | 'creative'
  | 'productivity';

export interface DocumentTemplate {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  icon: LucideIcon;
  defaultDocumentName: string;
  content: string;
  /** Premium templates include richer structure and Pro-ready layouts. */
  premium?: boolean;
  features?: string[];
  /** Realistic gallery thumbnail — PNG/WebP in public/templates/previews/ */
  previewImage?: string;
}
