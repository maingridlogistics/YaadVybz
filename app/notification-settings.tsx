import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Switch,
  Platform,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../hooks/useAuth';
import { Colors, Typography, Spacing, Radius } from '../constants/theme';

// ─── Types ────────────────────────────────────────────────────────────────────
interface NotifPref {
  key: keyof NotifPrefs;
  label: string;
  description: string;
  icon: string;
  iconColor: string;
  iconBg: string;
}

interface NotifPrefs {
  emailNotifNewParish: boolean;
  emailNotifNewPromoter: boolean;
  emailNotifEventChange: boolean;
  emailNotifEventReminder: boolean;
}

// ─── Notification categories ──────────────────────────────────────────────────
const NOTIF_GROUPS: { title: string; subtitle: string; prefs: NotifPref[] }[] = [
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

// ─── Toggle Row ───────────────────────────────────────────────────────────────
function ToggleRow({
  pref,
  value,
  onToggle,
  saving,
  isLast,
}: {
  pref: NotifPref;
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
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  iconBg: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 2,
  },
  textWrap: {
    flex: 1,
    gap: 3,
  },
  label: {
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
    color: Colors.textPrimary,
    lineHeight: 20,
  },
  desc: {
    fontSize: Typography.sm,
    color: Colors.textMuted,
    lineHeight: 18,
  },
  switch: {
    flexShrink: 0,
    marginTop: 2,
  },
});

// ─── Section Card ─────────────────────────────────────────────────────────────
function SectionCard({
  group,
  prefs,
  onToggle,
  savingKey,
}: {
  group: (typeof NOTIF_GROUPS)[0];
  prefs: NotifPrefs;
  onToggle: (key: keyof NotifPrefs) => void;
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
            value={prefs[pref.key]}
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
  wrap: {
    marginHorizontal: Spacing.base,
    marginBottom: Spacing.lg,
  },
  header: {
    marginBottom: Spacing.sm,
    paddingLeft: Spacing.xs,
  },
  title: {
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    color: Colors.gold,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  subtitle: {
    fontSize: Typography.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
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
  const { user, updateProfile } = useAuth();

  const [prefs, setPrefs] = useState<NotifPrefs>({
    emailNotifNewParish: (user as any)?.emailNotifNewParish ?? true,
    emailNotifNewPromoter: (user as any)?.emailNotifNewPromoter ?? true,
    emailNotifEventChange: (user as any)?.emailNotifEventChange ?? true,
    emailNotifEventReminder: (user as any)?.emailNotifEventReminder ?? true,
  });
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [showToast, setShowToast] = useState(false);
  const toastTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleToggle = useCallback(
    async (key: keyof NotifPrefs) => {
      const newValue = !prefs[key];
      setPrefs((prev) => ({ ...prev, [key]: newValue }));
      setSavingKey(key);

      try {
        await updateProfile({ [key]: newValue } as any);

        // Show toast
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        setShowToast(true);
        toastTimerRef.current = setTimeout(() => setShowToast(false), 1800);
      } catch (_) {
        // Revert on failure
        setPrefs((prev) => ({ ...prev, [key]: !newValue }));
      } finally {
        setSavingKey(null);
      }
    },
    [prefs, updateProfile]
  );

  const enabledCount = Object.values(prefs).filter(Boolean).length;
  const totalCount = Object.keys(prefs).length;

  const handleToggleAll = async () => {
    const allOn = enabledCount === totalCount;
    const newValue = !allOn;
    const updated: NotifPrefs = {
      emailNotifNewParish: newValue,
      emailNotifNewPromoter: newValue,
      emailNotifEventChange: newValue,
      emailNotifEventReminder: newValue,
    };
    setPrefs(updated);
    setSavingKey('all');
    try {
      await updateProfile(updated as any);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      setShowToast(true);
      toastTimerRef.current = setTimeout(() => setShowToast(false), 1800);
    } catch (_) {
      setPrefs(prefs);
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.safeTop}>
        {/* Header */}
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
            <Text style={styles.headerSub}>Email preferences</Text>
          </View>
          <Pressable
            onPress={handleToggleAll}
            disabled={savingKey !== null}
            style={({ pressed }) => [styles.toggleAllBtn, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.toggleAllText}>
              {enabledCount === totalCount ? 'Mute All' : 'Enable All'}
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {/* Summary pill */}
        <View style={styles.summaryWrap}>
          <View style={styles.summaryPill}>
            <View style={[styles.summaryDot, { backgroundColor: enabledCount > 0 ? Colors.greenLight : Colors.textMuted }]} />
            <Text style={styles.summaryText}>
              {enabledCount === 0
                ? 'All notifications muted'
                : enabledCount === totalCount
                ? 'All notifications enabled'
                : `${enabledCount} of ${totalCount} notifications enabled`}
            </Text>
          </View>
        </View>

        {/* Notification groups */}
        {NOTIF_GROUPS.map((group) => (
          <SectionCard
            key={group.title}
            group={group}
            prefs={prefs}
            onToggle={handleToggle}
            savingKey={savingKey}
          />
        ))}

        {/* Info note */}
        <View style={styles.noteCard}>
          <MaterialIcons name="info-outline" size={16} color={Colors.textMuted} />
          <Text style={styles.noteText}>
            These preferences control email notifications only. Changes are saved instantly to your account and apply to future events.
          </Text>
        </View>

        {/* Email address display */}
        {user?.email ? (
          <View style={styles.emailRow}>
            <MaterialIcons name="alternate-email" size={14} color={Colors.textMuted} />
            <Text style={styles.emailText}>Notifications sent to</Text>
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
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
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
  headerText: {
    flex: 1,
  },
  headerTitle: {
    fontSize: Typography.lg,
    fontWeight: Typography.bold,
    color: Colors.textPrimary,
  },
  headerSub: {
    fontSize: Typography.xs,
    color: Colors.textMuted,
    marginTop: 1,
  },
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
  scroll: {
    paddingTop: Spacing.lg,
  },

  // Summary pill
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
  summaryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  summaryText: {
    fontSize: Typography.sm,
    color: Colors.textSecondary,
    fontWeight: Typography.medium,
  },

  // Note
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
  noteText: {
    flex: 1,
    fontSize: Typography.sm,
    color: Colors.textMuted,
    lineHeight: 18,
  },

  // Email display
  emailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.md,
  },
  emailText: {
    fontSize: Typography.xs,
    color: Colors.textMuted,
  },
  emailValue: {
    fontSize: Typography.xs,
    color: Colors.textSecondary,
    fontWeight: Typography.medium,
    flexShrink: 1,
  },
});
