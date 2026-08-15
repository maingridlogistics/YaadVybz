/**
 * Admin Portal — System Tools
 * Admin diagnostic and configuration tools:
 *   - Ad Rotation Interval (admin_settings)
 *   - Send Test Email
 *   - SMTP Handshake Test
 *   - Send Test Push (quick)
 *   - Push Test Lab (detailed — nested route)
 *
 * Admin-only. Accessed from Profile → CONTENT & APP → System Tools.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { sendTestEmail, testSmtpConnection, sendTestPush } from '../../services/emailService';
import { supabase } from '../../lib/supabase';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';

export default function SystemToolsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const isAdmin = user?.roles.includes('admin') ?? false;

  // Ad rotation
  const [adRotMs, setAdRotMs] = useState<number | null>(null);
  const [adRotInput, setAdRotInput] = useState('');
  const [adRotSaving, setAdRotSaving] = useState(false);
  const [adRotSaved, setAdRotSaved] = useState(false);

  // Email test
  const [testEmailState, setTestEmailState] = useState<'idle' | 'sending' | 'ok' | 'fail'>('idle');
  const [testEmailDetail, setTestEmailDetail] = useState('');

  // SMTP test
  const [testSmtpState, setTestSmtpState] = useState<'idle' | 'testing' | 'ok' | 'slow' | 'fail'>('idle');

  // Push test
  const [testPushState, setTestPushState] = useState<'idle' | 'sending' | 'ok' | 'fail'>('idle');

  const loadAdRotation = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('admin_settings')
        .select('value')
        .eq('key', 'ad_rotation_interval_ms')
        .maybeSingle();
      const ms = data?.value?.ms;
      if (typeof ms === 'number') {
        setAdRotMs(ms);
        setAdRotInput(String(Math.round(ms / 1000)));
      } else {
        setAdRotMs(5000);
        setAdRotInput('5');
      }
    } catch {
      setAdRotMs(5000);
      setAdRotInput('5');
    }
  }, []);

  useEffect(() => { loadAdRotation(); }, [loadAdRotation]);

  const saveAdRotation = async () => {
    const secs = Number(adRotInput);
    if (!Number.isFinite(secs) || secs < 1 || secs > 120) {
      Alert.alert('Invalid Value', 'Enter a number between 1 and 120 seconds.');
      return;
    }
    setAdRotSaving(true);
    try {
      await supabase
        .from('admin_settings')
        .upsert({ key: 'ad_rotation_interval_ms', value: { ms: secs * 1000 } }, { onConflict: 'key' });
      setAdRotMs(secs * 1000);
      setAdRotSaved(true);
      setTimeout(() => setAdRotSaved(false), 3000);
    } catch {
      Alert.alert('Error', 'Failed to save ad rotation interval.');
    }
    setAdRotSaving(false);
  };

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
            <MaterialIcons name="build" size={18} color={Colors.gold} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>System Tools</Text>
            <Text style={s.headerSub}>Admin diagnostics and configuration</Text>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.body, { paddingBottom: insets.bottom + Spacing.xxl * 2 }]}
      >

        {/* ── Ad Rotation Interval ── */}
        <View style={s.settingCard}>
          <View style={s.cardTop}>
            <View style={s.iconWrap}>
              <MaterialIcons name="rotate-right" size={20} color={Colors.gold} />
            </View>
            <View style={s.cardText}>
              <Text style={s.cardTitle}>Ad Rotation Interval</Text>
              <Text style={s.cardSub}>
                How long each ad is shown before rotating. 1–120 seconds.
                {adRotMs !== null ? `\nCurrent: ${adRotMs / 1000}s` : ''}
              </Text>
            </View>
          </View>
          <View style={s.rotRow}>
            <TextInput
              style={s.rotInput}
              value={adRotInput}
              onChangeText={(v) => { setAdRotInput(v.replace(/[^0-9]/g, '')); setAdRotSaved(false); }}
              keyboardType="number-pad"
              maxLength={3}
              accessibilityLabel="Ad rotation interval in seconds"
              placeholder="5"
              placeholderTextColor={Colors.textMuted}
            />
            <Text style={s.rotUnit}>seconds</Text>
            <Pressable
              onPress={saveAdRotation}
              disabled={adRotSaving}
              style={({ pressed }) => [
                s.rotSaveBtn,
                adRotSaved && { backgroundColor: Colors.greenLight },
                adRotSaving && { opacity: 0.5 },
                pressed && { opacity: 0.8 },
              ]}
            >
              <MaterialIcons name={adRotSaved ? 'check' : 'save'} size={14} color={Colors.textOnGold} />
              <Text style={s.rotSaveBtnText}>
                {adRotSaving ? 'Saving…' : adRotSaved ? 'Saved' : 'Save'}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* ── Send Test Email ── */}
        <View style={s.settingCard}>
          <View style={s.cardTop}>
            <View style={s.iconWrap}>
              <MaterialIcons name="email" size={20} color={Colors.gold} />
            </View>
            <View style={s.cardText}>
              <Text style={s.cardTitle}>Test Email Delivery</Text>
              <Text style={s.cardSub}>Send a test email to your account to verify SMTP is working.</Text>
            </View>
          </View>
          {testEmailState !== 'idle' && (
            <View style={s.resultRow}>
              <MaterialIcons
                name={testEmailState === 'sending' ? 'hourglass-empty' : testEmailState === 'ok' ? 'check-circle' : 'error-outline'}
                size={13}
                color={testEmailState === 'ok' ? Colors.greenLight : testEmailState === 'fail' ? Colors.error : '#FF9800'}
              />
              <Text style={[s.resultText, { color: testEmailState === 'ok' ? Colors.greenLight : testEmailState === 'fail' ? Colors.error : '#FF9800' }]}>
                {testEmailState === 'sending' ? 'Sending...' : testEmailDetail}
              </Text>
            </View>
          )}
          <Pressable
            onPress={async () => {
              setTestEmailState('sending');
              setTestEmailDetail('');
              const { ok, detail } = await sendTestEmail();
              setTestEmailState(ok ? 'ok' : 'fail');
              setTestEmailDetail(detail);
            }}
            disabled={testEmailState === 'sending'}
            style={({ pressed }) => [s.testBtn, testEmailState === 'sending' && { opacity: 0.5 }, pressed && { opacity: 0.8 }]}
          >
            <MaterialIcons name="send" size={14} color={Colors.textOnGold} />
            <Text style={s.testBtnText}>{testEmailState === 'sending' ? 'Sending...' : 'Send Test Email'}</Text>
          </Pressable>
        </View>

        {/* ── SMTP Handshake ── */}
        <View style={s.settingCard}>
          <View style={s.cardTop}>
            <View style={s.iconWrap}>
              <MaterialIcons name="wifi-tethering" size={20} color={Colors.gold} />
            </View>
            <View style={s.cardText}>
              <Text style={s.cardTitle}>Test SMTP Handshake</Text>
              <Text style={s.cardSub}>TCP → EHLO → STARTTLS → AUTH probe. Detects latency before Supabase Auth 10s timeout.</Text>
            </View>
          </View>
          <Pressable
            onPress={async () => {
              setTestSmtpState('testing');
              const result = await testSmtpConnection();
              setTestSmtpState(!result.ok || result.totalMs >= 8000 ? 'fail' : result.totalMs >= 3000 ? 'slow' : 'ok');
            }}
            disabled={testSmtpState === 'testing'}
            style={({ pressed }) => [
              s.testBtn,
              testSmtpState === 'slow' && { backgroundColor: '#E65100' },
              testSmtpState === 'fail' && { backgroundColor: '#C62828' },
              testSmtpState === 'testing' && { opacity: 0.5 },
              pressed && { opacity: 0.8 },
            ]}
          >
            <MaterialIcons
              name={testSmtpState === 'ok' ? 'check' : testSmtpState === 'fail' ? 'error-outline' : 'wifi-tethering'}
              size={14}
              color={Colors.textOnGold}
            />
            <Text style={s.testBtnText}>
              {testSmtpState === 'testing' ? 'Probing…' : testSmtpState === 'ok' ? 'Healthy — Tap to Re-test' : testSmtpState === 'fail' ? 'Failed — Retry' : testSmtpState === 'slow' ? 'Slow — Retry' : 'Test SMTP Connection'}
            </Text>
          </Pressable>
        </View>

        {/* ── Send Test Push ── */}
        <View style={s.settingCard}>
          <View style={s.cardTop}>
            <View style={s.iconWrap}>
              <MaterialIcons name="notifications-active" size={20} color={Colors.gold} />
            </View>
            <View style={s.cardText}>
              <Text style={s.cardTitle}>Test Push Notification</Text>
              <Text style={s.cardSub}>Send a quick test push to this device to verify APNs/FCM delivery.</Text>
            </View>
          </View>
          <Pressable
            onPress={async () => {
              setTestPushState('sending');
              const result = await sendTestPush();
              setTestPushState(result.ok ? 'ok' : 'fail');
            }}
            disabled={testPushState === 'sending'}
            style={({ pressed }) => [s.testBtn, testPushState === 'sending' && { opacity: 0.5 }, pressed && { opacity: 0.8 }]}
          >
            <MaterialIcons name={testPushState === 'ok' ? 'check' : 'send'} size={14} color={Colors.textOnGold} />
            <Text style={s.testBtnText}>
              {testPushState === 'sending' ? 'Sending...' : testPushState === 'ok' ? 'Sent — Resend' : testPushState === 'fail' ? 'Failed — Retry' : 'Send Test Push'}
            </Text>
          </Pressable>
        </View>

        {/* ── Push Test Lab ── */}
        <Pressable
          onPress={() => router.push('/admin/push-test' as any)}
          style={({ pressed }) => [s.settingCard, s.labCard, pressed && { opacity: 0.88 }]}
        >
          <View style={s.cardTop}>
            <View style={[s.iconWrap, { backgroundColor: 'rgba(124,77,255,0.18)' }]}>
              <MaterialIcons name="science" size={20} color="#7C4DFF" />
            </View>
            <View style={s.cardText}>
              <Text style={s.cardTitle}>Push Test Lab</Text>
              <Text style={s.cardSub}>Select notification type, supply event ID, verify deep-link routing on device.</Text>
            </View>
            <MaterialIcons name="arrow-forward-ios" size={14} color={Colors.textMuted} />
          </View>
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

  settingCard: { backgroundColor: Colors.surface, borderRadius: Radius.xl, borderWidth: 1.5, borderColor: Colors.surfaceBorder, overflow: 'hidden' },
  labCard: { borderColor: 'rgba(124,77,255,0.35)' },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, padding: Spacing.base },
  iconWrap: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.surfaceElevated, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  cardText: { flex: 1, gap: 4 },
  cardTitle: { fontSize: Typography.base, fontWeight: Typography.bold as any, color: Colors.textPrimary },
  cardSub: { fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 19 },

  rotRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.base, paddingBottom: Spacing.md },
  rotInput: { width: 64, height: 44, backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.gold, color: Colors.textPrimary, fontSize: Typography.lg, fontWeight: Typography.bold as any, textAlign: 'center' },
  rotUnit: { fontSize: Typography.sm, color: Colors.textMuted, flex: 1 },
  rotSaveBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.gold, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: 10 },
  rotSaveBtnText: { fontSize: Typography.sm, fontWeight: Typography.bold as any, color: Colors.textOnGold },

  resultRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.surfaceBorder },
  resultText: { flex: 1, fontSize: Typography.xs },

  testBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, margin: Spacing.md, marginTop: 0, padding: Spacing.md, backgroundColor: Colors.gold, borderRadius: Radius.md },
  testBtnText: { fontSize: Typography.sm, fontWeight: Typography.bold as any, color: Colors.textOnGold },
});
