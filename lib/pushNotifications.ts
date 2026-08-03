/**
 * Vybz Hub — Push Notification Helpers
 *
 * Handles Expo push token registration on login and removal on logout.
 * All failures are silent — push never blocks any app flow.
 *
 * Real-device only: push tokens cannot be obtained in web preview or iOS Simulator.
 * Silently returns on web or if permission is denied.
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

/** Get the Expo push token for this device. */
async function fetchExpoPushToken(): Promise<string> {
  const projectId = getProjectId();
  if (!projectId) {
    console.warn('[Push] No Expo project ID found — add extra.eas.projectId to app.json');
  }
  console.log('[Push] Using projectId:', projectId ?? 'NONE (will fail on production)');
  const td = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : {});
  console.log('[Push] Got Expo push token:', td.data?.slice(0, 40));
  return td.data;
}

/**
 * Request push permission and register this device's Expo push token in Supabase.
 * Idempotent — the unique (user_id, token) constraint prevents duplicates.
 * Silently skips on web, simulator, or if the user denies permission.
 */
export type PushRegistrationResult =
  | { status: 'registered'; token: string }
  | { status: 'failed'; error: string }
  | { status: 'denied' }
  | { status: 'web' };

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

    const token = await fetchExpoPushToken();

    // Upsert — unique(user_id, token) absorbs duplicate registrations
    const { error } = await supabase.from('push_tokens').upsert(
      {
        user_id: userId,
        token,
        device_info: `${Platform.OS}/${Platform.Version}`,
      },
      { onConflict: 'user_id,token' }
    );
    if (error) {
      console.log('[Push] DB upsert failed:', error.message);
      return { status: 'failed', error: `DB: ${error.message}` };
    }
    console.log('[Push] Token registered for user', userId.slice(0, 8));
    return { status: 'registered', token };
  } catch (err) {
    const msg = String(err).slice(0, 200);
    // Never block app flow — simulators / web throw here normally
    console.log('[Push] Registration failed:', msg);
    return { status: 'failed', error: msg };
  }
}

/**
 * Remove this device's push token from Supabase on logout.
 * Silently skips on failure — stale tokens are cleaned up server-side
 * when Expo reports DeviceNotRegistered.
 */
export async function removePushToken(userId: string): Promise<void> {
  try {
    if (Platform.OS === 'web') return;
    const token = await fetchExpoPushToken();
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
