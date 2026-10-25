/**
 * Rules for deleting a KaiWriter cloud account. Shared by the
 * `delete-account` edge function and the browser (src/lib/accountData.ts).
 * Plain TypeScript with no runtime imports.
 */

export type DeleteAccountErrorCode =
  | 'bad_request'
  | 'unauthorized'
  | 'reauth_required'
  | 'subscription_active'
  | 'not_configured'
  | 'failed';

export const DELETE_ACCOUNT_STATUS: Record<DeleteAccountErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  reauth_required: 403,
  subscription_active: 409,
  not_configured: 503,
  failed: 500,
};

export const DELETE_ACCOUNT_MESSAGES: Record<DeleteAccountErrorCode, string> = {
  bad_request: 'Type DELETE to confirm.',
  unauthorized: 'Sign in to delete your account.',
  reauth_required: 'For your security, sign out and sign in again, then delete your account within 15 minutes.',
  subscription_active: 'Cancel your Pro subscription first (Manage billing & subscription), then delete your account.',
  not_configured: 'Account deletion is not set up on this server yet.',
  failed: 'Your account could not be deleted. Nothing was removed. Try again later.',
};

export const CONFIRM_PHRASE = 'DELETE';
/** Deleting an account needs a sign-in this recent (a stolen, older session can't do it). */
export const REAUTH_WINDOW_MS = 15 * 60 * 1000;

export function isDeleteAccountErrorCode(value: unknown): value is DeleteAccountErrorCode {
  return typeof value === 'string' && value in DELETE_ACCOUNT_STATUS;
}

/** True if the last sign-in is missing, unreadable, or older than the window. */
export function needsReauth(lastSignInAt: string | null | undefined, now: number): boolean {
  const at = lastSignInAt ? Date.parse(lastSignInAt) : NaN;
  return !Number.isFinite(at) || now - at > REAUTH_WINDOW_MS || at - now > 60_000;
}

/** A paid subscription that would keep billing after the account is gone. */
export function hasBillableSubscription(row: { status?: unknown; stripe_subscription_id?: unknown } | null | undefined): boolean {
  if (!row) return false;
  return (row.status === 'active' || row.status === 'trialing' || row.status === 'past_due')
    && typeof row.stripe_subscription_id === 'string' && row.stripe_subscription_id.length > 0;
}
