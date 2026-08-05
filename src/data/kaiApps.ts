import {
  FileText, PenLine, Send, Shield, BarChart3, FormInput, type LucideIcon,
} from 'lucide-react';
import { getKaiWriterOrigin } from '../lib/site';

export type KaiAppStatus = 'live' | 'soon';

export interface KaiApp {
  id: string;
  name: string;
  tagline: string;
  description: string;
  icon: LucideIcon;
  /** Absolute URL or in-app path */
  href: string;
  status: KaiAppStatus;
}

function writerHref(path: string): string {
  const base = typeof window !== 'undefined' ? getKaiWriterOrigin() : 'https://kaiwriter.kainoter.com';
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

export function getKaiApps(): KaiApp[] {
  return [
    {
      id: 'kaiwriter',
      name: 'KaiWriter',
      tagline: 'Documents & templates',
      description: 'Professional templates, cloud sync, and Word-compatible exports — without AI rewriting your work.',
      icon: FileText,
      href: writerHref('/app'),
      status: 'live',
    },
    {
      id: 'kaisign',
      name: 'KaiSign',
      tagline: 'E-signatures',
      description: 'Sign contracts and invoices created in KaiWriter. Coming soon.',
      icon: PenLine,
      href: '#',
      status: 'soon',
    },
    {
      id: 'kaisend',
      name: 'KaiSend',
      tagline: 'Client delivery',
      description: 'Email PDFs and payment reminders directly from your documents.',
      icon: Send,
      href: '#',
      status: 'soon',
    },
    {
      id: 'kaivault',
      name: 'KaiVault',
      tagline: 'Secure archive',
      description: 'Version archive and backup for Pro teams.',
      icon: Shield,
      href: '#',
      status: 'soon',
    },
    {
      id: 'kaiforms',
      name: 'KaiForms',
      tagline: 'Intake → documents',
      description: 'Client intake forms that populate KaiWriter templates automatically.',
      icon: FormInput,
      href: '#',
      status: 'soon',
    },
    {
      id: 'kaianalytics',
      name: 'KaiAnalytics',
      tagline: 'Usage insights',
      description: 'Template popularity and team productivity metrics.',
      icon: BarChart3,
      href: '#',
      status: 'soon',
    },
  ];
}

export function getLiveKaiApps(): KaiApp[] {
  return getKaiApps().filter((a) => a.status === 'live');
}
