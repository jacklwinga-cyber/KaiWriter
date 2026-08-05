import { isSupabaseConfigured } from './supabase';
import { PREMIUM_TEMPLATE_COUNT, TEMPLATE_COUNT } from '../data/templates';
import { appUrl } from './site';

export const PRO_PRICE_MONTHLY = 9.99;
export const PRO_PRICE_ANNUAL = 79;
export const FREE_DOCUMENT_LIMIT = 3;

export const PRO_FEATURES = [
  'Unlimited documents',
  `${PREMIUM_TEMPLATE_COUNT} flagship Pro templates (${TEMPLATE_COUNT} total)`,
  'Cloud sync across devices',
  'DOCX export & document branding',
  'Version history',
  'Priority support',
];

/** Included on Free — shown in upgrade modal so users know what they can try without paying */
export const FREE_FEATURES = [
  'Up to 3 documents',
  `${TEMPLATE_COUNT - PREMIUM_TEMPLATE_COUNT} free templates + blank document`,
  'Print / Save as PDF & TXT export',
  'Grammar check, proofread & writing suggestions',
  'Kai Assist placeholder fill (you approve every change)',
  'Optional device PIN lock',
];

export function isStripeConfigured(): boolean {
  return isSupabaseConfigured();
}

export class CheckoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CheckoutError';
  }
}

/**
 * Creates a Stripe Checkout session via Supabase Edge Function.
 * Requires deploy of supabase/functions/create-checkout.
 */
export async function startProCheckout(
  billing: 'monthly' | 'annual' = 'monthly',
  accessToken?: string | null,
): Promise<void> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;

  if (supabaseUrl && accessToken) {
    const response = await fetch(`${supabaseUrl}/functions/v1/create-checkout`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
      },
      body: JSON.stringify({
        billing,
        returnUrl: appUrl('/app'),
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new CheckoutError(
        (payload as { error?: string }).error ??
          'Checkout is not available yet. Deploy the create-checkout Edge Function and set Stripe secrets.',
      );
    }

    const url = (payload as { url?: string }).url;
    if (url) {
      window.location.href = url;
      return;
    }
    throw new CheckoutError('No checkout URL returned from server.');
  }

  throw new CheckoutError(
    'Sign in with Supabase and configure Stripe Edge Functions to start checkout.',
  );
}

/** Opens Stripe Customer Portal for subscription management. */
export async function openBillingPortal(accessToken?: string | null): Promise<void> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;

  if (supabaseUrl && accessToken) {
    const response = await fetch(`${supabaseUrl}/functions/v1/create-portal`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
      },
      body: JSON.stringify({ returnUrl: appUrl('/app') }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new CheckoutError(
        (payload as { error?: string }).error ?? 'Billing portal is not available yet.',
      );
    }

    const url = (payload as { url?: string }).url;
    if (url) {
      window.location.href = url;
      return;
    }
    throw new CheckoutError('No portal URL returned from server.');
  }

  throw new CheckoutError('Sign in with your email to manage billing.');
}
