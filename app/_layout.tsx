import React, { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

// Show OS banner even when the app is foregrounded so that background and
// foreground delivery can be confirmed visually during testing.
// The in-app notification feed also receives the same payload via
// addNotificationReceivedListener in NotificationsContext.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '../contexts/AuthContext';
import { EventsProvider } from '../contexts/EventsContext';
import { NotificationsProvider } from '../contexts/NotificationsContext';
import { LanguageProvider } from '../contexts/LanguageContext';
import { CategoriesProvider } from '../contexts/CategoriesContext';

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
