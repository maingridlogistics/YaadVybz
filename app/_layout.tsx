import React, { useEffect, useRef } from 'react';
import { Stack, useRouter } from 'expo-router';
import { Platform, Alert, Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { AuthProvider } from '../contexts/AuthContext';
import { EventsProvider } from '../contexts/EventsContext';
import { NotificationsProvider } from '../contexts/NotificationsContext';
import { LanguageProvider } from '../contexts/LanguageContext';
import { CategoriesProvider } from '../contexts/CategoriesContext';
import { useAuth } from '../hooks/useAuth';
import { IAPProvider } from '../contexts/IAPContext';
import { BusinessProvider } from '../contexts/BusinessContext';
import { Colors, Typography, Spacing, Radius } from '../constants/theme';
import { adminNav } from '../lib/adminNav';

// Show OS banner even when the app is foregrounded so that background and
// foreground delivery can be confirmed visually during testing.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// ── Deletion approval listener ─────────────────────────────────────────────────
// Placed inside AuthProvider so it can consume useAuth().
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

// ── Notification Permission Modal ──────────────────────────────────────────────
// Shown once after the user's first successful sign-in.
// Explains why Vybz Hub needs notifications before triggering the native prompt.
//
// Spec behavior:
//  - "Enable Notifications" → calls requestPermissionsAsync() via enableNotifications()
//  - "Not Now"              → dismisses without showing the native prompt
//  - Never shown on cold launch, only after SIGNED_IN
//  - Shown at most once per account (tracked in AsyncStorage)
function NotificationPermissionModal() {
  const { showNotificationModal, dismissNotificationModal, enableNotifications } = useAuth();

  return (
    <Modal
      visible={showNotificationModal}
      transparent
      animationType="slide"
      onRequestClose={dismissNotificationModal}
    >
      <View style={notifStyles.overlay}>
        <Pressable style={notifStyles.backdrop} onPress={dismissNotificationModal} />
        <View style={notifStyles.sheet}>
          {/* Handle */}
          <View style={notifStyles.handle} />

          {/* Icon */}
          <View style={notifStyles.iconWrap}>
            <LinearGradient
              colors={[Colors.gold, Colors.goldDim]}
              style={notifStyles.iconGradient}
            >
              <MaterialIcons name="notifications-active" size={36} color={Colors.textOnGold} />
            </LinearGradient>
          </View>

          {/* Brand */}
          <View style={notifStyles.brandRow}>
            <View style={notifStyles.brandDot} />
            <Text style={notifStyles.brandText}>VYBZ HUB</Text>
            <View style={notifStyles.brandDot} />
          </View>

          {/* Title */}
          <Text style={notifStyles.title}>Stay Connected</Text>

          {/* Body */}
          <Text style={notifStyles.body}>
            Enable notifications to receive event reminders, event updates, cancellations, important announcements, and alerts from promoters you follow.
          </Text>

          {/* Feature list */}
          {[
            { icon: 'alarm', text: 'Event reminders 2 hours before kick-off' },
            { icon: 'campaign', text: 'Alerts from promoters you follow' },
            { icon: 'edit-notifications', text: 'Cancellations and event changes' },
          ].map(({ icon, text }) => (
            <View key={text} style={notifStyles.featureRow}>
              <View style={notifStyles.featureIconWrap}>
                <MaterialIcons name={icon as any} size={14} color={Colors.gold} />
              </View>
              <Text style={notifStyles.featureText}>{text}</Text>
            </View>
          ))}

          {/* Enable button */}
          <Pressable
            onPress={enableNotifications}
            style={({ pressed }) => [notifStyles.enableBtn, pressed && { opacity: 0.88 }]}
          >
            <LinearGradient
              colors={[Colors.gold, Colors.goldDim]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={notifStyles.enableBtnInner}
            >
              <MaterialIcons name="notifications" size={18} color={Colors.textOnGold} />
              <Text style={notifStyles.enableBtnText}>Enable Notifications</Text>
            </LinearGradient>
          </Pressable>

          {/* Not Now */}
          <Pressable
            onPress={dismissNotificationModal}
            style={({ pressed }) => [notifStyles.notNowBtn, pressed && { opacity: 0.7 }]}
            hitSlop={8}
          >
            <Text style={notifStyles.notNowText}>Not Now</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const notifStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xxl,
    borderTopWidth: 1,
    borderColor: Colors.surfaceBorder,
    alignItems: 'center',
    gap: Spacing.md,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.surfaceBorder,
    marginBottom: Spacing.xs,
  },
  iconWrap: {
    borderRadius: 40,
    overflow: 'hidden',
    ...{
      shadowColor: Colors.gold,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.4,
      shadowRadius: 12,
      elevation: 8,
    },
  },
  iconGradient: {
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  brandDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.gold,
  },
  brandText: {
    fontSize: 11,
    fontWeight: Typography.black,
    color: Colors.gold,
    letterSpacing: 3,
  },
  title: {
    fontSize: 26,
    fontWeight: Typography.black,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  body: {
    fontSize: Typography.base,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    alignSelf: 'stretch',
    paddingVertical: Spacing.xs,
  },
  featureIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Colors.goldSurface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: `${Colors.gold}33`,
    flexShrink: 0,
  },
  featureText: {
    flex: 1,
    fontSize: Typography.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  enableBtn: {
    alignSelf: 'stretch',
    borderRadius: Radius.lg,
    overflow: 'hidden',
    marginTop: Spacing.xs,
  },
  enableBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.base,
  },
  enableBtnText: {
    fontSize: Typography.md,
    fontWeight: Typography.bold,
    color: Colors.textOnGold,
  },
  notNowBtn: {
    paddingVertical: Spacing.sm,
  },
  notNowText: {
    fontSize: Typography.base,
    color: Colors.textMuted,
    textDecorationLine: 'underline',
  },
});

// ─── Root Layout ───────────────────────────────────────────────────────────────
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

    // Deep-link to the relevant event when user taps a push notification.
    // Deletion-related notification types route admin to the Deletions tab.
    const handleTap = (response: Notifications.NotificationResponse) => {
      const data = response.notification.request.content.data ?? {};
      const notifType = data.type as string | undefined;
      const eventId   = data.eventId as string | undefined;

      // Admin: new deletion request or approval — route to Deletions tab.
      if (
        notifType === 'account_deletion_request' ||
        notifType === 'account_deletion_approved'
      ) {
        adminNav.setTab('deletions');
        router.push('/(tabs)/profile' as any);
        return;
      }

      // User: deletion request was rejected — route to their own Profile tab
      // (not the admin deletions tab, which is irrelevant to regular users).
      if (notifType === 'account_deletion_rejected') {
        router.push('/(tabs)/profile' as any);
        return;
      }

      // Rejected event: route to edit screen so promoter can make changes.
      // Falls back to My Events if no eventId is present.
      if (notifType === 'event_rejected') {
        if (eventId) router.push(`/edit-event/${eventId}` as any);
        else router.push('/my-events' as any);
        return;
      }

      // Cancelled event: the event has been deleted — routing to the event
      // detail screen would land on "not found". Route to Home tab instead.
      if (notifType === 'event_cancelled') {
        router.replace('/(tabs)/' as any);
        return;
      }

      // Boost expiring — deep-link to boost purchase screen for that event.
      if (notifType === 'boost_expiring') {
        if (eventId) router.push(`/monetization/boost/${eventId}` as any);
        else router.push('/(tabs)/profile' as any);
        return;
      }

      // Subscription / payment alerts — route to plans page.
      if (notifType === 'payment_failed' || notifType === 'subscription_cancellation_scheduled') {
        router.push('/monetization/upgrade' as any);
        return;
      }

      // New follower — route promoter to their own Profile tab.
      if (notifType === 'new_follower') {
        router.push('/(tabs)/profile' as any);
        return;
      }

      if (eventId) router.push(`/event/${eventId}` as any);
    };

    const sub = Notifications.addNotificationResponseReceivedListener(handleTap);
    Notifications.getLastNotificationResponseAsync().then((r) => { if (r) handleTap(r); });

    return () => sub.remove();
  }, []);

  return (
    <CategoriesProvider>
    <LanguageProvider>
    <AuthProvider>
      <IAPProvider>
      <EventsProvider>
      <BusinessProvider>
        <NotificationsProvider>
          <AuthDeletionListener />
          <NotificationPermissionModal />
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
              name="business/[id]"
              options={{ headerShown: false, animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="create-business"
              options={{ headerShown: false, animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="business-dashboard"
              options={{ headerShown: false, animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="bookmarks"
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
      </BusinessProvider>
      </EventsProvider>
      </IAPProvider>
    </AuthProvider>
    </LanguageProvider>
    </CategoriesProvider>
  );
}
