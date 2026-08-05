/** Production app origin (custom subdomain on kainoter.com). */
export const PRODUCTION_ORIGIN = 'https://kaiwriter.kainoter.com';

/** Root KaiHub URL (existing Vercel project: kainoter → hub.kainoter.com). */
export const KAI_ROOT_ORIGIN = 'https://hub.kainoter.com';

/**
 * Canonical site URL for redirects (Supabase auth, Stripe return URLs).
 * Set VITE_SITE_URL in production; falls back to window.origin in the browser.
 */
export function getSiteUrl(): string {
  const fromEnv = import.meta.env.VITE_SITE_URL as string | undefined;
  if (fromEnv?.trim()) return fromEnv.trim().replace(/\/$/, '');
  if (typeof window !== 'undefined') return window.location.origin;
  return PRODUCTION_ORIGIN;
}

export function getKaiWriterOrigin(): string {
  const fromEnv = import.meta.env.VITE_KAIWRITER_URL as string | undefined;
  if (fromEnv?.trim()) return fromEnv.trim().replace(/\/$/, '');
  if (typeof window !== 'undefined' && !isHubHost()) return window.location.origin;
  return PRODUCTION_ORIGIN;
}

export function getKaiHubOrigin(): string {
  const fromEnv = import.meta.env.VITE_KAIHUB_URL as string | undefined;
  if (fromEnv?.trim()) return fromEnv.trim().replace(/\/$/, '');
  if (typeof window !== 'undefined' && isHubHost()) return window.location.origin;
  return KAI_ROOT_ORIGIN;
}

/** True when served on KaiHub host (this repo’s hub routes). */
export function isHubHost(): boolean {
  const mode = import.meta.env.VITE_APP_MODE as string | undefined;
  if (mode === 'hub') return true;
  if (mode === 'writer') return false;
  if (typeof window === 'undefined') return false;
  const h = window.location.hostname;
  return h === 'hub.kainoter.com';
}

export function appUrl(path = '/app'): string {
  const base = getKaiWriterOrigin();
  return path.startsWith('/') ? `${base}${path}` : `${base}/${path}`;
}

/** Origins allowed for Supabase Auth redirect configuration. */
export const SUPABASE_AUTH_REDIRECT_URLS = [
  `${PRODUCTION_ORIGIN}/app`,
  `${PRODUCTION_ORIGIN}/`,
  `${PRODUCTION_ORIGIN}/doc/**`,
  `${PRODUCTION_ORIGIN}/auth/callback`,
  'http://localhost:5173/app',
  'http://localhost:5173/',
  'http://localhost:5173/doc/**',
  'http://localhost:5173/auth/callback',
] as const;

/** Redirect target after OAuth (Google) or magic-link sign-in. */
export function authCallbackUrl(fallbackPath = '/app'): string {
  return appUrl(fallbackPath);
}
