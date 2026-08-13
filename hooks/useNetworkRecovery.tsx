/**
 * useNetworkRecovery
 *
 * Monitors device network connectivity using @react-native-community/netinfo.
 * When the device transitions from offline → online, it:
 *   1. Re-validates the Supabase auth session (catches expired tokens during offline period).
 *   2. Restarts Supabase auto-refresh (stopped on background/offline).
 *   3. Calls an optional onReconnect callback (used by NotificationsContext to
 *      re-establish realtime channels and refresh notification state).
 *
 * IMPORTANT:
 *   - Never logs users out on network loss — only on definitive auth failures.
 *   - Uses a debounce ref to prevent multiple rapid fires on flaky connections.
 *   - Gracefully no-ops on web (NetInfo is not fully supported in web preview).
 */

import { useEffect, useRef } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { Platform } from 'react-native';
import { supabase } from '../lib/supabase';

interface UseNetworkRecoveryOptions {
  /**
   * Called when the device reconnects to the internet.
   * Use this to re-subscribe to realtime channels, refresh stale data, etc.
   * Do NOT perform auth actions here — auth recovery is handled internally.
   */
  onReconnect?: () => void;
  /**
   * Minimum milliseconds between consecutive reconnect handlers.
   * Prevents hammering Supabase on flaky/oscillating connections.
   * Default: 5000ms
   */
  debounceMs?: number;
}

export function useNetworkRecovery({
  onReconnect,
  debounceMs = 5000,
}: UseNetworkRecoveryOptions = {}) {
  // Track whether we were recently offline
  const wasOfflineRef = useRef(false);
  // Track last reconnect time to debounce
  const lastReconnectRef = useRef(0);
  // Track initial mount to avoid triggering on the first connectivity check
  const initializedRef = useRef(false);

  useEffect(() => {
    if (Platform.OS === 'web') {
      // NetInfo on web has limited support — skip silently.
      return;
    }

    const unsubscribe = NetInfo.addEventListener((state) => {
      // Consider connected only when both isConnected and isInternetReachable are true.
      // isInternetReachable can be null during initial check — treat null as unknown (skip).
      const isConnected =
        state.isConnected === true &&
        (state.isInternetReachable === true || state.isInternetReachable === null);

      if (!initializedRef.current) {
        // Record initial state without triggering reconnect logic
        initializedRef.current = true;
        wasOfflineRef.current = !isConnected && state.isInternetReachable !== null;
        return;
      }

      if (!isConnected) {
        // Device went offline — mark flag for detection on reconnect
        wasOfflineRef.current = true;
        return;
      }

      // Device is now connected
      if (wasOfflineRef.current) {
        wasOfflineRef.current = false;

        // Debounce: don't fire more than once per debounceMs window
        const now = Date.now();
        if (now - lastReconnectRef.current < debounceMs) return;
        lastReconnectRef.current = now;

        console.log('[NetworkRecovery] Reconnected — recovering session and subscriptions');

        // 1. Verify/recover Supabase auth session
        supabase.auth.getSession().then(({ data: { session }, error }) => {
          if (error) {
            // Session fetch failed — could be transient; don't sign out automatically
            console.warn('[NetworkRecovery] Session recovery failed:', error.message);
            return;
          }
          if (session) {
            // Session is valid — restart auto-refresh (may have been paused on background)
            supabase.auth.startAutoRefresh();
            console.log('[NetworkRecovery] Session recovered, auto-refresh restarted');
          }
          // If session is null, user was already signed out — no action needed
        }).catch((err) => {
          console.warn('[NetworkRecovery] getSession error:', String(err));
        });

        // 2. Notify callers to re-establish realtime and refresh data
        try {
          onReconnect?.();
        } catch (err) {
          console.warn('[NetworkRecovery] onReconnect callback error:', String(err));
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [onReconnect, debounceMs]);
}
