/**
 * Vybz Hub — Push Notification Helpers  [BUILD v3 — FCM direct path]
 *
 * Android: uses getDevicePushTokenAsync for raw FCM registration tokens.
 *          These are sent directly to FCM HTTP v1 API from the Edge Function,
 *          bypassing Expo's push routing entirely (no Expo credential dependency).
 *
 * iOS:     uses getExpoPushTokenAsync for Expo-routed APNs tokens.
 *          These continue to flow through Expo's push service.
 *
 * The token_type column in push_tokens (values: 'fcm' | 'expo') lets the Edge
 * Function branch to the correct delivery path without guessing from string shape.
 *
 * All failures are silent — push never blocks any app flow.
 * Real-device only: tokens cannot be obtained in web preview or iOS Simulator.
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from './supabase';

// ─── Build identity ───────────────────────────────────────────────────────────
// This line changes on every significant rewrite so old-vs-new APK can be
// confirmed immediately from the first log line after sign-in.
const BUILD_TAG = 'pushNotifications@v3-fcm-direct';

/** Resolve the Expo project ID from app config for production EAS builds. */
function getProjectId(): string | undefined {
  try {
    return (
      (Constants.expoConfig?.extra as any)?.eas?.projectId ??
      (Constants as any).easConfig?.projectId ??
      (Constants.expoConfig as any)?.projectId ??
      undefined
    );
  } catch {
    return undefined;
  }
}

/**
 * Get the push token for this device along with its type.
 * Android → raw FCM registration token (token_type: 'fcm')
 * iOS     → Expo-wrapped APNs token    (token_type: 'expo')
 *
 * Every step is logged so old vs new APK code can be confirmed from Metro/ADB.
 */
async function fetchDeviceToken(): Promise<{ token: string; tokenType: 'expo' | 'fcm' }> {
  console.log(`[Push][${BUILD_TAG}] fetchDeviceToken — Platform.OS=${Platform.OS}`);

  if (Platform.OS === 'android') {
    console.log('[Push] ANDROID PATH → calling getDevicePushTokenAsync() for raw FCM token');
    let td: Notifications.DevicePushToken;
    try {
      td = await Notifications.getDevicePushTokenAsync();
    } catch (err) {
      // Log the EXACT error so we know if this API is unavailable on this build
      console.error('[Push] getDevicePushTokenAsync() THREW:', String(err));
      throw err;
    }
    const rawType = td.type;           // Expo returns 'android' for GCM/FCM tokens
    const rawData = td.data;           // The actual FCM registration token string
    const token = String(rawData);
    console.log('[Push] getDevicePushTokenAsync() returned — type=' + rawType + ' dataLength=' + token.length);
    console.log('[Push] FCM token prefix (first 40 chars):', token.slice(0, 40));
    console.log('[Push] token_type being set: fcm');
    return { token, tokenType: 'fcm' };
  }

  // iOS — Expo-routed via APNs
  console.log('[Push] iOS PATH → calling getExpoPushTokenAsync()');
  const projectId = getProjectId();
  if (!projectId) {
    console.warn('[Push] No Expo project ID found — add extra.eas.projectId to app.json');
  }
  console.log('[Push] Using projectId:', projectId ?? 'NONE (will fail on production)');
  let td: Notifications.ExpoPushToken;
  try {
    td = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : {});
  } catch (err) {
    console.error('[Push] getExpoPushTokenAsync() THREW:', String(err));
    throw err;
  }
  console.log('[Push] getExpoPushTokenAsync() returned — token prefix:', td.data?.slice(0, 40));
  console.log('[Push] token_type being set: expo');
  return { token: td.data, tokenType: 'expo' };
}

export type PushRegistrationResult =
  | { status: 'registered'; token: string; tokenType: 'expo' | 'fcm' }
  | { status: 'failed'; error: string }
  | { status: 'denied' }
  | { status: 'web' };

/**
 * Request push permission and register this device's token in Supabase.
 * Android stores a raw FCM token (token_type='fcm') for direct FCM v1 sends.
 * iOS stores an Expo push token (token_type='expo') for Expo-routed APNs.
 * Idempotent — the unique (user_id, token) constraint prevents duplicates.
 * Silently skips on web, simulator, or if the user denies permission.
 */
export async function registerPushToken(userId: string): Promise<PushRegistrationResult> {
  // ── Version confirmation ─────────────────────────────────────────────────
  // If you see a DIFFERENT build tag in your logs, the old APK is still
  // running. Install the freshly generated APK before testing further.
  console.log(`[Push][${BUILD_TAG}] registerPushToken called for user ${userId.slice(0, 8)}`);

  try {
    if (Platform.OS === 'web') {
      console.log('[Push] Platform=web — skipping registration');
      return { status: 'web' };
    }

    // Ensure Android notification channel exists
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('vybzhub', {
        name: 'VybzHub',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FFD700',
      });
    }

    // Check / request permission
    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      console.log('[Push] Permission denied by user');
      return { status: 'denied' };
    }

    const { token, tokenType } = await fetchDeviceToken();

    // ── Final confirmation before upsert ──────────────────────────────────
    // These three lines are the ground truth for what enters the database.
    console.log('[Push] PRE-UPSERT — token_type:', tokenType);
    console.log('[Push] PRE-UPSERT — token prefix:', token.slice(0, 40));
    console.log('[Push] PRE-UPSERT — starts with ExponentPushToken:', token.startsWith('ExponentPushToken'));

    // Upsert — unique(user_id, token) absorbs duplicate registrations
    const upsertPayload = {
      user_id: userId,
      token,
      token_type: tokenType,
      platform: Platform.OS,
      device_info: `${Platform.OS}/${Platform.Version}`,
    };
    console.log('[Push] Upserting with token_type=' + upsertPayload.token_type + ' platform=' + upsertPayload.platform);

    const { error } = await supabase.from('push_tokens').upsert(
      upsertPayload,
      { onConflict: 'user_id,token' }
    );
    if (error) {
      console.log('[Push] DB upsert failed:', error.message);
      return { status: 'failed', error: `DB: ${error.message}` };
    }
    console.log('[Push] SUCCESS — token_type=' + tokenType + ' registered for user ' + userId.slice(0, 8));
    return { status: 'registered', token, tokenType };
  } catch (err) {
    const msg = String(err).slice(0, 200);
    // Never block app flow — simulators / web throw here normally
    console.log('[Push] Registration failed:', msg);
    return { status: 'failed', error: msg };
  }
}

/**
 * Remove this device's push token from Supabase on logout.
 * MUST complete BEFORE supabase.auth.signOut() — the RLS policy
 * (user_id = auth.uid()) rejects the delete once the session is cleared.
 */
export async function removePushToken(userId: string): Promise<void> {
  try {
    if (Platform.OS === 'web') return;
    const { token } = await fetchDeviceToken();
    await supabase
      .from('push_tokens')
      .delete()
      .eq('user_id', userId)
      .eq('token', token);
    console.log('[Push] Token removed for user', userId.slice(0, 8));
  } catch (_) {
    // Silent — don't block logout
  }
}
