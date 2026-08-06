import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Switch,
  Modal,
  Linking,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as ExpoNotifications from 'expo-notifications';
import { useAuth } from '../hooks/useAuth';
import { Colors, Typography, Spacing, Radius } from '../constants/theme';
import { requestAndRegisterPushNotifications } from '../lib/pushNotifications';

// ─── Types ────────────────────────────────────────────────────────────────────
interface PrefItem {
  key: string;
  label: string;
  description: string;
  icon: string;
  iconColor: string;
  iconBg: string;
}

interface EmailPrefs {
  emailNotifNewParish: boolean;
  emailNotifNewPromoter: boolean;
  emailNotifEventChange: boolean;
  emailNotifEventReminder: boolean;
}

interface PushPrefs {
  pushNotifNewParish: boolean;
  pushNotifNewPromoter: boolean;
  pushNotifEventChange: boolean;
}

// ─── Email notification groups ─────────────────────────────────────────────────
const EMAIL_GROUPS: { title: string; subtitle: string; prefs: PrefItem[] }[] = [
  {
    title: 'Discovery',
    subtitle: 'Be first to know about new events',
    prefs: [
      {
        key: 'emailNotifNewParish',
        label: 'New Events in My Parishes',
        description: 'Get notified when events are posted in your home or preferred parishes.',
        icon: 'place',
        iconColor: Colors.gold,
        iconBg: `${Colors.gold}18`,
      },
      {
        key: 'emailNotifNewPromoter',
        label: 'Events from Followed Promoters',
        description: 'Receive updates whenever a promoter you follow posts a new event.',
        icon: 'campaign',
        iconColor: '#42A5F5',
        iconBg: '#42A5F518',
      },
    ],
  },
  {
    title: 'Updates',
    subtitle: 'Stay informed about events you care about',
    prefs: [
      {
        key: 'emailNotifEventChange',
        label: 'Event Changes & Cancellations',
        description: 'Receive alerts if an event you marked as going or interested is updated or cancelled.',
        icon: 'edit-notifications',
        iconColor: '#FF7043',
        iconBg: '#FF704318',
      },
      {
        key: 'emailNotifEventReminder',
        label: 'Event Day Reminders',
        description: "Get a reminder on the day of events you're attending so you never miss the vybz.",
        icon: 'alarm',
        iconColor: Colors.greenLight,
        iconBg: `${Colors.green}18`,
      },
    ],
  },
];

// ─── Push notification group ──────────────────────────────────────────────────
const PUSH_GROUP: { title: string; subtitle: string; prefs: PrefItem[] } = {
  title: 'Push Notifications',
  subtitle: 'Instant device alerts even when the app is closed',
  prefs: [
    {
      key: 'pushNotifNewParish',
      label: 'New Events in My Parishes',
      description: 'Push alert when events are posted in your home or preferred parishes.',
      icon: 'place',
      iconColor: Colors.gold,
      iconBg: `${Colors.gold}18`,
    },
    {
      key: 'pushNotifNewPromoter',
      label: 'Events from Followed Promoters',
      description: 'Push alert when a promoter you follow posts a new event.',
      icon: 'campaign',
      iconColor: '#42A5F5',
      iconBg: '#42A5F518',
    },
    {
      key: 'pushNotifEventChange',
      label: 'Event Changes & Cancellations',
      description: 'Push alert if an event you marked Going or Interested is updated or cancelled.',
      icon: 'edit-notifications',
      iconColor: '#FF7043',
      iconBg: '#FF704318',
    },
  ],
};

// ─── Toggle Row ───────────────────────────────────────────────────────────────
function ToggleRow({
  pref,
  value,
  onToggle,
  saving,
  isLast,
}: {
  pref: PrefItem;
  value: boolean;
  onToggle: () => void;
  saving: boolean;
  isLast: boolean;
}) {
  return (
    <View style={[rowStyles.container, !isLast && rowStyles.divider]}>
      <View style={[rowStyles.iconBg, { backgroundColor: pref.iconBg }]}>
        <MaterialIcons name={pref.icon as any} size={18} color={pref.iconColor} />
      </View>
      <View style={rowStyles.textWrap}>
        <Text style={rowStyles.label}>{pref.label}</Text>
        <Text style={rowStyles.desc}>{pref.description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        disabled={saving}
        trackColor={{ false: Colors.surfaceBorder, true: Colors.green }}
        thumbColor="#fff"
        ios_backgroundColor={Colors.surfaceBorder}
        style={rowStyles.switch}
      />
    </View>
  );
}

const rowStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: Spacing.base,
    paddingHorizontal: Spacing.base,
    gap: Spacing.md,
  },
  divider: { borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder },
  iconBg: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 2,
  },
  textWrap: { flex: 1, gap: 3 },
  label: {
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
    color: Colors.textPrimary,
    lineHeight: 20,
  },
  desc: { fontSize: Typography.sm, color: Colors.textMuted, lineHeight: 18 },
  switch: { flexShrink: 0, marginTop: 2 },
});

// ─── Section Card ─────────────────────────────────────────────────────────────
function SectionCard({
  group,
  getValue,
  onToggle,
  savingKey,
}: {
  group: { title: string; subtitle: string; prefs: PrefItem[] };
  getValue: (key: string) => boolean;
  onToggle: (key: string) => void;
  savingKey: string | null;
}) {
  return (
    <View style={cardStyles.wrap}>
      <View style={cardStyles.header}>
        <Text style={cardStyles.title}>{group.title}</Text>
        <Text style={cardStyles.subtitle}>{group.subtitle}</Text>
      </View>
      <View style={cardStyles.card}>
        {group.prefs.map((pref, idx) => (
          <ToggleRow
            key={pref.key}
            pref={pref}
            value={getValue(pref.key)}
            onToggle={() => onToggle(pref.key)}
            saving={savingKey === pref.key}
            isLast={idx === group.prefs.length - 1}
          />
        ))}
      </View>
    </View>
  );
}

const cardStyles = StyleSheet.create({
  wrap: { marginHorizontal: Spacing.base, marginBottom: Spacing.lg },
  header: { marginBottom: Spacing.sm, paddingLeft: Spacing.xs },
  title: {
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    color: Colors.gold,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  subtitle: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2 },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    overflow: 'hidden',
  },
});

// ─── Save Toast ───────────────────────────────────────────────────────────────
function SavedToast({ visible }: { visible: boolean }) {
  return visible ? (
    <View style={toastStyles.container} pointerEvents="none">
      <View style={toastStyles.toast}>
        <MaterialIcons name="check-circle" size={16} color={Colors.greenLight} />
        <Text style={toastStyles.text}>Preference saved</Text>
      </View>
    </View>
  ) : null;
}

const toastStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 48,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 100,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm + 2,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: `${Colors.green}55`,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  text: {
    fontSize: Typography.sm,
    color: Colors.greenLight,
    fontWeight: Typography.semibold,
  },
});

// ─── In-App Notification Explanation Dialog ───────────────────────────────────
// Shown BEFORE the OS prompt fires. User must tap "Enable" to proceed.
// Tapping "Not Now" closes the dialog without ever calling requestPermissionsAsync().
function NotificationExplainDialog({
  visible,
  onEnable,
  onDismiss,
}: {
  visible: boolean;
  onEnable: () => void;
  onDismiss: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <Pressable style={dialogStyles.overlay} onPress={onDismiss}>
        <Pressable style={dialogStyles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={dialogStyles.iconWrap}>
            <MaterialIcons name="notifications-active" size={32} color={Colors.gold} />
          </View>
          <Text style={dialogStyles.title}>Enable Notifications</Text>
          <Text style={dialogStyles.body}>
            Vybz Hub sends notifications about event updates, cancellations, reminders, and alerts from promoters you follow.
          </Text>
          <View style={dialogStyles.bulletList}>
            {[
              { icon: 'place', text: 'New events in your parishes' },
              { icon: 'campaign', text: 'Updates from followed promoters' },
              { icon: 'edit-notifications', text: 'Event changes and cancellations' },
              { icon: 'alarm', text: 'Reminders before events start' },
            ].map(({ icon, text }) => (
              <View key={text} style={dialogStyles.bulletRow}>
                <MaterialIcons name={icon as any} size={15} color={Colors.gold} />
                <Text style={dialogStyles.bulletText}>{text}</Text>
              </View>
            ))}
          </View>
          <Pressable
            onPress={onEnable}
            style={({ pressed }) => [dialogStyles.enableBtn, pressed && { opacity: 0.88 }]}
          >
            <LinearGradient
              colors={[Colors.gold, Colors.goldDim]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={dialogStyles.enableBtnInner}
            >
              <MaterialIcons name="notifications" size={16} color={Colors.textOnGold} />
              <Text style={dialogStyles.enableBtnText}>Enable Notifications</Text>
            </LinearGradient>
          </Pressable>
          <Pressable onPress={onDismiss} style={dialogStyles.notNowBtn}>
            <Text style={dialogStyles.notNowText}>Not Now</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const dialogStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: `${Colors.gold}33`,
    width: '100%',
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.goldSurface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: `${Colors.gold}44`,
  },
  title: {
    fontSize: Typography.lg,
    fontWeight: Typography.black,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  body: {
    fontSize: Typography.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  bulletList: {
    alignSelf: 'stretch',
    gap: Spacing.sm,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.lg,
    padding: Spacing.base,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  bulletRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  bulletText: { fontSize: Typography.sm, color: Colors.textSecondary, flex: 1, lineHeight: 18 },
  enableBtn: { alignSelf: 'stretch', borderRadius: Radius.lg, overflow: 'hidden' },
  enableBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.base,
  },
  enableBtnText: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textOnGold },
  notNowBtn: { paddingVertical: Spacing.sm, paddingHorizontal: Spacing.xl },
  notNowText: { fontSize: Typography.sm, color: Colors.textMuted, textDecorationLine: 'underline' },
});

// ─── Open Settings Banner (permanently denied) ────────────────────────────────
function OpenSettingsBanner({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [bannerStyles.row, pressed && { opacity: 0.8 }]}
    >
      <MaterialIcons name="settings" size={16} color="#FF7043" />
      <Text style={bannerStyles.text}>
        Notifications are blocked. Tap to open Settings and allow them.
      </Text>
      <MaterialIcons name="open-in-new" size={14} color="#FF7043" />
    </Pressable>
  );
}

const bannerStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginHorizontal: Spacing.base,
    marginBottom: Spacing.md,
    padding: Spacing.base,
    backgroundColor: 'rgba(255,112,67,0.08)',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,112,67,0.3)',
  },
  text: { flex: 1, fontSize: Typography.sm, color: '#FF7043', lineHeight: 18 },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function NotificationSettingsScreen() {
  const router = useRouter();
  const { user, updateProfile, pushTokenStatus, setPushTokenStatus, setPushTokenError } = useAuth() as any;

  const [emailPrefs, setEmailPrefs] = useState<EmailPrefs>({
    emailNotifNewParish: (user as any)?.emailNotifNewParish ?? true,
    emailNotifNewPromoter: (user as any)?.emailNotifNewPromoter ?? true,
    emailNotifEventChange: (user as any)?.emailNotifEventChange ?? true,
    emailNotifEventReminder: (user as any)?.emailNotifEventReminder ?? true,
  });

  const [pushPrefs, setPushPrefs] = useState<PushPrefs>({
    pushNotifNewParish: (user as any)?.pushNotifNewParish ?? true,
    pushNotifNewPromoter: (user as any)?.pushNotifNewPromoter ?? true,
    pushNotifEventChange: (user as any)?.pushNotifEventChange ?? true,
  });

  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [showToast, setShowToast] = useState(false);
  const toastTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Push notification enablement state
  const [showExplainDialog, setShowExplainDialog] = useState(false);
  const [pushEnabling, setPushEnabling] = useState(false);
  const [permissionStatus, setPermissionStatus] = React.useState<'undetermined' | 'granted' | 'denied'>('undetermined');
  const [sessionDismissed, setSessionDismissed] = React.useState(false);

  // Check current OS permission on mount
  React.useEffect(() => {
    if (Platform.OS === 'web') return;
    ExpoNotifications.getPermissionsAsync().then(({ status }) => {
      setPermissionStatus(status as any);
    }).catch(() => {});
  }, []);

  const showSavedToast = () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setShowToast(true);
    toastTimerRef.current = setTimeout(() => setShowToast(false), 1800);
  };

  const handleEmailToggle = useCallback(
    async (key: string) => {
      const k = key as keyof EmailPrefs;
      const newValue = !emailPrefs[k];
      setEmailPrefs((prev) => ({ ...prev, [k]: newValue }));
      setSavingKey(key);
      try {
        await updateProfile({ [k]: newValue } as any);
        showSavedToast();
      } catch (_) {
        setEmailPrefs((prev) => ({ ...prev, [k]: !newValue }));
      } finally {
        setSavingKey(null);
      }
    },
    [emailPrefs, updateProfile]
  );

  const handlePushToggle = useCallback(
    async (key: string) => {
      const k = key as keyof PushPrefs;
      const newValue = !pushPrefs[k];
      setPushPrefs((prev) => ({ ...prev, [k]: newValue }));
      setSavingKey(key);
      try {
        await updateProfile({ [k]: newValue } as any);
        showSavedToast();
      } catch (_) {
        setPushPrefs((prev) => ({ ...prev, [k]: !newValue }));
      } finally {
        setSavingKey(null);
      }
    },
    [pushPrefs, updateProfile]
  );

  const emailEnabledCount = Object.values(emailPrefs).filter(Boolean).length;
  const pushEnabledCount = Object.values(pushPrefs).filter(Boolean).length;
  const totalEnabled = emailEnabledCount + pushEnabledCount;
  const totalCount = 7; // 4 email + 3 push

  const handleToggleAllEmail = async () => {
    const allOn = emailEnabledCount === 4;
    const newValue = !allOn;
    const updated: EmailPrefs = {
      emailNotifNewParish: newValue,
      emailNotifNewPromoter: newValue,
      emailNotifEventChange: newValue,
      emailNotifEventReminder: newValue,
    };
    setEmailPrefs(updated);
    setSavingKey('all');
    try {
      await updateProfile(updated as any);
      showSavedToast();
    } catch (_) {
      setEmailPrefs(emailPrefs);
    } finally {
      setSavingKey(null);
    }
  };

  // Called when user taps the "Enable Push Notifications" CTA
  const handleEnablePushTap = () => {
    if (permissionStatus === 'denied') {
      // Permission permanently denied — skip dialog, show Settings link instead
      return;
    }
    if (sessionDismissed) return;
    setShowExplainDialog(true);
  };

  // Called when user confirms in the dialog
  const handleDialogEnable = async () => {
    setShowExplainDialog(false);
    if (!user?.id) return;
    setPushEnabling(true);
    try {
      const result = await requestAndRegisterPushNotifications(user.id);
      const { status } = await ExpoNotifications.getPermissionsAsync();
      setPermissionStatus(status as any);
      if (result.status === 'registered') {
        if (setPushTokenStatus) setPushTokenStatus('registered');
        if (setPushTokenError) setPushTokenError(undefined);
        showSavedToast();
      } else if (result.status === 'denied') {
        if (setPushTokenStatus) setPushTokenStatus('denied');
      }
    } finally {
      setPushEnabling(false);
    }
  };

  // Called when user dismisses dialog without enabling
  const handleDialogDismiss = () => {
    setShowExplainDialog(false);
    setSessionDismissed(true);
  };

  const openAppSettings = () => {
    if (Platform.OS === 'ios') {
      Linking.openURL('app-settings:');
    } else {
      Linking.openSettings();
    }
  };

  const isPushGranted = pushTokenStatus === 'registered' || permissionStatus === 'granted';
  const isPushDenied = permissionStatus === 'denied';
  const showEnableCTA = !isPushGranted && !isPushDenied && !sessionDismissed && Platform.OS !== 'web';

  return (
    <View style={styles.root}>
      {/* In-App Explanation Dialog */}
      <NotificationExplainDialog
        visible={showExplainDialog}
        onEnable={handleDialogEnable}
        onDismiss={handleDialogDismiss}
      />

      <SafeAreaView edges={['top']} style={styles.safeTop}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
          >
            <MaterialIcons name="arrow-back" size={24} color={Colors.textPrimary} />
          </Pressable>
          <View style={styles.headerText}>
            <Text style={styles.headerTitle}>Notification Settings</Text>
            <Text style={styles.headerSub}>Email & push preferences</Text>
          </View>
          <Pressable
            onPress={handleToggleAllEmail}
            disabled={savingKey !== null}
            style={({ pressed }) => [styles.toggleAllBtn, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.toggleAllText}>
              {emailEnabledCount === 4 ? 'Mute Email' : 'Email All'}
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* Summary pill */}
        <View style={styles.summaryWrap}>
          <View style={styles.summaryPill}>
            <View style={[styles.summaryDot, { backgroundColor: totalEnabled > 0 ? Colors.greenLight : Colors.textMuted }]} />
            <Text style={styles.summaryText}>
              {totalEnabled === 0
                ? 'All notifications muted'
                : totalEnabled === totalCount
                ? 'All notifications enabled'
                : `${totalEnabled} of ${totalCount} notifications enabled`}
            </Text>
          </View>
        </View>

        {/* EMAIL section */}
        <View style={styles.channelHeader}>
          <MaterialIcons name="email" size={13} color={Colors.textMuted} />
          <Text style={styles.channelLabel}>EMAIL</Text>
        </View>

        {EMAIL_GROUPS.map((group) => (
          <SectionCard
            key={group.title}
            group={group}
            getValue={(key) => emailPrefs[key as keyof EmailPrefs]}
            onToggle={handleEmailToggle}
            savingKey={savingKey}
          />
        ))}

        {/* PUSH section */}
        <View style={styles.channelHeader}>
          <MaterialIcons name="notifications" size={13} color={Colors.textMuted} />
          <Text style={styles.channelLabel}>PUSH</Text>
        </View>

        {/* Permanently denied — show Settings link */}
        {isPushDenied && <OpenSettingsBanner onPress={openAppSettings} />}

        {/* Enable CTA — shown when permission is undetermined and user has not dismissed this session */}
        {showEnableCTA && (
          <Pressable
            onPress={handleEnablePushTap}
            disabled={pushEnabling}
            style={({ pressed }) => [styles.enablePushCta, pressed && { opacity: 0.85 }]}
          >
            <LinearGradient
              colors={[Colors.goldSurface, Colors.surface]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.enablePushCtaInner}
            >
              <MaterialIcons name={pushEnabling ? 'hourglass-top' : 'notifications-none'} size={20} color={Colors.gold} />
              <View style={{ flex: 1 }}>
                <Text style={styles.enablePushCtaTitle}>
                  {pushEnabling ? 'Enabling...' : 'Enable Push Notifications'}
                </Text>
                <Text style={styles.enablePushCtaSub}>
                  Tap to receive instant alerts for events you care about
                </Text>
              </View>
              <MaterialIcons name="arrow-forward-ios" size={14} color={Colors.gold} />
            </LinearGradient>
          </Pressable>
        )}

        <SectionCard
          group={PUSH_GROUP}
          getValue={(key) => pushPrefs[key as keyof PushPrefs]}
          onToggle={handlePushToggle}
          savingKey={savingKey}
        />

        {/* Push device note */}
        <View style={[styles.noteCard, styles.noteCardPush]}>
          <MaterialIcons name="phone-android" size={16} color={Colors.gold} />
          <Text style={[styles.noteText, { color: `${Colors.gold}CC` }]}>
            Push notifications require a physical device and OS permission. They cannot be tested in the web preview or iOS Simulator — use a real device or Android emulator with Google Play Services.
          </Text>
        </View>

        {/* General info */}
        <View style={styles.noteCard}>
          <MaterialIcons name="info-outline" size={16} color={Colors.textMuted} />
          <Text style={styles.noteText}>
            These preferences control email and push notifications independently. Changes apply instantly to future events.
          </Text>
        </View>

        {/* Email address */}
        {user?.email ? (
          <View style={styles.emailRow}>
            <MaterialIcons name="alternate-email" size={14} color={Colors.textMuted} />
            <Text style={styles.emailText}>Emails sent to</Text>
            <Text style={styles.emailValue} numberOfLines={1}>{user.email}</Text>
          </View>
        ) : null}

        <View style={{ height: Spacing.xxl * 2 }} />
      </ScrollView>

      <SavedToast visible={showToast} />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  safeTop: {
    backgroundColor: Colors.background,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  headerText: { flex: 1 },
  headerTitle: {
    fontSize: Typography.lg,
    fontWeight: Typography.bold,
    color: Colors.textPrimary,
  },
  headerSub: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 1 },
  toggleAllBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  toggleAllText: {
    fontSize: Typography.xs,
    fontWeight: Typography.semibold,
    color: Colors.textSecondary,
  },
  scroll: { paddingTop: Spacing.lg },
  summaryWrap: {
    alignItems: 'center',
    marginBottom: Spacing.lg,
    paddingHorizontal: Spacing.base,
  },
  summaryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  summaryDot: { width: 8, height: 8, borderRadius: 4 },
  summaryText: {
    fontSize: Typography.sm,
    color: Colors.textSecondary,
    fontWeight: Typography.medium,
  },
  channelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.base + Spacing.xs,
    marginBottom: Spacing.sm,
    marginTop: Spacing.xs,
  },
  channelLabel: {
    fontSize: 10,
    fontWeight: Typography.black,
    color: Colors.textMuted,
    letterSpacing: 1.4,
  },

  // Enable push CTA card
  enablePushCta: {
    marginHorizontal: Spacing.base,
    marginBottom: Spacing.md,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: `${Colors.gold}44`,
  },
  enablePushCtaInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.base,
  },
  enablePushCtaTitle: {
    fontSize: Typography.base,
    fontWeight: Typography.bold,
    color: Colors.gold,
  },
  enablePushCtaSub: {
    fontSize: Typography.xs,
    color: Colors.textMuted,
    marginTop: 2,
    lineHeight: 16,
  },

  noteCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    marginHorizontal: Spacing.base,
    marginBottom: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.base,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  noteCardPush: {
    backgroundColor: Colors.goldSurface,
    borderColor: `${Colors.gold}33`,
  },
  noteText: {
    flex: 1,
    fontSize: Typography.sm,
    color: Colors.textMuted,
    lineHeight: 18,
  },
  emailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.md,
  },
  emailText: { fontSize: Typography.xs, color: Colors.textMuted },
  emailValue: {
    fontSize: Typography.xs,
    color: Colors.textSecondary,
    fontWeight: Typography.medium,
    flexShrink: 1,
  },
});
