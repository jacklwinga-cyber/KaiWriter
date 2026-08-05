import type { AuthUser } from '../contexts/AuthProvider';

const PIN_HASH_KEY = 'kaiwriter-pin-hash';
const PIN_SALT_KEY = 'kaiwriter-pin-salt';
const PIN_PROFILE_KEY = 'kaiwriter-pin-profile';

export const PIN_MIN_LENGTH = 4;
export const PIN_MAX_LENGTH = 6;

export interface PinProfile {
  userId: string;
  displayName: string;
  plan: AuthUser['plan'];
  createdAt: number;
}

function encode(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hashPin(pin: string, salt: string): Promise<string> {
  const enc = new TextEncoder();
  const material = await crypto.subtle.importKey(
    'raw',
    enc.encode(pin),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: enc.encode(salt),
      iterations: 120_000,
      hash: 'SHA-256',
    },
    material,
    256,
  );
  return encode(bits);
}

export function isValidPinFormat(pin: string): boolean {
  return /^\d{4,6}$/.test(pin);
}

export function hasPinSetup(): boolean {
  return Boolean(localStorage.getItem(PIN_HASH_KEY) && localStorage.getItem(PIN_PROFILE_KEY));
}

export function loadPinProfile(): PinProfile | null {
  try {
    const raw = localStorage.getItem(PIN_PROFILE_KEY);
    return raw ? (JSON.parse(raw) as PinProfile) : null;
  } catch {
    return null;
  }
}

function savePinProfile(profile: PinProfile) {
  localStorage.setItem(PIN_PROFILE_KEY, JSON.stringify(profile));
}

export function profileToAuthUser(profile: PinProfile): AuthUser {
  return {
    id: profile.userId,
    email: '',
    displayName: profile.displayName,
    plan: 'free',
    accountType: 'pin',
  };
}

export async function createPin(pin: string, displayName: string): Promise<AuthUser> {
  if (!isValidPinFormat(pin)) {
    throw new Error(`PIN must be ${PIN_MIN_LENGTH}–${PIN_MAX_LENGTH} digits.`);
  }
  if (hasPinSetup()) {
    throw new Error('A PIN already exists on this device. Enter your PIN or reset in Account settings.');
  }

  const salt = crypto.randomUUID();
  const hash = await hashPin(pin, salt);
  const profile: PinProfile = {
    userId: crypto.randomUUID(),
    displayName: displayName.trim() || 'Writer',
    plan: 'free',
    createdAt: Date.now(),
  };

  localStorage.setItem(PIN_SALT_KEY, salt);
  localStorage.setItem(PIN_HASH_KEY, hash);
  savePinProfile(profile);

  return profileToAuthUser(profile);
}

export async function unlockWithPin(pin: string): Promise<AuthUser> {
  if (!hasPinSetup()) {
    throw new Error('No PIN on this device yet. Create one first.');
  }
  if (!isValidPinFormat(pin)) {
    throw new Error('Invalid PIN format.');
  }

  const salt = localStorage.getItem(PIN_SALT_KEY);
  const storedHash = localStorage.getItem(PIN_HASH_KEY);
  const profile = loadPinProfile();

  if (!salt || !storedHash || !profile) {
    throw new Error('PIN data is missing. Create a new PIN.');
  }

  const hash = await hashPin(pin, salt);
  if (hash !== storedHash) {
    throw new Error('Incorrect PIN. Try again.');
  }

  return profileToAuthUser(profile);
}

export async function changePin(currentPin: string, newPin: string): Promise<void> {
  await unlockWithPin(currentPin);
  if (!isValidPinFormat(newPin)) {
    throw new Error(`New PIN must be ${PIN_MIN_LENGTH}–${PIN_MAX_LENGTH} digits.`);
  }
  const salt = crypto.randomUUID();
  const hash = await hashPin(newPin, salt);
  localStorage.setItem(PIN_SALT_KEY, salt);
  localStorage.setItem(PIN_HASH_KEY, hash);
}

export function updatePinDisplayName(displayName: string) {
  const profile = loadPinProfile();
  if (!profile) return;
  savePinProfile({ ...profile, displayName: displayName.trim() || profile.displayName });
}

/** Removes PIN and profile from this device (documents stay in IndexedDB). */
export function resetPinOnDevice() {
  localStorage.removeItem(PIN_HASH_KEY);
  localStorage.removeItem(PIN_SALT_KEY);
  localStorage.removeItem(PIN_PROFILE_KEY);
}
