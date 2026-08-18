// services/biometricAuthService.ts
// Biometric authentication service for Vybz Hub.
//
// SECURITY MODEL:
//   Biometrics do NOT replace Supabase Auth.
//   Biometrics protect a locally stored Supabase refresh token in SecureStore.
//   On successful biometric verification, the stored token is used to restore
//   the Supabase session — the same session architecture used everywhere.
//
//   NOTHING sensitive is stored in AsyncStorage.
//   The refresh token is stored under AES-256 encryption in iOS Keychain /
//   Android Keystore via expo-secure-store.
//
// FLOW:
//   Enable:
//     1. User logs in normally (email / Google / Apple)
//     2. App offers biometric enable prompt
//     3. User accepts → biometric challenge shown
//     4. On success → Supabase refresh token written to SecureStore
//
//   Login:
//     1. Returning user taps "Sign in with Face ID"
//     2. Biometric challenge shown
//     3. On success → read refresh token from SecureStore
//     4. Call supabase.auth.setSession() to restore the session
//
//   Logout:
//     1. Clear the stored token from SecureStore
//     2. Disable biometric preference flag

import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { supabase } from '../lib/supabase';

const SECURE_KEY_REFRESH_TOKEN = '@vybzhub/biometric_refresh_token';
const SECURE_KEY_ACCESS_TOKEN  = '@vybzhub/biometric_access_token';
const SECURE_KEY_ENABLED_FLAG  = '@vybzhub/biometric_enabled';

// ─── Device capability check ──────────────────────────────────────────────────

export interface BiometricCapability {
  hasHardware: boolean;
  isEnrolled: boolean;
  /** Human-readable label: "Face ID" | "Touch ID" | "Biometrics" */
  label: string;
  /** MaterialIcons name matching the capability */
  iconName: string;
  /** Whether to show biometric option to this user */
  available: boolean;
}

export async function getBiometricCapability(): Promise<BiometricCapability> {
  const notAvailable: BiometricCapability = {
    hasHardware: false,
    isEnrolled: false,
    label: 'Biometrics',
    iconName: 'fingerprint',
    available: false,
  };

  if (Platform.OS === 'web') return notAvailable;

  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    if (!hasHardware) return { ...notAvailable, hasHardware: false };

    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    if (!isEnrolled) return { ...notAvailable, hasHardware: true, isEnrolled: false };

    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();

    let label = 'Biometrics';
    let iconName = 'fingerprint';

    if (Platform.OS === 'ios') {
      if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
        label = 'Face ID';
        iconName = 'face';
      } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
        label = 'Touch ID';
        iconName = 'fingerprint';
      }
    } else {
      // Android
      if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
        label = 'Face Unlock';
        iconName = 'face';
      } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
        label = 'Fingerprint';
        iconName = 'fingerprint';
      } else if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
        label = 'Iris';
        iconName = 'remove-red-eye';
      }
    }

    return { hasHardware: true, isEnrolled: true, label, iconName, available: true };
  } catch {
    return notAvailable;
  }
}

// ─── Preference flag ──────────────────────────────────────────────────────────

export async function isBiometricEnabled(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const val = await SecureStore.getItemAsync(SECURE_KEY_ENABLED_FLAG);
    return val === 'true';
  } catch {
    return false;
  }
}

// ─── Enable biometric login ───────────────────────────────────────────────────

export interface EnableBiometricResult {
  ok: boolean;
  error?: string;
  cancelled?: boolean;
}

/**
 * Enable biometric login for the current session.
 * Triggers a biometric challenge to confirm device ownership before storing
 * the session token. Must be called while a valid Supabase session exists.
 */
export async function enableBiometricLogin(): Promise<EnableBiometricResult> {
  if (Platform.OS === 'web') return { ok: false, error: 'Not supported on web.' };

  const cap = await getBiometricCapability();
  if (!cap.available) return { ok: false, error: 'Biometric authentication is not available on this device.' };

  // Verify with biometrics before writing anything to secure storage
  const authResult = await LocalAuthentication.authenticateAsync({
    promptMessage: `Enable ${cap.label} for Vybz Hub`,
    cancelLabel: 'Cancel',
    disableDeviceFallback: false,
    fallbackLabel: 'Use Passcode',
  });

  if (!authResult.success) {
    if (authResult.error === 'user_cancel' || authResult.error === 'user_fallback') {
      return { ok: false, cancelled: true };
    }
    return { ok: false, error: `${cap.label} verification failed. Please try again.` };
  }

  // Fetch current session tokens to persist
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.refresh_token || !session?.access_token) {
    return { ok: false, error: 'No active session found. Please sign in first.' };
  }

  try {
    // Store with requireAuthentication so the OS biometric gate protects the
    // read — the token cannot be read back without a successful biometric
    // challenge at the OS level, independent of our app-level prompt.
    const storeOptions: SecureStore.SecureStoreOptions = {
      requireAuthentication: true,
      authenticationPrompt: 'Confirm your identity to enable biometric sign-in',
    };
    await SecureStore.setItemAsync(SECURE_KEY_REFRESH_TOKEN, session.refresh_token, storeOptions);
    await SecureStore.setItemAsync(SECURE_KEY_ACCESS_TOKEN, session.access_token, storeOptions);
    // Enabled flag does NOT need requireAuthentication — it's just a boolean
    // preference that controls whether to show the biometric button
    await SecureStore.setItemAsync(SECURE_KEY_ENABLED_FLAG, 'true');
    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not save biometric credentials. Please try again.' };
  }
}

// ─── Biometric login ──────────────────────────────────────────────────────────

export interface BiometricLoginResult {
  ok: boolean;
  error?: string;
  cancelled?: boolean;
}

/**
 * Attempt biometric login for a returning user.
 * Shows the biometric prompt once — does not re-prompt on failure.
 */
export async function biometricLogin(biometricLabel: string): Promise<BiometricLoginResult> {
  if (Platform.OS === 'web') return { ok: false, error: 'Not supported on web.' };

  const cap = await getBiometricCapability();
  if (!cap.available) {
    await clearBiometricCredentials();
    return { ok: false, error: 'Biometric authentication is no longer available on this device.' };
  }

  const authResult = await LocalAuthentication.authenticateAsync({
    promptMessage: `Sign in with ${biometricLabel}`,
    cancelLabel: 'Use Password',
    disableDeviceFallback: false,
    fallbackLabel: 'Use Passcode',
  });

  if (!authResult.success) {
    if (authResult.error === 'user_cancel' || authResult.error === 'user_fallback') {
      return { ok: false, cancelled: true };
    }
    if (authResult.error === 'lockout' || authResult.error === 'lockout_permanent') {
      return { ok: false, error: 'Biometric authentication is locked. Please use your password.' };
    }
    if (authResult.error === 'not_enrolled') {
      await clearBiometricCredentials();
      return { ok: false, error: 'Biometrics are no longer enrolled on this device. Please sign in with your password.' };
    }
    return { ok: false, error: `${biometricLabel} authentication failed. Please try again or use your password.` };
  }

  // Biometric verified — restore Supabase session from stored tokens
  try {
    const readOptions: SecureStore.SecureStoreOptions = {
      requireAuthentication: true,
      authenticationPrompt: `Sign in with ${biometricLabel}`,
    };
    const refreshToken = await SecureStore.getItemAsync(SECURE_KEY_REFRESH_TOKEN, readOptions);
    const accessToken  = await SecureStore.getItemAsync(SECURE_KEY_ACCESS_TOKEN, readOptions);

    if (!refreshToken || !accessToken) {
      await clearBiometricCredentials();
      return { ok: false, error: 'Biometric credentials not found. Please sign in with your password.' };
    }

    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (error) {
      // Token expired — clear and require password
      await clearBiometricCredentials();
      return { ok: false, error: 'Your session has expired. Please sign in with your password to re-enable biometric login.' };
    }

    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not restore your session. Please sign in with your password.' };
  }
}

// ─── Clear / disable biometric ────────────────────────────────────────────────

/**
 * Clear all stored biometric credentials and disable biometric login.
 * Called on explicit logout, or when tokens expire/become invalid.
 */
export async function clearBiometricCredentials(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await SecureStore.deleteItemAsync(SECURE_KEY_REFRESH_TOKEN);
    await SecureStore.deleteItemAsync(SECURE_KEY_ACCESS_TOKEN);
    await SecureStore.deleteItemAsync(SECURE_KEY_ENABLED_FLAG);
  } catch {
    // Best-effort cleanup
  }
}

// ─── Update stored tokens after session refresh ───────────────────────────────

/**
 * Keep stored biometric tokens in sync when Supabase refreshes the session.
 * Call this from AuthContext on TOKEN_REFRESHED events if biometrics are enabled.
 */
export async function updateBiometricTokens(accessToken: string, refreshToken: string): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const enabled = await isBiometricEnabled();
    if (!enabled) return;
    await SecureStore.setItemAsync(SECURE_KEY_ACCESS_TOKEN, accessToken);
    await SecureStore.setItemAsync(SECURE_KEY_REFRESH_TOKEN, refreshToken);
  } catch {
    // Non-critical
  }
}
