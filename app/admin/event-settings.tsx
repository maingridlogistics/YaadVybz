/**
 * Admin Portal — Event Settings
 * Controls whether newly submitted events require admin approval.
 * Admin-only. Accessed from Profile → CONTENT & APP → Event Settings.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Switch,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';

export default function EventSettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, requireEventApproval, setRequireEventApproval } = useAuth();
  const isAdmin = user?.roles.includes('admin') ?? false;

  if (!isAdmin) {
    return (
      <View style={s.gate}>
        <SafeAreaView edges={['top']} />
        <MaterialIcons name="lock" size={48} color={Colors.textMuted} />
        <Text style={s.gateText}>Admin access required.</Text>
        <Pressable onPress={() => router.back()} style={s.gateBtn}>
          <Text style={s.gateBtnText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        <View style={s.header}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.7 }]}>
            <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
          </Pressable>
          <View style={s.headerIconWrap}>
            <MaterialIcons name="event-available" size={18} color={Colors.gold} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>Event Settings</Text>
            <Text style={s.headerSub}>Platform-wide event submission controls</Text>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.body, { paddingBottom: insets.bottom + Spacing.xxl * 2 }]}
      >
        {/* Require approval toggle */}
        <View style={s.settingCard}>
          <View style={s.settingTop}>
            <View style={[s.iconWrap, { backgroundColor: requireEventApproval ? `${Colors.gold}18` : `${Colors.greenLight}18` }]}>
              <MaterialIcons
                name={requireEventApproval ? 'pending-actions' : 'bolt'}
                size={22}
                color={requireEventApproval ? Colors.gold : Colors.greenLight}
              />
            </View>
            <View style={s.settingText}>
              <Text style={s.settingTitle}>Require Event Approval</Text>
              <Text style={s.settingSub}>
                When enabled, newly submitted events enter a Pending state and must be approved by an admin before going live. When disabled, events go live immediately upon submission.
              </Text>
            </View>
            <Switch
              value={requireEventApproval}
              onValueChange={(v) => setRequireEventApproval(v)}
              trackColor={{ false: Colors.surfaceBorder, true: Colors.gold }}
              thumbColor={requireEventApproval ? Colors.textOnGold : Colors.textMuted}
              accessibilityLabel="Require event approval toggle"
            />
          </View>

          {/* Status bar */}
          <View style={[s.statusBar, requireEventApproval ? s.statusBarOn : s.statusBarOff]}>
            <MaterialIcons
              name={requireEventApproval ? 'pending-actions' : 'bolt'}
              size={13}
              color={requireEventApproval ? '#FF9800' : Colors.greenLight}
            />
            <Text style={[s.statusText, { color: requireEventApproval ? '#FF9800' : Colors.greenLight }]}>
              {requireEventApproval
                ? 'Moderation ON — new events require approval before going live'
                : 'Auto-publish ON — new events go live immediately upon submission'}
            </Text>
          </View>
        </View>

        {/* Explanation card */}
        <View style={s.explainCard}>
          <View style={s.explainRow}>
            <MaterialIcons name="check-circle" size={16} color={Colors.greenLight} />
            <View style={{ flex: 1 }}>
              <Text style={s.explainTitle}>Moderation OFF (auto-publish)</Text>
              <Text style={s.explainText}>
                Promoters can post events and they appear live immediately. Best for low-volume or trusted-promoter environments.
              </Text>
            </View>
          </View>
          <View style={s.explainDivider} />
          <View style={s.explainRow}>
            <MaterialIcons name="pending-actions" size={16} color="#FF9800" />
            <View style={{ flex: 1 }}>
              <Text style={s.explainTitle}>Moderation ON (require approval)</Text>
              <Text style={s.explainText}>
                All new events go into the pending queue. An admin must review and approve each event before it appears publicly. Approved events notify the promoter via push and email.
              </Text>
            </View>
          </View>
        </View>

        {/* Link to event queue */}
        <Pressable
          onPress={() => router.push('/admin/event-queue' as any)}
          style={({ pressed }) => [s.queueLink, pressed && { opacity: 0.8 }]}
        >
          <MaterialIcons name="pending-actions" size={16} color={Colors.gold} />
          <Text style={s.queueLinkText}>View Event Approval Queue</Text>
          <MaterialIcons name="arrow-forward-ios" size={12} color={Colors.gold} />
        </Pressable>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  gate: { flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center', gap: Spacing.base },
  gateText: { fontSize: Typography.base, color: Colors.textMuted },
  gateBtn: { paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm, backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.surfaceBorder },
  gateBtnText: { color: Colors.gold, fontWeight: Typography.semibold as any },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.surfaceBorder },
  headerIconWrap: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.goldSurface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: `${Colors.gold}44` },
  headerTitle: { fontSize: Typography.lg, fontWeight: Typography.black as any, color: Colors.textPrimary },
  headerSub: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 1 },

  body: { padding: Spacing.base, gap: Spacing.md },

  settingCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    borderWidth: 1.5, borderColor: Colors.surfaceBorder, overflow: 'hidden',
  },
  settingTop: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, padding: Spacing.base },
  iconWrap: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  settingText: { flex: 1, gap: 4 },
  settingTitle: { fontSize: Typography.base, fontWeight: Typography.bold as any, color: Colors.textPrimary },
  settingSub: { fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 19 },
  statusBar: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm,
    borderTopWidth: 1, borderTopColor: Colors.surfaceBorder,
  },
  statusBarOn: { backgroundColor: 'rgba(255,152,0,0.08)' },
  statusBarOff: { backgroundColor: `${Colors.greenLight}10` },
  statusText: { flex: 1, fontSize: Typography.xs, fontWeight: Typography.semibold as any, lineHeight: 17 },

  explainCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.surfaceBorder, overflow: 'hidden',
  },
  explainRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, padding: Spacing.base },
  explainTitle: { fontSize: Typography.sm, fontWeight: Typography.bold as any, color: Colors.textPrimary, marginBottom: 4 },
  explainText: { fontSize: Typography.xs, color: Colors.textSecondary, lineHeight: 18 },
  explainDivider: { height: 1, backgroundColor: Colors.surfaceBorder },

  queueLink: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.goldSurface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: `${Colors.gold}44`, padding: Spacing.base,
  },
  queueLinkText: { flex: 1, fontSize: Typography.base, color: Colors.gold, fontWeight: Typography.semibold as any },
});
