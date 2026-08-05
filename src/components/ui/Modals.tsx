import React, { useState, useEffect } from 'react';
import { X, User, Monitor, Moon, Sun, Sparkles, Check, History, Lock, RotateCcw, Palette, Mail, Cloud, FlaskConical } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeProvider';
import type { ThemeMode } from '../../contexts/ThemeProvider';
import { useAuth } from '../../contexts/AuthProvider';
import { PRO_FEATURES, FREE_FEATURES, openBillingPortal } from '../../lib/stripe';
import {
  getLegacyPinProQaStatus,
  resetLegacyPinProQaState,
  simulateLegacyPinProPlan,
  simulateLegacyPinProTrial,
  type LegacyPinProQaStatus,
} from '../../lib/legacyPinPro';
import { listVersions, saveVersion, type DocumentVersion } from '../../lib/versionStore';
import type { DocumentBranding } from '../../lib/branding';
import { DEFAULT_BRAND_COLOR } from '../../lib/branding';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: ModalProps) {
  const { theme, setTheme } = useTheme();
  const { refreshLegacyPinProNotice, isCloudAccount } = useAuth();
  const [qaStatus, setQaStatus] = useState<LegacyPinProQaStatus | null>(null);
  const isDev = import.meta.env.DEV;

  useEffect(() => {
    if (isOpen && isDev) setQaStatus(getLegacyPinProQaStatus());
  }, [isOpen, isDev]);

  if (!isOpen) return null;

  const runQaAction = (action: () => void) => {
    action();
    refreshLegacyPinProNotice();
    setQaStatus(getLegacyPinProQaStatus());
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={{ ...modalStyle, width: isDev ? '440px' : undefined }} onClick={e => e.stopPropagation()}>
        <div style={headerStyle}>
          <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Settings</h2>
          <button onClick={onClose} style={closeBtnStyle}><X size={20} /></button>
        </div>
        
        <div style={contentStyle}>
          <div style={settingGroupStyle}>
            <h3 style={settingTitleStyle}>Appearance</h3>
            <div style={themeGridStyle}>
              {(['light', 'dark', 'system'] as ThemeMode[]).map(mode => (
                <button 
                  key={mode}
                  onClick={() => setTheme(mode)}
                  style={{
                    ...themeBtnStyle,
                    borderColor: theme === mode ? 'var(--brand-primary)' : 'var(--border-color)',
                    backgroundColor: theme === mode ? 'var(--accent-light)' : 'transparent'
                  }}
                >
                  {mode === 'light' && <Sun size={24} />}
                  {mode === 'dark' && <Moon size={24} />}
                  {mode === 'system' && <Monitor size={24} />}
                  <span style={{ textTransform: 'capitalize', marginTop: '8px' }}>{mode}</span>
                </button>
              ))}
            </div>
          </div>

          {isDev && (
            <div style={settingGroupStyle}>
              <h3 style={{ ...settingTitleStyle, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <FlaskConical size={14} /> Dev QA — Legacy Pro banner
              </h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.5, margin: '0 0 12px' }}>
                Inject retired local Pro state to test the one-time migration banner. Not included in production builds.
              </p>
              {isCloudAccount && (
                <p style={{ color: 'var(--accent-error)', fontSize: '0.85rem', marginBottom: '12px' }}>
                  Sign out of your cloud account first — the banner only shows for guest/PIN users.
                </p>
              )}
              {qaStatus && (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '12px' }}>
                  Banner dismissed: {qaStatus.bannerDismissed ? 'yes' : 'no'} · Legacy flags: {qaStatus.hasLegacyFlags ? 'yes' : 'no'}
                </p>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <button
                  type="button"
                  style={actionBtnStyle}
                  disabled={isCloudAccount}
                  onClick={() => runQaAction(simulateLegacyPinProTrial)}
                >
                  Simulate active local trial
                </button>
                <button
                  type="button"
                  style={actionBtnStyle}
                  disabled={isCloudAccount}
                  onClick={() => runQaAction(simulateLegacyPinProPlan)}
                >
                  Simulate retired local Pro plan
                </button>
                <button
                  type="button"
                  style={{ ...actionBtnStyle, color: 'var(--text-secondary)' }}
                  onClick={() => runQaAction(resetLegacyPinProQaState)}
                >
                  Reset legacy QA state
                </button>
              </div>
            </div>
          )}
          
          <div style={settingGroupStyle}>
            <h3 style={settingTitleStyle}>About</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              KaiWriter Version 1.0.0
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.56 2.98-2.26 5.5-4.82 7.18l7.73 6c4.51-4.16 7.13-10.28 7.13-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

function GoogleSignInButton({ disabled, onClick }: { disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        width: '100%',
        marginBottom: '10px',
        padding: '10px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '10px',
        background: '#fff',
        color: '#1f1f1f',
        fontWeight: 600,
        border: '1px solid var(--border-color)',
        borderRadius: 'var(--radius-sm)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.7 : 1,
      }}
    >
      <GoogleIcon />
      Continue with Google
    </button>
  );
}

export function ProfileModal({ isOpen, onClose, defaultView = 'main' }: ModalProps & { defaultView?: 'main' | 'signin' }) {
  const {
    user, createPin, unlockWithPin, signOut, isPro, isTrialing, trialDaysRemaining, startProTrial,
    isSupabaseEnabled, accessToken, authError, clearAuthError, hasPinSetup, isCloudAccount,
    signInWithEmail, verifyEmailOtp, signInWithGoogle,
  } = useAuth();
  const [view, setView] = useState<'main' | 'signin' | 'pin-create' | 'pin-unlock'>(defaultView === 'signin' ? 'signin' : 'main');
  const [displayName, setDisplayName] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setView('main');
      setPin('');
      setConfirmPin('');
      setOtpCode('');
      setOtpSent(false);
      setBillingError(null);
      setInfoMessage(null);
      return;
    }
    setView(defaultView === 'signin' ? 'signin' : 'main');
  }, [isOpen, defaultView]);

  if (!isOpen) return null;

  const handleCreatePin = async () => {
    if (!displayName.trim()) return;
    if (pin.length < 4 || pin !== confirmPin) return;
    setSubmitting(true);
    clearAuthError();
    try {
      await createPin(pin, displayName.trim());
      setPin('');
      setConfirmPin('');
      setView('main');
    } catch {
      // authError set in provider
    } finally {
      setSubmitting(false);
    }
  };

  const handleUnlock = async () => {
    if (pin.length < 4) return;
    setSubmitting(true);
    clearAuthError();
    try {
      await unlockWithPin(pin);
      setPin('');
      setView('main');
    } catch {
      // authError set in provider
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendMagicLink = async () => {
    if (!email.trim()) return;
    setSubmitting(true);
    setBillingError(null);
    setInfoMessage(null);
    clearAuthError();
    try {
      await signInWithEmail(email.trim());
      setOtpSent(true);
      setInfoMessage('Check your email for a sign-in link or 6-digit code.');
    } catch (err) {
      setBillingError(err instanceof Error ? err.message : 'Could not send sign-in email');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!email.trim() || otpCode.trim().length < 6) return;
    setSubmitting(true);
    setBillingError(null);
    clearAuthError();
    try {
      await verifyEmailOtp(email.trim(), otpCode.trim());
      setView('main');
      onClose();
    } catch (err) {
      setBillingError(err instanceof Error ? err.message : 'Invalid code');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setSubmitting(true);
    setBillingError(null);
    clearAuthError();
    try {
      await signInWithGoogle();
    } catch (err) {
      setBillingError(err instanceof Error ? err.message : 'Google sign-in failed');
      setSubmitting(false);
    }
  };

  const pinInputProps = {
    inputMode: 'numeric' as const,
    pattern: '[0-9]*',
    maxLength: 6,
    autoComplete: 'off' as const,
  };

  const accountLabel = isCloudAccount
    ? user?.email || 'Cloud account'
    : user?.accountType === 'pin'
      ? 'PIN profile on this device'
      : 'Guest';

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={{ ...modalStyle, width: '420px' }} onClick={e => e.stopPropagation()}>
        <div style={headerStyle}>
          <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Account</h2>
          <button type="button" onClick={onClose} style={closeBtnStyle}><X size={20} /></button>
        </div>

        <div style={contentStyle}>
          {view === 'signin' ? (
            <>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '16px', lineHeight: 1.5 }}>
                Sign in for cloud sync, Pro trials, and billing. Your documents merge into this account automatically.
              </p>
              {isSupabaseEnabled && (
                <>
                  <GoogleSignInButton disabled={submitting} onClick={() => void handleGoogleSignIn()} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '16px 0', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                    <span style={{ flex: 1, height: 1, background: 'var(--border-color)' }} />
                    <span>or use email</span>
                    <span style={{ flex: 1, height: 1, background: 'var(--border-color)' }} />
                  </div>
                </>
              )}
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{ ...inputStyle, marginBottom: '12px' }}
                autoComplete="email"
              />
              {otpSent && (
                <input
                  type="text"
                  placeholder="6-digit code from email"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  style={{ ...inputStyle, marginBottom: '12px' }}
                  inputMode="numeric"
                />
              )}
              {infoMessage && <p style={{ color: 'var(--accent-success)', fontSize: '0.85rem', marginBottom: '12px' }}>{infoMessage}</p>}
              {(authError || billingError) && (
                <p style={{ color: 'var(--accent-error)', fontSize: '0.85rem', marginBottom: '12px' }}>{authError || billingError}</p>
              )}
              {!otpSent ? (
                <button
                  type="button"
                  disabled={submitting || !email.trim()}
                  style={{ ...primaryBtnStyle, width: '100%', marginBottom: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                  onClick={() => void handleSendMagicLink()}
                >
                  <Mail size={16} /> {submitting ? 'Sending…' : 'Send sign-in link'}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={submitting || otpCode.length < 6}
                  style={{ ...primaryBtnStyle, width: '100%', marginBottom: '10px' }}
                  onClick={() => void handleVerifyOtp()}
                >
                  {submitting ? 'Verifying…' : 'Verify code'}
                </button>
              )}
              <button type="button" style={{ ...actionBtnStyle, width: '100%' }} onClick={() => setView('main')}>
                Back
              </button>
            </>
          ) : view === 'pin-create' ? (
            <>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '16px', lineHeight: 1.5 }}>
                Optional: lock KaiWriter on this device with a PIN. This does not replace cloud sign-in for Pro or sync.
              </p>
              <input
                type="text"
                placeholder="Your name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                style={{ ...inputStyle, marginBottom: '12px' }}
              />
              <input
                type="password"
                placeholder="Create PIN (4–6 digits)"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                style={{ ...inputStyle, marginBottom: '12px' }}
                {...pinInputProps}
              />
              <input
                type="password"
                placeholder="Confirm PIN"
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                style={{ ...inputStyle, marginBottom: '12px' }}
                {...pinInputProps}
              />
              {pin && confirmPin && pin !== confirmPin && (
                <p style={{ color: 'var(--accent-error)', fontSize: '0.85rem', marginBottom: '12px' }}>PINs do not match.</p>
              )}
              {authError && <p style={{ color: 'var(--accent-error)', fontSize: '0.85rem', marginBottom: '12px' }}>{authError}</p>}
              <button
                type="button"
                disabled={submitting || !displayName.trim() || pin.length < 4 || pin !== confirmPin}
                style={{ ...primaryBtnStyle, width: '100%', marginBottom: '10px' }}
                onClick={() => void handleCreatePin()}
              >
                {submitting ? 'Please wait…' : 'Create PIN'}
              </button>
              <button type="button" style={{ ...actionBtnStyle, width: '100%' }} onClick={() => setView('main')}>
                Back
              </button>
            </>
          ) : view === 'pin-unlock' ? (
            <>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '16px', lineHeight: 1.5 }}>
                Enter your PIN to restore your profile on this device, or continue as a guest.
              </p>
              <input
                type="password"
                placeholder="Enter PIN"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                style={{ ...inputStyle, marginBottom: '12px' }}
                {...pinInputProps}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleUnlock(); }}
              />
              {authError && <p style={{ color: 'var(--accent-error)', fontSize: '0.85rem', marginBottom: '12px' }}>{authError}</p>}
              <button
                type="button"
                disabled={submitting || pin.length < 4}
                style={{ ...primaryBtnStyle, width: '100%', marginBottom: '10px' }}
                onClick={() => void handleUnlock()}
              >
                {submitting ? 'Please wait…' : 'Unlock'}
              </button>
              <button type="button" style={{ ...actionBtnStyle, width: '100%' }} onClick={() => { clearAuthError(); setView('main'); }}>
                Continue as guest
              </button>
            </>
          ) : user ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
                <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: 'var(--bg-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {isCloudAccount ? <Cloud size={28} color="var(--text-secondary)" /> : <User size={32} color="var(--text-secondary)" />}
                </div>
                <div>
                  <div style={{ fontWeight: '600', fontSize: '1.1rem' }}>{user.displayName}</div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{accountLabel}</div>
                  <div style={{ color: isPro ? 'var(--accent-success)' : 'var(--text-muted)', fontSize: '0.85rem', marginTop: '4px' }}>
                    {isPro ? (isTrialing ? `Pro trial · ${trialDaysRemaining} day${trialDaysRemaining === 1 ? '' : 's'} left` : 'Pro Plan') : 'Free Plan'}
                    {isCloudAccount && accessToken && ' • Cloud sync on'}
                  </div>
                </div>
              </div>
              {!isPro && isCloudAccount && (
                <button
                  type="button"
                  style={{ ...primaryBtnStyle, marginBottom: '12px', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                  onClick={() => {
                    void startProTrial().catch((err) => setBillingError(err instanceof Error ? err.message : 'Could not start trial'));
                  }}
                >
                  <Sparkles size={16} /> Start 14-day Pro trial
                </button>
              )}
              {!isPro && !isCloudAccount && isSupabaseEnabled && (
                <>
                  <GoogleSignInButton disabled={submitting} onClick={() => void handleGoogleSignIn()} />
                  <button
                    type="button"
                    style={{ ...actionBtnStyle, marginBottom: '12px', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                    onClick={() => setView('signin')}
                  >
                    <Mail size={16} /> Sign in with email
                  </button>
                </>
              )}
              {isPro && isCloudAccount && accessToken && (
                <button
                  type="button"
                  disabled={billingLoading}
                  style={{ ...actionBtnStyle, marginBottom: '12px', width: '100%' }}
                  onClick={() => {
                    setBillingError(null);
                    setBillingLoading(true);
                    void openBillingPortal(accessToken)
                      .catch((err) => setBillingError(err instanceof Error ? err.message : 'Could not open billing portal'))
                      .finally(() => setBillingLoading(false));
                  }}
                >
                  {billingLoading ? 'Opening…' : 'Manage billing & subscription'}
                </button>
              )}
              {billingError && <p style={{ color: 'var(--accent-error)', fontSize: '0.85rem', marginBottom: '12px' }}>{billingError}</p>}
              {!hasPinSetup && (
                <button type="button" style={{ ...actionBtnStyle, marginBottom: '12px', width: '100%' }} onClick={() => setView('pin-create')}>
                  Set device PIN (optional)
                </button>
              )}
              <button type="button" style={actionBtnStyle} onClick={() => { void signOut(); onClose(); }}>
                {isCloudAccount ? 'Sign out' : 'Clear profile'}
              </button>
            </>
          ) : (
            <>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '16px', lineHeight: 1.5 }}>
                You&apos;re using KaiWriter as a guest. Documents stay on this device. Sign in when you want cloud sync or Pro.
              </p>
              {isSupabaseEnabled && (
                <>
                  <GoogleSignInButton disabled={submitting} onClick={() => void handleGoogleSignIn()} />
                  <button
                    type="button"
                    style={{ ...actionBtnStyle, width: '100%', marginBottom: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                    onClick={() => setView('signin')}
                  >
                    <Mail size={16} /> Sign in with email
                  </button>
                </>
              )}
              {hasPinSetup ? (
                <button type="button" style={{ ...actionBtnStyle, width: '100%', marginBottom: '10px' }} onClick={() => setView('pin-unlock')}>
                  Unlock with PIN
                </button>
              ) : (
                <button type="button" style={{ ...actionBtnStyle, width: '100%', marginBottom: '10px' }} onClick={() => setView('pin-create')}>
                  Set device PIN (optional)
                </button>
              )}
              <button type="button" style={{ ...actionBtnStyle, width: '100%' }} onClick={onClose}>
                Continue as guest
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function ProUpgradeModal({ isOpen, onClose, reason }: ModalProps & { reason?: string }) {
  const { accessToken, isCloudAccount, startProTrial, isSupabaseEnabled } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [needsSignIn, setNeedsSignIn] = useState(false);

  if (!isOpen) return null;

  const handleStartTrial = async () => {
    setError(null);
    setLoading(true);
    setNeedsSignIn(false);
    try {
      await startProTrial();
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not start trial';
      setError(message);
      if (message.toLowerCase().includes('sign in')) setNeedsSignIn(true);
    } finally {
      setLoading(false);
    }
  };

  const canUseStripe = Boolean(isSupabaseEnabled && accessToken && isCloudAccount);

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={{ ...modalStyle, width: '440px' }} onClick={e => e.stopPropagation()}>
        <div style={headerStyle}>
          <h2 style={{ margin: 0, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={20} style={{ color: 'var(--accent-gold)' }} /> KaiWriter Pro
          </h2>
          <button type="button" onClick={onClose} style={closeBtnStyle}><X size={20} /></button>
        </div>
        <div style={contentStyle}>
          {reason && (
            <p style={{ fontSize: '0.9rem', color: 'var(--text-primary)', marginBottom: '12px', padding: '10px 12px', background: 'var(--bg-hover)', borderRadius: '8px' }}>
              {reason}
            </p>
          )}
          <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>
            Unlock flagship templates, unlimited documents, DOCX export, and cloud sync.
          </p>
          <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
            Already free on your plan
          </p>
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 16px 0' }}>
            {FREE_FEATURES.map((f) => (
              <li key={f} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
                <Check size={14} style={{ color: 'var(--accent-success)', flexShrink: 0 }} /> {f}
              </li>
            ))}
          </ul>
          <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
            Pro adds
          </p>
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 20px 0' }}>
            {PRO_FEATURES.map((f) => (
              <li key={f} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', fontSize: '0.95rem' }}>
                <Check size={16} style={{ color: 'var(--accent-success)', flexShrink: 0 }} /> {f}
              </li>
            ))}
          </ul>
          <p style={{ fontSize: '0.85rem', color: 'var(--accent-success)', marginBottom: '16px', fontWeight: 500 }}>
            14-day free trial via Stripe — sign in with email required.
          </p>
          {error && <p style={{ color: 'var(--accent-error)', fontSize: '0.85rem', marginBottom: '12px' }}>{error}</p>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <button type="button" disabled={loading} style={{ ...primaryBtnStyle, width: '100%' }} onClick={() => void handleStartTrial()}>
              {loading ? 'Starting…' : canUseStripe ? 'Start 14-day free trial' : 'Continue to sign in & trial'}
            </button>
            <button type="button" disabled={loading} style={{ ...actionBtnStyle, width: '100%' }} onClick={onClose}>
              Continue with Free
            </button>
          </div>
          {!canUseStripe && (
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '12px' }}>
              {needsSignIn || !isCloudAccount
                ? 'Open Account in the sidebar to sign in with email, then start your trial.'
                : 'Cloud checkout is not configured on this deployment yet.'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

interface VersionHistoryModalProps extends ModalProps {
  documentId: string;
  documentName: string;
  isPro: boolean;
  currentContent: string;
  onRestore: (content: string) => void;
  onRequestUpgrade: () => void;
}

export function VersionHistoryModal({
  isOpen,
  onClose,
  documentId,
  documentName,
  isPro,
  currentContent,
  onRestore,
  onRequestUpgrade,
}: VersionHistoryModalProps) {
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen || !isPro) return;
    setLoading(true);
    void listVersions(documentId)
      .then(setVersions)
      .finally(() => setLoading(false));
  }, [isOpen, documentId, isPro]);

  if (!isOpen) return null;

  const handleManualSnapshot = async () => {
    setSaving(true);
    try {
      await saveVersion(documentId, documentName, currentContent, 'manual');
      setVersions(await listVersions(documentId));
    } finally {
      setSaving(false);
    }
  };

  const handleRestore = (version: DocumentVersion) => {
    if (!window.confirm(`Restore "${version.name}" from ${new Date(version.createdAt).toLocaleString()}? Current changes will be saved as a new version.`)) return;
    void (async () => {
      await saveVersion(documentId, documentName, currentContent, 'manual');
      onRestore(version.content);
      onClose();
    })();
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={{ ...modalStyle, width: '480px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <h2 style={{ margin: 0, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <History size={20} /> Version History
          </h2>
          <button type="button" onClick={onClose} style={closeBtnStyle}><X size={20} /></button>
        </div>
        <div style={{ ...contentStyle, overflow: 'auto', flex: 1 }}>
          {!isPro ? (
            <>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>
                Version history is a Pro feature. Restore previous drafts and keep automatic snapshots every 15 minutes.
              </p>
              <button type="button" style={{ ...primaryBtnStyle, display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }} onClick={onRequestUpgrade}>
                <Lock size={16} /> Upgrade to Pro
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={saving}
                style={{ ...actionBtnStyle, marginBottom: '16px', width: '100%' }}
                onClick={() => void handleManualSnapshot()}
              >
                {saving ? 'Saving…' : 'Save current version'}
              </button>
              {loading && <p style={{ color: 'var(--text-secondary)' }}>Loading versions…</p>}
              {!loading && versions.length === 0 && (
                <p style={{ color: 'var(--text-secondary)' }}>No versions yet. Auto-snapshots save every 15 minutes while you edit.</p>
              )}
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {versions.map((v) => (
                  <li
                    key={v.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 0',
                      borderBottom: '1px solid var(--border-color)',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 500 }}>{v.name}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        {new Date(v.createdAt).toLocaleString()} · {v.source === 'manual' ? 'Manual' : 'Auto'}
                      </div>
                    </div>
                    <button
                      type="button"
                      style={{ ...actionBtnStyle, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}
                      onClick={() => handleRestore(v)}
                    >
                      <RotateCcw size={14} /> Restore
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

interface BrandSettingsModalProps extends ModalProps {
  branding: DocumentBranding;
  isPro: boolean;
  onSave: (branding: DocumentBranding) => void;
  onRequestUpgrade: () => void;
}

export function BrandSettingsModal({
  isOpen,
  onClose,
  branding,
  isPro,
  onSave,
  onRequestUpgrade,
}: BrandSettingsModalProps) {
  const [companyName, setCompanyName] = useState(branding.companyName ?? '');
  const [headerText, setHeaderText] = useState(branding.headerText ?? '');
  const [primaryColor, setPrimaryColor] = useState(branding.primaryColor ?? DEFAULT_BRAND_COLOR);
  const [logoDataUrl, setLogoDataUrl] = useState(branding.logoDataUrl ?? '');

  useEffect(() => {
    if (!isOpen) return;
    setCompanyName(branding.companyName ?? '');
    setHeaderText(branding.headerText ?? '');
    setPrimaryColor(branding.primaryColor ?? DEFAULT_BRAND_COLOR);
    setLogoDataUrl(branding.logoDataUrl ?? '');
  }, [isOpen, branding]);

  if (!isOpen) return null;

  const handleLogoUpload = (file: File | null) => {
    if (!file) return;
    if (file.size > 512_000) {
      window.alert('Logo must be under 512 KB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setLogoDataUrl(String(reader.result));
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    onSave({
      companyName: companyName.trim() || undefined,
      headerText: headerText.trim() || undefined,
      primaryColor: primaryColor || DEFAULT_BRAND_COLOR,
      logoDataUrl: logoDataUrl || undefined,
    });
    onClose();
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={{ ...modalStyle, width: '440px' }} onClick={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <h2 style={{ margin: 0, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Palette size={20} /> Document Branding
          </h2>
          <button type="button" onClick={onClose} style={closeBtnStyle}><X size={20} /></button>
        </div>
        <div style={contentStyle}>
          {!isPro ? (
            <>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>
                Add your logo, company name, and brand colors to exports. Branding appears in DOCX headers and footers.
              </p>
              <button type="button" style={{ ...primaryBtnStyle, display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }} onClick={onRequestUpgrade}>
                <Lock size={16} /> Upgrade to Pro
              </button>
            </>
          ) : (
            <>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px' }}>Company name</label>
              <input type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)} style={{ ...inputStyle, marginBottom: '12px' }} placeholder="Acme Corp" />

              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px' }}>Footer tagline</label>
              <input type="text" value={headerText} onChange={(e) => setHeaderText(e.target.value)} style={{ ...inputStyle, marginBottom: '12px' }} placeholder="Confidential · acme.com" />

              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px' }}>Brand color</label>
              <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} style={{ width: '100%', height: '36px', marginBottom: '12px', border: 'none', background: 'transparent' }} />

              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px' }}>Logo (PNG/JPG, max 512 KB)</label>
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => handleLogoUpload(e.target.files?.[0] ?? null)} style={{ marginBottom: '12px', fontSize: '0.85rem' }} />
              {logoDataUrl && (
                <div style={{ marginBottom: '12px' }}>
                  <img src={logoDataUrl} alt="Logo preview" style={{ maxHeight: '48px', maxWidth: '160px' }} />
                  <button type="button" onClick={() => setLogoDataUrl('')} style={{ display: 'block', marginTop: '6px', fontSize: '0.8rem', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>Remove logo</button>
                </div>
              )}

              <button type="button" style={{ ...primaryBtnStyle, width: '100%' }} onClick={handleSave}>
                Save branding
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0, left: 0, right: 0, bottom: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
  backdropFilter: 'blur(2px)'
};

const modalStyle: React.CSSProperties = {
  backgroundColor: 'var(--bg-surface)',
  borderRadius: 'var(--radius-lg)',
  width: '400px',
  maxWidth: '90vw',
  boxShadow: 'var(--shadow-dropdown)',
  border: '1px solid var(--border-color)',
  display: 'flex',
  flexDirection: 'column'
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '16px 24px',
  borderBottom: '1px solid var(--border-color)'
};

const closeBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--text-secondary)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '4px',
  borderRadius: '4px'
};

const contentStyle: React.CSSProperties = {
  padding: '24px'
};

const settingGroupStyle: React.CSSProperties = {
  marginBottom: '24px'
};

const settingTitleStyle: React.CSSProperties = {
  margin: '0 0 12px 0',
  fontSize: '0.9rem',
  color: 'var(--text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em'
};

const themeGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: '12px'
};

const themeBtnStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '16px',
  borderWidth: '2px',
  borderStyle: 'solid',
  borderRadius: '8px',
  cursor: 'pointer',
  color: 'var(--text-primary)',
  transition: 'all 0.2s'
};

const actionBtnStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px',
  backgroundColor: 'var(--bg-hover)',
  border: '1px solid var(--border-color)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--text-primary)',
  cursor: 'pointer',
  fontWeight: '500'
};

const primaryBtnStyle: React.CSSProperties = {
  ...actionBtnStyle,
  background: 'var(--brand-gradient)',
  border: 'none',
  color: 'white',
  fontWeight: '600',
  boxShadow: '0 4px 12px rgb(107 63 160 / 0.3)',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: '4px',
  border: '1px solid var(--border-color)',
  background: 'var(--bg-hover)',
  color: 'var(--text-primary)',
  fontSize: '0.95rem',
};

export function SignatureModal({ isOpen, onClose, onInsert }: ModalProps & { onInsert?: (dataUrl: string) => void }) {
  const [mode, setMode] = React.useState<'draw' | 'type'>('draw');
  const [text, setText] = React.useState('');
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = React.useState(false);

  if (!isOpen) return null;

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.beginPath();
    ctx.moveTo(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.lineTo(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const handleInsert = () => {
    if (mode === 'draw') {
      const canvas = canvasRef.current;
      if (canvas && onInsert) {
        onInsert(canvas.toDataURL('image/png'));
      }
    } else {
      const canvas = document.createElement('canvas');
      canvas.width = 400;
      canvas.height = 150;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#000';
        ctx.font = '48px "Brush Script MT", cursive';
        ctx.fillText(text, 20, 80);
        if (onInsert) onInsert(canvas.toDataURL('image/png'));
      }
    }
    onClose();
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={{ ...modalStyle, width: '500px' }} onClick={e => e.stopPropagation()}>
        <div style={headerStyle}>
          <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Insert Signature</h2>
          <button onClick={onClose} style={closeBtnStyle}><X size={20} /></button>
        </div>

        <div style={contentStyle}>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <button
              onClick={() => setMode('draw')}
              style={{ flex: 1, padding: '8px', border: '1px solid var(--border-color)', background: mode === 'draw' ? 'var(--bg-active)' : 'transparent', borderRadius: '4px' }}
            >Draw</button>
            <button
              onClick={() => setMode('type')}
              style={{ flex: 1, padding: '8px', border: '1px solid var(--border-color)', background: mode === 'type' ? 'var(--bg-active)' : 'transparent', borderRadius: '4px' }}
            >Type</button>
          </div>

          {mode === 'draw' ? (
            <div style={{ border: '1px solid var(--border-color)', borderRadius: '4px', background: '#fff' }}>
              <canvas
                ref={canvasRef}
                width={450}
                height={200}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseOut={stopDrawing}
                style={{ cursor: 'crosshair', display: 'block' }}
              />
            </div>
          ) : (
            <div style={{ padding: '24px 0' }}>
              <input
                type="text"
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder="Type your signature here..."
                style={{ width: '100%', padding: '12px', fontSize: '16px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-hover)' }}
              />
              <div style={{ marginTop: '24px', fontFamily: '"Brush Script MT", cursive', fontSize: '48px', color: '#000', borderBottom: '1px solid #ccc', paddingBottom: '8px', minHeight: '60px' }}>
                {text}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '24px' }}>
            {mode === 'draw' ? <button onClick={clearCanvas} style={{ color: 'var(--text-secondary)' }}>Clear</button> : <div />}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: '4px', border: '1px solid var(--border-color)' }}>Cancel</button>
              <button onClick={handleInsert} style={{ ...primaryBtnStyle, width: 'auto', padding: '8px 16px' }}>Insert</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
