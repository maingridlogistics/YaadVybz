import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../hooks/useAuth';
import { supabaseReady } from '../lib/supabase';
import { Colors, Typography, Spacing, Radius } from '../constants/theme';
import { SUPPORT_EMAIL } from '../constants/support';
import { PHONE_AUTH_ENABLED } from '../constants/featureFlags';

type AuthTab = 'login' | 'register';
type LoginView = 'form' | 'forgot' | 'reset_sent';

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
    return 'Too many reset attempts. Please wait a few minutes before trying again.';
  }
  if (msg.includes('context deadline') || msg.includes('request_timeout') || (error as any)?.status === 504 || (error as any)?.code === 'request_timeout') {
    return 'The mail server is taking too long to respond. Please wait a moment and try again.';
  }
  if (msg.includes('token has expired') || msg.includes('link is invalid')) {
    return 'This link has expired. Please request a new password reset.';
  }
  if (msg.includes('phone auth') || msg.includes('twilio') || msg.includes('sms')) {
    return 'Phone sign-in is not yet configured. Please use email instead.';
  }
  if (msg.includes('oauth') || msg.includes('coming soon')) {
    return 'This sign-in method is not yet configured. Please use email.';
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

// ─── Password Strength Bar ────────────────────────────────────────────────────
function PasswordStrengthBar({ password }: { password: string }) {
  const { level, label, color } = getPasswordStrength(password);
  if (password.length === 0) return null;

  return (
    <View style={strengthStyles.container}>
      <View style={strengthStyles.bars}>
        {[1, 2, 3].map((i) => (
          <View
            key={i}
            style={[
              strengthStyles.bar,
              { backgroundColor: i <= level ? color : Colors.surfaceBorder },
            ]}
          />
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
  box: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    backgroundColor: '#1A1000', borderRadius: Radius.md,
    borderWidth: 1, borderColor: '#FF980044',
    padding: Spacing.md,
  },
  text: { flex: 1, fontSize: Typography.xs, color: '#FFB74D', lineHeight: 18 },
});

// ─── Error Banner ─────────────────────────────────────────────────────────────
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
  container: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    backgroundColor: '#2A1010', borderRadius: Radius.md,
    borderWidth: 1, borderColor: '#FF444433',
    padding: Spacing.md,
  },
  text: { flex: 1, fontSize: Typography.sm, color: '#FF7777', lineHeight: 19 },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function Auth() {
  const {
    user,
    signUp,
    signInWithEmail,
    signInWithPhone,
    verifyOTP,
    signInWithGoogle,
    signInWithApple,
    resetPassword,
    updatePassword,
    passwordRecoveryMode,
  } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Navigate away if user becomes signed in
  useEffect(() => {
    if (user) router.replace('/(tabs)');
  }, [user]);

  // ── State ──────────────────────────────────────────────────────────────
  const [tab, setTab] = useState<AuthTab>('login');
  const [loginView, setLoginView] = useState<LoginView>('form');
  const [registerSuccess, setRegisterSuccess] = useState(false);

  // Form fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);

  // UI state
  const [selectedRoles, setSelectedRoles] = useState<string[]>(['attendee']);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showNew, setShowNew] = useState(false);
  // Always default to email; phone is only selectable when PHONE_AUTH_ENABLED is true.
  const [method, setMethod] = useState<'email' | 'phone'>('email');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const clearError = () => setError('');

  // ── Login ─────────────────────────────────────────────────────────────
  const handleLogin = async () => {
    clearError();
    if (!email.trim()) { setError('Please enter your email address.'); return; }
    if (!validateEmail(email)) { setError('Please enter a valid email address.'); return; }
    if (!password.trim()) { setError('Please enter your password.'); return; }

    setLoading(true);
    try {
      await signInWithEmail(email.trim(), password);
      // onAuthStateChange fires → user updates → useEffect navigates
    } catch (err) {
      setError(getAuthErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // ── Register ──────────────────────────────────────────────────────────
  const handleRegister = async () => {
    clearError();
    if (!name.trim() || name.trim().length < 2) { setError('Please enter your full name (at least 2 characters).'); return; }
    if (!email.trim()) { setError('Please enter your email address.'); return; }
    if (!validateEmail(email)) { setError('Please enter a valid email address.'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters long.'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match. Please try again.'); return; }

    setLoading(true);
    try {
      await signUp(name.trim(), email.trim(), password, selectedRoles);
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
    if (!resetEmail.trim() || !validateEmail(resetEmail)) {
      setError('Please enter a valid email address.');
      return;
    }
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

  // ── Update Password (recovery mode) ──────────────────────────────────
  const handleUpdatePassword = async () => {
    clearError();
    if (newPassword.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (newPassword !== confirmNewPassword) { setError('Passwords do not match.'); return; }
    setLoading(true);
    try {
      await updatePassword(newPassword);
      // passwordRecoveryMode clears → user is set → useEffect navigates
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
    try {
      await signInWithPhone(phone.trim());
      setOtpSent(true);
    } catch (err) {
      setError(getAuthErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    clearError();
    if (!otp.trim()) { setError('Please enter the OTP code.'); return; }
    setLoading(true);
    try {
      await verifyOTP(otp.trim());
    } catch (err) {
      setError(getAuthErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // ── Social ────────────────────────────────────────────────────────────
  const handleSocial = async (provider: 'google' | 'apple') => {
    clearError();
    setLoading(true);
    try {
      if (provider === 'google') await signInWithGoogle();
      else await signInWithApple();
    } catch (err) {
      setError(getAuthErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────
  // ── Password Recovery Mode (opened via reset link deep link) ─────────
  // ─────────────────────────────────────────────────────────────────────
  if (passwordRecoveryMode) {
    return (
      <View style={styles.container}>
        <LinearGradient colors={['#001A0D', Colors.background, Colors.background]} style={StyleSheet.absoluteFillObject} />
        <SafeAreaView style={{ flex: 1 }}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + Spacing.xxl }]} showsVerticalScrollIndicator={false}>
              <View style={styles.header}>
                <View style={styles.logoRow}>
                  <View style={styles.logoDot} />
                  <Text style={styles.logoText}>VYBZ HUB</Text>
                </View>
                <Text style={styles.tagline}>Set a new password.</Text>
              </View>

              {error ? <ErrorBanner message={error} onDismiss={clearError} /> : null}

              <View style={styles.form}>
                <View>
                  <Text style={styles.inputLabel}>New Password</Text>
                  <View style={styles.inputWrapper}>
                    <MaterialIcons name="lock" size={18} color={Colors.textMuted} style={styles.inputIcon} />
                    <TextInput
                      style={[styles.input, { flex: 1 }]}
                      placeholder="Min. 8 characters"
                      placeholderTextColor={Colors.textMuted}
                      value={newPassword}
                      onChangeText={setNewPassword}
                      secureTextEntry={!showNew}
                      accessibilityLabel="New password"
                    />
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
                    <TextInput
                      style={[styles.input, { flex: 1 }]}
                      placeholder="Re-enter password"
                      placeholderTextColor={Colors.textMuted}
                      value={confirmNewPassword}
                      onChangeText={setConfirmNewPassword}
                      secureTextEntry={true}
                      accessibilityLabel="Confirm new password"
                    />
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

  // ─────────────────────────────────────────────────────────────────────
  // ── Register Success ─────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────
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
            {'\n\n'}Click the link in the email to activate your account and sign in.
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

  // ─────────────────────────────────────────────────────────────────────
  // ── Forgot Password: Sent ────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────
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
            {'\n\n'}Click the link to set a new password. The link expires in 1 hour.
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

  // ─────────────────────────────────────────────────────────────────────
  // ── Main Auth Form ───────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <LinearGradient colors={['#001A0D', Colors.background, Colors.background]} style={StyleSheet.absoluteFillObject} />

      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + Spacing.xxl }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

            {/* Header */}
            <View style={styles.header}>
              <View style={styles.logoRow}>
                <View style={styles.logoDot} />
                <Text style={styles.logoText}>VYBZ HUB</Text>
              </View>
              <Text style={styles.tagline}>
                {tab === 'login'
                  ? loginView === 'forgot' ? 'Reset your password.' : 'Welcome back, Viber.'
                  : "Join the island's event scene."}
              </Text>
            </View>

            {/* Config warning if Supabase anon key is missing */}
            {!supabaseReady && (
              <View style={configWarnStyles.box}>
                <MaterialIcons name="warning" size={16} color="#FF9800" />
                <Text style={configWarnStyles.text}>
                  {'EXPO_PUBLIC_SUPABASE_ANON_KEY is not set.\nCopy the "anon / public" key from\nSupabase Dashboard → Project Settings → API\nand add it to your .env file.'}
                </Text>
              </View>
            )}

            {/* Error Banner */}
            {error ? <ErrorBanner message={error} onDismiss={clearError} /> : null}

            {/* ── Forgot Password Form ── */}
            {tab === 'login' && loginView === 'forgot' ? (
              <View style={styles.form}>
                <View style={styles.forgotInfo}>
                  <MaterialIcons name="help-outline" size={18} color={Colors.gold} />
                  <Text style={styles.forgotInfoText}>
                    Enter your email address and we will send you a link to reset your password.
                  </Text>
                </View>

                <View>
                  <Text style={styles.inputLabel}>Email Address</Text>
                  <View style={styles.inputWrapper}>
                    <MaterialIcons name="email" size={18} color={Colors.textMuted} style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      placeholder="you@example.com"
                      placeholderTextColor={Colors.textMuted}
                      value={resetEmail}
                      onChangeText={setResetEmail}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      accessibilityLabel="Email for password reset"
                    />
                  </View>
                </View>

                <Pressable onPress={handleSendReset} disabled={loading} style={({ pressed }) => [styles.mainBtn, pressed && { opacity: 0.85 }]}>
                  <LinearGradient colors={[Colors.gold, Colors.goldDim]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.mainBtnInner}>
                    <MaterialIcons name="send" size={16} color={Colors.textOnGold} />
                    <Text style={styles.mainBtnText}>{loading ? 'Sending… please wait' : 'Send Reset Link'}</Text>
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
                    <Pressable
                      key={t}
                      onPress={() => { setTab(t); clearError(); setLoginView('form'); }}
                      style={[styles.tabBtn, tab === t && styles.tabBtnActive]}
                    >
                      <Text style={[styles.tabBtnText, tab === t && styles.tabBtnTextActive]}>
                        {t === 'login' ? 'Sign In' : 'Create Account'}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                {/* Method switcher (login only) — Phone tab hidden until Twilio is configured */}
                {tab === 'login' && PHONE_AUTH_ENABLED && (
                  <View style={styles.methodRow}>
                    {(['email', 'phone'] as const).map((m) => (
                      <Pressable key={m} onPress={() => { setMethod(m); setOtpSent(false); clearError(); }} style={[styles.methodBtn, method === m && styles.methodBtnActive]}>
                        <MaterialIcons name={m === 'email' ? 'email' : 'phone'} size={16} color={method === m ? Colors.textOnGold : Colors.textSecondary} />
                        <Text style={[styles.methodText, method === m && styles.methodTextActive]}>
                          {m === 'email' ? 'Email' : 'Phone'}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                )}

                {/* Forms */}
                <View style={styles.form}>

                  {/* ── Login: Email ── */}
                  {tab === 'login' && method === 'email' && (
                    <>
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

                      <Pressable onPress={() => { setLoginView('forgot'); setResetEmail(email); clearError(); }} style={styles.forgotBtn}>
                        <Text style={styles.forgotBtnText}>Forgot password?</Text>
                      </Pressable>

                      <Pressable onPress={handleLogin} disabled={loading} style={({ pressed }) => [styles.mainBtn, pressed && { opacity: 0.85 }]}>
                        <LinearGradient colors={[Colors.gold, Colors.goldDim]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.mainBtnInner}>
                          <Text style={styles.mainBtnText}>{loading ? 'Signing in...' : 'Sign In'}</Text>
                        </LinearGradient>
                      </Pressable>
                    </>
                  )}

                  {/* ── Login: Phone OTP ── */}
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
                            <View style={styles.inputWrapper}>
                              <MaterialIcons name="phone" size={18} color={Colors.textMuted} style={styles.inputIcon} />
                              <TextInput style={styles.input} placeholder="+1 (876) 000-0000" placeholderTextColor={Colors.textMuted} value={phone} onChangeText={setPhone} keyboardType="phone-pad" accessibilityLabel="Phone number" />
                            </View>
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
                              <Pressable
                                key={key}
                                onPress={() =>
                                  setSelectedRoles((prev) => {
                                    if (active && prev.length === 1) return prev;
                                    return active ? prev.filter((r) => r !== key) : [...prev, key];
                                  })
                                }
                                style={({ pressed }) => [
                                  styles.roleBtn,
                                  active && styles.roleBtnActive,
                                  pressed && { opacity: 0.8 },
                                ]}
                              >
                                <MaterialIcons
                                  name={icon as any}
                                  size={20}
                                  color={active ? Colors.textOnGold : Colors.textMuted}
                                />
                                <Text style={[styles.roleBtnText, active && styles.roleBtnTextActive]}>
                                  {label}
                                </Text>
                                {active && (
                                  <MaterialIcons name="check-circle" size={14} color={Colors.textOnGold} />
                                )}
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

                      <Pressable onPress={handleRegister} disabled={loading} style={({ pressed }) => [styles.mainBtn, pressed && { opacity: 0.85 }]}>
                        <LinearGradient colors={[Colors.gold, Colors.goldDim]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.mainBtnInner}>
                          <MaterialIcons name="how-to-reg" size={18} color={Colors.textOnGold} />
                          <Text style={styles.mainBtnText}>{loading ? 'Creating account...' : 'Create Account'}</Text>
                        </LinearGradient>
                      </Pressable>

                      <Text style={styles.termsText}>
                        By creating an account you agree to our Terms of Service. Need help?{' '}
                        <Text style={{ color: Colors.gold }}>{SUPPORT_EMAIL}</Text>
                      </Text>
                    </>
                  )}
                </View>

                {/* Social sign-in — hidden until OAuth is fully implemented */}
                {/* Google and Apple OAuth are not yet configured. Buttons will return
                    when signInWithGoogle() and signInWithApple() are implemented. */}

                {/* Skip */}
                <Pressable onPress={() => router.replace('/(tabs)')} style={styles.skipBtn}>
                  <Text style={styles.skipText}>Browse without account</Text>
                </Pressable>
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: Spacing.base, gap: Spacing.lg },

  header: { paddingTop: Spacing.xl, gap: Spacing.sm },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  logoDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.gold },
  logoText: { fontSize: Typography.sm, fontWeight: '900', color: Colors.gold, letterSpacing: 3 },
  tagline: { fontSize: 26, fontWeight: '900', color: Colors.textPrimary, lineHeight: 32, marginTop: Spacing.sm },

  tabRow: { flexDirection: 'row', backgroundColor: Colors.surface, borderRadius: Radius.md, padding: 3 },
  tabBtn: { flex: 1, paddingVertical: Spacing.sm, alignItems: 'center', borderRadius: Radius.md - 2 },
  tabBtnActive: { backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: Colors.surfaceBorder },
  tabBtnText: { fontSize: Typography.base, color: Colors.textMuted, fontWeight: '500' },
  tabBtnTextActive: { color: Colors.textPrimary, fontWeight: '700' },

  methodRow: { flexDirection: 'row', gap: Spacing.sm },
  methodBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.xs, paddingVertical: Spacing.md, borderRadius: Radius.md,
    backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.surfaceBorder,
  },
  methodBtnActive: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  methodText: { fontSize: Typography.sm, color: Colors.textSecondary, fontWeight: '500' },
  methodTextActive: { color: Colors.textOnGold, fontWeight: '700' },

  form: { gap: Spacing.base },
  inputLabel: { fontSize: Typography.sm, color: Colors.textSecondary, fontWeight: '500', marginBottom: Spacing.xs },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1.5, borderColor: Colors.surfaceBorder, paddingHorizontal: Spacing.md,
  },
  inputIcon: { marginRight: Spacing.sm },
  input: { flex: 1, height: 52, fontSize: Typography.base, color: Colors.textPrimary },
  eyeBtn: { padding: Spacing.xs },

  mismatchText: { fontSize: 11, color: Colors.error ?? '#FF4444', marginTop: 4 },

  forgotBtn: { alignSelf: 'flex-end', paddingVertical: 2 },
  forgotBtnText: { fontSize: Typography.sm, color: Colors.gold, fontWeight: '500' },

  mainBtn: { borderRadius: Radius.md, overflow: 'hidden', marginTop: Spacing.xs },
  mainBtnInner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, paddingVertical: Spacing.base + 2,
  },
  mainBtnText: { fontSize: Typography.md, fontWeight: '700', color: Colors.textOnGold },

  forgotInfo: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    backgroundColor: Colors.goldSurface, padding: Spacing.md, borderRadius: Radius.md,
    borderWidth: 1, borderColor: `${Colors.gold}33`,
  },
  forgotInfoText: { flex: 1, fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 20 },

  backToLoginBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, alignSelf: 'center', paddingVertical: Spacing.sm },
  backToLoginText: { fontSize: Typography.sm, color: Colors.textMuted },

  comingSoonBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, padding: Spacing.md,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  comingSoonText: { flex: 1, fontSize: Typography.sm, color: Colors.textMuted, lineHeight: 19 },

  otpInfo: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.greenSurface, padding: Spacing.md, borderRadius: Radius.md,
    borderWidth: 1, borderColor: `${Colors.green}44`,
  },
  otpInfoText: { flex: 1, fontSize: Typography.sm, color: Colors.greenLight, lineHeight: 20 },

  termsText: { fontSize: Typography.xs, color: Colors.textMuted, textAlign: 'center', lineHeight: 18 },

  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.surfaceBorder },
  dividerText: { fontSize: Typography.sm, color: Colors.textMuted },

  socialRow: { flexDirection: 'row', gap: Spacing.sm },
  socialBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, paddingVertical: Spacing.md, borderRadius: Radius.md,
    backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.surfaceBorder,
  },
  socialBtnText: { fontSize: Typography.sm, color: Colors.textPrimary, fontWeight: '600' },

  skipBtn: { alignItems: 'center', paddingVertical: Spacing.sm },
  skipText: { fontSize: Typography.sm, color: Colors.textMuted, textDecorationLine: 'underline' },

  // Role selector
  roleRow: { flexDirection: 'row', gap: Spacing.sm },
  roleBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.xs, paddingVertical: Spacing.md, borderRadius: Radius.md,
    backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.surfaceBorder,
  },
  roleBtnActive: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  roleBtnText: { fontSize: Typography.sm, color: Colors.textMuted, fontWeight: '600' as const },
  roleBtnTextActive: { color: Colors.textOnGold, fontWeight: '700' as const },
  roleHint: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 4 },

  // Success states
  successIcon: {
    width: 90, height: 90, borderRadius: 45,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: Colors.surfaceBorder,
  },
  successTitle: { fontSize: 24, fontWeight: '900', color: Colors.textPrimary, textAlign: 'center' },
  successSub: { fontSize: Typography.base, color: Colors.textSecondary, textAlign: 'center', lineHeight: 24 },
});
