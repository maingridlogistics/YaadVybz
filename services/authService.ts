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
// Dynamically imported to avoid crashing on web / environments without native modules.

let GoogleSignin: any = null;
let GoogleStatusCodes: any = null;

function getGoogleSignin() {
  if (GoogleSignin) return { GoogleSignin, statusCodes: GoogleStatusCodes };
  try {
    const mod = require('@react-native-google-signin/google-signin');
    GoogleSignin = mod.GoogleSignin;
    GoogleStatusCodes = mod.statusCodes;
    return { GoogleSignin, statusCodes: GoogleStatusCodes };
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
export function configureGoogleSignIn(config: {
  webClientId: string;
  iosClientId?: string;
}) {
  const g = getGoogleSignin();
  if (!g) return;
  g.GoogleSignin.configure({
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

  const g = getGoogleSignin();
  if (!g) {
    return { ok: false, error: 'Google Sign In is not available on this device.' };
  }

  try {
    await g.GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const userInfo = await g.GoogleSignin.signIn();
    const idToken = userInfo?.data?.idToken ?? userInfo?.idToken;

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

    const displayName = userInfo?.data?.user?.name ?? userInfo?.user?.name ?? null;
    return { ok: true, displayName };
  } catch (err: any) {
    // User cancelled — silent close
    if (
      err?.code === g.statusCodes?.SIGN_IN_CANCELLED ||
      err?.code === 'SIGN_IN_CANCELLED' ||
      err?.message?.toLowerCase?.()?.includes('cancel')
    ) {
      return { ok: false, cancelled: true };
    }
    // Play Services not available
    if (err?.code === g.statusCodes?.PLAY_SERVICES_NOT_AVAILABLE) {
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

  let AppleAuthentication: any;
  try {
    AppleAuthentication = require('expo-apple-authentication');
  } catch {
    return { ok: false, error: 'Apple sign-in is not available on this device.' };
  }

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

/**
 * Sign out the current Google account (if signed in via Google).
 * Safe to call when user is signed in via another provider — no-op in that case.
 */
export async function revokeGoogleSignIn(): Promise<void> {
  const g = getGoogleSignin();
  if (!g) return;
  try {
    const isSignedIn = await g.GoogleSignin.isSignedIn();
    if (isSignedIn) await g.GoogleSignin.revokeAccess();
    await g.GoogleSignin.signOut();
  } catch {
    // Non-critical — Supabase session is already cleared
  }
}
