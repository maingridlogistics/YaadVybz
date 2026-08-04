/**
 * Vybz Hub — Push Notification Helpers
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
  if (Platform.OS === 'android') {
    // Raw FCM token — bypasses Expo's push routing.
    // The Edge Function sends these directly via FCM HTTP v1 API.
    const td = await Notifications.getDevicePushTokenAsync();
    const token = String(td.data);
    console.log('[Push] FCM device token (Android):', token.slice(0, 40));
    return { token, tokenType: 'fcm' };
  }

  // iOS — Expo-routed via APNs
  const projectId = getProjectId();
  if (!projectId) {
    console.warn('[Push] No Expo project ID found — add extra.eas.projectId to app.json');
  }
  console.log('[Push] Using projectId:', projectId ?? 'NONE (will fail on production)');
  const td = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : {});
  console.log('[Push] Expo push token (iOS):', td.data?.slice(0, 40));
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
  try {
    if (Platform.OS === 'web') return { status: 'web' };

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

    // Upsert — unique(user_id, token) absorbs duplicate registrations
    const { error } = await supabase.from('push_tokens').upsert(
      {
        user_id: userId,
        token,
        token_type: tokenType,
        device_info: `${Platform.OS}/${Platform.Version}`,
      },
      { onConflict: 'user_id,token' }
    );
    if (error) {
      console.log('[Push] DB upsert failed:', error.message);
      return { status: 'failed', error: `DB: ${error.message}` };
    }
    console.log('[Push] Token registered (type=%s) for user %s', tokenType, userId.slice(0, 8));
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
