import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { getSupabase, isSupabaseConfigured } from '../lib/supabase';
import { fetchSubscriptionDetails, mergeCloudIntoLocal } from '../lib/cloudSync';
import { setCloudSyncUserId } from '../lib/documentStore';
import {
  dismissLegacyPinProBanner,
  getLegacyPinProNotice,
  normalizeLegacyPinStorage,
  type LegacyPinProNotice,
} from '../lib/legacyPinPro';
import { authCallbackUrl } from '../lib/site';
import {
  createPin as createPinRecord,
  hasPinSetup,
  loadPinProfile,
  profileToAuthUser,
  unlockWithPin,
  resetPinOnDevice,
} from '../lib/pinAuth';
import { startProCheckout } from '../lib/stripe';

export type AuthAccountType = 'guest' | 'pin' | 'cloud';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  plan: 'free' | 'pro' | 'teams';
  accountType: AuthAccountType;
  subscriptionStatus?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  isGuest: boolean;
  isCloudAccount: boolean;
  isLoading: boolean;
  isSupabaseEnabled: boolean;
  hasPinSetup: boolean;
  accessToken: string | null;
  legacyPinProNotice: LegacyPinProNotice | null;
  createPin: (pin: string, displayName: string) => Promise<void>;
  unlockWithPin: (pin: string) => Promise<void>;
  signInWithEmail: (email: string) => Promise<void>;
  verifyEmailOtp: (email: string, token: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshPlan: () => Promise<void>;
  startProTrial: () => Promise<void>;
  dismissLegacyPinProNotice: () => void;
  refreshLegacyPinProNotice: () => void;
  isPro: boolean;
  isTrialing: boolean;
  trialDaysRemaining: number | null;
  authError: string | null;
  clearAuthError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const SESSION_KEY = 'kaiwriter-auth-session';

function loadSessionUser(): AuthUser | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthUser;
    if (!parsed.accountType) {
      return { ...parsed, accountType: 'pin', plan: 'free' };
    }
    return parsed;
  } catch {
    return null;
  }
}

function saveSessionUser(user: AuthUser | null) {
  if (user) sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
  else sessionStorage.removeItem(SESSION_KEY);
}

function planFromAppMetadata(user: User): 'free' | 'pro' | 'teams' | null {
  const plan = user.app_metadata?.kaiwriter_plan;
  if (plan === 'pro' || plan === 'teams' || plan === 'free') return plan;
  return null;
}

function trialDaysFromPeriodEnd(periodEnd: number | null, status: string): number | null {
  if (status !== 'trialing' || !periodEnd) return null;
  const ms = periodEnd - Date.now();
  if (ms <= 0) return null;
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

function displayNameFromSupabaseUser(user: User): string {
  return (
    (user.user_metadata?.full_name as string | undefined) ||
    (user.user_metadata?.name as string | undefined) ||
    (user.user_metadata?.display_name as string | undefined) ||
    user.email?.split('@')[0] ||
    'User'
  );
}

async function mapSupabaseUser(user: User): Promise<AuthUser> {
  let plan = planFromAppMetadata(user);
  let subscriptionStatus = 'inactive';

  if (!plan || plan === 'free') {
    const details = await fetchSubscriptionDetails(user.id);
    plan = details.plan;
    subscriptionStatus = details.status;
  }

  return {
    id: user.id,
    email: user.email ?? '',
    displayName: displayNameFromSupabaseUser(user),
    plan: plan ?? 'free',
    accountType: 'cloud',
    subscriptionStatus,
  };
}

function readOAuthErrorFromUrl(): string | null {
  const search = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const raw =
    search.get('error_description') ||
    hash.get('error_description') ||
    search.get('error') ||
    hash.get('error');
  if (!raw) return null;
  try {
    return decodeURIComponent(raw.replace(/\+/g, ' '));
  } catch {
    return raw;
  }
}

function clearAuthParamsFromUrl() {
  const path = window.location.pathname;
  const params = new URLSearchParams(window.location.search);
  params.delete('error');
  params.delete('error_description');
  params.delete('code');
  const qs = params.toString();
  window.history.replaceState({}, '', `${path}${qs ? `?${qs}` : ''}${window.location.hash.includes('access_token') ? '' : ''}`);
  if (window.location.hash.includes('access_token') || window.location.hash.includes('error')) {
    window.history.replaceState({}, '', `${path}${qs ? `?${qs}` : ''}`);
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [pinSetup, setPinSetup] = useState(false);
  const [subscriptionPeriodEnd, setSubscriptionPeriodEnd] = useState<number | null>(null);
  const [legacyPinProNotice, setLegacyPinProNotice] = useState<LegacyPinProNotice | null>(null);
  const isSupabaseEnabled = isSupabaseConfigured();

  const refreshLegacyNotice = useCallback((cloudAccount: boolean) => {
    setLegacyPinProNotice(getLegacyPinProNotice(cloudAccount));
  }, []);

  const applyPinUser = useCallback((next: AuthUser | null) => {
    setUser(next);
    saveSessionUser(next);
    setCloudSyncUserId(null);
    setAccessToken(null);
    setSubscriptionPeriodEnd(null);
    refreshLegacyNotice(false);
  }, [refreshLegacyNotice]);

  const applyCloudUser = useCallback(async (sbUser: User, session: Session | null) => {
    dismissLegacyPinProBanner();
    normalizeLegacyPinStorage();
    setLegacyPinProNotice(null);

    const mapped = await mapSupabaseUser(sbUser);
    const details = await fetchSubscriptionDetails(mapped.id);
    setSubscriptionPeriodEnd(details.currentPeriodEnd);
    setUser(mapped);
    saveSessionUser(mapped);
    setCloudSyncUserId(mapped.id);
    setAccessToken(session?.access_token ?? null);
    await mergeCloudIntoLocal(mapped.id);
  }, []);

  useEffect(() => {
    const oauthError = readOAuthErrorFromUrl();
    if (oauthError) {
      setAuthError(oauthError);
      clearAuthParamsFromUrl();
    }
  }, []);

  useEffect(() => {
    setPinSetup(hasPinSetup());

    const init = async () => {
      if (isSupabaseEnabled) {
        const supabase = getSupabase();
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) {
          setAuthError(error.message);
        }
        if (session?.user) {
          await applyCloudUser(session.user, session);
          setIsLoading(false);
          return;
        }
      }

      const sessionUser = loadSessionUser();
      if (sessionUser?.accountType === 'pin') {
        const profile = loadPinProfile();
        if (profile) {
          applyPinUser(profileToAuthUser(profile));
        }
      }

      refreshLegacyNotice(false);
      setIsLoading(false);
    };

    void init();

    if (!isSupabaseEnabled) return;

    const supabase = getSupabase();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        void applyCloudUser(session.user, session);
      } else if (event === 'SIGNED_OUT') {
        applyPinUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [isSupabaseEnabled, applyCloudUser, applyPinUser, refreshLegacyNotice]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('checkout') === 'success' && isSupabaseEnabled && accessToken) {
      void getSupabase().auth.refreshSession().then(({ data: { session } }) => {
        if (session?.user) void applyCloudUser(session.user, session);
      });
      params.delete('checkout');
      const path = window.location.pathname === '/' ? '/app' : window.location.pathname;
      window.history.replaceState({}, '', `${path}${params.toString() ? `?${params}` : ''}`);
    }
    if (params.get('checkout') === 'cancel') {
      params.delete('checkout');
      window.history.replaceState({}, '', `${window.location.pathname}${params.toString() ? `?${params}` : ''}`);
    }
  }, [isSupabaseEnabled, applyCloudUser, accessToken]);

  const createPin = useCallback(async (pin: string, displayName: string) => {
    setAuthError(null);
    try {
      const authUser = await createPinRecord(pin, displayName);
      applyPinUser(authUser);
      setPinSetup(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not create PIN';
      setAuthError(message);
      throw err;
    }
  }, [applyPinUser]);

  const unlockPin = useCallback(async (pin: string) => {
    setAuthError(null);
    try {
      const authUser = await unlockWithPin(pin);
      applyPinUser(authUser);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Incorrect PIN';
      setAuthError(message);
      throw err;
    }
  }, [applyPinUser]);

  const signInWithEmail = useCallback(async (email: string) => {
    if (!isSupabaseEnabled) {
      throw new Error('Cloud sign-in is not configured yet.');
    }
    setAuthError(null);
    const supabase = getSupabase();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: authCallbackUrl('/app') },
    });
    if (error) {
      setAuthError(error.message);
      throw error;
    }
  }, [isSupabaseEnabled]);

  const verifyEmailOtp = useCallback(async (email: string, token: string) => {
    if (!isSupabaseEnabled) {
      throw new Error('Cloud sign-in is not configured yet.');
    }
    setAuthError(null);
    const supabase = getSupabase();
    const { data, error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: token.trim(),
      type: 'email',
    });
    if (error) {
      setAuthError(error.message);
      throw error;
    }
    if (data.session?.user) {
      await applyCloudUser(data.session.user, data.session);
    }
  }, [isSupabaseEnabled, applyCloudUser]);

  const signInWithGoogle = useCallback(async () => {
    if (!isSupabaseEnabled) {
      throw new Error('Cloud sign-in is not configured yet.');
    }
    setAuthError(null);
    const supabase = getSupabase();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: authCallbackUrl('/app'),
        queryParams: { prompt: 'select_account' },
      },
    });
    if (error) {
      setAuthError(error.message);
      throw error;
    }
  }, [isSupabaseEnabled]);

  const signOut = useCallback(async () => {
    if (isSupabaseEnabled) await getSupabase().auth.signOut();
    applyPinUser(null);
  }, [isSupabaseEnabled, applyPinUser]);

  const refreshPlan = useCallback(async () => {
    if (!user || user.accountType !== 'cloud' || !isSupabaseEnabled) return;
    const { data: { session } } = await getSupabase().auth.refreshSession();
    if (session?.user) await applyCloudUser(session.user, session);
  }, [user, isSupabaseEnabled, applyCloudUser]);

  const startProTrial = useCallback(async () => {
    if (!isSupabaseEnabled) {
      throw new Error('Sign in with Google or email to start a Pro trial. Cloud checkout is not configured on this deployment.');
    }
    if (!accessToken) {
      throw new Error('Sign in with Google or email first — Pro trials and cloud sync require a cloud account.');
    }
    await startProCheckout('monthly', accessToken);
  }, [isSupabaseEnabled, accessToken]);

  const dismissLegacyPinProNotice = useCallback(() => {
    dismissLegacyPinProBanner();
    setLegacyPinProNotice(null);
    if (user?.accountType === 'pin') {
      const profile = loadPinProfile();
      if (profile) applyPinUser(profileToAuthUser(profile));
    }
  }, [user, applyPinUser]);

  const refreshLegacyPinProNotice = useCallback(() => {
    setLegacyPinProNotice(getLegacyPinProNotice(user?.accountType === 'cloud'));
  }, [user?.accountType]);

  const isTrialing = user?.accountType === 'cloud' && user.subscriptionStatus === 'trialing';
  const trialDaysRemaining = useMemo(() => {
    if (!isTrialing) return null;
    return trialDaysFromPeriodEnd(subscriptionPeriodEnd, user?.subscriptionStatus ?? '');
  }, [isTrialing, subscriptionPeriodEnd, user?.subscriptionStatus]);

  const isAdminMode = import.meta.env.VITE_ADMIN_MODE === 'true';
  const isPro = isAdminMode || user?.plan === 'pro' || user?.plan === 'teams';
  const isGuest = !user;
  const isCloudAccount = user?.accountType === 'cloud';

  const value = useMemo(
    () => ({
      user,
      isGuest,
      isCloudAccount,
      isLoading,
      isSupabaseEnabled,
      hasPinSetup: pinSetup,
      accessToken,
      legacyPinProNotice,
      createPin,
      unlockWithPin: unlockPin,
      signInWithEmail,
      verifyEmailOtp,
      signInWithGoogle,
      signOut,
      refreshPlan,
      startProTrial,
      dismissLegacyPinProNotice,
      refreshLegacyPinProNotice,
      isPro,
      isTrialing,
      trialDaysRemaining,
      authError,
      clearAuthError: () => setAuthError(null),
    }),
    [
      user, isGuest, isCloudAccount, isLoading, isSupabaseEnabled, pinSetup, accessToken,
      legacyPinProNotice, createPin, unlockPin, signInWithEmail, verifyEmailOtp, signInWithGoogle,
      signOut, refreshPlan, startProTrial, dismissLegacyPinProNotice, refreshLegacyPinProNotice, isPro, isTrialing,
      trialDaysRemaining, authError,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export { resetPinOnDevice };
