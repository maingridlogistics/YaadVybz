import React, { useEffect, useRef } from 'react';
import { Stack, useRouter } from 'expo-router';
import { Platform, Alert } from 'react-native';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '../contexts/AuthContext';
import { EventsProvider } from '../contexts/EventsContext';
import { NotificationsProvider } from '../contexts/NotificationsContext';
import { LanguageProvider } from '../contexts/LanguageContext';
import { CategoriesProvider } from '../contexts/CategoriesContext';
import { useAuth } from '../hooks/useAuth';

// Show OS banner even when the app is foregrounded so that background and
// foreground delivery can be confirmed visually during testing.
// The in-app notification feed also receives the same payload via
// addNotificationReceivedListener in NotificationsContext.
//
// Field notes:
//   shouldShowBanner / shouldShowList — introduced in expo-notifications ~0.28 (SDK 51+)
//   shouldShowAlert                   — legacy field, still honoured on older SDK versions
// Both sets are returned so the handler works across SDK versions without branching.
// The handler must resolve within 3 seconds or the OS drops the notification.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,   // SDK 51+ — controls the heads-up / lock-screen banner
    shouldShowList: true,     // SDK 51+ — controls appearance in the notification shade
    shouldShowAlert: true,    // legacy fallback for SDK <51
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// ── Deletion approval listener ────────────────────────────────────────────────
// Placed inside AuthProvider so it can consume useAuth().
// When an admin approves an account deletion request, Supabase Realtime fires
// in AuthContext which flips accountDeleted → true and signs the user out.
// This component detects that flag app-wide (not just on the profile screen),
// shows a one-time informational alert, then redirects to onboarding.
function AuthDeletionListener() {
  const { accountDeleted } = useAuth();
  const router = useRouter();
  const hasAlerted = useRef(false);

  useEffect(() => {
    if (!accountDeleted || hasAlerted.current) return;
    hasAlerted.current = true;
    Alert.alert(
      'Account Deleted',
      'Your account deletion request has been approved and your account has been permanently removed.',
      [{ text: 'OK', onPress: () => router.replace('/onboarding' as any) }],
      { cancelable: false },
    );
  }, [accountDeleted]);

  return null;
}

export default function RootLayout() {
  const router = useRouter();

  useEffect(() => {
    // Android requires an explicit notification channel
    if (Platform.OS === 'android') {
      Notifications.setNotificationChannelAsync('vybzhub', {
        name: 'VybzHub',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FFD700',
      });
    }

    // Deep-link to the relevant event when user taps a push notification
    const handleTap = (response: Notifications.NotificationResponse) => {
      const eventId = response.notification.request.content.data?.eventId as string | undefined;
      if (eventId) router.push(`/event/${eventId}` as any);
    };

    // Background taps (app open in background)
    const sub = Notifications.addNotificationResponseReceivedListener(handleTap);

    // Cold-start tap (app was closed when notification was tapped)
    Notifications.getLastNotificationResponseAsync().then((r) => { if (r) handleTap(r); });

    return () => sub.remove();
  }, []);

  return (
    <CategoriesProvider>
    <LanguageProvider>
    <AuthProvider>
      <EventsProvider>
        <NotificationsProvider>
          <AuthDeletionListener />
          <StatusBar style="light" />
          <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="onboarding" />
            <Stack.Screen name="auth" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen
              name="event/[id]"
              options={{ headerShown: false, animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="promoter/[id]"
              options={{ headerShown: false, animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="notifications"
              options={{ headerShown: false, animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="admin"
              options={{ headerShown: false, animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="my-events"
              options={{ headerShown: false, animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="edit-event/[id]"
              options={{ headerShown: false, animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="monetization/upgrade"
              options={{ headerShown: false, animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="squad/[eventId]"
              options={{ headerShown: false, animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="monetization/boost/[id]"
              options={{ headerShown: false, animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="monetization/boost-performance/[id]"
              options={{ headerShown: false, animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="notification-settings"
              options={{ headerShown: false, animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="admin/ads/[placementId]"
              options={{ headerShown: false, animation: 'slide_from_right' }}
            />
          </Stack>
        </NotificationsProvider>
      </EventsProvider>
    </AuthProvider>
    </LanguageProvider>
    </CategoriesProvider>
  );
}
