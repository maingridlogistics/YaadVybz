/**
 * Promoter More Tab
 * Marketing, Operations, Account, Mode Switch.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  Linking,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { usePromoterMode } from '../../hooks/usePromoterMode';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import { LEGAL_URLS } from '../../constants/legalUrls';
import { SUPPORT_SUBJECT_GENERAL, SUPPORT_EMAIL } from '../../constants/support';
import { canPurchaseDigitalFeatures } from '../../constants/purchaseGate';

function SectionHeader({ title }: { title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionBar} />
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

function MenuRow({
  icon,
  label,
  sub,
  color,
  onPress,
  badge,
  destructive,
}: {
  icon: string;
  label: string;
  sub?: string;
  color: string;
  onPress: () => void;
  badge?: string;
  destructive?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.menuRow, pressed && { opacity: 0.8 }]}
    >
      <View style={[styles.menuIconBg, { backgroundColor: `${color}18` }]}>
        <MaterialIcons name={icon as any} size={18} color={destructive ? Colors.error : color} />
      </View>
      <View style={styles.menuText}>
        <Text style={[styles.menuLabel, destructive && { color: Colors.error }]}>{label}</Text>
        {sub ? <Text style={styles.menuSub}>{sub}</Text> : null}
      </View>
      {badge ? (
        <View style={styles.menuBadge}>
          <Text style={styles.menuBadgeText}>{badge}</Text>
        </View>
      ) : null}
      <MaterialIcons
        name="arrow-forward-ios"
        size={13}
        color={destructive ? Colors.error : Colors.textMuted}
        style={{ opacity: 0.7 }}
      />
    </Pressable>
  );
}

export default function PromoterMoreTab() {
  const { user, signOut, verifiedPromoter, remainingBoosts, subscriptionStatus } = useAuth();
  const { switchToAttendee } = usePromoterMode();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const isPromoter = user?.roles.includes('promoter') ?? false;
  const subscriptionTier = user?.subscriptionTier ?? 'free';

  const tierConfig = {
    free:  { color: '#607D8B', label: 'Free',  icon: 'person' },
    pro:   { color: Colors.gold, label: 'Pro', icon: 'campaign' },
    elite: { color: '#E91E63', label: 'Elite', icon: 'star' },
  } as const;
  const tc = tierConfig[subscriptionTier as keyof typeof tierConfig] ?? tierConfig.free;

  const handleSwitchToAttendee = () => {
    switchToAttendee();
    router.replace('/(tabs)' as any);
  };

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: () => {
          signOut().catch(() => {});
          router.replace('/onboarding' as any);
        },
      },
    ]);
  };

  if (!user) return null;

  const avatarLetter = (user.name[0] ?? 'P').toUpperCase();

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        {/* Mini identity header */}
        <View style={styles.miniHeader}>
          {user.avatarUrl ? (
            <Image
              source={{ uri: user.avatarUrl }}
              style={styles.miniAvatar}
              contentFit="cover"
              transition={200}
            />
          ) : (
            <View style={[styles.miniAvatar, styles.miniAvatarLetter]}>
              <Text style={styles.miniAvatarText}>{avatarLetter}</Text>
            </View>
          )}
          <View style={styles.miniInfo}>
            <View style={styles.miniNameRow}>
              <Text style={styles.miniName} numberOfLines={1}>{user.name}</Text>
              {verifiedPromoter && (
                <MaterialIcons name="verified" size={14} color={Colors.gold} />
              )}
            </View>
            <View style={[styles.tierBadge, { backgroundColor: `${tc.color}22`, borderColor: `${tc.color}55` }]}>
              <MaterialIcons name={tc.icon as any} size={10} color={tc.color} />
              <Text style={[styles.tierText, { color: tc.color }]}>{tc.label}</Text>
            </View>
          </View>
          <Pressable
            onPress={() => router.push(`/promoter/${user.id}` as any)}
            style={({ pressed }) => [styles.viewProfileBtn, pressed && { opacity: 0.7 }]}
            hitSlop={8}
          >
            <MaterialIcons name="open-in-new" size={14} color={Colors.gold} />
            <Text style={styles.viewProfileText}>Public Profile</Text>
          </Pressable>
        </View>
      </SafeAreaView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + Spacing.xxl * 2 }]}
      >
        {/* Marketing */}
        <View style={styles.section}>
          <SectionHeader title="Marketing" />
          <MenuRow
            icon="rocket-launch"
            label="Boost an Event"
            sub="Increase visibility across Jamaica"
            color="#E91E63"
            badge={remainingBoosts != null && remainingBoosts > 0 ? `${remainingBoosts} free` : undefined}
            onPress={() => router.push('/(promoter)/events' as any)}
          />
          <MenuRow
            icon="bar-chart"
            label="Boost Performance"
            sub="View impressions and engagement"
            color="#CE93D8"
            onPress={() => router.push('/(promoter)/events' as any)}
          />
          {canPurchaseDigitalFeatures && (
            <MenuRow
              icon="upgrade"
              label="Upgrade Plan"
              sub={subscriptionTier === 'free' ? 'Unlock Pro or Elite benefits' : `Current: ${tc.label} plan`}
              color={tc.color}
              onPress={() => router.push('/monetization/upgrade' as any)}
            />
          )}
          <MenuRow
            icon="people"
            label="Followers"
            sub="View your audience and followers"
            color="#42A5F5"
            onPress={() => router.push(`/promoter/${user.id}` as any)}
          />
        </View>

        {/* Operations */}
        <View style={styles.section}>
          <SectionHeader title="Operations" />
          <MenuRow
            icon="group"
            label="Manage Staff"
            sub="Scanners and managers"
            color="#7E57C2"
            onPress={() => router.push('/(promoter)/ticketing' as any)}
          />
          <MenuRow
            icon="qr-code-scanner"
            label="Ticket Scanner"
            sub="Scan and verify attendee tickets"
            color="#CE93D8"
            onPress={() => router.push('/(promoter)/ticketing' as any)}
          />
        </View>

        {/* Account */}
        <View style={styles.section}>
          <SectionHeader title="Account" />
          <MenuRow
            icon="open-in-new"
            label="View Public Profile"
            sub="See your promoter page as fans do"
            color="#7E57C2"
            onPress={() => router.push(`/promoter/${user.id}` as any)}
          />
          <MenuRow
            icon="notifications"
            label="Notification Settings"
            sub="Email and push preferences"
            color="#42A5F5"
            onPress={() => router.push('/notification-settings' as any)}
          />
          <MenuRow
            icon="support-agent"
            label="Contact Support"
            sub={SUPPORT_EMAIL}
            color="#26C6DA"
            onPress={() => Linking.openURL(SUPPORT_SUBJECT_GENERAL)}
          />
          <MenuRow
            icon="gavel"
            label="Legal & Policies"
            sub="Terms, promoter policy, ticket terms"
            color={Colors.textMuted}
            onPress={() => Linking.openURL(LEGAL_URLS.terms)}
          />
        </View>

        {/* Mode & Auth */}
        <View style={styles.section}>
          <SectionHeader title="Mode" />

          {/* Switch to Attendee */}
          <Pressable
            onPress={handleSwitchToAttendee}
            style={({ pressed }) => [styles.switchCard, pressed && { opacity: 0.85 }]}
          >
            <LinearGradient
              colors={['rgba(255,255,255,0.04)', 'transparent']}
              style={StyleSheet.absoluteFillObject}
            />
            <View style={styles.switchIconWrap}>
              <MaterialIcons name="people" size={20} color="#42A5F5" />
            </View>
            <View style={styles.switchText}>
              <Text style={styles.switchLabel}>Switch to Attendee View</Text>
              <Text style={styles.switchSub}>Browse events as a regular attendee</Text>
            </View>
            <MaterialIcons name="arrow-forward-ios" size={14} color="#42A5F5" />
          </Pressable>

          {/* Sign Out */}
          <Pressable
            onPress={handleSignOut}
            style={({ pressed }) => [styles.signOutRow, pressed && { opacity: 0.8 }]}
          >
            <MaterialIcons name="logout" size={18} color={Colors.error} />
            <Text style={styles.signOutText}>Sign Out</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  miniHeader: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
    backgroundColor: '#050F08',
  },
  miniAvatar: {
    width: 44, height: 44, borderRadius: 22,
    borderWidth: 1.5, borderColor: `${Colors.gold}66`, flexShrink: 0,
  },
  miniAvatarLetter: {
    backgroundColor: Colors.goldSurface, alignItems: 'center', justifyContent: 'center',
  },
  miniAvatarText: { fontSize: 18, fontWeight: Typography.black as any, color: Colors.gold },
  miniInfo: { flex: 1, gap: 4 },
  miniNameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  miniName: { fontSize: Typography.base, fontWeight: Typography.bold as any, color: Colors.textPrimary },
  tierBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 7, paddingVertical: 2,
    borderRadius: Radius.full, borderWidth: 1, alignSelf: 'flex-start',
  },
  tierText: { fontSize: 10, fontWeight: Typography.bold as any },
  viewProfileBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.goldSurface, paddingHorizontal: Spacing.sm, paddingVertical: 5,
    borderRadius: Radius.full, borderWidth: 1, borderColor: `${Colors.gold}44`,
  },
  viewProfileText: { fontSize: 10, color: Colors.gold, fontWeight: Typography.semibold as any },

  body: { padding: Spacing.base, gap: Spacing.lg },

  section: { gap: Spacing.sm },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  sectionBar: { width: 3, height: 14, borderRadius: 2, backgroundColor: Colors.gold },
  sectionTitle: {
    fontSize: Typography.xs, fontWeight: Typography.bold as any,
    color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1,
  },

  menuRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
    padding: Spacing.md,
  },
  menuIconBg: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  menuText: { flex: 1 },
  menuLabel: { fontSize: Typography.sm, fontWeight: Typography.semibold as any, color: Colors.textPrimary },
  menuSub: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 1 },
  menuBadge: {
    backgroundColor: Colors.goldSurface, paddingHorizontal: Spacing.sm, paddingVertical: 3,
    borderRadius: Radius.full, borderWidth: 1, borderColor: `${Colors.gold}44`,
  },
  menuBadgeText: { fontSize: 10, color: Colors.gold, fontWeight: Typography.bold as any },

  switchCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    borderWidth: 1.5, borderColor: 'rgba(66,165,245,0.35)',
    padding: Spacing.base, overflow: 'hidden', position: 'relative',
  },
  switchIconWrap: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(66,165,245,0.12)', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(66,165,245,0.3)', flexShrink: 0,
  },
  switchText: { flex: 1 },
  switchLabel: { fontSize: Typography.base, fontWeight: Typography.bold as any, color: '#42A5F5' },
  switchSub: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2 },

  signOutRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
    paddingVertical: Spacing.md, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: 'rgba(255,68,68,0.25)',
    backgroundColor: 'rgba(255,68,68,0.06)',
  },
  signOutText: { fontSize: Typography.base, fontWeight: Typography.semibold as any, color: Colors.error },
});
