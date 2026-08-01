import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../hooks/useAuth';
import { Colors, Typography, Spacing, Radius } from '../constants/theme';

type AuthTab = 'login' | 'register';
type LoginMethod = 'email' | 'phone';

export default function Auth() {
  const [tab, setTab] = useState<AuthTab>('login');
  const [method, setMethod] = useState<LoginMethod>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const { signInWithEmail, signInWithPhone, verifyOTP, signInWithGoogle, signInWithApple } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const handleEmailAuth = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Missing Fields', 'Please enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      await signInWithEmail(email.trim(), password);
      router.replace('/(tabs)');
    } catch (_) {
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSendOTP = async () => {
    if (!phone.trim()) {
      Alert.alert('Missing Field', 'Please enter your phone number.');
      return;
    }
    setLoading(true);
    try {
      await signInWithPhone(phone.trim());
      setOtpSent(true);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (!otp.trim()) {
      Alert.alert('Missing Field', 'Please enter the OTP code.');
      return;
    }
    setLoading(true);
    try {
      await verifyOTP(otp.trim());
      router.replace('/(tabs)');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setLoading(true);
    try {
      await signInWithGoogle();
      router.replace('/(tabs)');
    } finally {
      setLoading(false);
    }
  };

  const handleApple = async () => {
    setLoading(true);
    try {
      await signInWithApple();
      router.replace('/(tabs)');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#001A0D', Colors.background, Colors.background]}
        style={StyleSheet.absoluteFillObject}
      />

      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + Spacing.xxl }]}
            showsVerticalScrollIndicator={false}
          >
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.logoRow}>
                <View style={styles.logoDot} />
                <Text style={styles.logoText}>YAAD VYBZ</Text>
              </View>
              <Text style={styles.tagline}>
                {tab === 'login' ? 'Welcome back, Viber.' : "Join the island's event scene."}
              </Text>
            </View>

            {/* Mock badge */}
            <View style={styles.mockBadge}>
              <MaterialIcons name="info" size={14} color={Colors.gold} />
              <Text style={styles.mockText}>DEMO MODE — any email/password works</Text>
            </View>

            {/* Tab switcher */}
            <View style={styles.tabRow}>
              <Pressable
                onPress={() => setTab('login')}
                style={[styles.tabBtn, tab === 'login' && styles.tabBtnActive]}
              >
                <Text style={[styles.tabBtnText, tab === 'login' && styles.tabBtnTextActive]}>
                  Sign In
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setTab('register')}
                style={[styles.tabBtn, tab === 'register' && styles.tabBtnActive]}
              >
                <Text style={[styles.tabBtnText, tab === 'register' && styles.tabBtnTextActive]}>
                  Register
                </Text>
              </Pressable>
            </View>

            {/* Method switcher */}
            <View style={styles.methodRow}>
              <Pressable
                onPress={() => { setMethod('email'); setOtpSent(false); }}
                style={[styles.methodBtn, method === 'email' && styles.methodBtnActive]}
              >
                <MaterialIcons
                  name="email"
                  size={16}
                  color={method === 'email' ? Colors.textOnGold : Colors.textSecondary}
                />
                <Text style={[styles.methodText, method === 'email' && styles.methodTextActive]}>
                  Email
                </Text>
              </Pressable>
              <Pressable
                onPress={() => { setMethod('phone'); setOtpSent(false); }}
                style={[styles.methodBtn, method === 'phone' && styles.methodBtnActive]}
              >
                <MaterialIcons
                  name="phone"
                  size={16}
                  color={method === 'phone' ? Colors.textOnGold : Colors.textSecondary}
                />
                <Text style={[styles.methodText, method === 'phone' && styles.methodTextActive]}>
                  Phone
                </Text>
              </Pressable>
            </View>

            {/* Forms */}
            <View style={styles.form}>
              {method === 'email' ? (
                <>
                  <View>
                    <Text style={styles.inputLabel}>Email Address</Text>
                    <View style={styles.inputWrapper}>
                      <MaterialIcons name="email" size={18} color={Colors.textMuted} style={styles.inputIcon} />
                      <TextInput
                        style={styles.input}
                        placeholder="you@example.com"
                        placeholderTextColor={Colors.textMuted}
                        value={email}
                        onChangeText={setEmail}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoCorrect={false}
                        accessibilityLabel="Email address"
                      />
                    </View>
                  </View>

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
                        accessibilityLabel="Password"
                      />
                      <Pressable onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                        <MaterialIcons
                          name={showPassword ? 'visibility-off' : 'visibility'}
                          size={18}
                          color={Colors.textMuted}
                        />
                      </Pressable>
                    </View>
                  </View>

                  <Pressable
                    onPress={handleEmailAuth}
                    disabled={loading}
                    style={({ pressed }) => [styles.mainBtn, pressed && { opacity: 0.85 }]}
                  >
                    <LinearGradient
                      colors={[Colors.gold, Colors.goldDim]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.mainBtnInner}
                    >
                      <Text style={styles.mainBtnText}>
                        {loading ? 'Please wait...' : tab === 'login' ? 'Sign In' : 'Create Account'}
                      </Text>
                    </LinearGradient>
                  </Pressable>
                </>
              ) : (
                <>
                  {!otpSent ? (
                    <>
                      <View>
                        <Text style={styles.inputLabel}>Phone Number</Text>
                        <View style={styles.inputWrapper}>
                          <MaterialIcons name="phone" size={18} color={Colors.textMuted} style={styles.inputIcon} />
                          <TextInput
                            style={styles.input}
                            placeholder="+1 (876) 000-0000"
                            placeholderTextColor={Colors.textMuted}
                            value={phone}
                            onChangeText={setPhone}
                            keyboardType="phone-pad"
                            accessibilityLabel="Phone number"
                          />
                        </View>
                      </View>
                      <Pressable
                        onPress={handleSendOTP}
                        disabled={loading}
                        style={({ pressed }) => [styles.mainBtn, pressed && { opacity: 0.85 }]}
                      >
                        <LinearGradient
                          colors={[Colors.gold, Colors.goldDim]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={styles.mainBtnInner}
                        >
                          <Text style={styles.mainBtnText}>
                            {loading ? 'Sending...' : 'Send OTP Code'}
                          </Text>
                        </LinearGradient>
                      </Pressable>
                    </>
                  ) : (
                    <>
                      <View style={styles.otpInfo}>
                        <MaterialIcons name="sms" size={20} color={Colors.green} />
                        <Text style={styles.otpInfoText}>
                          Code sent to {phone}. (Demo: enter any 4 digits)
                        </Text>
                      </View>
                      <View>
                        <Text style={styles.inputLabel}>OTP Code</Text>
                        <View style={styles.inputWrapper}>
                          <MaterialIcons name="vpn-key" size={18} color={Colors.textMuted} style={styles.inputIcon} />
                          <TextInput
                            style={styles.input}
                            placeholder="1234"
                            placeholderTextColor={Colors.textMuted}
                            value={otp}
                            onChangeText={setOtp}
                            keyboardType="number-pad"
                            maxLength={6}
                            accessibilityLabel="OTP code"
                          />
                        </View>
                      </View>
                      <Pressable
                        onPress={handleVerifyOTP}
                        disabled={loading}
                        style={({ pressed }) => [styles.mainBtn, pressed && { opacity: 0.85 }]}
                      >
                        <LinearGradient
                          colors={[Colors.gold, Colors.goldDim]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={styles.mainBtnInner}
                        >
                          <Text style={styles.mainBtnText}>
                            {loading ? 'Verifying...' : 'Verify & Continue'}
                          </Text>
                        </LinearGradient>
                      </Pressable>
                    </>
                  )}
                </>
              )}
            </View>

            {/* Divider */}
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or continue with</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Social buttons */}
            <View style={styles.socialRow}>
              <Pressable
                onPress={handleGoogle}
                style={({ pressed }) => [styles.socialBtn, pressed && { opacity: 0.8 }]}
              >
                <MaterialIcons name="language" size={22} color={Colors.textPrimary} />
                <Text style={styles.socialBtnText}>Google</Text>
              </Pressable>

              {Platform.OS === 'ios' && (
                <Pressable
                  onPress={handleApple}
                  style={({ pressed }) => [styles.socialBtn, pressed && { opacity: 0.8 }]}
                >
                  <MaterialIcons name="phone-iphone" size={22} color={Colors.textPrimary} />
                  <Text style={styles.socialBtnText}>Apple</Text>
                </Pressable>
              )}
            </View>

            {/* Skip */}
            <Pressable
              onPress={() => router.replace('/(tabs)')}
              style={styles.skipBtn}
            >
              <Text style={styles.skipText}>Browse without account</Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: {
    paddingHorizontal: Spacing.base,
    gap: Spacing.lg,
  },
  header: {
    paddingTop: Spacing.xl,
    gap: Spacing.sm,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  logoDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.gold,
  },
  logoText: {
    fontSize: Typography.sm,
    fontWeight: Typography.black,
    color: Colors.gold,
    letterSpacing: 3,
  },
  tagline: {
    fontSize: 26,
    fontWeight: Typography.black,
    color: Colors.textPrimary,
    lineHeight: 32,
    marginTop: Spacing.sm,
  },
  mockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.goldSurface,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: `${Colors.gold}33`,
  },
  mockText: {
    fontSize: Typography.xs,
    color: Colors.gold,
    fontWeight: Typography.medium,
  },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: 3,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    borderRadius: Radius.md - 2,
  },
  tabBtnActive: {
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  tabBtnText: {
    fontSize: Typography.base,
    color: Colors.textMuted,
    fontWeight: Typography.medium,
  },
  tabBtnTextActive: {
    color: Colors.textPrimary,
    fontWeight: Typography.bold,
  },
  methodRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  methodBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.surfaceBorder,
  },
  methodBtnActive: {
    backgroundColor: Colors.gold,
    borderColor: Colors.gold,
  },
  methodText: {
    fontSize: Typography.sm,
    color: Colors.textSecondary,
    fontWeight: Typography.medium,
  },
  methodTextActive: {
    color: Colors.textOnGold,
    fontWeight: Typography.bold,
  },
  form: {
    gap: Spacing.base,
  },
  inputLabel: {
    fontSize: Typography.sm,
    color: Colors.textSecondary,
    fontWeight: Typography.medium,
    marginBottom: Spacing.xs,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.surfaceBorder,
    paddingHorizontal: Spacing.md,
  },
  inputIcon: {
    marginRight: Spacing.sm,
  },
  input: {
    flex: 1,
    height: 52,
    fontSize: Typography.base,
    color: Colors.textPrimary,
  },
  eyeBtn: {
    padding: Spacing.xs,
  },
  mainBtn: {
    borderRadius: Radius.md,
    overflow: 'hidden',
    marginTop: Spacing.xs,
  },
  mainBtnInner: {
    paddingVertical: Spacing.base + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainBtnText: {
    fontSize: Typography.md,
    fontWeight: Typography.bold,
    color: Colors.textOnGold,
  },
  otpInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    backgroundColor: Colors.greenSurface,
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: `${Colors.green}44`,
  },
  otpInfoText: {
    flex: 1,
    fontSize: Typography.sm,
    color: Colors.greenLight,
    lineHeight: 20,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.surfaceBorder,
  },
  dividerText: {
    fontSize: Typography.sm,
    color: Colors.textMuted,
  },
  socialRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  socialBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.surfaceBorder,
  },
  socialBtnText: {
    fontSize: Typography.sm,
    color: Colors.textPrimary,
    fontWeight: Typography.semibold,
  },
  skipBtn: {
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  skipText: {
    fontSize: Typography.sm,
    color: Colors.textMuted,
    textDecorationLine: 'underline',
  },
});
