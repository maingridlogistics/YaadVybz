/**
 * Vybz Hub — Push Notification Helpers  [BUILD v4 — permission-safe]
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
 * Permission strategy (App Store / Play Store compliant):
 *   - checkAndSyncExistingPushPermission() — SILENT, called after sign-in.
 *     Uses getPermissionsAsync() only. Never shows OS prompt. If permission
 *     is already granted, syncs the token; otherwise returns 'not_granted'.
 *   - requestAndRegisterPushNotifications() — EXPLICIT, called only when the
 *     user taps "Enable Notifications" in settings, after seeing the in-app
 *     explanation. Calls requestPermissionsAsync(); may show OS prompt.
 *
 * All failures are silent — push never blocks any app flow.
 * Real-device only: tokens cannot be obtained in web preview or iOS Simulator.
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from './supabase';

// ─── Build identity ───────────────────────────────────────────────────────────
const BUILD_TAG = 'pushNotifications@v4-permission-safe';

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
 */
async function fetchDeviceToken(): Promise<{ token: string; tokenType: 'expo' | 'fcm' }> {
  console.log(`[Push][${BUILD_TAG}] fetchDeviceToken — Platform.OS=${Platform.OS}`);

  if (Platform.OS === 'android') {
    console.log('[Push] ANDROID PATH → calling getDevicePushTokenAsync() for raw FCM token');
    let td: Notifications.DevicePushToken;
    try {
      td = await Notifications.getDevicePushTokenAsync();
    } catch (err) {
      console.error('[Push] getDevicePushTokenAsync() THREW:', String(err));
      throw err;
    }
    const rawType = td.type;
    const rawData = td.data;
    const token = String(rawData);
    console.log('[Push] getDevicePushTokenAsync() returned — type=' + rawType + ' dataLength=' + token.length);
    console.log('[Push] FCM token prefix (first 40 chars):', token.slice(0, 40));
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
  return { token: td.data, tokenType: 'expo' };
}

// ─── Internal: upsert token into Supabase ─────────────────────────────────────
async function _syncToken(userId: string): Promise<PushRegistrationResult> {
  try {
    const { token, tokenType } = await fetchDeviceToken();

    console.log('[Push] PRE-UPSERT — token_type:', tokenType);
    console.log('[Push] PRE-UPSERT — token prefix:', token.slice(0, 40));
    console.log('[Push] PRE-UPSERT — starts with ExponentPushToken:', token.startsWith('ExponentPushToken'));

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
      { onConflict: 'user_id,token' },
    );
    if (error) {
      console.log('[Push] DB upsert failed:', error.message);
      return { status: 'failed', error: `DB: ${error.message}` };
    }
    console.log('[Push] SUCCESS — token_type=' + tokenType + ' registered for user ' + userId.slice(0, 8));
    return { status: 'registered', token, tokenType };
  } catch (err) {
    const msg = String(err).slice(0, 200);
    console.log('[Push] _syncToken failed:', msg);
    return { status: 'failed', error: msg };
  }
}

// ─── Internal: ensure Android channel exists ──────────────────────────────────
async function _ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('vybzhub', {
    name: 'VybzHub',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#FFD700',
  });
}

// ─── Public result type ───────────────────────────────────────────────────────
export type PushRegistrationResult =
  | { status: 'registered'; token: string; tokenType: 'expo' | 'fcm' }
  | { status: 'failed'; error: string }
  | { status: 'denied' }
  | { status: 'web' }
  | { status: 'not_granted' };

// ─── SILENT — called after sign-in ───────────────────────────────────────────
/**
 * Checks the existing OS permission state WITHOUT prompting.
 * If permission is already granted, syncs the push token silently.
 * If permission is undetermined or denied, returns 'not_granted' — no OS
 * prompt is shown.
 *
 * This is the ONLY function AuthContext.fetchProfile() calls.
 * The OS notification prompt must never appear at sign-in or on launch.
 */
export async function checkAndSyncExistingPushPermission(userId: string): Promise<PushRegistrationResult> {
  if (Platform.OS === 'web') return { status: 'web' };
  console.log(`[Push][${BUILD_TAG}] checkAndSyncExistingPushPermission for user ${userId.slice(0, 8)}`);
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      console.log(`[Push] checkAndSync — permission is "${status}", skipping (no prompt)`);
      return { status: 'not_granted' };
    }
    await _ensureAndroidChannel();
    return await _syncToken(userId);
  } catch (err) {
    const msg = String(err).slice(0, 200);
    console.log('[Push] checkAndSync failed:', msg);
    return { status: 'failed', error: msg };
  }
}

// ─── EXPLICIT — called only on user action ────────────────────────────────────
/**
 * Called only after the user taps "Enable Notifications" in Notification
 * Settings, AND after the in-app explanation has been shown.
 *
 * Calls requestPermissionsAsync() — the OS prompt MAY appear if status is
 * 'undetermined'. If already granted, syncs silently. If denied, returns
 * 'denied' without prompting again.
 */
export async function requestAndRegisterPushNotifications(userId: string): Promise<PushRegistrationResult> {
  if (Platform.OS === 'web') return { status: 'web' };
  console.log(`[Push][${BUILD_TAG}] requestAndRegisterPushNotifications for user ${userId.slice(0, 8)}`);
  try {
    await _ensureAndroidChannel();

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
    return await _syncToken(userId);
  } catch (err) {
    const msg = String(err).slice(0, 200);
    console.log('[Push] requestAndRegister failed:', msg);
    return { status: 'failed', error: msg };
  }
}

// ─── Legacy alias — retained so AuthContext retryPushToken still compiles ─────
// retryPushToken in AuthContext calls registerPushToken; it is only invoked
// when the user manually taps Retry from the profile push status row, which
// is a user-initiated action and therefore acceptable.
export const registerPushToken = requestAndRegisterPushNotifications;

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
