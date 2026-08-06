/**
 * Vybz Hub — Push Notification Helpers  [BUILD v4 — split-permission]
 *
 * Functions are split by intent:
 *
 *   checkAndSyncExistingPushPermission(userId)
 *     → Calls getPermissionsAsync() ONLY.
 *     → Never calls requestPermissionsAsync().
 *     → Silently saves/refreshes the push token if permission is already granted.
 *     → Called by AuthContext after every sign-in to keep the token current.
 *
 *   requestAndRegisterPushNotifications(userId)
 *     → Calls requestPermissionsAsync().
 *     → Only called after the user taps "Enable Notifications" in the branded modal,
 *       or taps "Retry" in the Profile notification-settings row.
 *     → Handles denial without blocking any app flow.
 *
 * Platform notes:
 *   Android: raw FCM registration token (token_type='fcm'), direct FCM HTTP v1 sends.
 *   iOS:     Expo push token (token_type='expo'), routed via Expo → APNs.
 *
 * All failures are silent — push never blocks any app flow.
 * Real-device only: tokens cannot be obtained in web preview or iOS Simulator.
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from './supabase';

// ─── Build identity ───────────────────────────────────────────────────────────
const BUILD_TAG = 'pushNotifications@v4-split-permission';

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
    console.log('[Push] ANDROID PATH → getDevicePushTokenAsync()');
    let td: Notifications.DevicePushToken;
    try {
      td = await Notifications.getDevicePushTokenAsync();
    } catch (err) {
      console.error('[Push] getDevicePushTokenAsync() THREW:', String(err));
      throw err;
    }
    const token = String(td.data);
    console.log('[Push] FCM token prefix (first 40):', token.slice(0, 40));
    return { token, tokenType: 'fcm' };
  }

  // iOS
  console.log('[Push] iOS PATH → getExpoPushTokenAsync()');
  const projectId = getProjectId();
  if (!projectId) {
    console.warn('[Push] No Expo project ID — add extra.eas.projectId to app.json');
  }
  let td: Notifications.ExpoPushToken;
  try {
    td = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : {});
  } catch (err) {
    console.error('[Push] getExpoPushTokenAsync() THREW:', String(err));
    throw err;
  }
  console.log('[Push] Expo token prefix:', td.data?.slice(0, 40));
  return { token: td.data, tokenType: 'expo' };
}

/**
 * Internal: upsert the current device's push token into Supabase.
 * Called only after we know permission is granted.
 */
async function _upsertToken(userId: string): Promise<PushRegistrationResult> {
  console.log(`[Push][${BUILD_TAG}] _upsertToken for user ${userId.slice(0, 8)}`);
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('vybzhub', {
        name: 'VybzHub',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FFD700',
      });
    }

    const { token, tokenType } = await fetchDeviceToken();

    console.log('[Push] PRE-UPSERT — token_type:', tokenType);
    console.log('[Push] PRE-UPSERT — token prefix:', token.slice(0, 40));

    const { error } = await supabase.from('push_tokens').upsert(
      {
        user_id: userId,
        token,
        token_type: tokenType,
        platform: Platform.OS,
        device_info: `${Platform.OS}/${Platform.Version}`,
      },
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
    console.log('[Push] _upsertToken failed:', msg);
    return { status: 'failed', error: msg };
  }
}

export type PushRegistrationResult =
  | { status: 'registered'; token: string; tokenType: 'expo' | 'fcm' }
  | { status: 'failed'; error: string }
  | { status: 'denied' }
  | { status: 'web' };

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

/**
 * Silent check: syncs the push token ONLY if permission is already granted.
 * NEVER calls requestPermissionsAsync().
 * Called by AuthContext after sign-in to keep tokens current.
 */
export async function checkAndSyncExistingPushPermission(
  userId: string,
): Promise<PushRegistrationResult> {
  console.log(`[Push][${BUILD_TAG}] checkAndSyncExistingPushPermission for user ${userId.slice(0, 8)}`);

  try {
    if (Platform.OS === 'web') {
      return { status: 'web' };
    }

    const { status } = await Notifications.getPermissionsAsync();
    console.log('[Push] Existing permission status:', status);

    if (status !== 'granted') {
      // Permission not yet granted — do NOT request it here.
      // The branded explanation modal will trigger requestAndRegisterPushNotifications.
      console.log('[Push] Permission not granted — skipping silent sync');
      return { status: 'denied' };
    }

    return await _upsertToken(userId);
  } catch (err) {
    const msg = String(err).slice(0, 200);
    console.log('[Push] checkAndSyncExistingPushPermission failed:', msg);
    return { status: 'failed', error: msg };
  }
}

/**
 * Request push permission and register this device's token.
 * Only call this after the user explicitly taps "Enable Notifications"
 * or "Retry" in the notification settings row.
 */
export async function requestAndRegisterPushNotifications(
  userId: string,
): Promise<PushRegistrationResult> {
  console.log(`[Push][${BUILD_TAG}] requestAndRegisterPushNotifications for user ${userId.slice(0, 8)}`);

  try {
    if (Platform.OS === 'web') {
      return { status: 'web' };
    }

    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;

    if (existing !== 'granted') {
      console.log('[Push] Requesting permission from user...');
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('[Push] User denied permission');
      return { status: 'denied' };
    }

    return await _upsertToken(userId);
  } catch (err) {
    const msg = String(err).slice(0, 200);
    console.log('[Push] requestAndRegisterPushNotifications failed:', msg);
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

/**
 * @deprecated Use requestAndRegisterPushNotifications instead.
 * Kept as an alias to avoid breaking any external callers during migration.
 */
export const registerPushToken = requestAndRegisterPushNotifications;
