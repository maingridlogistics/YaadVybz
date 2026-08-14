// components/ui/AppScreen.tsx
// Stage 4 — Reusable screen/page container for the light theme design system.

import React from 'react';
import {
  View,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  ViewStyle,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, Edge } from 'react-native-safe-area-context';
import { Colors, Spacing } from '../../constants/theme';

interface AppScreenProps {
  children: React.ReactNode;
  /** Enables vertical scrolling. Default: false (use for full-height screens). */
  scrollable?: boolean;
  /** Show a full-screen loading spinner instead of children. */
  loading?: boolean;
  /** Apply safe area edges. Default: ['top'] */
  edges?: Edge[];
  /** Horizontal content padding. Default: true */
  padded?: boolean;
  paddingHorizontal?: number;
  /** Keyboard avoiding for screens with inputs. */
  keyboardAvoiding?: boolean;
  /** Pull-to-refresh support (scrollable must be true). */
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Extra content padding at the bottom of scroll content */
  contentPaddingBottom?: number;
  style?: ViewStyle;
  contentStyle?: ViewStyle;
  testID?: string;
}

export function AppScreen({
  children,
  scrollable = false,
  loading = false,
  edges = ['top'],
  padded = true,
  paddingHorizontal = Spacing.base,
  keyboardAvoiding = false,
  refreshing = false,
  onRefresh,
  contentPaddingBottom = Spacing.xxl,
  style,
  contentStyle,
  testID,
}: AppScreenProps) {
  const inner = loading ? (
    <View style={styles.loading}>
      <ActivityIndicator size="large" color={Colors.primary} />
    </View>
  ) : scrollable ? (
    <ScrollView
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[
        padded && { paddingHorizontal },
        { paddingBottom: contentPaddingBottom },
        contentStyle,
      ]}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing ?? false}
            onRefresh={onRefresh}
            tintColor={Colors.primary}
            colors={[Colors.primary]}
          />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  ) : (
    <View
      style={[
        styles.staticContent,
        padded && { paddingHorizontal },
        contentStyle,
      ]}
    >
      {children}
    </View>
  );

  const wrapped = keyboardAvoiding ? (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.flex}
    >
      {inner}
    </KeyboardAvoidingView>
  ) : inner;

  return (
    <SafeAreaView
      edges={edges}
      style={[styles.safeArea, style]}
      testID={testID}
    >
      {wrapped}
    </SafeAreaView>
  );
}

// ─── AppScreenHeader ──────────────────────────────────────────────────────────
// Reusable top bar for screens that need a title + optional back/action buttons.

import { Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { Typography, Shadows } from '../../constants/theme';

interface AppScreenHeaderProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  onBackPress?: () => void;
  rightAction?: React.ReactNode;
  bordered?: boolean;
  style?: ViewStyle;
}

export function AppScreenHeader({
  title,
  subtitle,
  showBack = false,
  onBackPress,
  rightAction,
  bordered = true,
  style,
}: AppScreenHeaderProps) {
  const router = useRouter();

  const handleBack = () => {
    if (onBackPress) onBackPress();
    else if (router.canGoBack()) router.back();
  };

  return (
    <View style={[styles.header, bordered && styles.headerBordered, style]}>
      {showBack ? (
        <Pressable
          onPress={handleBack}
          style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.7 }]}
          hitSlop={8}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </Pressable>
      ) : (
        <View style={styles.headerBtnPlaceholder} />
      )}

      <View style={styles.headerCenter}>
        <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
        {subtitle ? (
          <Text style={styles.headerSubtitle} numberOfLines={1}>{subtitle}</Text>
        ) : null}
      </View>

      <View style={styles.headerRight}>
        {rightAction ?? <View style={styles.headerBtnPlaceholder} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  flex: { flex: 1 },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  staticContent: {
    flex: 1,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.surface,
    gap: Spacing.sm,
    minHeight: 56,
  },
  headerBordered: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
    ...Shadows.header,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  headerBtnPlaceholder: { width: 40, height: 40, flexShrink: 0 },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    gap: 1,
  },
  headerTitle: {
    fontSize: Typography.lg,
    fontWeight: Typography.bold,
    color: Colors.textPrimary,
  },
  headerSubtitle: {
    fontSize: Typography.xs,
    color: Colors.textMuted,
  },
  headerRight: {
    width: 40,
    alignItems: 'flex-end',
    flexShrink: 0,
  },
});
