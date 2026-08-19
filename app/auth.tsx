import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons, FontAwesome } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useAuth } from '../hooks/useAuth';
import { supabaseReady, clearPersistedSession, getSupabaseClient } from '../lib/supabase';
import { Colors, Typography, Spacing, Radius } from '../constants/theme';
import { SUPPORT_EMAIL } from '../constants/support';
import { LEGAL_URLS } from '../constants/legalUrls';
import { toTitleCase } from '../constants/textNormalization';
import { WHATSAPP_AUTH_ENABLED } from '../constants/featureFlags';
import { PhoneInput, validatePhone, parseE164 } from '../components/ui/PhoneInput';
import {
  getBiometricCapability,
  biometricLogin,
  enableBiometricLogin,
  clearBiometricCredentials,
  isBiometricEnabled,
} from '../services/biometricAuthService';

// ─── View states ──────────────────────────────────────────────────────────────
type LoginView =
  | 'entry'             // WhatsApp primary + "Continue with email"
  | 'whatsapp_phone'    // Phone number entry
  | 'whatsapp_otp'      // OTP verify
  | 'email_entry'       // Email field only
  | 'email_checking'    // Detecting existing vs new account
  | 'email_login'       // Password for existing account
  | 'email_register'    // Full signup for new account (no account found)
  | 'forgot'
  | 'reset_sent'
  | 'register_success';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const validateEmail = (email: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

/**
 * Checks whether an email already has a Vybz Hub account.
 * Uses the check-email-registered Edge Function (service-role backed, rate-limited).
 * Fails open (returns true) on network error to avoid blocking legitimate sign-in.
 */
async function checkEmailRegistered(email: string): Promise<boolean> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.functions.invoke('check-email-registered', {
      body: { email: email.trim().toLowerCase() },
    });
    if (error) return true; // fail open
    return !!(data as any)?.exists;
  } catch {
    return true; // fail open
  }
}

function getAuthErrorMessage(error: any): string {
  const msg = (error?.message ?? '').toLowerCase();
  if (msg.includes('invalid login credentials') || msg.includes('invalid credentials')) {
    return 'Incorrect email or password. Please try again.';
  }
  if (msg.includes('email not confirmed')) {
    return 'Please verify your email. Check your inbox for a confirmation link.';
  }
  if (msg.includes('user already registered') || msg.includes('already been registered') || msg.includes('already exists')) {
    return 'An account with this email already exists. Sign in instead.';
  }
  if (msg.includes('password should be at least') || msg.includes('password is too short')) {
    return 'Password must be at least 8 characters.';
  }
  if (msg.includes('unable to validate email') || msg.includes('invalid email')) {
    return 'Please enter a valid email address.';
  }
  if (msg.includes('invalid api key') || msg.includes('placeholder-key') || msg.includes('apikey') || msg.includes('jwt') || msg.includes('no api key')) {
    return 'Backend not configured: EXPO_PUBLIC_SUPABASE_ANON_KEY is missing. Check the .env file.';
  }
  if (msg.includes('rate limit') || msg.includes('too many requests') || msg.includes('email rate limit')) {
    return 'Too many attempts. Please wait a few minutes before trying again.';
  }
  if (msg.includes('context deadline') || msg.includes('request_timeout') || (error as any)?.status === 504 || (error as any)?.code === 'request_timeout') {
    return 'The server is taking too long to respond. Please wait a moment and try again.';
  }
  if (msg.includes('token has expired') || msg.includes('link is invalid')) {
    return 'This link has expired. Please request a new password reset.';
  }
  return `Something went wrong. Contact ${SUPPORT_EMAIL} for help.`;
}

function getPasswordStrength(pwd: string): { level: 0 | 1 | 2 | 3; label: string; color: string } {
  if (pwd.length === 0) return { level: 0, label: '', color: 'transparent' };
  if (pwd.length < 8) return { level: 1, label: 'Too short', color: Colors.error ?? '#FF4444' };
  const hasUpper = /[A-Z]/.test(pwd);
  const hasNum = /\d/.test(pwd);
  const hasSpecial = /[!@#$%^&*_\-+=]/.test(pwd);
  const score = [hasUpper, hasNum, hasSpecial].filter(Boolean).length;
  if (score === 0) return { level: 1, label: 'Weak', color: Colors.error ?? '#FF4444' };
  if (score === 1) return { level: 2, label: 'Fair', color: Colors.gold };
  return { level: 3, label: 'Strong', color: Colors.greenLight };
}

function PasswordStrengthBar({ password }: { password: string }) {
  const { level, label, color } = getPasswordStrength(password);
  if (password.length === 0) return null;
  return (
    <View style={strengthStyles.container}>
      <View style={strengthStyles.bars}>
        {[1, 2, 3].map((i) => (
          <View key={i} style={[strengthStyles.bar, { backgroundColor: i <= level ? color : Colors.surfaceBorder }]} />
        ))}
      </View>
      {label ? <Text style={[strengthStyles.label, { color }]}>{label}</Text> : null}
    </View>
  );
}
const strengthStyles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: 6 },
  bars: { flexDirection: 'row', gap: 4, flex: 1 },
  bar: { flex: 1, height: 4, borderRadius: 2 },
  label: { fontSize: 11, fontWeight: '600', minWidth: 44, textAlign: 'right' },
});

function ErrorBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <View style={errStyles.container}>
      <MaterialIcons name="error-outline" size={16} color={Colors.error ?? '#FF4444'} />
      <Text style={errStyles.text}>{message}</Text>
      <Pressable onPress={onDismiss} hitSlop={8}>
        <MaterialIcons name="close" size={16} color={Colors.textMuted} />
      </Pressable>
    </View>
  );
}
const errStyles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, backgroundColor: '#2A1010', borderRadius: Radius.md, borderWidth: 1, borderColor: '#FF444433', padding: Spacing.md },
  text: { flex: 1, fontSize: Typography.sm, color: '#FF7777', lineHeight: 19 },
});

function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={12} style={styles.backBtn}>
      <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
    </Pressable>
  );
}

// ─── Biometric Button ─────────────────────────────────────────────────────────
function BiometricButton({ label, iconName, onPress, loading }: { label: string; iconName: string; onPress: () => void; loading: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={loading} style={({ pressed }) => [bioStyles.btn, pressed && { opacity: 0.85 }]} accessibilityLabel={`Sign in with ${label}`}>
      {loading ? <ActivityIndicator size="small" color={Colors.gold} /> : <MaterialIcons name={iconName as any} size={22} color={Colors.gold} />}
      <View style={{ flex: 1 }}>
        <Text style={bioStyles.label}>Sign in with {label}</Text>
        <Text style={bioStyles.sub}>Use stored credentials</Text>
      </View>
      <MaterialIcons name="arrow-forward-ios" size={14} color={Colors.gold} />
    </Pressable>
  );
}
const bioStyles = StyleSheet.create({
  btn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.goldSurface, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1.5, borderColor: `${Colors.gold}44` },
  label: { fontSize: Typography.sm, fontWeight: '700', color: Colors.gold },
  sub: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 1 },
});

// ─── Shared layout shell ──────────────────────────────────────────────────────
function AuthShell({
  children,
  onBack,
  headline,
  subline,
  insets,
}: {
  children: React.ReactNode;
  onBack?: () => void;
  headline?: string;
  subline?: string;
  insets: { bottom: number };
}) {
  return (
    <View style={styles.container}>
      <LinearGradient colors={['#001A0D', Colors.background, Colors.background]} style={StyleSheet.absoluteFillObject} />
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <ScrollView
            contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + Spacing.xxl }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {onBack ? <BackButton onPress={onBack} /> : null}
            <View style={styles.header}>
              <View style={styles.logoRow}><View style={styles.logoDot} /><Text style={styles.logoText}>VYBZ HUB</Text></View>
              {headline ? <Text style={styles.tagline}>{headline}</Text> : null}
              {subline ? <Text style={styles.subline}>{subline}</Text> : null}
            </View>
            {children}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

// ─── Main Auth Screen ─────────────────────────────────────────────────────────
export default function Auth() {
  const {
    user,
    signUp,
    signInWithEmail,
    resetPassword,
    updatePassword,
    passwordRecoveryMode,
    refreshBiometricState,
    sendWhatsAppOtp,
    verifyWhatsAppOtp,
  } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();

  useEffect(() => {
    if (!user) return;
    if (returnTo) { router.replace(returnTo as any); return; }
    router.replace('/(tabs)' as any);
  }, [user, router, returnTo]);

  // ── View state ───────────────────────────────────────────────────────────
  const [view, setView] = useState<LoginView>('entry');
  const clearError = () => setError('');

  // ── Shared ───────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // ── WhatsApp state ───────────────────────────────────────────────────────
  const [waPhone, setWaPhone] = useState('');
  const [waOtpCode, setWaOtpCode] = useState('');
  const [waResendCooldown, setWaResendCooldown] = useState(0);
  const resendTimerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const startResendCooldown = (seconds: number) => {
    setWaResendCooldown(seconds);
    if (resendTimerRef.current) clearInterval(resendTimerRef.current);
    resendTimerRef.current = setInterval(() => {
      setWaResendCooldown((prev) => {
        if (prev <= 1) { if (resendTimerRef.current) clearInterval(resendTimerRef.current); return 0; }
        return prev - 1;
      });
    }, 1000);
  };
  React.useEffect(() => () => { if (resendTimerRef.current) clearInterval(resendTimerRef.current); }, []);

  // ── Email state ──────────────────────────────────────────────────────────
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  // Register extras
  const [name, setName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [regPhone, setRegPhone] = useState('');
  const [regPhoneError, setRegPhoneError] = useState('');
  const [selectedRoles, setSelectedRoles] = useState<string[]>(['attendee']);

  // Forgot password
  const [resetEmail, setResetEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showNew, setShowNew] = useState(false);

  // ── Biometric state ──────────────────────────────────────────────────────
  const [bioCap, setBioCap] = useState<{ available: boolean; label: string; iconName: string }>({ available: false, label: 'Biometrics', iconName: 'fingerprint' });
  const [bioEnabled, setBioEnabled] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [showBioOffer, setShowBioOffer] = useState(false);
  const [bioOfferLoading, setBioOfferLoading] = useState(false);

  useEffect(() => {
    getBiometricCapability().then((cap) => {
      setBioCap(cap);
      if (cap.available) isBiometricEnabled().then(setBioEnabled);
    });
  }, []);

  const offerBiometricIfAvailable = useCallback(async () => {
    const cap = await getBiometricCapability();
    if (!cap.available) return;
    const enabled = await isBiometricEnabled();
    if (enabled) return;
    setShowBioOffer(true);
  }, []);

  // ── WhatsApp handlers ─────────────────────────────────────────────────────
  const handleSendWhatsApp = async (isResend = false) => {
    clearError();
    const phone = waPhone.trim();
    if (!phone) { setError('Please enter your WhatsApp number.'); return; }
    setLoading(true);
    try {
      await sendWhatsAppOtp(phone);
      setView('whatsapp_otp');
      setWaOtpCode('');
      startResendCooldown(60);
    } catch (err: any) {
      const msg = (err?.message ?? '').toLowerCase();
      if (msg.includes('rate') || msg.includes('too many')) {
        setError('Too many attempts. Please wait a moment before trying again.');
        startResendCooldown(60);
      } else {
        setError('Could not send WhatsApp code. Please check your number and try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyWhatsApp = async () => {
    clearError();
    const digits = waOtpCode.replace(/\D/g, '');
    if (digits.length < 4) { setError('Please enter the full verification code.'); return; }
    setLoading(true);
    try {
      const result = await verifyWhatsAppOtp(waPhone.trim(), digits);
      if (result.isNewUser || result.needsEmail) {
        router.replace(result.needsEmail ? '/complete-profile?needsEmail=true' as any : '/complete-profile' as any);
        return;
      }
      // Existing complete user — onAuthStateChange navigates automatically
    } catch (err: any) {
      const msg = (err?.message ?? '').toLowerCase();
      if (msg.includes('invalid') || msg.includes('incorrect') || msg.includes('expired') || msg.includes('token')) {
        setError('That code is incorrect or has expired. Please try again.');
      } else {
        setError("We couldn't verify that code. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  // ── Email entry → detection → routing ────────────────────────────────────
  const handleEmailContinue = async () => {
    clearError();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) { setError('Please enter your email address.'); return; }
    if (!validateEmail(trimmed)) { setError('Please enter a valid email address.'); return; }
    setEmail(trimmed);

    // Show checking state, then detect and route
    setView('email_checking');
    try {
      const exists = await checkEmailRegistered(trimmed);
      if (exists) {
        // Existing account → password login
        setView('email_login');
      } else {
        // No account found → go directly to signup onboarding
        setView('email_register');
      }
    } catch {
      // On any error, default to login (fail open)
      setView('email_login');
    }
  };

  // ── Email login handler ───────────────────────────────────────────────────
  const handleLogin = async () => {
    clearError();
    if (!password.trim()) { setError('Please enter your password.'); return; }
    setLoading(true);
    try {
      await signInWithEmail(email.trim(), password);
      if (!rememberMe) await clearPersistedSession();
      void offerBiometricIfAvailable();
    } catch (err) {
      setError(getAuthErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // ── Biometric login ───────────────────────────────────────────────────────
  const handleBiometricLogin = async () => {
    if (biometricLoading) return;
    clearError();
    setBiometricLoading(true);
    try {
      const result = await biometricLogin(bioCap.label);
      if (result.cancelled) { setBiometricLoading(false); return; }
      if (!result.ok) {
        if (result.error?.includes('expired') || result.error?.includes('not found')) {
          setBioEnabled(false);
          await clearBiometricCredentials();
        }
        setError(result.error ?? 'Biometric authentication failed. Please use your password.');
      }
    } catch {
      setError('Biometric authentication failed. Please try again or use your password.');
    } finally {
      setBiometricLoading(false);
    }
  };

  // ── Email register handler ────────────────────────────────────────────────
  const handleRegister = async () => {
    clearError();
    setRegPhoneError('');
    if (!name.trim() || name.trim().length < 2) { setError('Please enter your full name (at least 2 characters).'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters long.'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match. Please try again.'); return; }
    const parsedPhone = parseE164(regPhone);
    if (!regPhone || parsedPhone.national.replace(/\D/g, '').length === 0) { setRegPhoneError('Phone number is required.'); return; }
    if (!validatePhone(parsedPhone.country, parsedPhone.national)) {
      const isJamaica = parsedPhone.country.code === 'JM876' || parsedPhone.country.code === 'JM658';
      setRegPhoneError(isJamaica ? 'Enter a valid Jamaica number (7 local digits after the area code).' : 'Please enter a valid phone number for the selected country.');
      return;
    }
    setLoading(true);
    try {
      await signUp(toTitleCase(name.trim()), email.trim(), password, selectedRoles, regPhone);
      setView('register_success');
    } catch (err) {
      setError(getAuthErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // ── Forgot / Reset password ───────────────────────────────────────────────
  const handleSendReset = async () => {
    clearError();
    if (!resetEmail.trim() || !validateEmail(resetEmail)) { setError('Please enter a valid email address.'); return; }
    setLoading(true);
    try { await resetPassword(resetEmail.trim()); setView('reset_sent'); }
    catch (err) { setError(getAuthErrorMessage(err)); }
    finally { setLoading(false); }
  };

  const handleUpdatePassword = async () => {
    clearError();
    if (newPassword.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (newPassword !== confirmNewPassword) { setError('Passwords do not match.'); return; }
    setLoading(true);
    try { await updatePassword(newPassword); }
    catch (err) { setError(getAuthErrorMessage(err)); }
    finally { setLoading(false); }
  };

  // ── Biometric offer ───────────────────────────────────────────────────────
  const handleEnableBiometric = async () => {
    setBioOfferLoading(true);
    try {
      const result = await enableBiometricLogin();
      if (result.ok) { setBioEnabled(true); await refreshBiometricState(); }
    } catch {}
    setBioOfferLoading(false);
    setShowBioOffer(false);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Password Recovery
  // ─────────────────────────────────────────────────────────────────────────
  if (passwordRecoveryMode) {
    return (
      <AuthShell headline="Set a new password." insets={insets}>
        {error ? <ErrorBanner message={error} onDismiss={clearError} /> : null}
        <View style={styles.form}>
          <View>
            <Text style={styles.inputLabel}>New Password</Text>
            <View style={styles.inputWrapper}>
              <MaterialIcons name="lock" size={18} color={Colors.textMuted} style={styles.inputIcon} />
              <TextInput style={[styles.input, { flex: 1 }]} placeholder="Min. 8 characters" placeholderTextColor={Colors.textMuted} value={newPassword} onChangeText={setNewPassword} secureTextEntry={!showNew} accessibilityLabel="New password" />
              <Pressable onPress={() => setShowNew(!showNew)} style={styles.eyeBtn}><MaterialIcons name={showNew ? 'visibility-off' : 'visibility'} size={18} color={Colors.textMuted} /></Pressable>
            </View>
            <PasswordStrengthBar password={newPassword} />
          </View>
          <View>
            <Text style={styles.inputLabel}>Confirm New Password</Text>
            <View style={styles.inputWrapper}>
              <MaterialIcons name="lock-outline" size={18} color={Colors.textMuted} style={styles.inputIcon} />
              <TextInput style={[styles.input, { flex: 1 }]} placeholder="Re-enter password" placeholderTextColor={Colors.textMuted} value={confirmNewPassword} onChangeText={setConfirmNewPassword} secureTextEntry accessibilityLabel="Confirm new password" />
            </View>
          </View>
          <Pressable onPress={handleUpdatePassword} disabled={loading} style={({ pressed }) => [styles.mainBtn, pressed && { opacity: 0.85 }]}>
            <LinearGradient colors={[Colors.gold, Colors.goldDim]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.mainBtnInner}>
              <MaterialIcons name="check-circle" size={18} color={Colors.textOnGold} />
              <Text style={styles.mainBtnText}>{loading ? 'Updating...' : 'Set New Password'}</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </AuthShell>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Register Success
  // ─────────────────────────────────────────────────────────────────────────
  if (view === 'register_success') {
    return (
      <View style={styles.container}>
        <LinearGradient colors={['#001A0D', Colors.background, Colors.background]} style={StyleSheet.absoluteFillObject} />
        <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl, gap: Spacing.lg }}>
          <View style={[styles.successIcon, { backgroundColor: Colors.greenSurface }]}>
            <MaterialIcons name="mark-email-unread" size={42} color={Colors.greenLight} />
          </View>
          <Text style={styles.successTitle}>Check your inbox!</Text>
          <Text style={styles.successSub}>
            We sent a verification email to{'\n'}
            <Text style={{ color: Colors.gold, fontWeight: '700' }}>{email}</Text>
            {'\n\n'}Click the link to activate your account and sign in.
          </Text>
          <Pressable onPress={() => { setView('email_login'); setPassword(''); }} style={({ pressed }) => [styles.mainBtn, { alignSelf: 'stretch' }, pressed && { opacity: 0.85 }]}>
            <LinearGradient colors={[Colors.gold, Colors.goldDim]} style={styles.mainBtnInner}>
              <Text style={styles.mainBtnText}>Back to Sign In</Text>
            </LinearGradient>
          </Pressable>
          <Pressable onPress={() => router.replace('/(tabs)')} style={styles.skipBtn}>
            <Text style={styles.skipText}>Browse without account</Text>
          </Pressable>
        </SafeAreaView>
      </View>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Reset Sent
  // ─────────────────────────────────────────────────────────────────────────
  if (view === 'reset_sent') {
    return (
      <View style={styles.container}>
        <LinearGradient colors={['#001A0D', Colors.background, Colors.background]} style={StyleSheet.absoluteFillObject} />
        <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl, gap: Spacing.lg }}>
          <View style={[styles.successIcon, { backgroundColor: Colors.goldSurface }]}>
            <MaterialIcons name="email" size={42} color={Colors.gold} />
          </View>
          <Text style={styles.successTitle}>Reset link sent!</Text>
          <Text style={styles.successSub}>
            Check your inbox at{'\n'}
            <Text style={{ color: Colors.gold, fontWeight: '700' }}>{resetEmail}</Text>
            {'\n\n'}Click the link to set a new password. Expires in 1 hour.
          </Text>
          <Pressable onPress={() => { setView('email_login'); setResetEmail(''); clearError(); }} style={({ pressed }) => [styles.mainBtn, { alignSelf: 'stretch' }, pressed && { opacity: 0.85 }]}>
            <LinearGradient colors={[Colors.gold, Colors.goldDim]} style={styles.mainBtnInner}>
              <Text style={styles.mainBtnText}>Back to Sign In</Text>
            </LinearGradient>
          </Pressable>
        </SafeAreaView>
      </View>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Forgot Password
  // ─────────────────────────────────────────────────────────────────────────
  if (view === 'forgot') {
    return (
      <AuthShell onBack={() => { setView('email_login'); clearError(); }} headline="Reset your password." insets={insets}>
        {error ? <ErrorBanner message={error} onDismiss={clearError} /> : null}
        <View style={styles.form}>
          <View style={styles.forgotInfo}>
            <MaterialIcons name="help-outline" size={18} color={Colors.gold} />
            <Text style={styles.forgotInfoText}>Enter your email and we will send a reset link.</Text>
          </View>
          <View>
            <Text style={styles.inputLabel}>Email Address</Text>
            <View style={styles.inputWrapper}>
              <MaterialIcons name="email" size={18} color={Colors.textMuted} style={styles.inputIcon} />
              <TextInput style={styles.input} placeholder="you@example.com" placeholderTextColor={Colors.textMuted} value={resetEmail} onChangeText={setResetEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} accessibilityLabel="Email for password reset" />
            </View>
          </View>
          <Pressable onPress={handleSendReset} disabled={loading} style={({ pressed }) => [styles.mainBtn, pressed && { opacity: 0.85 }]}>
            <LinearGradient colors={[Colors.gold, Colors.goldDim]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.mainBtnInner}>
              <MaterialIcons name="send" size={16} color={Colors.textOnGold} />
              <Text style={styles.mainBtnText}>{loading ? 'Sending...' : 'Send Reset Link'}</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </AuthShell>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // WhatsApp — Phone Entry
  // ─────────────────────────────────────────────────────────────────────────
  if (view === 'whatsapp_phone') {
    return (
      <AuthShell onBack={() => { setView('entry'); clearError(); }} headline="Continue with WhatsApp" insets={insets}>
        {error ? <ErrorBanner message={error} onDismiss={clearError} /> : null}
        <View style={styles.form}>
          <View style={waStyles.infoBox}>
            <FontAwesome name="whatsapp" size={18} color="#25D366" />
            <Text style={waStyles.infoText}>We will send a verification code to your WhatsApp.</Text>
          </View>
          <View>
            <Text style={styles.inputLabel}>WhatsApp Number</Text>
            <PhoneInput value={waPhone} onChange={(e164) => setWaPhone(e164)} placeholder="876 000 0000" disabled={loading} />
          </View>
          <Pressable onPress={() => handleSendWhatsApp(false)} disabled={loading} style={({ pressed }) => [waStyles.waBtn, pressed && { opacity: 0.85 }]}>
            <View style={waStyles.waBtnInner}>
              {loading ? <ActivityIndicator size="small" color="#25D366" /> : <MaterialIcons name="send" size={18} color="#25D366" />}
              <Text style={waStyles.waBtnText}>{loading ? 'Sending...' : 'Send Code'}</Text>
            </View>
          </Pressable>
        </View>
      </AuthShell>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // WhatsApp — OTP Verify
  // ─────────────────────────────────────────────────────────────────────────
  if (view === 'whatsapp_otp') {
    const formattedPhone = waPhone.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, '+1 ($1) $2-$3') || waPhone;
    return (
      <AuthShell onBack={() => { setView('whatsapp_phone'); setWaOtpCode(''); clearError(); }} headline="Verify your WhatsApp" insets={insets}>
        {error ? <ErrorBanner message={error} onDismiss={clearError} /> : null}
        <View style={styles.form}>
          <View style={waStyles.sentBox}>
            <FontAwesome name="whatsapp" size={20} color="#25D366" />
            <View style={{ flex: 1 }}>
              <Text style={waStyles.sentTitle}>Code sent via WhatsApp</Text>
              <Text style={waStyles.sentPhone}>{formattedPhone}</Text>
            </View>
          </View>

          <View>
            <Text style={styles.inputLabel}>Verification Code</Text>
            <View style={waStyles.otpRow}>
              {[0, 1, 2, 3, 4, 5].map((i) => {
                const digit = (waOtpCode.replace(/\D/g, ''))[i] ?? '';
                const isFocused = waOtpCode.replace(/\D/g, '').length === i;
                return (
                  <View key={i} style={[waStyles.otpBox, isFocused && waStyles.otpBoxFocused, digit ? waStyles.otpBoxFilled : null]}>
                    <Text style={waStyles.otpDigit}>{digit}</Text>
                  </View>
                );
              })}
              <TextInput
                style={waStyles.otpHiddenInput}
                value={waOtpCode}
                onChangeText={(t) => setWaOtpCode(t.replace(/\D/g, '').slice(0, 6))}
                keyboardType="number-pad"
                maxLength={6}
                autoFocus
                caretHidden
                accessibilityLabel="Verification code"
              />
            </View>
          </View>

          <Pressable
            onPress={handleVerifyWhatsApp}
            disabled={loading || waOtpCode.replace(/\D/g, '').length < 4}
            style={({ pressed }) => [waStyles.waBtn, (loading || waOtpCode.replace(/\D/g, '').length < 4) && { opacity: 0.5 }, pressed && { opacity: 0.85 }]}
          >
            <View style={waStyles.waBtnInner}>
              {loading ? <ActivityIndicator size="small" color="#25D366" /> : <MaterialIcons name="check-circle" size={18} color="#25D366" />}
              <Text style={waStyles.waBtnText}>{loading ? 'Verifying...' : 'Verify'}</Text>
            </View>
          </Pressable>

          <Pressable
            onPress={() => { clearError(); setWaOtpCode(''); void handleSendWhatsApp(true); }}
            disabled={waResendCooldown > 0 || loading}
            style={({ pressed }) => [waStyles.resendBtn, pressed && { opacity: 0.75 }]}
          >
            <Text style={[waStyles.resendText, waResendCooldown > 0 && { color: Colors.textMuted }]}>
              {waResendCooldown > 0 ? `Resend code in ${waResendCooldown}s` : 'Resend code'}
            </Text>
          </Pressable>

          <Pressable onPress={() => { setView('whatsapp_phone'); setWaOtpCode(''); clearError(); }} style={styles.backToLoginBtn}>
            <MaterialIcons name="arrow-back" size={16} color={Colors.textMuted} />
            <Text style={styles.backToLoginText}>Change number</Text>
          </Pressable>
        </View>
      </AuthShell>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Email — Entry (just email field) — vertically centered
  // ─────────────────────────────────────────────────────────────────────────
  if (view === 'email_entry') {
    return (
      <View style={styles.container}>
        {/* Faded background image — atmosphere layer */}
        <Image
          source={require('../assets/images/email-auth-bg.jpg')}
          style={StyleSheet.absoluteFillObject}
          contentFit="cover"
          transition={400}
        />
        {/* Dark overlay to preserve readability */}
        <View style={emailBgStyles.overlay} />
        {/* Green-tinted gradient on top of image for brand feel */}
        <LinearGradient
          colors={['rgba(0,10,5,0.82)', 'rgba(0,0,0,0.78)', 'rgba(0,0,0,0.88)']}
          style={StyleSheet.absoluteFillObject}
        />
        <SafeAreaView style={{ flex: 1 }}>
          {/* Back button at top, outside centered block */}
          <BackButton onPress={() => { setView('entry'); clearError(); }} />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <ScrollView
              contentContainerStyle={[styles.emailEntryScroll, { paddingBottom: insets.bottom + Spacing.xxl }]}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.emailEntryCenter}>
                {/* Brand + headline */}
                <View style={styles.emailEntryHero}>
                  <View style={styles.logoRow}>
                    <View style={styles.logoDot} />
                    <Text style={styles.logoText}>VYBZ HUB</Text>
                  </View>
                  <Text style={[styles.tagline, { textAlign: 'center' }]}>{"What's your email?"}</Text>
                  <Text style={[styles.subline, { textAlign: 'center' }]}>Enter your email to continue.</Text>
                </View>

                {!supabaseReady && (
                  <View style={configWarnStyles.box}>
                    <MaterialIcons name="warning" size={16} color="#FF9800" />
                    <Text style={configWarnStyles.text}>{'EXPO_PUBLIC_SUPABASE_ANON_KEY is not set.\nCopy the "anon / public" key from\nSupabase Dashboard → Project Settings → API.'}</Text>
                  </View>
                )}
                {error ? <ErrorBanner message={error} onDismiss={clearError} /> : null}

                <View style={styles.form}>
                  <View>
                    <Text style={styles.inputLabel}>Email Address</Text>
                    <View style={styles.inputWrapper}>
                      <MaterialIcons name="email" size={18} color={Colors.textMuted} style={styles.inputIcon} />
                      <TextInput
                        style={styles.input}
                        placeholder="you@example.com"
                        placeholderTextColor={Colors.textMuted}
                        value={email}
                        onChangeText={(t) => { setEmail(t); clearError(); }}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoCorrect={false}
                        returnKeyType="done"
                        onSubmitEditing={handleEmailContinue}
                        autoFocus
                        accessibilityLabel="Email address"
                      />
                    </View>
                  </View>

                  <Pressable onPress={handleEmailContinue} disabled={loading} style={({ pressed }) => [styles.mainBtn, pressed && { opacity: 0.85 }]}>
                    <LinearGradient colors={[Colors.gold, Colors.goldDim]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.mainBtnInner}>
                      <Text style={styles.mainBtnText}>Continue</Text>
                      <MaterialIcons name="arrow-forward" size={18} color={Colors.textOnGold} />
                    </LinearGradient>
                  </Pressable>
                </View>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </View>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Email — Checking (account detection in progress)
  // ─────────────────────────────────────────────────────────────────────────
  if (view === 'email_checking') {
    return (
      <View style={styles.container}>
        <LinearGradient colors={['#001A0D', Colors.background, Colors.background]} style={StyleSheet.absoluteFillObject} />
        <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.lg, paddingHorizontal: Spacing.xl }}>
          <View style={styles.logoRow}>
            <View style={styles.logoDot} />
            <Text style={styles.logoText}>VYBZ HUB</Text>
          </View>
          <ActivityIndicator size="large" color={Colors.gold} />
          <Text style={styles.checkingText}>Checking your account…</Text>
          <Text style={styles.checkingEmail}>{email}</Text>
        </SafeAreaView>
      </View>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Email — Login (password for existing account)
  // ─────────────────────────────────────────────────────────────────────────
  if (view === 'email_login') {
    return (
      <AuthShell
        onBack={() => { setView('email_entry'); clearError(); setPassword(''); }}
        headline="Welcome back."
        subline={email}
        insets={insets}
      >
        {error ? <ErrorBanner message={error} onDismiss={clearError} /> : null}

        {/* Biometric quick-login */}
        {showBioOffer && bioCap.available && (
          <View style={offerStyles.card}>
            <View style={offerStyles.iconWrap}><MaterialIcons name={bioCap.iconName as any} size={28} color={Colors.gold} /></View>
            <View style={{ flex: 1 }}>
              <Text style={offerStyles.title}>Enable {bioCap.label}?</Text>
              <Text style={offerStyles.sub}>Sign in faster next time.</Text>
            </View>
            <View style={offerStyles.btns}>
              <Pressable onPress={handleEnableBiometric} disabled={bioOfferLoading} style={({ pressed }) => [offerStyles.enableBtn, pressed && { opacity: 0.85 }]}>
                {bioOfferLoading ? <ActivityIndicator size="small" color={Colors.textOnGold} /> : <Text style={offerStyles.enableBtnText}>Enable</Text>}
              </Pressable>
              <Pressable onPress={() => setShowBioOffer(false)} style={offerStyles.notNowBtn}><Text style={offerStyles.notNowText}>Not Now</Text></Pressable>
            </View>
          </View>
        )}

        {bioEnabled && bioCap.available && !showBioOffer && (
          <BiometricButton label={bioCap.label} iconName={bioCap.iconName} onPress={handleBiometricLogin} loading={biometricLoading} />
        )}

        <View style={styles.form}>
          {/* Email locked display */}
          <Pressable onPress={() => { setView('email_entry'); setPassword(''); clearError(); }} style={styles.emailLockRow}>
            <MaterialIcons name="email" size={16} color={Colors.textMuted} />
            <Text style={styles.emailLockText}>{email}</Text>
            <MaterialIcons name="edit" size={14} color={Colors.gold} />
          </Pressable>

          <View>
            <Text style={styles.inputLabel}>Password</Text>
            <View style={styles.inputWrapper}>
              <MaterialIcons name="lock" size={18} color={Colors.textMuted} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="Enter password"
                placeholderTextColor={Colors.textMuted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                returnKeyType="go"
                onSubmitEditing={handleLogin}
                autoFocus
                accessibilityLabel="Password"
              />
              <Pressable onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                <MaterialIcons name={showPassword ? 'visibility-off' : 'visibility'} size={18} color={Colors.textMuted} />
              </Pressable>
            </View>
          </View>

          <View style={styles.rememberForgotRow}>
            <Pressable onPress={() => setRememberMe(!rememberMe)} style={styles.rememberRow} accessibilityRole="checkbox" accessibilityState={{ checked: rememberMe }}>
              <View style={[styles.checkbox, rememberMe && styles.checkboxActive]}>
                {rememberMe && <MaterialIcons name="check" size={12} color={Colors.textOnGold} />}
              </View>
              <Text style={styles.rememberText}>Remember me</Text>
            </Pressable>
            <Pressable onPress={() => { setView('forgot'); setResetEmail(email); clearError(); }} style={styles.forgotBtn}>
              <Text style={styles.forgotBtnText}>Forgot password?</Text>
            </Pressable>
          </View>

          <Pressable onPress={handleLogin} disabled={loading} style={({ pressed }) => [styles.mainBtn, pressed && { opacity: 0.85 }]}>
            <LinearGradient colors={[Colors.gold, Colors.goldDim]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.mainBtnInner}>
              {loading ? <ActivityIndicator size="small" color={Colors.textOnGold} /> : null}
              <Text style={styles.mainBtnText}>{loading ? 'Signing in...' : 'Sign In'}</Text>
            </LinearGradient>
          </Pressable>

          {bioEnabled && (
            <Pressable onPress={() => { setBioEnabled(false); void clearBiometricCredentials(); }} style={styles.switchAccountBtn}>
              <MaterialIcons name="switch-account" size={14} color={Colors.textMuted} />
              <Text style={styles.switchAccountText}>Sign in with a different account</Text>
            </Pressable>
          )}
        </View>
      </AuthShell>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Email — Register (new account — no account was found for this email)
  // ─────────────────────────────────────────────────────────────────────────
  if (view === 'email_register') {
    return (
      <AuthShell
        onBack={() => { setView('email_entry'); clearError(); setPassword(''); setConfirmPassword(''); setName(''); }}
        headline="Create your account."
        subline="Join the island's event scene."
        insets={insets}
      >
        {error ? <ErrorBanner message={error} onDismiss={clearError} /> : null}
        <View style={styles.form}>
          {/* Email locked */}
          <Pressable onPress={() => { setView('email_entry'); setPassword(''); clearError(); }} style={styles.emailLockRow}>
            <MaterialIcons name="email" size={16} color={Colors.textMuted} />
            <Text style={styles.emailLockText}>{email}</Text>
            <MaterialIcons name="edit" size={14} color={Colors.gold} />
          </Pressable>

          {/* Roles */}
          <View>
            <Text style={styles.inputLabel}>I want to... *</Text>
            <View style={styles.roleRow}>
              {([
                { key: 'attendee', icon: 'person', label: 'Attend Events' },
                { key: 'promoter', icon: 'campaign', label: 'Promote Events' },
              ] as const).map(({ key, icon, label }) => {
                const active = selectedRoles.includes(key);
                return (
                  <Pressable key={key}
                    onPress={() => setSelectedRoles((prev) => { if (active && prev.length === 1) return prev; return active ? prev.filter((r) => r !== key) : [...prev, key]; })}
                    style={({ pressed }) => [styles.roleBtn, active && styles.roleBtnActive, pressed && { opacity: 0.8 }]}
                  >
                    <MaterialIcons name={icon as any} size={20} color={active ? Colors.textOnGold : Colors.textMuted} />
                    <Text style={[styles.roleBtnText, active && styles.roleBtnTextActive]}>{label}</Text>
                    {active && <MaterialIcons name="check-circle" size={14} color={Colors.textOnGold} />}
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.roleHint}>You can select both. Roles can be changed later.</Text>
          </View>

          <View>
            <Text style={styles.inputLabel}>Full Name *</Text>
            <View style={styles.inputWrapper}>
              <MaterialIcons name="person" size={18} color={Colors.textMuted} style={styles.inputIcon} />
              <TextInput style={styles.input} placeholder="Your name" placeholderTextColor={Colors.textMuted} value={name} onChangeText={setName} autoCapitalize="words" autoCorrect={false} accessibilityLabel="Full name" />
            </View>
          </View>

          <View>
            <Text style={styles.inputLabel}>Password *</Text>
            <View style={styles.inputWrapper}>
              <MaterialIcons name="lock" size={18} color={Colors.textMuted} style={styles.inputIcon} />
              <TextInput style={[styles.input, { flex: 1 }]} placeholder="Min. 8 characters" placeholderTextColor={Colors.textMuted} value={password} onChangeText={setPassword} secureTextEntry={!showPassword} accessibilityLabel="Password" />
              <Pressable onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                <MaterialIcons name={showPassword ? 'visibility-off' : 'visibility'} size={18} color={Colors.textMuted} />
              </Pressable>
            </View>
            <PasswordStrengthBar password={password} />
          </View>

          <View>
            <Text style={styles.inputLabel}>Confirm Password *</Text>
            <View style={styles.inputWrapper}>
              <MaterialIcons name="lock-outline" size={18} color={Colors.textMuted} style={styles.inputIcon} />
              <TextInput style={[styles.input, { flex: 1 }]} placeholder="Re-enter password" placeholderTextColor={Colors.textMuted} value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry={!showConfirm} accessibilityLabel="Confirm password" />
              <Pressable onPress={() => setShowConfirm(!showConfirm)} style={styles.eyeBtn}>
                <MaterialIcons name={showConfirm ? 'visibility-off' : 'visibility'} size={18} color={Colors.textMuted} />
              </Pressable>
            </View>
            {confirmPassword.length > 0 && password !== confirmPassword && (
              <Text style={styles.mismatchText}>Passwords do not match</Text>
            )}
          </View>

          <View>
            <Text style={styles.inputLabel}>Phone Number *</Text>
            <PhoneInput value={regPhone} onChange={(e164) => { setRegPhone(e164); setRegPhoneError(''); }} error={regPhoneError} placeholder="876 000 0000" />
          </View>

          <Pressable onPress={handleRegister} disabled={loading} style={({ pressed }) => [styles.mainBtn, pressed && { opacity: 0.85 }]}>
            <LinearGradient colors={[Colors.gold, Colors.goldDim]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.mainBtnInner}>
              {loading ? <ActivityIndicator size="small" color={Colors.textOnGold} /> : <MaterialIcons name="how-to-reg" size={18} color={Colors.textOnGold} />}
              <Text style={styles.mainBtnText}>{loading ? 'Creating account...' : 'Create Account'}</Text>
            </LinearGradient>
          </Pressable>

          <Text style={styles.termsText}>
            By creating an account you agree to our{' '}
            <Text style={styles.termsLink} onPress={() => Linking.openURL(LEGAL_URLS.terms)}>Terms of Use</Text>
            {' '}and{' '}
            <Text style={styles.termsLink} onPress={() => Linking.openURL(LEGAL_URLS.privacy)}>Privacy Policy</Text>.
          </Text>
        </View>
      </AuthShell>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ENTRY — Primary screen (WhatsApp + email only)
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <LinearGradient colors={['#001A0D', Colors.background, Colors.background]} style={StyleSheet.absoluteFillObject} />
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={{ flex: 1 }}>
            {/* ── Centered composition ── */}
            <View style={styles.entryCenter}>
              <ScrollView
                contentContainerStyle={styles.entryCenterScroll}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {/* Brand + headline */}
                <View style={styles.entryHero}>
                  <View style={styles.logoRow}>
                    <View style={styles.logoDot} />
                    <Text style={styles.logoText}>VYBZ HUB</Text>
                  </View>
                  <Text style={styles.entryHeadline}>Find your vybz.</Text>
                  <Text style={styles.entrySubline}>
                    Discover events and businesses across Jamaica.
                  </Text>
                </View>

                {/* Dancing people */}
                <DancingPeople />

                {/* CTA area */}
                <View style={styles.entryCtaBlock}>
                  {WHATSAPP_AUTH_ENABLED && (
                    <Pressable
                      onPress={() => { clearError(); setWaPhone(''); setView('whatsapp_phone'); }}
                      style={({ pressed }) => [waStyles.waBtn, pressed && { opacity: 0.88 }]}
                      accessibilityLabel="Continue with WhatsApp"
                    >
                      <View style={waStyles.waBtnInner}>
                        <FontAwesome name="whatsapp" size={22} color="#25D366" />
                        <Text style={[waStyles.waBtnText, { fontSize: Typography.md }]}>Continue with WhatsApp</Text>
                      </View>
                    </Pressable>
                  )}

                  <View style={styles.dividerRow}>
                    <View style={styles.dividerLine} />
                    <Text style={styles.dividerText}>OR</Text>
                    <View style={styles.dividerLine} />
                  </View>

                  <Pressable
                    onPress={() => { clearError(); setEmail(''); setView('email_entry'); }}
                    style={({ pressed }) => [styles.emailEntryBtn, pressed && { opacity: 0.85 }]}
                    accessibilityLabel="Continue with email"
                  >
                    <MaterialIcons name="email" size={18} color={Colors.textSecondary} />
                    <Text style={styles.emailEntryBtnText}>Continue with email</Text>
                  </Pressable>

                  {error ? <ErrorBanner message={error} onDismiss={clearError} /> : null}
                </View>
              </ScrollView>
            </View>

            {/* ── Footer — separate from centered block ── */}
            <View style={[styles.entryFooter, { paddingBottom: insets.bottom + Spacing.md }]}>
              <Pressable onPress={() => router.replace('/(tabs)')} style={styles.skipBtn}>
                <Text style={styles.skipText}>Browse without account</Text>
              </Pressable>
              <View style={styles.legalFooterRow}>
                <Pressable onPress={() => Linking.openURL(LEGAL_URLS.privacy)} hitSlop={8}>
                  <Text style={styles.legalFooterLink}>Privacy Policy</Text>
                </Pressable>
                <Text style={styles.legalFooterDot}>·</Text>
                <Pressable onPress={() => Linking.openURL(LEGAL_URLS.terms)} hitSlop={8}>
                  <Text style={styles.legalFooterLink}>Terms of Use</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

// ─── WhatsApp styles ──────────────────────────────────────────────────────────
const waStyles = StyleSheet.create({
  waBtn: { borderRadius: Radius.md, backgroundColor: '#0A1A0F', borderWidth: 1.5, borderColor: '#25D366' },
  waBtnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingVertical: Spacing.base + 2 },
  waBtnText: { fontSize: Typography.md, fontWeight: '700', color: '#25D366' },
  infoBox: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, backgroundColor: '#0A1A0A', borderRadius: Radius.md, padding: Spacing.md, borderWidth: 1, borderColor: '#25D36633' },
  infoText: { flex: 1, fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 20 },
  sentBox: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: '#0A1A0A', borderRadius: Radius.md, padding: Spacing.md, borderWidth: 1, borderColor: '#25D36633' },
  sentTitle: { fontSize: Typography.sm, color: Colors.textSecondary, fontWeight: '500' },
  sentPhone: { fontSize: Typography.base, color: Colors.textPrimary, fontWeight: '700', marginTop: 2 },
  otpRow: { flexDirection: 'row', gap: Spacing.sm, justifyContent: 'center', position: 'relative', paddingVertical: Spacing.xs },
  otpBox: { width: 46, height: 56, borderRadius: Radius.md, borderWidth: 2, borderColor: Colors.surfaceBorder, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  otpBoxFocused: { borderColor: '#25D366' },
  otpBoxFilled: { borderColor: Colors.gold, backgroundColor: Colors.goldSurface },
  otpDigit: { fontSize: 22, fontWeight: '700', color: Colors.textPrimary },
  otpHiddenInput: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0, fontSize: 1 },
  resendBtn: { alignSelf: 'center', paddingVertical: Spacing.sm },
  resendText: { fontSize: Typography.sm, color: '#25D366', fontWeight: '600', textDecorationLine: 'underline' },
});

// ─── Email entry background styles ──────────────────────────────────────────
const emailBgStyles = StyleSheet.create({
  // Deep semi-transparent overlay so the image reads as atmosphere, not content
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 8, 4, 0.55)',
  },
});

// ─── Config warn ──────────────────────────────────────────────────────────────
const configWarnStyles = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, backgroundColor: '#1A1000', borderRadius: Radius.md, borderWidth: 1, borderColor: '#FF980044', padding: Spacing.md },
  text: { flex: 1, fontSize: Typography.xs, color: '#FFB74D', lineHeight: 18 },
});

// ─── Biometric offer card ─────────────────────────────────────────────────────
const offerStyles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.goldSurface, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1.5, borderColor: `${Colors.gold}44` },
  iconWrap: { width: 50, height: 50, borderRadius: 25, backgroundColor: `${Colors.gold}18`, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  title: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.gold },
  sub: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2 },
  btns: { gap: Spacing.xs },
  enableBtn: { backgroundColor: Colors.gold, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: 7, alignItems: 'center', minWidth: 70 },
  enableBtnText: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textOnGold },
  notNowBtn: { paddingVertical: 6, alignItems: 'center' },
  notNowText: { fontSize: Typography.xs, color: Colors.textMuted },
});

// ─── Dancing People Animation ─────────────────────────────────────────────────
function DancingPeople() {
  const dancers = [
    { delay: 0,   color: Colors.gold,        scale: 1.0 },
    { delay: 150, color: Colors.textMuted,   scale: 0.85 },
    { delay: 80,  color: Colors.gold,        scale: 0.92 },
    { delay: 220, color: Colors.textMuted,   scale: 1.0 },
    { delay: 40,  color: `${Colors.gold}99`, scale: 0.88 },
  ];
  return (
    <View style={dancerStyles.wrap}>
      {dancers.map((d, i) => (
        <Dancer key={i} delay={d.delay} color={d.color} scale={d.scale} index={i} />
      ))}
    </View>
  );
}

function Dancer({ delay, color, scale, index }: { delay: number; color: string; scale: number; index: number }) {
  const bounce = useSharedValue(0);
  const tilt   = useSharedValue(0);
  const armL   = useSharedValue(0);
  const armR   = useSharedValue(0);

  useEffect(() => {
    const dir = index % 2 === 0 ? 1 : -1;
    bounce.value = withDelay(delay, withRepeat(withSequence(withTiming(-10 * scale, { duration: 300, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 300, easing: Easing.in(Easing.quad) })), -1, false));
    tilt.value   = withDelay(delay, withRepeat(withSequence(withTiming(dir * 12, { duration: 300 }), withTiming(-dir * 12, { duration: 300 })), -1, false));
    armL.value   = withDelay(delay, withRepeat(withSequence(withTiming(-40, { duration: 280 }), withTiming(10, { duration: 280 })), -1, false));
    armR.value   = withDelay(delay + 140, withRepeat(withSequence(withTiming(40, { duration: 280 }), withTiming(-10, { duration: 280 })), -1, false));
  }, [bounce, tilt, armL, armR, delay, index, scale]);

  const bodyStyle = useAnimatedStyle(() => ({ transform: [{ translateY: bounce.value }, { rotate: `${tilt.value}deg` }] }));
  const armLStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${armL.value}deg` }] }));
  const armRStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${armR.value}deg` }] }));
  const s = scale;

  return (
    <Animated.View style={[dancerStyles.figure, bodyStyle]}>
      <View style={[dancerStyles.head, { width: 14 * s, height: 14 * s, borderRadius: 7 * s, backgroundColor: color }]} />
      <View style={dancerStyles.torsoRow}>
        <Animated.View style={[dancerStyles.arm, armLStyle, { width: 5 * s, height: 18 * s, borderRadius: 3 * s, backgroundColor: color, transformOrigin: 'top center' }]} />
        <View style={[dancerStyles.torso, { width: 12 * s, height: 22 * s, borderRadius: 4 * s, backgroundColor: color }]} />
        <Animated.View style={[dancerStyles.arm, armRStyle, { width: 5 * s, height: 18 * s, borderRadius: 3 * s, backgroundColor: color, transformOrigin: 'top center' }]} />
      </View>
      <View style={dancerStyles.legsRow}>
        <View style={[dancerStyles.leg, { width: 5 * s, height: 20 * s, borderRadius: 3 * s, backgroundColor: color, marginRight: 2 * s }]} />
        <View style={[dancerStyles.leg, { width: 5 * s, height: 20 * s, borderRadius: 3 * s, backgroundColor: color }]} />
      </View>
    </Animated.View>
  );
}

const dancerStyles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: Spacing.md, paddingVertical: Spacing.lg, opacity: 0.45 },
  figure: { alignItems: 'center', gap: 2 },
  head: {},
  torsoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 2 },
  arm: {},
  torso: {},
  legsRow: { flexDirection: 'row' },
  leg: {},
});

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: Spacing.base, gap: Spacing.lg },

  // Entry screen
  entryCenter: { flex: 1 },
  entryCenterScroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: Spacing.base, paddingVertical: Spacing.xl },
  entryHero: { gap: 8, alignItems: 'center', marginBottom: 24 },
  entryHeadline: { fontSize: 38, fontWeight: '900', color: Colors.textPrimary, textAlign: 'center', lineHeight: 44 },
  entrySubline: { fontSize: Typography.base, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  entryCtaBlock: { gap: Spacing.md, marginTop: 24 },
  entryFooter: { paddingHorizontal: Spacing.base, gap: Spacing.sm, alignItems: 'center' },

  // Email entry (vertically centered)
  emailEntryScroll: { flexGrow: 1, paddingHorizontal: Spacing.base },
  emailEntryCenter: { flex: 1, justifyContent: 'center', gap: Spacing.lg, minHeight: 300 },
  emailEntryHero: { gap: Spacing.sm, alignItems: 'center' },

  header: { paddingTop: Spacing.xl, gap: Spacing.sm },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  logoDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.gold },
  logoText: { fontSize: Typography.sm, fontWeight: '900', color: Colors.gold, letterSpacing: 3 },
  tagline: { fontSize: 26, fontWeight: '900', color: Colors.textPrimary, lineHeight: 32, marginTop: Spacing.sm },
  subline: { fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 20 },

  backBtn: { marginBottom: Spacing.sm, alignSelf: 'flex-start', paddingHorizontal: Spacing.base, paddingTop: Spacing.xs },

  form: { gap: Spacing.base },
  inputLabel: { fontSize: Typography.sm, color: Colors.textSecondary, fontWeight: '500', marginBottom: Spacing.xs },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.surfaceBorder, paddingHorizontal: Spacing.md },
  inputIcon: { marginRight: Spacing.sm },
  input: { flex: 1, height: 52, fontSize: Typography.base, color: Colors.textPrimary },
  eyeBtn: { padding: Spacing.xs },
  mismatchText: { fontSize: 11, color: Colors.error ?? '#FF4444', marginTop: 4 },

  emailLockRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, padding: Spacing.md, borderWidth: 1, borderColor: Colors.surfaceBorder },
  emailLockText: { flex: 1, fontSize: Typography.sm, color: Colors.textSecondary },

  emailEntryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, borderRadius: Radius.md, paddingVertical: Spacing.base + 2, backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.surfaceBorder },
  emailEntryBtnText: { fontSize: Typography.md, fontWeight: '600', color: Colors.textSecondary },

  rememberForgotRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rememberRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  checkbox: { width: 20, height: 20, borderRadius: 4, borderWidth: 1.5, borderColor: Colors.surfaceBorder, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surfaceElevated },
  checkboxActive: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  rememberText: { fontSize: Typography.sm, color: Colors.textSecondary },

  forgotBtn: { paddingVertical: 2 },
  forgotBtnText: { fontSize: Typography.sm, color: Colors.gold, fontWeight: '500' },

  mainBtn: { borderRadius: Radius.md, overflow: 'hidden', marginTop: Spacing.xs },
  mainBtnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingVertical: Spacing.base + 2 },
  mainBtnText: { fontSize: Typography.md, fontWeight: '700', color: Colors.textOnGold },

  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.surfaceBorder },
  dividerText: { fontSize: Typography.sm, color: Colors.textMuted },

  switchAccountBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, alignSelf: 'center', paddingVertical: Spacing.xs },
  switchAccountText: { fontSize: Typography.xs, color: Colors.textMuted, textDecorationLine: 'underline' },

  forgotInfo: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, backgroundColor: Colors.goldSurface, padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1, borderColor: `${Colors.gold}33` },
  forgotInfoText: { flex: 1, fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 20 },

  backToLoginBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, alignSelf: 'center', paddingVertical: Spacing.sm },
  backToLoginText: { fontSize: Typography.sm, color: Colors.textMuted },

  termsText: { fontSize: Typography.xs, color: Colors.textMuted, textAlign: 'center', lineHeight: 18 },
  termsLink: { fontSize: Typography.xs, color: Colors.gold, lineHeight: 18, textDecorationLine: 'underline' },

  skipBtn: { alignItems: 'center', paddingVertical: Spacing.sm },
  skipText: { fontSize: Typography.sm, color: Colors.textMuted, textDecorationLine: 'underline' },

  legalFooterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingTop: Spacing.xs },
  legalFooterLink: { fontSize: 11, color: Colors.textMuted, textDecorationLine: 'underline' },
  legalFooterDot: { fontSize: 11, color: Colors.textMuted },

  roleRow: { flexDirection: 'row', gap: Spacing.sm },
  roleBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.xs, paddingVertical: Spacing.md, borderRadius: Radius.md, backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.surfaceBorder },
  roleBtnActive: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  roleBtnText: { fontSize: Typography.sm, color: Colors.textMuted, fontWeight: '600' as const },
  roleBtnTextActive: { color: Colors.textOnGold, fontWeight: '700' as const },
  roleHint: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 4 },

  successIcon: { width: 90, height: 90, borderRadius: 45, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: Colors.surfaceBorder },
  successTitle: { fontSize: 24, fontWeight: '900', color: Colors.textPrimary, textAlign: 'center' },
  successSub: { fontSize: Typography.base, color: Colors.textSecondary, textAlign: 'center', lineHeight: 24 },

  // Email checking / account detection
  checkingText: { fontSize: Typography.base, color: Colors.textSecondary, fontWeight: '500' },
  checkingEmail: { fontSize: Typography.sm, color: Colors.gold, fontWeight: '700' },
});
