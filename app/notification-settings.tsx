import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Switch,
  AppState,
  Linking,
  Platform,
} from 'react-native';
import * as Notifications from 'expo-notifications';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../hooks/useAuth';
import { Colors, Typography, Spacing, Radius } from '../constants/theme';

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

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function NotificationSettingsScreen() {
  const router = useRouter();
  const { user, updateProfile, pushTokenStatus, pushTokenError, retryPushToken } = useAuth();

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

  // ── OS push permission tracking ─────────────────────────────────────────────
  const [osPermission, setOsPermission] = useState<'granted' | 'denied' | 'undetermined' | null>(null);
  const [retrying, setRetrying] = useState(false);
  // Stable ref so the AppState listener always calls the current retryPushToken
  const retryRef = useRef(retryPushToken);
  useEffect(() => { retryRef.current = retryPushToken; }, [retryPushToken]);

  const checkOsPermission = useCallback(async () => {
    if (Platform.OS === 'web') return;
    try {
      const { status } = await Notifications.getPermissionsAsync();
      setOsPermission(status as 'granted' | 'denied' | 'undetermined');
    } catch {}
  }, []);

  // Check on mount
  useEffect(() => { checkOsPermission(); }, [checkOsPermission]);

  // Re-check when user returns from OS Settings; auto-register if just granted
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = AppState.addEventListener('change', async (appState) => {
      if (appState !== 'active') return;
      try {
        const { status } = await Notifications.getPermissionsAsync();
        const perm = status as 'granted' | 'denied' | 'undetermined';
        setOsPermission(perm);
        // OS just granted — complete token registration silently
        if (perm === 'granted' && pushTokenStatus !== 'registered' && !retrying) {
          setRetrying(true);
          try { await retryRef.current(); } catch {}
          setRetrying(false);
        }
      } catch {}
    });
    return () => sub.remove();
  }, [pushTokenStatus, retrying]);

  const handleEnableNotifications = async () => {
    if (retrying) return;
    setRetrying(true);
    try { await retryRef.current(); } catch {}
    setRetrying(false);
  };

  // Derived push status (platform-aware)
  const isWeb = Platform.OS === 'web';
  const isDenied = !isWeb && (pushTokenStatus === 'denied' || osPermission === 'denied');
  const isRegistered = pushTokenStatus === 'registered';
  const isFailed = !isDenied && pushTokenStatus === 'failed';
  const isNotEnabled = !isWeb && !isRegistered && !isDenied && !isFailed;

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
      } catch {
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
      } catch {
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
    } catch {
      setEmailPrefs(emailPrefs);
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <View style={styles.root}>
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

        {/* EMAIL section label */}
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

        {/* PUSH section label */}
        <View style={styles.channelHeader}>
          <MaterialIcons name="notifications" size={13} color={Colors.textMuted} />
          <Text style={styles.channelLabel}>PUSH</Text>
        </View>

        {/* ── Push permission status + recovery card ─────────────────────── */}
        {!isWeb ? (
          <View style={[
            pushBanner.card,
            isRegistered && pushBanner.cardEnabled,
            isDenied && pushBanner.cardDenied,
            isFailed && pushBanner.cardFailed,
          ]}>
            <View style={pushBanner.top}>
              <MaterialIcons
                name={
                  isRegistered ? 'check-circle'
                  : isDenied ? 'do-not-disturb'
                  : isFailed ? 'error-outline'
                  : 'notifications-off'
                }
                size={22}
                color={
                  isRegistered ? Colors.greenLight
                  : isDenied ? '#FF7043'
                  : isFailed ? '#FF9800'
                  : Colors.textMuted
                }
              />
              <View style={pushBanner.textWrap}>
                <Text style={[
                  pushBanner.title,
                  isRegistered && { color: Colors.greenLight },
                  isDenied && { color: '#FF7043' },
                  isFailed && { color: '#FF9800' },
                ]}>
                  {isRegistered ? 'Push Notifications Enabled'
                    : isDenied ? 'Permission Denied'
                    : isFailed ? 'Registration Failed'
                    : retrying ? 'Enabling…'
                    : 'Push Not Enabled'}
                </Text>
                <Text style={pushBanner.sub}>
                  {isRegistered
                    ? 'You will receive push alerts on this device.'
                    : isDenied
                    ? 'Notifications are disabled in your device settings. Open Settings to allow them.'
                    : isFailed
                    ? (pushTokenError ? `Error: ${pushTokenError}` : 'Could not register for push notifications. Tap Try Again.')
                    : 'Enable to receive event alerts even when the app is closed.'}
                </Text>
              </View>
            </View>

            {isDenied ? (
              <Pressable
                onPress={() => Linking.openSettings()}
                style={({ pressed }) => [pushBanner.btn, pushBanner.btnDenied, pressed && { opacity: 0.8 }]}
              >
                <MaterialIcons name="settings" size={14} color="#fff" />
                <Text style={pushBanner.btnText}>Open Settings</Text>
              </Pressable>
            ) : isFailed ? (
              <Pressable
                onPress={handleEnableNotifications}
                disabled={retrying}
                style={({ pressed }) => [pushBanner.btn, pushBanner.btnFailed, pressed && { opacity: 0.8 }, retrying && { opacity: 0.5 }]}
              >
                <MaterialIcons name="refresh" size={14} color="#fff" />
                <Text style={pushBanner.btnText}>{retrying ? 'Trying…' : 'Try Again'}</Text>
              </Pressable>
            ) : isNotEnabled ? (
              <Pressable
                onPress={handleEnableNotifications}
                disabled={retrying}
                style={({ pressed }) => [pushBanner.btn, pushBanner.btnEnable, pressed && { opacity: 0.8 }, retrying && { opacity: 0.5 }]}
              >
                <MaterialIcons name="notifications-active" size={14} color={Colors.textOnGold} />
                <Text style={[pushBanner.btnText, { color: Colors.textOnGold }]}>
                  {retrying ? 'Enabling…' : 'Enable Notifications'}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

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

// ─── Push Status Banner Styles ────────────────────────────────────────────────
const pushBanner = StyleSheet.create({
  card: {
    marginHorizontal: Spacing.base,
    marginBottom: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    borderWidth: 1.5,
    borderColor: Colors.surfaceBorder,
    overflow: 'hidden',
    padding: Spacing.base,
    gap: Spacing.md,
  },
  cardEnabled: {
    backgroundColor: `${Colors.greenLight}0A`,
    borderColor: `${Colors.greenLight}33`,
  },
  cardDenied: {
    backgroundColor: 'rgba(255,112,67,0.06)',
    borderColor: 'rgba(255,112,67,0.35)',
  },
  cardFailed: {
    backgroundColor: 'rgba(255,152,0,0.06)',
    borderColor: 'rgba(255,152,0,0.35)',
  },
  top: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  textWrap: { flex: 1, gap: 3 },
  title: {
    fontSize: Typography.base,
    fontWeight: Typography.bold,
    color: Colors.textPrimary,
  },
  sub: {
    fontSize: Typography.sm,
    color: Colors.textMuted,
    lineHeight: 18,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
  },
  btnEnable: { backgroundColor: Colors.gold },
  btnDenied: { backgroundColor: '#FF7043' },
  btnFailed: { backgroundColor: '#E65100' },
  btnText: {
    fontSize: Typography.sm,
    fontWeight: Typography.bold,
    color: '#fff',
  },
});
