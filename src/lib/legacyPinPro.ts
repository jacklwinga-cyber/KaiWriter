const LEGACY_BANNER_KEY = 'kaiwriter-legacy-pro-banner-dismissed';
const PIN_PROFILE_KEY = 'kaiwriter-pin-profile';
const SESSION_KEY = 'kaiwriter-auth-session';

export interface LegacyPinProNotice {
  title: string;
  body: string;
}

interface LegacyPinShape {
  plan?: string;
  trialEndsAt?: number | null;
}

function readLegacyPinProfile(): LegacyPinShape | null {
  try {
    const raw = localStorage.getItem(PIN_PROFILE_KEY);
    return raw ? (JSON.parse(raw) as LegacyPinShape) : null;
  } catch {
    return null;
  }
}

function readLegacySessionUser(): LegacyPinShape | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as LegacyPinShape) : null;
  } catch {
    return null;
  }
}

function hadLocalProAccess(profile: LegacyPinShape | null): boolean {
  if (!profile) return false;
  if (profile.plan === 'pro' || profile.plan === 'teams') return true;
  return typeof profile.trialEndsAt === 'number' && profile.trialEndsAt > 0;
}

/** True when this device previously had device-only Pro (now retired). */
export function getLegacyPinProNotice(isCloudAccount: boolean): LegacyPinProNotice | null {
  if (isCloudAccount) return null;
  if (localStorage.getItem(LEGACY_BANNER_KEY) === '1') return null;

  const pinProfile = readLegacyPinProfile();
  const sessionUser = readLegacySessionUser();
  if (!hadLocalProAccess(pinProfile) && !hadLocalProAccess(sessionUser)) return null;

  const trialEndsAt = pinProfile?.trialEndsAt ?? sessionUser?.trialEndsAt;
  const trialStillActive = typeof trialEndsAt === 'number' && trialEndsAt > Date.now();

  if (trialStillActive) {
    return {
      title: 'Device-only Pro trial is ending',
      body: 'Local Pro trials no longer unlock paid features. Sign in with Google or email to start a real 14-day Pro trial with cloud sync and billing.',
    };
  }

  return {
    title: 'Local Pro access has been retired',
    body: 'Pro features now require a cloud account. Sign in with Google or email to subscribe or start a free trial — your documents on this device will merge automatically.',
  };
}

/** Remove fake Pro plan / trial fields from device storage. */
export function normalizeLegacyPinStorage(): void {
  const raw = localStorage.getItem(PIN_PROFILE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const next: Record<string, unknown> = { ...parsed, plan: 'free' };
      delete next.trialEndsAt;
      localStorage.setItem(PIN_PROFILE_KEY, JSON.stringify(next));
    } catch {
      // ignore corrupt profile
    }
  }

  const sessionRaw = sessionStorage.getItem(SESSION_KEY);
  if (sessionRaw) {
    try {
      const parsed = JSON.parse(sessionRaw) as Record<string, unknown>;
      if (parsed.plan === 'pro' || parsed.plan === 'teams' || parsed.trialEndsAt) {
        const next: Record<string, unknown> = {
          ...parsed,
          plan: 'free',
          accountType: parsed.accountType ?? 'pin',
        };
        delete next.trialEndsAt;
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(next));
      }
    } catch {
      // ignore corrupt session
    }
  }
}

/** Strip retired local Pro flags and mark the banner as seen. */
export function dismissLegacyPinProBanner(): void {
  localStorage.setItem(LEGACY_BANNER_KEY, '1');
  normalizeLegacyPinStorage();
}

export interface LegacyPinProQaStatus {
  bannerDismissed: boolean;
  hasLegacyFlags: boolean;
  pinProfilePresent: boolean;
}

/** Dev-only: read current legacy migration QA state. */
export function getLegacyPinProQaStatus(): LegacyPinProQaStatus {
  const pinProfile = readLegacyPinProfile();
  return {
    bannerDismissed: localStorage.getItem(LEGACY_BANNER_KEY) === '1',
    hasLegacyFlags: hadLocalProAccess(pinProfile) || hadLocalProAccess(readLegacySessionUser()),
    pinProfilePresent: Boolean(localStorage.getItem(PIN_PROFILE_KEY)),
  };
}

function writeQaPinProfile(patch: { plan?: string; trialEndsAt?: number | null }) {
  if (!import.meta.env.DEV) return;

  localStorage.removeItem(LEGACY_BANNER_KEY);

  let base: Record<string, unknown> = {
    userId: crypto.randomUUID(),
    displayName: 'QA Legacy User',
    plan: 'free',
    createdAt: Date.now(),
  };

  const raw = localStorage.getItem(PIN_PROFILE_KEY);
  if (raw) {
    try {
      base = { ...base, ...(JSON.parse(raw) as Record<string, unknown>) };
    } catch {
      // use defaults
    }
  }

  localStorage.setItem(
    PIN_PROFILE_KEY,
    JSON.stringify({ ...base, plan: 'free', trialEndsAt: undefined, ...patch }),
  );
}

/** Dev-only: inject an active device-only Pro trial (shows “trial ending” banner). */
export function simulateLegacyPinProTrial(): void {
  if (!import.meta.env.DEV) return;
  writeQaPinProfile({
    plan: 'free',
    trialEndsAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
  });
}

/** Dev-only: inject a retired local Pro plan (shows “local Pro retired” banner). */
export function simulateLegacyPinProPlan(): void {
  if (!import.meta.env.DEV) return;
  writeQaPinProfile({
    plan: 'pro',
    trialEndsAt: null,
  });
}

/** Dev-only: clear legacy simulation and banner-dismiss flag. */
export function resetLegacyPinProQaState(): void {
  if (!import.meta.env.DEV) return;
  localStorage.removeItem(LEGACY_BANNER_KEY);
  normalizeLegacyPinStorage();
}
