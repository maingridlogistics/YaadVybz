// services/authService.ts
// Google Sign In and Apple Sign In for Vybz Hub.
//
// ARCHITECTURE:
//   Both providers authenticate through Supabase Auth — the same session system
//   used by email/password. There is no separate user database.
//
//   Google: Uses @react-native-google-signin/google-signin to obtain a Google
//   ID token, then calls supabase.auth.signInWithIdToken({ provider: 'google' }).
//
//   Apple: Uses expo-apple-authentication (iOS only) to obtain an Apple identity
//   token, then calls supabase.auth.signInWithIdToken({ provider: 'apple' }).
//
//   On success, Supabase:
//   - Creates a new auth.users row (if email doesn't already exist)
//   - Links to an existing row if the same email was used with another provider
//   - The on_auth_user_created trigger creates user_profiles automatically
//
// IDENTITY LINKING:
//   Supabase's autoLinking merges identities when the email matches an existing
//   account. No manual merging required.

import { Platform } from 'react-native';
import { supabase } from '../lib/supabase';

// ─── Google Sign In ───────────────────────────────────────────────────────────
// Lazily loaded: the package is a native-only module. We cache the module
// reference after the first successful import so subsequent calls are synchronous.
//
// GoogleSignInModule is typed as an explicit interface rather than
// `typeof import(...)` so TypeScript does not need to resolve the package
// at type-check time (the package is a native module absent from web bundles).

interface GoogleSignInUser {
  idToken: string | null;
  user: { name: string | null; email: string | null; id: string };
}

interface GoogleSignInModule {
  GoogleSignin: {
    configure: (opts: {
      webClientId?: string;
      iosClientId?: string;
      offlineAccess?: boolean;
      scopes?: string[];
    }) => void;
    hasPlayServices: (opts?: { showPlayServicesUpdateDialog?: boolean }) => Promise<boolean>;
    signIn: () => Promise<{ data?: GoogleSignInUser } & GoogleSignInUser>;
    isSignedIn: () => Promise<boolean>;
    signOut: () => Promise<void>;
    revokeAccess: () => Promise<void>;
  };
  statusCodes: {
    SIGN_IN_CANCELLED: string;
    IN_PROGRESS: string;
    PLAY_SERVICES_NOT_AVAILABLE: string;
    SIGN_IN_REQUIRED: string;
    [key: string]: string;
  };
}

let _googleModule: GoogleSignInModule | null = null;
let _googleLoadAttempted = false;

async function loadGoogleSignIn(): Promise<GoogleSignInModule | null> {
  if (_googleModule) return _googleModule;
  if (_googleLoadAttempted) return null;
  _googleLoadAttempted = true;
  if (Platform.OS === 'web') return null;
  try {
    const mod = await import('@react-native-google-signin/google-signin');
    _googleModule = mod as unknown as GoogleSignInModule;
    return _googleModule;
  } catch {
    return null;
  }
}

/**
 * Configure Google Sign In.
 * Must be called once, early in the app lifecycle.
 * webClientId is required by Supabase (it uses the OAuth flow under the hood).
 * iosClientId is needed for native iOS sign-in.
 */
export async function configureGoogleSignIn(config: {
  webClientId: string;
  iosClientId?: string;
}) {
  const mod = await loadGoogleSignIn();
  if (!mod) return;
  mod.GoogleSignin.configure({
    webClientId: config.webClientId,
    iosClientId: config.iosClientId,
    offlineAccess: false,
    scopes: ['profile', 'email'],
  });
}

export interface SocialAuthResult {
  ok: boolean;
  /** Populated when the provider returned a display name (first-time Google/Apple) */
  displayName?: string | null;
  /** Populated when Apple returns email (first-time only) */
  email?: string | null;
  error?: string;
  cancelled?: boolean;
}

/**
 * Sign in with Google.
 * Returns the Supabase session via onAuthStateChange — caller does not need
 * to manually set anything; AuthContext listens to auth state changes.
 */
export async function signInWithGoogle(): Promise<SocialAuthResult> {
  if (Platform.OS === 'web') {
    return { ok: false, error: 'Google sign-in is not supported in the browser version.' };
  }

  const mod = await loadGoogleSignIn();
  if (!mod) {
    return { ok: false, error: 'Google Sign In is not available on this device.' };
  }
  const { GoogleSignin, statusCodes } = mod;

  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const userInfo = await GoogleSignin.signIn();
    const idToken = userInfo?.data?.idToken ?? (userInfo as any)?.idToken;

    if (!idToken) {
      return { ok: false, error: 'Google sign-in did not return an identity token. Please try again.' };
    }

    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: idToken,
    });

    if (error) {
      return { ok: false, error: 'Google sign-in could not be completed. Please try again.' };
    }

    const displayName = userInfo?.data?.user?.name ?? (userInfo as any)?.user?.name ?? null;
    return { ok: true, displayName };
  } catch (err: any) {
    if (
      err?.code === statusCodes?.SIGN_IN_CANCELLED ||
      err?.code === 'SIGN_IN_CANCELLED' ||
      err?.message?.toLowerCase?.()?.includes('cancel')
    ) {
      return { ok: false, cancelled: true };
    }
    if (err?.code === statusCodes?.PLAY_SERVICES_NOT_AVAILABLE) {
      return { ok: false, error: 'Google Play Services is required for Google sign-in.' };
    }
    console.warn('[authService] Google sign-in error:', err?.message ?? err);
    return { ok: false, error: 'Google sign-in could not be completed. Please try again.' };
  }
}

/**
 * Sign in with Apple.
 * iOS only. Returns { ok: false, error: '...' } on Android/web with a
 * friendly message — the UI should only show this button on iOS.
 */
export async function signInWithApple(): Promise<SocialAuthResult> {
  if (Platform.OS !== 'ios') {
    return { ok: false, error: 'Apple sign-in is only available on iOS.' };
  }

  let appleModule: typeof import('expo-apple-authentication') | null = null;
  try {
    appleModule = await import('expo-apple-authentication');
  } catch {
    return { ok: false, error: 'Apple sign-in is not available on this device.' };
  }
  if (!appleModule) {
    return { ok: false, error: 'Apple sign-in is not available on this device.' };
  }
  const AppleAuthentication = appleModule;

  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });

    const identityToken = credential.identityToken;
    if (!identityToken) {
      return { ok: false, error: 'Apple sign-in did not return an identity token. Please try again.' };
    }

    // Apple only provides fullName on the VERY FIRST authorization.
    // Capture it now; subsequent logins will return null.
    const firstName = credential.fullName?.givenName ?? null;
    const lastName  = credential.fullName?.familyName ?? null;
    const displayName = [firstName, lastName].filter(Boolean).join(' ') || null;
    const appleEmail  = credential.email ?? null;

    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: identityToken,
    });

    if (error) {
      return { ok: false, error: 'Apple sign-in could not be completed. Please try again.' };
    }

    return { ok: true, displayName, email: appleEmail };
  } catch (err: any) {
    // User cancelled — Apple-specific error code
    if (
      err?.code === 'ERR_REQUEST_CANCELED' ||
      err?.code === '1001' ||
      err?.message?.toLowerCase?.()?.includes('cancel')
    ) {
      return { ok: false, cancelled: true };
    }
    console.warn('[authService] Apple sign-in error:', err?.message ?? err);
    return { ok: false, error: 'Apple sign-in could not be completed. Please try again.' };
  }
}

// ─── WhatsApp OTP Auth ── DEPRECATED ─────────────────────────────────────────
// WhatsApp auth is now handled natively via Supabase phone auth in AuthContext:
//   sendWhatsAppOtp  → supabase.auth.signInWithOtp({ phone, options: { channel: 'whatsapp' } })
//   verifyWhatsAppOtp → supabase.auth.verifyOtp({ phone, token, type: 'sms' })
//
// The Edge Functions send-whatsapp-otp and verify-whatsapp-otp are NO LONGER
// called by any active login path.
//
// These stubs are kept for reference only. Do not call them from auth flows.

export interface WhatsAppOtpSendResult {
  ok: boolean;
  error?: string;
  code?: string;
  retryAfterSeconds?: number;
}

export interface WhatsAppOtpVerifyResult {
  ok: boolean;
  error?: string;
  isNewUser?: boolean;
}

/** @deprecated Use AuthContext.sendWhatsAppOtp instead */
export async function sendWhatsAppOtp(_phone: string): Promise<WhatsAppOtpSendResult> {
  return { ok: false, error: 'Use AuthContext.sendWhatsAppOtp — native Supabase phone auth.' };
}

/** @deprecated Use AuthContext.verifyWhatsAppOtp instead */
export async function verifyWhatsAppOtp(_phone: string, _code: string): Promise<WhatsAppOtpVerifyResult> {
  return { ok: false, error: 'Use AuthContext.verifyWhatsAppOtp — native Supabase phone auth.' };
}

/**
 * Sign out the current Google account (if signed in via Google).
 * Safe to call when user is signed in via another provider — no-op in that case.
 */
export async function revokeGoogleSignIn(): Promise<void> {
  const mod = await loadGoogleSignIn();
  if (!mod) return;
  try {
    const isSignedIn = await mod.GoogleSignin.isSignedIn();
    if (isSignedIn) await mod.GoogleSignin.revokeAccess();
    await mod.GoogleSignin.signOut();
  } catch {
    // Non-critical — Supabase session is already cleared
  }
}
