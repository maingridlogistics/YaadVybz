// app/complete-profile.tsx
// WhatsApp new-user onboarding — collects name, username, and parish.
//
// Shown after WhatsApp OTP verification when the user is new (no name or parish).
// The verified phone is already set on the profile and is displayed read-only.
// No password is collected — WhatsApp users are passwordless.
//
// Routing:
//   - auth.tsx navigates here when verifyWhatsAppOtp returns isNewUser=true
//   - index.tsx redirects here on app launch when profile is incomplete
//     (phone_verified=true, name empty or parish empty)

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { PARISHES } from '../constants/data';
import { Colors, Typography, Spacing, Radius } from '../constants/theme';
import { toTitleCase } from '../constants/textNormalization';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatVerifiedPhone(e164: string): string {
  if (!e164) return '';
  // +18765551234 → +1 876 555-1234
  const m = e164.match(/^\+1(876|658)(\d{3})(\d{4})$/);
  if (m) return `+1 ${m[1]} ${m[2]}-${m[3]}`;
  return e164;
}

function isValidUsername(u: string): boolean {
  return /^[a-zA-Z0-9_]{3,30}$/.test(u);
}

// ─── Error banner ─────────────────────────────────────────────────────────────
function ErrorBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <View style={errStyles.container}>
      <MaterialIcons name="error-outline" size={16} color="#FF7777" />
      <Text style={errStyles.text}>{message}</Text>
      <Pressable onPress={onDismiss} hitSlop={8}>
        <MaterialIcons name="close" size={16} color={Colors.textMuted} />
      </Pressable>
    </View>
  );
}
const errStyles = StyleSheet.create({
  container: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    backgroundColor: '#2A1010', borderRadius: Radius.md,
    borderWidth: 1, borderColor: '#FF444433', padding: Spacing.md,
  },
  text: { flex: 1, fontSize: Typography.sm, color: '#FF7777', lineHeight: 19 },
});

// ─── Step indicator ───────────────────────────────────────────────────────────
function StepDots({ total, current }: { total: number; current: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6, alignSelf: 'center', marginBottom: Spacing.md }}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={{
            width: i === current ? 20 : 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: i === current ? Colors.gold : Colors.surfaceBorder,
          }}
        />
      ))}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
type Step = 'name_username' | 'parish';

export default function CompleteProfile() {
  const { user, updateProfile, completeOnboarding, refreshProfile } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState<Step>('name_username');
  const [name, setName] = useState(user?.name && user.name !== 'Viber' ? user.name : '');
  const [username, setUsername] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [parish, setParish] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Verified phone from profile
  const verifiedPhone = user?.phone ?? '';
  const formattedPhone = formatVerifiedPhone(verifiedPhone);

  // ── Username availability check ───────────────────────────────────────
  const checkUsernameAvailability = useCallback(async (value: string): Promise<boolean> => {
    if (!isValidUsername(value)) return false;
    setCheckingUsername(true);
    try {
      // Query for any existing row with same username (case-insensitive)
      const { data, error: dbErr } = await supabase
        .from('user_profiles')
        .select('id')
        .ilike('username', value)
        .neq('id', user?.id ?? '')
        .maybeSingle();
      if (dbErr) return true; // fail open — allow through on DB error
      return !data; // true = available
    } finally {
      setCheckingUsername(false);
    }
  }, [user?.id]);

  // ── Step 1: Name + Username ───────────────────────────────────────────
  const handleNameNext = async () => {
    setError('');
    setUsernameError('');

    const trimmedName = name.trim();
    const trimmedUsername = username.trim().toLowerCase();

    if (trimmedName.length < 2) {
      setError('Please enter your full name (at least 2 characters).');
      return;
    }
    if (trimmedUsername.length < 3) {
      setUsernameError('Username must be at least 3 characters.');
      return;
    }
    if (!isValidUsername(trimmedUsername)) {
      setUsernameError('Only letters, numbers and underscores allowed (3–30 chars).');
      return;
    }

    const available = await checkUsernameAvailability(trimmedUsername);
    if (!available) {
      setUsernameError('That username is already taken. Please choose another.');
      return;
    }

    setStep('parish');
  };

  // ── Step 2: Parish + Save ─────────────────────────────────────────────
  const handleFinish = async () => {
    setError('');
    if (!parish) {
      setError('Please select your home parish.');
      return;
    }
    setSaving(true);
    try {
      const trimmedName = name.trim();
      const trimmedUsername = username.trim().toLowerCase();

      // Write name + username to DB
      const { error: dbErr } = await supabase
        .from('user_profiles')
        .update({
          name: toTitleCase(trimmedName),
          username: trimmedUsername,
        })
        .eq('id', user!.id);

      if (dbErr) throw dbErr;

      // completeOnboarding writes home_parish + interests and sets isOnboarded=true
      await completeOnboarding(parish, []);

      // Refresh profile so all fields are current in AuthContext
      await refreshProfile();

      // Navigate into app
      router.replace('/(tabs)' as any);
    } catch (err: any) {
      setError(err?.message ?? 'Could not save your profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // ─── Step 1 UI ─────────────────────────────────────────────────────────
  if (step === 'name_username') {
    return (
      <View style={styles.container}>
        <LinearGradient
          colors={['#001A0D', Colors.background, Colors.background]}
          style={StyleSheet.absoluteFillObject}
        />
        <SafeAreaView style={{ flex: 1 }}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <ScrollView
              contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + Spacing.xxl }]}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* Logo */}
              <View style={styles.header}>
                <View style={styles.logoRow}>
                  <View style={styles.logoDot} />
                  <Text style={styles.logoText}>VYBZ HUB</Text>
                </View>
                <Text style={styles.title}>{"Almost there!"}</Text>
                <Text style={styles.subtitle}>{"Set up your profile to get started."}</Text>
              </View>

              <StepDots total={2} current={0} />

              {error ? <ErrorBanner message={error} onDismiss={() => setError('')} /> : null}

              {/* Verified phone display */}
              {formattedPhone ? (
                <View style={styles.verifiedPhoneCard}>
                  <MaterialIcons name="whatsapp" size={18} color="#25D366" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.verifiedPhoneLabel}>WhatsApp Verified</Text>
                    <Text style={styles.verifiedPhoneNumber}>{formattedPhone}</Text>
                  </View>
                  <View style={styles.verifiedBadge}>
                    <MaterialIcons name="verified" size={14} color="#25D366" />
                    <Text style={styles.verifiedBadgeText}>Verified</Text>
                  </View>
                </View>
              ) : null}

              <View style={styles.form}>
                {/* Full name */}
                <View>
                  <Text style={styles.inputLabel}>Full Name *</Text>
                  <View style={styles.inputWrapper}>
                    <MaterialIcons name="person" size={18} color={Colors.textMuted} style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      placeholder="Your name"
                      placeholderTextColor={Colors.textMuted}
                      value={name}
                      onChangeText={setName}
                      autoCapitalize="words"
                      autoCorrect={false}
                      accessibilityLabel="Full name"
                    />
                  </View>
                </View>

                {/* Username */}
                <View>
                  <Text style={styles.inputLabel}>Username *</Text>
                  <View style={[styles.inputWrapper, usernameError ? styles.inputWrapperError : null]}>
                    <Text style={styles.atSign}>@</Text>
                    <TextInput
                      style={[styles.input, { flex: 1 }]}
                      placeholder="your_username"
                      placeholderTextColor={Colors.textMuted}
                      value={username}
                      onChangeText={(t) => {
                        setUsername(t.toLowerCase().replace(/[^a-z0-9_]/g, ''));
                        setUsernameError('');
                      }}
                      autoCapitalize="none"
                      autoCorrect={false}
                      maxLength={30}
                      accessibilityLabel="Username"
                    />
                    {checkingUsername ? (
                      <ActivityIndicator size="small" color={Colors.gold} style={{ marginRight: Spacing.sm }} />
                    ) : null}
                  </View>
                  {usernameError ? (
                    <Text style={styles.fieldError}>{usernameError}</Text>
                  ) : (
                    <Text style={styles.fieldHint}>Letters, numbers and underscores only. 3–30 characters.</Text>
                  )}
                </View>

                <Pressable
                  onPress={handleNameNext}
                  disabled={saving || checkingUsername}
                  style={({ pressed }) => [styles.mainBtn, pressed && { opacity: 0.85 }]}
                >
                  <LinearGradient
                    colors={[Colors.gold, Colors.goldDim]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.mainBtnInner}
                  >
                    <Text style={styles.mainBtnText}>Continue</Text>
                    <MaterialIcons name="arrow-forward" size={18} color={Colors.textOnGold} />
                  </LinearGradient>
                </Pressable>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </View>
    );
  }

  // ─── Step 2: Parish picker ─────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#001A0D', Colors.background, Colors.background]}
        style={StyleSheet.absoluteFillObject}
      />
      <SafeAreaView style={{ flex: 1 }}>
        <View style={[styles.scroll, { paddingBottom: insets.bottom + Spacing.xxl, flex: 1 }]}>
          {/* Logo */}
          <View style={styles.header}>
            <Pressable onPress={() => setStep('name_username')} hitSlop={12} style={{ alignSelf: 'flex-start' }}>
              <MaterialIcons name="arrow-back" size={24} color={Colors.textPrimary} />
            </Pressable>
            <View style={styles.logoRow}>
              <View style={styles.logoDot} />
              <Text style={styles.logoText}>VYBZ HUB</Text>
            </View>
            <Text style={styles.title}>{"Where are you based?"}</Text>
            <Text style={styles.subtitle}>{"We'll show you events close to you first."}</Text>
          </View>

          <StepDots total={2} current={1} />

          {error ? <ErrorBanner message={error} onDismiss={() => setError('')} /> : null}

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.parishGrid}>
            {PARISHES.map((p) => (
              <Pressable
                key={p}
                onPress={() => setParish(p)}
                style={({ pressed }) => [
                  styles.parishChip,
                  parish === p && styles.parishChipActive,
                  pressed && { opacity: 0.8 },
                ]}
              >
                <MaterialIcons
                  name="place"
                  size={14}
                  color={parish === p ? Colors.textOnGold : Colors.textSecondary}
                />
                <Text style={[styles.parishChipText, parish === p && styles.parishChipTextActive]}>
                  {p}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          <Pressable
            onPress={handleFinish}
            disabled={saving || !parish}
            style={({ pressed }) => [
              styles.mainBtn,
              { marginHorizontal: Spacing.base },
              (!parish || saving) && { opacity: 0.45 },
              pressed && { opacity: 0.85 },
            ]}
          >
            <LinearGradient
              colors={[Colors.gold, Colors.goldDim]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.mainBtnInner}
            >
              {saving ? (
                <ActivityIndicator size="small" color={Colors.textOnGold} />
              ) : (
                <MaterialIcons name="celebration" size={18} color={Colors.textOnGold} />
              )}
              <Text style={styles.mainBtnText}>{saving ? 'Saving...' : "Let's Go!"}</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: Spacing.base, gap: Spacing.lg },

  header: { paddingTop: Spacing.xl, gap: Spacing.sm, marginBottom: Spacing.sm },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  logoDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.gold },
  logoText: { fontSize: Typography.sm, fontWeight: '900', color: Colors.gold, letterSpacing: 3 },
  title: { fontSize: 26, fontWeight: '900', color: Colors.textPrimary, lineHeight: 32, marginTop: Spacing.sm },
  subtitle: { fontSize: Typography.base, color: Colors.textSecondary, lineHeight: 22 },

  verifiedPhoneCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: '#0A1A0F',
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: '#25D36633',
  },
  verifiedPhoneLabel: { fontSize: Typography.xs, color: Colors.textMuted, fontWeight: '500' },
  verifiedPhoneNumber: { fontSize: Typography.base, color: Colors.textPrimary, fontWeight: '700', marginTop: 2 },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#0A2A15',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#25D36644',
  },
  verifiedBadgeText: { fontSize: 11, color: '#25D366', fontWeight: '700' },

  form: { gap: Spacing.base },
  inputLabel: { fontSize: Typography.sm, color: Colors.textSecondary, fontWeight: '500', marginBottom: Spacing.xs },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1.5, borderColor: Colors.surfaceBorder, paddingHorizontal: Spacing.md,
    minHeight: 52,
  },
  inputWrapperError: { borderColor: Colors.error },
  inputIcon: { marginRight: Spacing.sm },
  atSign: {
    fontSize: Typography.base,
    color: Colors.textMuted,
    fontWeight: '600',
    marginRight: 2,
  },
  input: { flex: 1, height: 52, fontSize: Typography.base, color: Colors.textPrimary },
  fieldError: { fontSize: 11, color: Colors.error, marginTop: 4 },
  fieldHint: { fontSize: 11, color: Colors.textMuted, marginTop: 4 },

  mainBtn: { borderRadius: Radius.md, overflow: 'hidden', marginTop: Spacing.sm },
  mainBtnInner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, paddingVertical: Spacing.base + 2,
  },
  mainBtnText: { fontSize: Typography.md, fontWeight: '700', color: Colors.textOnGold },

  parishGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    paddingBottom: Spacing.lg,
  },
  parishChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderRadius: Radius.full, backgroundColor: Colors.surface,
    borderWidth: 1.5, borderColor: Colors.surfaceBorder,
  },
  parishChipActive: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  parishChipText: { fontSize: Typography.sm, color: Colors.textSecondary, fontWeight: '500' },
  parishChipTextActive: { color: Colors.textOnGold, fontWeight: '700' },
});
