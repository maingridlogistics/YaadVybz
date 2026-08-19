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
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../hooks/useAuth';
import { supabaseReady, clearPersistedSession } from '../lib/supabase';
import { Colors, Typography, Spacing, Radius } from '../constants/theme';
import { SUPPORT_EMAIL } from '../constants/support';
import { LEGAL_URLS } from '../constants/legalUrls';
import { toTitleCase } from '../constants/textNormalization';
import { PHONE_AUTH_ENABLED, WHATSAPP_AUTH_ENABLED } from '../constants/featureFlags';
import { PhoneInput, validatePhone, parseE164 } from '../components/ui/PhoneInput';
import {
  getBiometricCapability,
  biometricLogin,
  enableBiometricLogin,
  clearBiometricCredentials,
  isBiometricEnabled,
} from '../services/biometricAuthService';
import { sendWhatsAppOtp, verifyWhatsAppOtp } from '../services/authService';

type AuthTab = 'login' | 'register';
type LoginView = 'form' | 'forgot' | 'reset_sent' | 'whatsapp_phone' | 'whatsapp_otp';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const validateEmail = (email: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

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
  if (msg.includes('phone auth') || msg.includes('twilio') || msg.includes('sms')) {
    return 'Phone sign-in is not yet configured. Please use email instead.';
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

const configWarnStyles = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, backgroundColor: '#1A1000', borderRadius: Radius.md, borderWidth: 1, borderColor: '#FF980044', padding: Spacing.md },
  text: { flex: 1, fontSize: Typography.xs, color: '#FFB74D', lineHeight: 18 },
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

// ─── Biometric Sign-In Button ─────────────────────────────────────────────────
function BiometricButton({
  label,
  iconName,
  onPress,
  loading,
}: {
  label: string;
  iconName: string;
  onPress: () => void;
  loading: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      style={({ pressed }) => [bioStyles.btn, pressed && { opacity: 0.85 }]}
      accessibilityLabel={`Sign in with ${label}`}
    >
      {loading
        ? <ActivityIndicator size="small" color={Colors.gold} />
        : <MaterialIcons name={iconName as any} size={22} color={Colors.gold} />}
      <View style={{ flex: 1 }}>
        <Text style={bioStyles.label}>Sign in with {label}</Text>
        <Text style={bioStyles.sub}>Use stored credentials</Text>
      </View>
      <MaterialIcons name="arrow-forward-ios" size={14} color={Colors.gold} />
    </Pressable>
  );
}

const bioStyles = StyleSheet.create({
  btn: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.goldSurface, borderRadius: Radius.lg, padding: Spacing.md,
    borderWidth: 1.5, borderColor: `${Colors.gold}44`,
  },
  label: { fontSize: Typography.sm, fontWeight: '700', color: Colors.gold },
  sub: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 1 },
});

// ─── Main Auth Screen ─────────────────────────────────────────────────────────
export default function Auth() {
  const {
    user,
    signUp,
    signInWithEmail,
    signInWithPhone,
    verifyOTP,
    resetPassword,
    updatePassword,
    passwordRecoveryMode,
    refreshBiometricState,
  } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();

  useEffect(() => {
    if (!user) return;
    if (returnTo) { router.replace(returnTo as any); return; }
    router.replace('/(tabs)' as any);
  }, [user, router, returnTo]);

  // ── Form state ──────────────────────────────────────────────────────
  const [tab, setTab] = useState<AuthTab>('login');
  const [loginView, setLoginView] = useState<LoginView>('form');
  const [registerSuccess, setRegisterSuccess] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regPhoneError, setRegPhoneError] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);

  // WhatsApp OTP state
  const [waPhone, setWaPhone] = useState('');
  const [waOtpCode, setWaOtpCode] = useState('');
  const [waResendCooldown, setWaResendCooldown] = useState(0);
  const resendTimerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const [selectedRoles, setSelectedRoles] = useState<string[]>(['attendee']);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [method, setMethod] = useState<'email' | 'phone'>('email');
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [error, setError] = useState('');

  // ── Biometric state ─────────────────────────────────────────────────
  const [bioCap, setBioCap] = useState<{ available: boolean; label: string; iconName: string }>({
    available: false, label: 'Biometrics', iconName: 'fingerprint',
  });
  const [bioEnabled, setBioEnabled] = useState(false);
  // Biometric enable offer (shown after successful login)
  const [showBioOffer, setShowBioOffer] = useState(false);
  const [bioOfferLoading, setBioOfferLoading] = useState(false);

  useEffect(() => {
    getBiometricCapability().then((cap) => {
      setBioCap(cap);
      if (cap.available) isBiometricEnabled().then(setBioEnabled);
    });
  }, []);

  // Clear cooldown timer on unmount
  React.useEffect(() => {
    return () => {
      if (resendTimerRef.current) clearInterval(resendTimerRef.current);
    };
  }, []);

  const startResendCooldown = (seconds: number) => {
    setWaResendCooldown(seconds);
    if (resendTimerRef.current) clearInterval(resendTimerRef.current);
    resendTimerRef.current = setInterval(() => {
      setWaResendCooldown((prev) => {
        if (prev <= 1) {
          if (resendTimerRef.current) clearInterval(resendTimerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const clearError = () => setError('');

  // ── After successful login: offer biometric if available and not yet set ──
  const offerBiometricIfAvailable = useCallback(async () => {
    const cap = await getBiometricCapability();
    if (!cap.available) return;
    const enabled = await isBiometricEnabled();
    if (enabled) return;
    setShowBioOffer(true);
  }, []);

  // ── Login ─────────────────────────────────────────────────────────────
  const handleLogin = async () => {
    clearError();
    if (!email.trim()) { setError('Please enter your email address.'); return; }
    if (!validateEmail(email)) { setError('Please enter a valid email address.'); return; }
    if (!password.trim()) { setError('Please enter your password.'); return; }
    setLoading(true);
    try {
      await signInWithEmail(email.trim(), password);
      // Remember Me = OFF: clear the persisted session from AsyncStorage so
      // the app does not auto-login after being force-killed and restarted.
      // The session remains valid for the current app lifecycle.
      if (!rememberMe) {
        await clearPersistedSession();
      }
      void offerBiometricIfAvailable();
    } catch (err) {
      setError(getAuthErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // ── Biometric Login ───────────────────────────────────────────────────
  const handleBiometricLogin = async () => {
    if (biometricLoading) return;
    clearError();
    setBiometricLoading(true);
    try {
      const result = await biometricLogin(bioCap.label);
      if (result.cancelled) { setBiometricLoading(false); return; }
      if (!result.ok) {
        // Clear biometric state on critical failures so user isn't stuck
        if (result.error?.includes('expired') || result.error?.includes('not found')) {
          setBioEnabled(false);
          await clearBiometricCredentials();
        }
        setError(result.error ?? 'Biometric authentication failed. Please use your password.');
      }
      // On success, onAuthStateChange fires → user set → navigate
    } catch {
      setError('Biometric authentication failed. Please try again or use your password.');
    } finally {
      setBiometricLoading(false);
    }
  };

  // ── Register ──────────────────────────────────────────────────────────
  const handleRegister = async () => {
    clearError();
    setRegPhoneError('');
    if (!name.trim() || name.trim().length < 2) { setError('Please enter your full name (at least 2 characters).'); return; }
    if (!email.trim()) { setError('Please enter your email address.'); return; }
    if (!validateEmail(email)) { setError('Please enter a valid email address.'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters long.'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match. Please try again.'); return; }
    const parsedPhone = parseE164(regPhone);
    if (!regPhone || parsedPhone.national.replace(/\D/g, '').length === 0) { setRegPhoneError('Phone number is required.'); return; }
    if (!validatePhone(parsedPhone.country, parsedPhone.national)) {
      setRegPhoneError(parsedPhone.country.code === 'JM' ? 'Enter a valid Jamaica number (876 or 658 area code, 10 digits).' : 'Please enter a valid phone number for the selected country.');
      return;
    }
    setLoading(true);
    try {
      await signUp(toTitleCase(name.trim()), email.trim(), password, selectedRoles, regPhone);
      setRegisterSuccess(true);
    } catch (err) {
      setError(getAuthErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // ── Forgot Password ───────────────────────────────────────────────────
  const handleSendReset = async () => {
    clearError();
    if (!resetEmail.trim() || !validateEmail(resetEmail)) { setError('Please enter a valid email address.'); return; }
    setLoading(true);
    try {
      await resetPassword(resetEmail.trim());
      setLoginView('reset_sent');
    } catch (err) {
      setError(getAuthErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // ── Update Password ───────────────────────────────────────────────────
  const handleUpdatePassword = async () => {
    clearError();
    if (newPassword.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (newPassword !== confirmNewPassword) { setError('Passwords do not match.'); return; }
    setLoading(true);
    try {
      await updatePassword(newPassword);
    } catch (err) {
      setError(getAuthErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // ── Phone OTP ─────────────────────────────────────────────────────────
  const handleSendOTP = async () => {
    clearError();
    if (!phone.trim()) { setError('Please enter your phone number.'); return; }
    setLoading(true);
    try { await signInWithPhone(phone.trim()); setOtpSent(true); }
    catch (err) { setError(getAuthErrorMessage(err)); }
    finally { setLoading(false); }
  };

  const handleVerifyOTP = async () => {
    clearError();
    if (!otp.trim()) { setError('Please enter the OTP code.'); return; }
    setLoading(true);
    try { await verifyOTP(otp.trim()); }
    catch (err) { setError(getAuthErrorMessage(err)); }
    finally { setLoading(false); }
  };

  // ── WhatsApp OTP ──────────────────────────────────────────────────────
  const handleSendWhatsApp = async (isResend = false) => {
    clearError();
    const phoneToSend = waPhone.trim();
    if (!phoneToSend) { setError('Please enter your WhatsApp number.'); return; }
    setLoading(true);
    try {
      const result = await sendWhatsAppOtp(phoneToSend);
      if (!result.ok) {
        setError(result.error ?? 'Could not send WhatsApp code.');
        if (result.retryAfterSeconds) startResendCooldown(result.retryAfterSeconds);
        return;
      }
      setLoginView('whatsapp_otp');
      setWaOtpCode('');
      startResendCooldown(60);
    } catch {
      setError('Could not send WhatsApp code. Please try again.');
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
      if (!result.ok) {
        setError(result.error ?? 'Verification failed. Please try again.');
        return;
      }
      // On success onAuthStateChange fires and navigates automatically
    } catch {
      setError('Verification failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Biometric offer handlers ──────────────────────────────────────────
  const handleEnableBiometric = async () => {
    setBioOfferLoading(true);
    try {
      const result = await enableBiometricLogin();
      if (result.ok) {
        setBioEnabled(true);
        await refreshBiometricState();
      }
    } catch {}
    setBioOfferLoading(false);
    setShowBioOffer(false);
  };

  // ── WhatsApp Phone Entry View ─────────────────────────────────────────
  if (loginView === 'whatsapp_phone') {
    return (
      <View style={styles.container}>
        <LinearGradient colors={['#001A0D', Colors.background, Colors.background]} style={StyleSheet.absoluteFillObject} />
        <SafeAreaView style={{ flex: 1 }}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + Spacing.xxl }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={styles.header}>
                <View style={styles.logoRow}><View style={styles.logoDot} /><Text style={styles.logoText}>VYBZ HUB</Text></View>
                <Text style={styles.tagline}>Continue with WhatsApp</Text>
              </View>
              {error ? <ErrorBanner message={error} onDismiss={clearError} /> : null}
              <View style={styles.form}>
                <View style={waStyles.infoBox}>
                  <MaterialIcons name="whatsapp" size={18} color="#25D366" />
                  <Text style={waStyles.infoText}>We will send a verification code to your WhatsApp.</Text>
                </View>
                <View>
                  <Text style={styles.inputLabel}>WhatsApp Number</Text>
                  <PhoneInput
                    value={waPhone}
                    onChange={(e164) => setWaPhone(e164)}
                    placeholder="876 000 0000"
                    disabled={loading}
                  />
                </View>
                <Pressable onPress={() => handleSendWhatsApp(false)} disabled={loading} style={({ pressed }) => [waStyles.waBtn, pressed && { opacity: 0.85 }]}>
                  <View style={waStyles.waBtnInner}>
                    {loading
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <MaterialIcons name="send" size={18} color="#fff" />}
                    <Text style={waStyles.waBtnText}>{loading ? 'Sending...' : 'Send Code'}</Text>
                  </View>
                </Pressable>
                <Pressable onPress={() => { setLoginView('form'); setWaPhone(''); clearError(); }} style={styles.backToLoginBtn}>
                  <MaterialIcons name="arrow-back" size={16} color={Colors.textMuted} />
                  <Text style={styles.backToLoginText}>Back to Sign In</Text>
                </Pressable>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </View>
    );
  }

  // ── WhatsApp OTP Verify View ──────────────────────────────────────────
  if (loginView === 'whatsapp_otp') {
    const formattedPhone = waPhone.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, '+1 ($1) $2-$3') || waPhone;
    return (
      <View style={styles.container}>
        <LinearGradient colors={['#001A0D', Colors.background, Colors.background]} style={StyleSheet.absoluteFillObject} />
        <SafeAreaView style={{ flex: 1 }}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + Spacing.xxl }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={styles.header}>
                <View style={styles.logoRow}><View style={styles.logoDot} /><Text style={styles.logoText}>VYBZ HUB</Text></View>
                <Text style={styles.tagline}>Verify your WhatsApp</Text>
              </View>
              {error ? <ErrorBanner message={error} onDismiss={clearError} /> : null}
              <View style={styles.form}>
                <View style={waStyles.sentBox}>
                  <MaterialIcons name="whatsapp" size={20} color="#25D366" />
                  <View style={{ flex: 1 }}>
                    <Text style={waStyles.sentTitle}>Code sent via WhatsApp</Text>
                    <Text style={waStyles.sentPhone}>{formattedPhone}</Text>
                  </View>
                </View>

                {/* Boxed OTP input */}
                <View>
                  <Text style={styles.inputLabel}>Verification Code</Text>
                  <View style={waStyles.otpRow}>
                    {[0, 1, 2, 3, 4, 5].map((i) => {
                      const digit = (waOtpCode.replace(/\D/g, ''))[i] ?? '';
                      const isFocused = waOtpCode.replace(/\D/g, '').length === i;
                      return (
                        <View key={i} style={[waStyles.otpBox, isFocused && waStyles.otpBoxFocused, digit && waStyles.otpBoxFilled]}>
                          <Text style={waStyles.otpDigit}>{digit}</Text>
                        </View>
                      );
                    })}
                    {/* Hidden input captures all typing */}
                    <TextInput
                      style={waStyles.otpHiddenInput}
                      value={waOtpCode}
                      onChangeText={(t) => {
                        const digits = t.replace(/\D/g, '').slice(0, 6);
                        setWaOtpCode(digits);
                      }}
                      keyboardType="number-pad"
                      maxLength={6}
                      autoFocus
                      caretHidden
                      accessibilityLabel="Verification code"
                    />
                  </View>
                </View>

                <Pressable onPress={handleVerifyWhatsApp} disabled={loading || waOtpCode.replace(/\D/g, '').length < 4} style={({ pressed }) => [waStyles.waBtn, (loading || waOtpCode.replace(/\D/g, '').length < 4) && { opacity: 0.5 }, pressed && { opacity: 0.85 }]}>
                  <View style={waStyles.waBtnInner}>
                    {loading
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <MaterialIcons name="check-circle" size={18} color="#fff" />}
                    <Text style={waStyles.waBtnText}>{loading ? 'Verifying...' : 'Verify'}</Text>
                  </View>
                </Pressable>

                {/* Resend */}
                <Pressable
                  onPress={() => { clearError(); setWaOtpCode(''); void handleSendWhatsApp(true); }}
                  disabled={waResendCooldown > 0 || loading}
                  style={({ pressed }) => [waStyles.resendBtn, pressed && { opacity: 0.75 }]}
                >
                  <Text style={[waStyles.resendText, waResendCooldown > 0 && { color: Colors.textMuted }]}>
                    {waResendCooldown > 0 ? `Resend code in ${waResendCooldown}s` : 'Resend code'}
                  </Text>
                </Pressable>

                {/* Change number */}
                <Pressable onPress={() => { setLoginView('whatsapp_phone'); setWaOtpCode(''); clearError(); }} style={styles.backToLoginBtn}>
                  <MaterialIcons name="arrow-back" size={16} color={Colors.textMuted} />
                  <Text style={styles.backToLoginText}>Change number</Text>
                </Pressable>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </View>
    );
  }

  // ── Password Recovery Mode ────────────────────────────────────────────
  if (passwordRecoveryMode) {
    return (
      <View style={styles.container}>
        <LinearGradient colors={['#001A0D', Colors.background, Colors.background]} style={StyleSheet.absoluteFillObject} />
        <SafeAreaView style={{ flex: 1 }}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + Spacing.xxl }]} showsVerticalScrollIndicator={false}>
              <View style={styles.header}>
                <View style={styles.logoRow}><View style={styles.logoDot} /><Text style={styles.logoText}>VYBZ HUB</Text></View>
                <Text style={styles.tagline}>Set a new password.</Text>
              </View>
              {error ? <ErrorBanner message={error} onDismiss={clearError} /> : null}
              <View style={styles.form}>
                <View>
                  <Text style={styles.inputLabel}>New Password</Text>
                  <View style={styles.inputWrapper}>
                    <MaterialIcons name="lock" size={18} color={Colors.textMuted} style={styles.inputIcon} />
                    <TextInput style={[styles.input, { flex: 1 }]} placeholder="Min. 8 characters" placeholderTextColor={Colors.textMuted} value={newPassword} onChangeText={setNewPassword} secureTextEntry={!showNew} accessibilityLabel="New password" />
                    <Pressable onPress={() => setShowNew(!showNew)} style={styles.eyeBtn}>
                      <MaterialIcons name={showNew ? 'visibility-off' : 'visibility'} size={18} color={Colors.textMuted} />
                    </Pressable>
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
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </View>
    );
  }

  // ── Register Success ──────────────────────────────────────────────────
  if (tab === 'register' && registerSuccess) {
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
          <Pressable onPress={() => { setTab('login'); setRegisterSuccess(false); setEmail(''); setPassword(''); setName(''); setConfirmPassword(''); }} style={({ pressed }) => [styles.mainBtn, { alignSelf: 'stretch' }, pressed && { opacity: 0.85 }]}>
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

  // ── Reset sent ────────────────────────────────────────────────────────
  if (tab === 'login' && loginView === 'reset_sent') {
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
          <Pressable onPress={() => { setLoginView('form'); setResetEmail(''); clearError(); }} style={({ pressed }) => [styles.mainBtn, { alignSelf: 'stretch' }, pressed && { opacity: 0.85 }]}>
            <LinearGradient colors={[Colors.gold, Colors.goldDim]} style={styles.mainBtnInner}>
              <Text style={styles.mainBtnText}>Back to Sign In</Text>
            </LinearGradient>
          </Pressable>
        </SafeAreaView>
      </View>
    );
  }

  // ── Main Form ─────────────────────────────────────────────────────────
  const anyLoading = loading;

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
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.logoRow}><View style={styles.logoDot} /><Text style={styles.logoText}>VYBZ HUB</Text></View>
              <Text style={styles.tagline}>
                {tab === 'login'
                  ? loginView === 'forgot' ? 'Reset your password.' : 'Welcome back, Viber.'
                  : "Join the island's event scene."}
              </Text>
            </View>

            {/* Config warning */}
            {!supabaseReady && (
              <View style={configWarnStyles.box}>
                <MaterialIcons name="warning" size={16} color="#FF9800" />
                <Text style={configWarnStyles.text}>
                  {'EXPO_PUBLIC_SUPABASE_ANON_KEY is not set.\nCopy the "anon / public" key from\nSupabase Dashboard → Project Settings → API.'}
                </Text>
              </View>
            )}

            {/* Error Banner */}
            {error ? <ErrorBanner message={error} onDismiss={clearError} /> : null}

            {/* ── Biometric enable offer ── */}
            {showBioOffer && bioCap.available && (
              <View style={offerStyles.card}>
                <View style={offerStyles.iconWrap}>
                  <MaterialIcons name={bioCap.iconName as any} size={28} color={Colors.gold} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={offerStyles.title}>Enable {bioCap.label}?</Text>
                  <Text style={offerStyles.sub}>Sign in faster next time using {bioCap.label}.</Text>
                </View>
                <View style={offerStyles.btns}>
                  <Pressable
                    onPress={handleEnableBiometric}
                    disabled={bioOfferLoading}
                    style={({ pressed }) => [offerStyles.enableBtn, pressed && { opacity: 0.85 }]}
                  >
                    {bioOfferLoading ? <ActivityIndicator size="small" color={Colors.textOnGold} /> : <Text style={offerStyles.enableBtnText}>Enable</Text>}
                  </Pressable>
                  <Pressable onPress={() => setShowBioOffer(false)} style={offerStyles.notNowBtn}>
                    <Text style={offerStyles.notNowText}>Not Now</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {/* ── Forgot Password Form ── */}
            {tab === 'login' && loginView === 'forgot' ? (
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
                    <Text style={styles.mainBtnText}>{loading ? 'Sending…' : 'Send Reset Link'}</Text>
                  </LinearGradient>
                </Pressable>
                <Pressable onPress={() => { setLoginView('form'); clearError(); }} style={styles.backToLoginBtn}>
                  <MaterialIcons name="arrow-back" size={16} color={Colors.textMuted} />
                  <Text style={styles.backToLoginText}>Back to Sign In</Text>
                </Pressable>
              </View>
            ) : (
              <>
                {/* Tab switcher */}
                <View style={styles.tabRow}>
                  {(['login', 'register'] as const).map((t) => (
                    <Pressable key={t} onPress={() => { setTab(t); clearError(); setLoginView('form'); }}
                      style={[styles.tabBtn, tab === t && styles.tabBtnActive]}>
                      <Text style={[styles.tabBtnText, tab === t && styles.tabBtnTextActive]}>
                        {t === 'login' ? 'Sign In' : 'Create Account'}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                {/* Method switcher */}
                {tab === 'login' && PHONE_AUTH_ENABLED && (
                  <View style={styles.methodRow}>
                    {(['email', 'phone'] as const).map((m) => (
                      <Pressable key={m} onPress={() => { setMethod(m); setOtpSent(false); clearError(); }}
                        style={[styles.methodBtn, method === m && styles.methodBtnActive]}>
                        <MaterialIcons name={m === 'email' ? 'email' : 'phone'} size={16} color={method === m ? Colors.textOnGold : Colors.textSecondary} />
                        <Text style={[styles.methodText, method === m && styles.methodTextActive]}>
                          {m === 'email' ? 'Email' : 'Phone'}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                )}

                <View style={styles.form}>

                  {/* ── Login Email form ── */}
                  {tab === 'login' && method === 'email' && (
                    <>
                      {/* Biometric quick-login for returning users */}
                      {bioEnabled && bioCap.available && (
                        <BiometricButton
                          label={bioCap.label}
                          iconName={bioCap.iconName}
                          onPress={handleBiometricLogin}
                          loading={biometricLoading}
                        />
                      )}

                      <View>
                        <Text style={styles.inputLabel}>Email Address</Text>
                        <View style={styles.inputWrapper}>
                          <MaterialIcons name="email" size={18} color={Colors.textMuted} style={styles.inputIcon} />
                          <TextInput style={styles.input} placeholder="you@example.com" placeholderTextColor={Colors.textMuted} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} accessibilityLabel="Email address" />
                        </View>
                      </View>

                      <View>
                        <Text style={styles.inputLabel}>Password</Text>
                        <View style={styles.inputWrapper}>
                          <MaterialIcons name="lock" size={18} color={Colors.textMuted} style={styles.inputIcon} />
                          <TextInput style={[styles.input, { flex: 1 }]} placeholder="Enter password" placeholderTextColor={Colors.textMuted} value={password} onChangeText={setPassword} secureTextEntry={!showPassword} returnKeyType="go" onSubmitEditing={handleLogin} accessibilityLabel="Password" />
                          <Pressable onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                            <MaterialIcons name={showPassword ? 'visibility-off' : 'visibility'} size={18} color={Colors.textMuted} />
                          </Pressable>
                        </View>
                      </View>

                      {/* Remember Me + Forgot Password row */}
                      <View style={styles.rememberForgotRow}>
                        <Pressable onPress={() => setRememberMe(!rememberMe)} style={styles.rememberRow} accessibilityRole="checkbox" accessibilityState={{ checked: rememberMe }}>
                          <View style={[styles.checkbox, rememberMe && styles.checkboxActive]}>
                            {rememberMe && <MaterialIcons name="check" size={12} color={Colors.textOnGold} />}
                          </View>
                          <Text style={styles.rememberText}>Remember me</Text>
                        </Pressable>
                        <Pressable onPress={() => { setLoginView('forgot'); setResetEmail(email); clearError(); }} style={styles.forgotBtn}>
                          <Text style={styles.forgotBtnText}>Forgot password?</Text>
                        </Pressable>
                      </View>

                      <Pressable onPress={handleLogin} disabled={anyLoading} style={({ pressed }) => [styles.mainBtn, pressed && { opacity: 0.85 }]}>
                        <LinearGradient colors={[Colors.gold, Colors.goldDim]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.mainBtnInner}>
                          {loading ? <ActivityIndicator size="small" color={Colors.textOnGold} /> : null}
                          <Text style={styles.mainBtnText}>{loading ? 'Signing in...' : 'Sign In'}</Text>
                        </LinearGradient>
                      </Pressable>

                      {/* WhatsApp sign-in */}
                      {WHATSAPP_AUTH_ENABLED && (
                        <>
                          <View style={styles.dividerRow}>
                            <View style={styles.dividerLine} />
                            <Text style={styles.dividerText}>or</Text>
                            <View style={styles.dividerLine} />
                          </View>
                          <Pressable
                            onPress={() => { clearError(); setWaPhone(''); setLoginView('whatsapp_phone'); }}
                            disabled={anyLoading}
                            style={({ pressed }) => [waStyles.waBtn, pressed && { opacity: 0.85 }]}
                            accessibilityLabel="Continue with WhatsApp"
                          >
                            <View style={waStyles.waBtnInner}>
                              <MaterialIcons name="whatsapp" size={20} color="#fff" />
                              <Text style={waStyles.waBtnText}>Continue with WhatsApp</Text>
                            </View>
                          </Pressable>
                        </>
                      )}

                      {/* Switch account link */}
                      {bioEnabled && (
                        <Pressable onPress={() => { setBioEnabled(false); void clearBiometricCredentials(); }} style={styles.switchAccountBtn}>
                          <MaterialIcons name="switch-account" size={14} color={Colors.textMuted} />
                          <Text style={styles.switchAccountText}>Sign in with a different account</Text>
                        </Pressable>
                      )}
                    </>
                  )}

                  {/* ── Login Phone OTP ── */}
                  {tab === 'login' && method === 'phone' && (
                    <>
                      <View style={styles.comingSoonBox}>
                        <MaterialIcons name="info-outline" size={16} color={Colors.textMuted} />
                        <Text style={styles.comingSoonText}>Phone sign-in requires Twilio configuration in your Supabase project settings.</Text>
                      </View>
                      {!otpSent ? (
                        <>
                          <View>
                            <Text style={styles.inputLabel}>Phone Number</Text>
                            <PhoneInput value={phone} onChange={(e164) => setPhone(e164)} placeholder="876 000 0000" disabled={loading} />
                          </View>
                          <Pressable onPress={handleSendOTP} disabled={loading} style={({ pressed }) => [styles.mainBtn, pressed && { opacity: 0.85 }]}>
                            <LinearGradient colors={[Colors.gold, Colors.goldDim]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.mainBtnInner}>
                              <Text style={styles.mainBtnText}>{loading ? 'Sending...' : 'Send OTP Code'}</Text>
                            </LinearGradient>
                          </Pressable>
                        </>
                      ) : (
                        <>
                          <View style={styles.otpInfo}>
                            <MaterialIcons name="sms" size={20} color={Colors.green} />
                            <Text style={styles.otpInfoText}>Code sent to {phone}</Text>
                          </View>
                          <View>
                            <Text style={styles.inputLabel}>OTP Code</Text>
                            <View style={styles.inputWrapper}>
                              <MaterialIcons name="vpn-key" size={18} color={Colors.textMuted} style={styles.inputIcon} />
                              <TextInput style={styles.input} placeholder="123456" placeholderTextColor={Colors.textMuted} value={otp} onChangeText={setOtp} keyboardType="number-pad" maxLength={6} accessibilityLabel="OTP code" />
                            </View>
                          </View>
                          <Pressable onPress={handleVerifyOTP} disabled={loading} style={({ pressed }) => [styles.mainBtn, pressed && { opacity: 0.85 }]}>
                            <LinearGradient colors={[Colors.gold, Colors.goldDim]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.mainBtnInner}>
                              <Text style={styles.mainBtnText}>{loading ? 'Verifying...' : 'Verify & Sign In'}</Text>
                            </LinearGradient>
                          </Pressable>
                        </>
                      )}
                    </>
                  )}

                  {/* ── Register Form ── */}
                  {tab === 'register' && (
                    <>
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
                        <Text style={styles.inputLabel}>Email Address *</Text>
                        <View style={styles.inputWrapper}>
                          <MaterialIcons name="email" size={18} color={Colors.textMuted} style={styles.inputIcon} />
                          <TextInput style={styles.input} placeholder="you@example.com" placeholderTextColor={Colors.textMuted} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} accessibilityLabel="Email address" />
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

                      <Pressable onPress={handleRegister} disabled={anyLoading} style={({ pressed }) => [styles.mainBtn, pressed && { opacity: 0.85 }]}>
                        <LinearGradient colors={[Colors.gold, Colors.goldDim]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.mainBtnInner}>
                          {loading ? <ActivityIndicator size="small" color={Colors.textOnGold} /> : <MaterialIcons name="how-to-reg" size={18} color={Colors.textOnGold} />}
                          <Text style={styles.mainBtnText}>{loading ? 'Creating account...' : 'Create Account'}</Text>
                        </LinearGradient>
                      </Pressable>

                      <Text style={styles.termsText}>
                        By creating an account you agree to our{' '}
                        <Text style={styles.termsLink} onPress={() => Linking.openURL(LEGAL_URLS.terms)}>Terms of Use</Text>
                        {' '}and{' '}
                        <Text style={styles.termsLink} onPress={() => Linking.openURL(LEGAL_URLS.privacy)}>Privacy Policy</Text>
                        . Need help? <Text style={{ color: Colors.gold }}>{SUPPORT_EMAIL}</Text>
                      </Text>
                    </>
                  )}
                </View>

                {/* Skip */}
                <Pressable onPress={() => router.replace('/(tabs)')} style={styles.skipBtn}>
                  <Text style={styles.skipText}>Browse without account</Text>
                </Pressable>

                {/* Legal footer */}
                <View style={styles.legalFooterRow}>
                  <Pressable onPress={() => Linking.openURL(LEGAL_URLS.privacy)} hitSlop={8}>
                    <Text style={styles.legalFooterLink}>Privacy Policy</Text>
                  </Pressable>
                  <Text style={styles.legalFooterDot}>·</Text>
                  <Pressable onPress={() => Linking.openURL(LEGAL_URLS.terms)} hitSlop={8}>
                    <Text style={styles.legalFooterLink}>Terms of Use</Text>
                  </Pressable>
                </View>

                <DancingPeople />
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

// ─── WhatsApp styles ─────────────────────────────────────────────────────────
const waStyles = StyleSheet.create({
  waBtn: {
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: '#25D366',
  },
  waBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.base + 2,
  },
  waBtnText: {
    fontSize: Typography.md,
    fontWeight: '700',
    color: '#fff',
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    backgroundColor: '#0A1A0A',
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: '#25D36633',
  },
  infoText: {
    flex: 1,
    fontSize: Typography.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  sentBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: '#0A1A0A',
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: '#25D36633',
  },
  sentTitle: {
    fontSize: Typography.sm,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  sentPhone: {
    fontSize: Typography.base,
    color: Colors.textPrimary,
    fontWeight: '700',
    marginTop: 2,
  },
  otpRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    justifyContent: 'center',
    position: 'relative',
    paddingVertical: Spacing.xs,
  },
  otpBox: {
    width: 46,
    height: 56,
    borderRadius: Radius.md,
    borderWidth: 2,
    borderColor: Colors.surfaceBorder,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpBoxFocused: {
    borderColor: '#25D366',
  },
  otpBoxFilled: {
    borderColor: Colors.gold,
    backgroundColor: Colors.goldSurface,
  },
  otpDigit: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  // Invisible input that floats over the boxes to capture typing
  otpHiddenInput: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0,
    fontSize: 1,
  },
  resendBtn: {
    alignSelf: 'center',
    paddingVertical: Spacing.sm,
  },
  resendText: {
    fontSize: Typography.sm,
    color: '#25D366',
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});

// ─── Biometric offer card styles ──────────────────────────────────────────────
const offerStyles = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.goldSurface, borderRadius: Radius.xl, padding: Spacing.md,
    borderWidth: 1.5, borderColor: `${Colors.gold}44`,
  },
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
    tilt.value = withDelay(delay, withRepeat(withSequence(withTiming(dir * 12, { duration: 300 }), withTiming(-dir * 12, { duration: 300 })), -1, false));
    armL.value = withDelay(delay, withRepeat(withSequence(withTiming(-40, { duration: 280 }), withTiming(10, { duration: 280 })), -1, false));
    armR.value = withDelay(delay + 140, withRepeat(withSequence(withTiming(40, { duration: 280 }), withTiming(-10, { duration: 280 })), -1, false));
  }, [bounce, tilt, armL, armR, delay, index, scale]);

  const bodyStyle  = useAnimatedStyle(() => ({ transform: [{ translateY: bounce.value }, { rotate: `${tilt.value}deg` }] }));
  const armLStyle  = useAnimatedStyle(() => ({ transform: [{ rotate: `${armL.value}deg` }] }));
  const armRStyle  = useAnimatedStyle(() => ({ transform: [{ rotate: `${armR.value}deg` }] }));
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
  wrap: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: Spacing.md, paddingVertical: Spacing.lg, marginTop: Spacing.xs, opacity: 0.45 },
  figure: { alignItems: 'center', gap: 2 },
  head: {},
  torsoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 2 },
  arm: {},
  torso: {},
  legsRow: { flexDirection: 'row' },
  leg: {},
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: Spacing.base, gap: Spacing.lg },

  header: { paddingTop: Spacing.xl, gap: Spacing.sm },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  logoDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.gold },
  logoText: { fontSize: Typography.sm, fontWeight: '900', color: Colors.gold, letterSpacing: 3 },
  tagline: { fontSize: 26, fontWeight: '900', color: Colors.textPrimary, lineHeight: 32, marginTop: Spacing.sm },

  tabRow: { flexDirection: 'row', backgroundColor: Colors.surface, borderRadius: Radius.md, padding: 3, borderWidth: 1, borderColor: Colors.surfaceBorder },
  tabBtn: { flex: 1, paddingVertical: Spacing.md, alignItems: 'center', borderRadius: Radius.sm },
  tabBtnActive: { backgroundColor: Colors.gold },
  tabBtnText: { fontSize: Typography.sm, color: Colors.textMuted, fontWeight: '600' },
  tabBtnTextActive: { color: Colors.textOnGold, fontWeight: '700' },

  methodRow: { flexDirection: 'row', gap: Spacing.sm },
  methodBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.xs, paddingVertical: Spacing.md, borderRadius: Radius.md, backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.surfaceBorder },
  methodBtnActive: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  methodText: { fontSize: Typography.sm, color: Colors.textSecondary, fontWeight: '500' },
  methodTextActive: { color: Colors.textOnGold, fontWeight: '700' },

  form: { gap: Spacing.base },
  inputLabel: { fontSize: Typography.sm, color: Colors.textSecondary, fontWeight: '500', marginBottom: Spacing.xs },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.surfaceBorder, paddingHorizontal: Spacing.md },
  inputIcon: { marginRight: Spacing.sm },
  input: { flex: 1, height: 52, fontSize: Typography.base, color: Colors.textPrimary },
  eyeBtn: { padding: Spacing.xs },

  mismatchText: { fontSize: 11, color: Colors.error ?? '#FF4444', marginTop: 4 },

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

  comingSoonBox: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, padding: Spacing.md, borderWidth: 1, borderColor: Colors.surfaceBorder },
  comingSoonText: { flex: 1, fontSize: Typography.sm, color: Colors.textMuted, lineHeight: 19 },

  otpInfo: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.greenSurface, padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1, borderColor: `${Colors.green}44` },
  otpInfoText: { flex: 1, fontSize: Typography.sm, color: Colors.greenLight, lineHeight: 20 },

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
});
