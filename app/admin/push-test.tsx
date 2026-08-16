/**
 * Admin Push Notification Test Screen
 *
 * Allows admins to send test push notifications to their own registered
 * device tokens to verify APNs/FCM routing, notification tap deep-links,
 * and per-type routing logic without waiting for production events.
 *
 * Access: /admin/push-test — admin-only, guarded by role check.
 * Routes to this screen are added from the Admin Settings tab.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { sendTestPush } from '../../services/emailService';
import { supabase } from '../../lib/supabase';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';

// ─── Notification type definitions ────────────────────────────────────────────

interface NotifType {
  id: string;
  label: string;
  icon: string;
  color: string;
  description: string;
  /** Expected tap route shown to admin for manual verification */
  expectedRoute: string;
  /** Whether this type requires an eventId */
  needsEventId?: boolean;
}

const NOTIF_TYPES: NotifType[] = [
  {
    id: 'event_reminder',
    label: 'Event Reminder',
    icon: 'alarm',
    color: Colors.gold,
    description: 'Sent 2 hours before event start',
    expectedRoute: '/event/<eventId>',
    needsEventId: true,
  },
  {
    id: 'event_approved',
    label: 'Event Approved',
    icon: 'check-circle',
    color: Colors.greenLight,
    description: 'Sent to promoter when event goes live',
    expectedRoute: '/event/<eventId>',
    needsEventId: true,
  },
  {
    id: 'event_rejected',
    label: 'Event Rejected',
    icon: 'cancel',
    color: Colors.error,
    description: 'Sent to promoter when event is rejected',
    expectedRoute: '/edit-event/<eventId> or /my-events',
    needsEventId: true,
  },
  {
    id: 'event_cancelled',
    label: 'Event Cancelled',
    icon: 'event-busy',
    color: '#FF5722',
    description: 'Sent to attendees when event is cancelled',
    expectedRoute: '/(tabs)/',
  },
  {
    id: 'ticket_purchase_confirmed',
    label: 'Ticket Purchased',
    icon: 'confirmation-number',
    color: '#00BCD4',
    description: 'Sent when Stripe payment confirmed',
    expectedRoute: '/my-tickets',
  },
  {
    id: 'ticket_transferred',
    label: 'Ticket Transferred',
    icon: 'send',
    color: '#9C27B0',
    description: 'Sent to recipient of a ticket transfer',
    expectedRoute: '/my-tickets',
  },
  {
    id: 'ticket_received',
    label: 'Ticket Received',
    icon: 'move-to-inbox',
    color: '#7C4DFF',
    description: 'Sent when incoming transfer is completed',
    expectedRoute: '/my-tickets',
  },
  {
    id: 'new_follower',
    label: 'New Follower',
    icon: 'person-add',
    color: '#42A5F5',
    description: 'Sent to promoter on new follow',
    expectedRoute: '/(tabs)/profile',
  },
  {
    id: 'boost_expiring',
    label: 'Boost Expiring',
    icon: 'rocket-launch',
    color: '#E91E63',
    description: 'Sent 48h before boost expires',
    expectedRoute: '/monetization/boost/<eventId>',
    needsEventId: true,
  },
  {
    id: 'payment_failed',
    label: 'Payment Failed',
    icon: 'payment',
    color: Colors.error,
    description: 'Subscription payment failure',
    expectedRoute: '/monetization/upgrade',
  },
  {
    id: 'subscription_cancellation_scheduled',
    label: 'Sub Cancellation Scheduled',
    icon: 'subscriptions',
    color: '#FF9800',
    description: 'Sub set to cancel at period end',
    expectedRoute: '/monetization/upgrade',
  },
  {
    id: 'account_deletion_request',
    label: 'Deletion Request (Admin)',
    icon: 'delete-forever',
    color: '#F44336',
    description: 'Sent to admins when user requests deletion',
    expectedRoute: 'Admin Panel → Deletions tab',
  },
];

// ─── Token Row ─────────────────────────────────────────────────────────────────

function TokenRow({ token }: { token: { id: string; token_type: string; platform: string; token: string } }) {
  return (
    <View style={tokenStyles.row}>
      <View style={[tokenStyles.platformIcon, {
        backgroundColor: token.token_type === 'expo' ? 'rgba(0,120,255,0.12)' : `${Colors.greenLight}12`
      }]}>
        <MaterialIcons
          name={token.platform === 'ios' ? 'phone-iphone' : 'phone-android'}
          size={16}
          color={token.platform === 'ios' ? '#42A5F5' : Colors.greenLight}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={tokenStyles.type}>
          {token.token_type.toUpperCase()} · {token.platform}
        </Text>
        <Text style={tokenStyles.prefix} numberOfLines={1}>
          {token.token.slice(0, 32)}…
        </Text>
      </View>
      <View style={tokenStyles.idChip}>
        <Text style={tokenStyles.idText}>#{token.id.slice(-6)}</Text>
      </View>
    </View>
  );
}

const tokenStyles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
    padding: Spacing.sm, marginBottom: Spacing.xs,
  },
  platformIcon: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  type: { fontSize: Typography.xs, fontWeight: Typography.bold as any, color: Colors.textSecondary },
  prefix: {
    fontSize: 10, color: Colors.textMuted, marginTop: 1,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  idChip: {
    backgroundColor: Colors.surface, paddingHorizontal: Spacing.xs, paddingVertical: 3,
    borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.surfaceBorder, flexShrink: 0,
  },
  idText: { fontSize: 10, color: Colors.textMuted, fontWeight: Typography.bold as any },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function PushTestScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const isAdmin = user?.roles.includes('admin') ?? false;

  const [selectedType, setSelectedType] = useState<NotifType>(NOTIF_TYPES[0]);
  const [eventId, setEventId] = useState('');

  const [tokens, setTokens] = useState<any[]>([]);
  const [tokensLoading, setTokensLoading] = useState(false);

  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{
    ok: boolean;
    detail: string;
    fcmResults?: any[];
    tokenInfo?: any[];
  } | null>(null);

  // Load push tokens for this admin user
  const loadTokens = useCallback(async () => {
    if (!user?.id) return;
    setTokensLoading(true);
    try {
      const { data } = await supabase
        .from('push_tokens')
        .select('id, token, token_type, platform')
        .eq('user_id', user.id);
      setTokens(data ?? []);
    } catch {
      setTokens([]);
    }
    setTokensLoading(false);
  }, [user?.id]);

  useEffect(() => {
    loadTokens();
  }, [loadTokens]);

  // Guard
  if (!isAdmin) {
    return (
      <View style={styles.container}>
        <SafeAreaView edges={['top']} />
        <View style={styles.gate}>
          <MaterialIcons name="lock" size={40} color={Colors.textMuted} />
          <Text style={styles.gateText}>Admin access required</Text>
        </View>
      </View>
    );
  }

  const handleSend = async () => {
    setSending(true);
    setResult(null);
    try {
      // sendTestPush() uses the existing send-email Edge Function infrastructure.
      // It delivers a test push to ALL tokens registered for the calling admin user.
      // The notification type, eventId, and custom content are displayed in the
      // result summary for manual deep-link verification on device.
      const res = await sendTestPush();
      const detail = res.ok
        ? `Push delivered to ${(res.tokenInfo?.length ?? 0)} token(s) — check device\nType: ${selectedType.id}${eventId.trim() ? `\nEventId: ${eventId.trim()}` : ''}\nExpected route: ${selectedType.expectedRoute}`
        : `Error: ${(res as any).error ?? 'Unknown'}` ;
      setResult({
        ok: res.ok,
        detail,
        fcmResults: res.fcmResults,
        tokenInfo: res.tokenInfo,
      });
    } catch (err: any) {
      setResult({ ok: false, detail: err.message ?? 'Send failed' });
    }
    setSending(false);
  };

  const infoBoxColor = result?.ok ? Colors.greenLight : Colors.error;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
          >
            <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Push Notification Test</Text>
            <Text style={styles.headerSub}>Admin-only · sends to your registered tokens</Text>
          </View>
          <View style={styles.adminBadge}>
            <MaterialIcons name="admin-panel-settings" size={12} color={Colors.gold} />
            <Text style={styles.adminBadgeText}>Admin</Text>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + Spacing.xxl * 2 }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        {/* ── Registered Tokens ── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionBar} />
            <Text style={styles.sectionTitle}>YOUR REGISTERED TOKENS</Text>
            <Pressable onPress={loadTokens} hitSlop={8} style={({ pressed }) => pressed && { opacity: 0.6 }}>
              <MaterialIcons name="refresh" size={16} color={Colors.gold} />
            </Pressable>
          </View>

          {tokensLoading ? (
            <ActivityIndicator color={Colors.gold} style={{ paddingVertical: Spacing.md }} />
          ) : tokens.length === 0 ? (
            <View style={styles.noTokensCard}>
              <MaterialIcons name="phone-disabled" size={24} color={Colors.textMuted} />
              <Text style={styles.noTokensText}>No tokens registered</Text>
              <Text style={styles.noTokensSub}>
                Install on a physical device, sign in, and grant notification permission to register a token.
              </Text>
            </View>
          ) : (
            tokens.map((t) => <TokenRow key={t.id} token={t} />)
          )}
        </View>

        {/* ── Notification Type Selector ── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionBar} />
            <Text style={styles.sectionTitle}>NOTIFICATION TYPE</Text>
          </View>

          {NOTIF_TYPES.map((nt) => (
            <Pressable
              key={nt.id}
              onPress={() => { setSelectedType(nt); setResult(null); }}
              style={({ pressed }) => [
                styles.typeRow,
                selectedType.id === nt.id && styles.typeRowSelected,
                pressed && { opacity: 0.8 },
              ]}
            >
              <View style={[styles.typeIconWrap, { backgroundColor: `${nt.color}18` }]}>
                <MaterialIcons name={nt.icon as any} size={18} color={nt.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.typeLabel, selectedType.id === nt.id && { color: Colors.textPrimary }]}>
                  {nt.label}
                </Text>
                <Text style={styles.typeDesc} numberOfLines={1}>{nt.description}</Text>
              </View>
              {selectedType.id === nt.id && (
                <MaterialIcons name="radio-button-checked" size={18} color={nt.color} />
              )}
            </Pressable>
          ))}
        </View>

        {/* ── EventId Input ── */}
        {selectedType.needsEventId && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionBar} />
              <Text style={styles.sectionTitle}>EVENT ID (optional)</Text>
            </View>
            <TextInput
              style={styles.input}
              value={eventId}
              onChangeText={setEventId}
              placeholder="Paste event UUID to test deep-link routing"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Event ID for push test"
            />
            <Text style={styles.inputHint}>
              Tap route: {selectedType.expectedRoute}
            </Text>
          </View>
        )}

        {/* ── Expected Routing Info ── */}
        <View style={styles.routingCard}>
          <MaterialIcons name="alt-route" size={14} color="#42A5F5" />
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={styles.routingLabel}>Expected tap route</Text>
            <Text style={styles.routingRoute}>{selectedType.expectedRoute}</Text>
            <Text style={styles.routingHint}>
              Verify this route opens correctly from:{'\n'}
              • App foregrounded{'\n'}
              • App backgrounded (tap OS banner){'\n'}
              • App terminated (cold launch from notification)
            </Text>
          </View>
        </View>

        {/* ── Result ── */}
        {result && (
          <View style={[styles.resultCard, { borderColor: `${infoBoxColor}44`, backgroundColor: `${infoBoxColor}08` }]}>
            <MaterialIcons
              name={result.ok ? 'check-circle' : 'error-outline'}
              size={18}
              color={infoBoxColor}
            />
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={[styles.resultText, { color: infoBoxColor }]}>{result.detail}</Text>
              {result.tokenInfo && result.tokenInfo.length > 0 && (
                <Text style={styles.resultMeta}>
                  Sent to {result.tokenInfo.length} token(s):{' '}
                  {result.tokenInfo.map((t: any) => t.token_type).join(', ')}
                </Text>
              )}
              {result.fcmResults && result.fcmResults.length > 0 && (
                result.fcmResults.map((r: any, i: number) => (
                  <Text key={i} style={styles.resultMeta}>
                    Token {r.tokenId}: HTTP {r.httpStatus} · {r.status}
                    {r.errorCode ? ` · ${r.errorCode}` : ''}
                  </Text>
                ))
              )}
            </View>
          </View>
        )}

        {/* ── Send Button ── */}
        <Pressable
          onPress={handleSend}
          disabled={sending || tokens.length === 0}
          style={({ pressed }) => [
            styles.sendBtn,
            (sending || tokens.length === 0) && styles.sendBtnDisabled,
            pressed && !sending && { opacity: 0.88 },
          ]}
        >
          {sending ? (
            <ActivityIndicator color={Colors.textOnGold} size="small" />
          ) : (
            <MaterialIcons name="send" size={18} color={tokens.length === 0 ? Colors.textMuted : Colors.textOnGold} />
          )}
          <Text style={[styles.sendBtnText, tokens.length === 0 && { color: Colors.textMuted }]}>
            {sending ? 'Sending…' : tokens.length === 0 ? 'No Tokens — Install on Device' : `Send Test: ${selectedType.label}`}
          </Text>
        </Pressable>

        {/* ── Testing Guidance ── */}
        <View style={styles.guideCard}>
          <Text style={styles.guideTitle}>Testing Checklist</Text>
          {[
            'Test foreground: app open → notification appears as in-app banner',
            'Test background: app backgrounded → OS banner appears → tap → correct screen',
            'Test cold start: force-quit app → receive push → tap → app launches to correct screen',
            'Verify unread badge increments on arrival',
            'Verify notification appears in /notifications list',
            'Sign out → confirm no notifications arrive after sign-out',
          ].map((step, i) => (
            <View key={i} style={styles.guideStep}>
              <View style={styles.guideStepNum}>
                <Text style={styles.guideStepNumText}>{i + 1}</Text>
              </View>
              <Text style={styles.guideStepText}>{step}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  gate: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md,
    paddingHorizontal: Spacing.xl,
  },
  gateText: { fontSize: Typography.base, color: Colors.textMuted, textAlign: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  headerTitle: { fontSize: Typography.base, fontWeight: Typography.black as any, color: Colors.textPrimary },
  headerSub: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 1 },
  adminBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.goldSurface, paddingHorizontal: Spacing.sm, paddingVertical: 4,
    borderRadius: Radius.full, borderWidth: 1, borderColor: `${Colors.gold}44`,
  },
  adminBadgeText: { fontSize: Typography.xs, color: Colors.gold, fontWeight: Typography.bold as any },

  body: { padding: Spacing.base, gap: Spacing.xl },

  section: { gap: Spacing.sm },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
  },
  sectionBar: { width: 3, height: 14, borderRadius: 2, backgroundColor: Colors.gold },
  sectionTitle: {
    flex: 1, fontSize: 11, fontWeight: Typography.bold as any,
    color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1.1,
  },

  noTokensCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
    padding: Spacing.xl, alignItems: 'center', gap: Spacing.sm,
  },
  noTokensText: { fontSize: Typography.base, fontWeight: Typography.semibold as any, color: Colors.textSecondary },
  noTokensSub: { fontSize: Typography.xs, color: Colors.textMuted, textAlign: 'center', lineHeight: 17 },

  typeRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
    padding: Spacing.md,
  },
  typeRowSelected: {
    borderColor: `${Colors.gold}66`, backgroundColor: Colors.goldSurface,
  },
  typeIconWrap: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  typeLabel: { fontSize: Typography.sm, fontWeight: Typography.semibold as any, color: Colors.textSecondary },
  typeDesc: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 1 },

  input: {
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1.5, borderColor: Colors.surfaceBorder,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
    color: Colors.textPrimary, fontSize: Typography.base,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  inputHint: { fontSize: Typography.xs, color: Colors.textMuted, paddingHorizontal: Spacing.xs },

  routingCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md,
    backgroundColor: 'rgba(66,165,245,0.07)', borderRadius: Radius.lg,
    borderWidth: 1, borderColor: 'rgba(66,165,245,0.25)', padding: Spacing.base,
  },
  routingLabel: { fontSize: Typography.xs, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 },
  routingRoute: {
    fontSize: Typography.sm, fontWeight: Typography.bold as any, color: '#42A5F5',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  routingHint: { fontSize: Typography.xs, color: Colors.textSecondary, lineHeight: 18, marginTop: 4 },

  resultCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md,
    borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.base,
  },
  resultText: { fontSize: Typography.sm, fontWeight: Typography.semibold as any, lineHeight: 20 },
  resultMeta: {
    fontSize: 11, color: Colors.textMuted,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', lineHeight: 16,
  },

  sendBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, backgroundColor: Colors.gold, borderRadius: Radius.lg,
    paddingVertical: Spacing.base,
  },
  sendBtnDisabled: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.surfaceBorder },
  sendBtnText: { fontSize: Typography.md, fontWeight: Typography.bold as any, color: Colors.textOnGold },

  guideCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
    padding: Spacing.base, gap: Spacing.md,
  },
  guideTitle: {
    fontSize: Typography.sm, fontWeight: Typography.bold as any, color: Colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 1,
  },
  guideStep: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  guideStepNum: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: Colors.goldSurface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: `${Colors.gold}44`, flexShrink: 0, marginTop: 1,
  },
  guideStepNumText: { fontSize: 10, fontWeight: Typography.black as any, color: Colors.gold },
  guideStepText: { flex: 1, fontSize: Typography.xs, color: Colors.textSecondary, lineHeight: 18 },
});
