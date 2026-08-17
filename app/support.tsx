// ─── Priority Customer Support (Elite) ───────────────────────────────────────
// Elite creators receive priority support. This screen:
//   - Verifies Elite status server-side
//   - Shows Elite-priority contact options with clear priority indicator
//   - Standard users see normal support options only
//   - Priority requests are tagged in the email subject for Admin identification
//
// Route: /support

import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput,
  Alert, ActivityIndicator, Linking, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useAuth } from '../hooks/useAuth';
import { getSupabaseClient } from '../lib/supabase';
import { Colors, Typography, Spacing, Radius } from '../constants/theme';
import { SUPPORT_EMAIL } from '../constants/support';

const STANDARD_SUPPORT_EMAIL = SUPPORT_EMAIL;
const ELITE_SUPPORT_SUBJECT = 'mailto:info@vybzhub.com?subject=%5BELITE%20PRIORITY%5D%20Support%20Request';
const GENERAL_SUPPORT_SUBJECT = 'mailto:info@vybzhub.com?subject=VybzHub%20Support%20Request';

type SupportCategory = 'account' | 'billing' | 'events' | 'technical' | 'other';

const CATEGORIES: { key: SupportCategory; label: string; icon: string }[] = [
  { key: 'account', label: 'Account & Profile', icon: 'person' },
  { key: 'billing', label: 'Billing & Subscription', icon: 'credit-card' },
  { key: 'events', label: 'Events & Ticketing', icon: 'event' },
  { key: 'technical', label: 'Technical Issue', icon: 'bug-report' },
  { key: 'other', label: 'Other', icon: 'help-outline' },
];

export default function SupportScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const [verifiedTier, setVerifiedTier] = useState<string>('free');
  const [verifying, setVerifying] = useState(true);
  const [category, setCategory] = useState<SupportCategory | null>(null);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  // Server-authoritative Elite check — do not use client user.subscriptionTier alone
  useEffect(() => {
    if (!user?.id) { setVerifying(false); return; }
    const supabase = getSupabaseClient();
    supabase
      .from('user_profiles')
      .select('subscription_tier, subscription_status, current_period_end')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        const tier = (data as any)?.subscription_tier ?? 'free';
        const status = (data as any)?.subscription_status ?? 'active';
        const periodEnd = (data as any)?.current_period_end;
        // Validate entitlement: tier must be elite AND status must be active AND not expired
        const isActive = status === 'active' || status === 'trialing';
        const notExpired = !periodEnd || new Date(periodEnd) > new Date();
        const effectiveTier = (tier === 'elite' && isActive && notExpired) ? 'elite' :
                              (tier === 'pro' && isActive && notExpired) ? 'pro' : 'free';
        setVerifiedTier(effectiveTier);
        setVerifying(false);
      }, () => setVerifying(false));
  }, [user?.id]);

  const isElite = verifiedTier === 'elite';
  const isPaid = verifiedTier !== 'free';

  const handleSendEmail = async () => {
    if (!category) { Alert.alert('Select a Category', 'Please choose a support category before sending.'); return; }
    if (!message.trim()) { Alert.alert('Describe Your Issue', 'Please describe your issue before sending.'); return; }
    setSending(true);
    try {
      const categoryLabel = CATEGORIES.find((c) => c.key === category)?.label ?? category;
      const priorityPrefix = isElite ? '[ELITE PRIORITY] ' : isPaid ? '[PRO] ' : '';
      const subject = encodeURIComponent(`${priorityPrefix}[${categoryLabel}] Support Request`);
      const body = encodeURIComponent(
        `${isElite ? '=== ELITE PRIORITY SUPPORT REQUEST ===\n\n' : ''}` +
        `User: ${user?.name ?? 'Unknown'}\n` +
        `Email: ${user?.email ?? 'Unknown'}\n` +
        `Plan: ${verifiedTier.toUpperCase()}\n` +
        `Category: ${categoryLabel}\n\n` +
        `---\n\n${message.trim()}`
      );
      const mailUrl = `mailto:${STANDARD_SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
      const can = await Linking.canOpenURL(mailUrl);
      if (can) {
        await Linking.openURL(mailUrl);
      } else {
        Alert.alert(
          'Email Not Available',
          `Contact us directly at ${STANDARD_SUPPORT_EMAIL}.\n\n${isElite ? 'As an Elite member, mention [ELITE PRIORITY] in your subject line.' : ''}`,
          [{ text: 'Copy Email', onPress: () => {} }, { text: 'OK' }]
        );
      }
    } finally {
      setSending(false);
    }
  };

  if (verifying) {
    return (
      <View style={s.container}>
        <SafeAreaView edges={['top']} />
        <View style={s.center}><ActivityIndicator size="large" color={Colors.gold} /></View>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        <View style={s.header}>
          <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={8}>
            <MaterialIcons name="arrow-back" size={20} color={Colors.textPrimary} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>Help & Support</Text>
            {isElite && <Text style={s.headerSub}>Elite Priority Support</Text>}
          </View>
          {isElite && (
            <View style={s.eliteBadge}>
              <MaterialIcons name="star" size={10} color="#E91E63" />
              <Text style={s.eliteBadgeText}>Priority</Text>
            </View>
          )}
        </View>
      </SafeAreaView>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">

          {/* Elite Priority Banner */}
          {isElite && (
            <View style={s.priorityBanner}>
              <LinearGradient colors={['rgba(233,30,99,0.15)', 'rgba(233,30,99,0.05)']} style={StyleSheet.absoluteFillObject} />
              <View style={s.priorityIconWrap}>
                <MaterialIcons name="star" size={20} color="#E91E63" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.priorityTitle}>Elite Priority Support</Text>
                <Text style={s.priorityBody}>
                  As an Elite creator, your support requests are flagged as priority and reviewed first by our team.
                </Text>
              </View>
            </View>
          )}

          {/* Quick links */}
          <View style={s.quickLinksSection}>
            <Text style={s.sectionLabel}>Quick Help</Text>
            <View style={s.quickLinksGrid}>
              {[
                { icon: 'menu-book', label: 'FAQs', url: 'https://vybzhub.com/faq' },
                { icon: 'email', label: 'Email Us', url: isElite ? ELITE_SUPPORT_SUBJECT : GENERAL_SUPPORT_SUBJECT },
                { icon: 'privacy-tip', label: 'Privacy Policy', url: 'https://vybzhub.com/privacy' },
                { icon: 'gavel', label: 'Terms of Use', url: 'https://vybzhub.com/terms' },
              ].map(({ icon, label, url }) => (
                <Pressable
                  key={label}
                  onPress={() => Linking.openURL(url).catch(() => {})}
                  style={({ pressed }) => [s.quickLink, pressed && { opacity: 0.75 }]}
                >
                  <MaterialIcons name={icon as any} size={20} color={isElite ? '#E91E63' : Colors.gold} />
                  <Text style={[s.quickLinkLabel, isElite && { color: '#E91E63' }]}>{label}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Support form */}
          <Text style={s.sectionLabel}>Send a Support Request</Text>

          <Text style={s.subLabel}>Category</Text>
          <View style={s.categoryGrid}>
            {CATEGORIES.map((cat) => {
              const active = category === cat.key;
              return (
                <Pressable
                  key={cat.key}
                  onPress={() => setCategory(cat.key)}
                  style={({ pressed }) => [s.categoryChip, active && s.categoryChipActive, pressed && { opacity: 0.8 }]}
                >
                  <MaterialIcons name={cat.icon as any} size={14} color={active ? (isElite ? '#E91E63' : Colors.gold) : Colors.textMuted} />
                  <Text style={[s.categoryChipText, active && { color: isElite ? '#E91E63' : Colors.gold, fontWeight: Typography.bold }]}>
                    {cat.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={[s.subLabel, { marginTop: Spacing.md }]}>Describe Your Issue</Text>
          <TextInput
            style={s.messageInput}
            value={message}
            onChangeText={setMessage}
            placeholder={isElite
              ? 'Describe your issue in detail. As an Elite creator your request will be prioritized.'
              : 'Describe your issue in detail…'}
            placeholderTextColor={Colors.textMuted}
            multiline
            numberOfLines={6}
            textAlignVertical="top"
            maxLength={2000}
          />
          <Text style={s.charCount}>{message.length}/2000</Text>

          {user?.email && (
            <View style={s.replyNote}>
              <MaterialIcons name="reply" size={13} color={Colors.textMuted} />
              <Text style={s.replyNoteText}>We will reply to {user.email}</Text>
            </View>
          )}

          <Pressable
            onPress={handleSendEmail}
            disabled={sending || !category || !message.trim()}
            style={({ pressed }) => [
              s.sendBtn,
              (!category || !message.trim()) && { opacity: 0.4 },
              pressed && { opacity: 0.85 },
            ]}
          >
            <LinearGradient
              colors={isElite ? ['#E91E63', '#AD1457'] : [Colors.gold, Colors.goldDim]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={s.sendBtnInner}
            >
              {sending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <MaterialIcons name={isElite ? 'star' : 'send'} size={16} color="#fff" />
              )}
              <Text style={s.sendBtnText}>
                {sending ? 'Opening Email…' : isElite ? 'Send Priority Request' : 'Send Support Request'}
              </Text>
            </LinearGradient>
          </Pressable>

          {/* Response time estimate */}
          <View style={s.responseNote}>
            <MaterialIcons name="schedule" size={13} color={Colors.textMuted} />
            <Text style={s.responseNoteText}>
              {isElite
                ? 'Elite priority requests are typically reviewed within 12–24 hours.'
                : 'Standard requests are typically reviewed within 2–5 business days.'}
            </Text>
          </View>

          {/* Upgrade prompt for non-Elite */}
          {!isElite && user && (
            <Pressable
              onPress={() => router.push('/monetization/upgrade' as any)}
              style={({ pressed }) => [s.upgradePrompt, pressed && { opacity: 0.85 }]}
            >
              <MaterialIcons name="star" size={14} color="#E91E63" />
              <Text style={s.upgradePromptText}>Upgrade to Elite for priority customer support</Text>
              <MaterialIcons name="arrow-forward" size={13} color="#E91E63" />
            </Pressable>
          )}

          <View style={{ height: 60 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.base, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.surfaceBorder },
  headerTitle: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textPrimary },
  headerSub: { fontSize: Typography.xs, color: '#E91E63', marginTop: 1, fontWeight: Typography.semibold },
  eliteBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(233,30,99,0.12)', paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: Radius.full, borderWidth: 1, borderColor: 'rgba(233,30,99,0.3)' },
  eliteBadgeText: { fontSize: 10, color: '#E91E63', fontWeight: Typography.bold },

  content: { padding: Spacing.base, gap: Spacing.base },

  priorityBanner: { borderRadius: Radius.lg, borderWidth: 1.5, borderColor: 'rgba(233,30,99,0.3)', overflow: 'hidden', padding: Spacing.base, flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  priorityIconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(233,30,99,0.15)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  priorityTitle: { fontSize: Typography.sm, fontWeight: Typography.bold, color: '#E91E63', marginBottom: 3 },
  priorityBody: { fontSize: Typography.xs, color: Colors.textSecondary, lineHeight: 18 },

  quickLinksSection: { gap: Spacing.sm },
  quickLinksGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  quickLink: { flex: 1, minWidth: '45%', flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.surface, padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.surfaceBorder },
  quickLinkLabel: { fontSize: Typography.sm, color: Colors.gold, fontWeight: Typography.semibold },

  sectionLabel: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 },
  subLabel: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textSecondary },

  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  categoryChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.full, backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.surfaceBorder },
  categoryChipActive: { backgroundColor: Colors.goldSurface, borderColor: `${Colors.gold}55` },
  categoryChipText: { fontSize: Typography.sm, color: Colors.textMuted, fontWeight: Typography.medium },

  messageInput: { backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.surfaceBorder, padding: Spacing.md, fontSize: Typography.base, color: Colors.textPrimary, minHeight: 140, includeFontPadding: false },
  charCount: { fontSize: Typography.xs, color: Colors.textMuted, textAlign: 'right', marginTop: 3 },

  replyNote: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  replyNoteText: { fontSize: Typography.xs, color: Colors.textMuted },

  sendBtn: { borderRadius: Radius.lg, overflow: 'hidden' },
  sendBtnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingVertical: Spacing.base },
  sendBtnText: { fontSize: Typography.base, fontWeight: Typography.bold, color: '#fff' },

  responseNote: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.xs },
  responseNoteText: { flex: 1, fontSize: Typography.xs, color: Colors.textMuted, lineHeight: 17 },

  upgradePrompt: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: 'rgba(233,30,99,0.08)', borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: 'rgba(233,30,99,0.2)' },
  upgradePromptText: { flex: 1, fontSize: Typography.sm, color: '#E91E63', fontWeight: Typography.medium },
});
