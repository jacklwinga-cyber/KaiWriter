export interface DocumentBranding {
  companyName?: string;
  headerText?: string;
  primaryColor?: string;
  logoDataUrl?: string;
}

export const DEFAULT_BRAND_COLOR = '#6b3fa0';

export function hasBranding(branding?: DocumentBranding | null): boolean {
  if (!branding) return false;
  return Boolean(
    branding.companyName?.trim() ||
      branding.headerText?.trim() ||
      branding.logoDataUrl,
  );
}
