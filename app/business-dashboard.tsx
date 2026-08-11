import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing, Radius } from '../constants/theme';
import { useAuth } from '../hooks/useAuth';
import { useBusinesses } from '../hooks/useBusinesses';
import { Business } from '../types/business';

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, color }: { icon: string; label: string; value: number; color: string }) {
  return (
    <View style={statStyles.card}>
      <View style={[statStyles.iconWrap, { backgroundColor: `${color}22` }]}>
        <MaterialIcons name={icon as any} size={20} color={color} />
      </View>
      <Text style={statStyles.value}>{value.toLocaleString()}</Text>
      <Text style={statStyles.label}>{label}</Text>
    </View>
  );
}
const statStyles = StyleSheet.create({
  card: { flex: 1, backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, padding: Spacing.md, alignItems: 'center', gap: 4, borderWidth: 1, borderColor: Colors.surfaceBorder },
  iconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  value: { fontSize: Typography.xl, fontWeight: Typography.black, color: Colors.textPrimary },
  label: { fontSize: 10, color: Colors.textMuted, textAlign: 'center', fontWeight: Typography.medium },
});

// ─── Action row ───────────────────────────────────────────────────────────────
function ActionRow({ icon, label, description, onPress, badge }: { icon: string; label: string; description?: string; onPress: () => void; badge?: string }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [acStyles.row, pressed && { opacity: 0.8 }]}>
      <View style={acStyles.iconWrap}>
        <MaterialIcons name={icon as any} size={20} color={Colors.gold} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={acStyles.label}>{label}</Text>
        {description ? <Text style={acStyles.desc}>{description}</Text> : null}
      </View>
      {badge && (
        <View style={acStyles.badge}>
          <Text style={acStyles.badgeText}>{badge}</Text>
        </View>
      )}
      <MaterialIcons name="chevron-right" size={20} color={Colors.textMuted} />
    </Pressable>
  );
}
const acStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md, paddingHorizontal: Spacing.base, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder },
  iconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.goldSurface, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  label: { fontSize: Typography.base, fontWeight: Typography.medium, color: Colors.textPrimary },
  desc: { fontSize: Typography.sm, color: Colors.textMuted, marginTop: 2 },
  badge: { backgroundColor: Colors.error, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, color: '#fff', fontWeight: Typography.bold },
});

// ─── Status banner ────────────────────────────────────────────────────────────
function StatusBanner({ business }: { business: Business }) {
  const configs = {
    pending:  { color: Colors.warning, icon: 'hourglass-empty', text: 'Pending Review — Your listing is being reviewed by our team.' },
    live:     { color: Colors.success, icon: 'check-circle', text: 'Live — Your business is publicly visible.' },
    rejected: { color: Colors.error,   icon: 'cancel', text: `Rejected — ${business.rejectedReason ?? 'See admin feedback.'}` },
    flagged:  { color: Colors.warning, icon: 'flag', text: `Flagged — ${business.flagReason ?? 'Under review.'}` },
  };
  const cfg = configs[business.status] ?? configs.pending;
  return (
    <View style={[bnStyles.banner, { borderColor: `${cfg.color}44`, backgroundColor: `${cfg.color}11` }]}>
      <MaterialIcons name={cfg.icon as any} size={20} color={cfg.color} />
      <Text style={[bnStyles.text, { color: cfg.color }]}>{cfg.text}</Text>
    </View>
  );
}
const bnStyles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1, marginBottom: Spacing.lg },
  text: { flex: 1, fontSize: Typography.sm, fontWeight: Typography.medium, lineHeight: 20 },
});

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function BusinessDashboardScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { myBusiness, isLoadingMine, refreshMyBusiness, hasPendingRevision } = useBusinesses();

  useEffect(() => {
    refreshMyBusiness();
  }, []);

  if (isLoadingMine) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={Colors.gold} size="large" />
      </View>
    );
  }

  if (!myBusiness) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
          </Pressable>
          <Text style={styles.topTitle}>My Business</Text>
        </View>
        <View style={styles.noBizWrap}>
          <MaterialIcons name="add-business" size={64} color={Colors.textMuted} />
          <Text style={styles.noBizTitle}>No Business Yet</Text>
          <Text style={styles.noBizBody}>Create your business listing to start reaching customers across Jamaica.</Text>
          <Pressable onPress={() => router.push('/create-business' as any)} style={styles.createBtn}>
            <MaterialIcons name="add" size={20} color={Colors.textOnGold} />
            <Text style={styles.createBtnText}>Create Business Listing</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const biz = myBusiness;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </Pressable>
        <Text style={styles.topTitle} numberOfLines={1}>{biz.name}</Text>
        <Pressable onPress={() => router.push(`/business/${biz.id}` as any)}>
          <MaterialIcons name="open-in-new" size={20} color={Colors.gold} />
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
        <View style={styles.body}>
          {/* Status */}
          <StatusBanner business={biz} />

          {/* Pending revision notice */}
          {hasPendingRevision && (
            <View style={styles.revisionBanner}>
              <MaterialIcons name="edit" size={16} color={Colors.info} />
              <Text style={styles.revisionText}>Changes pending admin review. Public profile shows the last approved version.</Text>
            </View>
          )}

          {/* Analytics grid */}
          <Text style={styles.sectionTitle}>Analytics</Text>
          <View style={styles.statsGrid}>
            <StatCard icon="visibility"    label="Profile Views"    value={biz.viewCount}            color={Colors.gold}    />
            <StatCard icon="phone"         label="Phone Calls"      value={biz.phoneClickCount}      color={Colors.success} />
          </View>
          <View style={[styles.statsGrid, { marginTop: Spacing.sm }]}>
            <StatCard icon="chat"          label="WhatsApp"         value={biz.whatsappClickCount}   color="#25D366"        />
            <StatCard icon="email"         label="Email Clicks"     value={biz.emailClickCount}      color={Colors.info}    />
          </View>
          <View style={[styles.statsGrid, { marginTop: Spacing.sm }]}>
            <StatCard icon="language"      label="Website Clicks"   value={biz.websiteClickCount}    color={Colors.warning} />
            <StatCard icon="directions"    label="Directions"       value={biz.directionsClickCount} color={Colors.error}   />
          </View>

          {/* Management */}
          <Text style={[styles.sectionTitle, { marginTop: Spacing.xl }]}>Management</Text>
          <View style={styles.actionBlock}>
            <ActionRow icon="edit" label="Edit Business" description="Update business info (requires review)" onPress={() => Alert.alert('Coming Soon', 'Edit business functionality will be available in the next update.')} />
            <ActionRow icon="place" label="Manage Locations" description={`${biz.locations?.length ?? 0} location(s)`} onPress={() => Alert.alert('Coming Soon', 'Location management will be available in the next update.')} />
            <ActionRow icon="local-offer" label="Manage Promotions" description="Add deals and discount codes" onPress={() => Alert.alert('Coming Soon', 'Promotion management will be available in the next update.')} />
            <ActionRow icon="build" label="Manage Services" description="Add or update offered services" onPress={() => Alert.alert('Coming Soon', 'Service management will be available in the next update.')} />
            <ActionRow icon="event" label="Post Business Event" description="Add an upcoming event to your profile" onPress={() => router.push('/(tabs)/post' as any)} />
          </View>

          {/* View public profile */}
          {biz.status === 'live' && (
            <Pressable onPress={() => router.push(`/business/${biz.id}` as any)} style={styles.viewPublicBtn}>
              <MaterialIcons name="store" size={18} color={Colors.gold} />
              <Text style={styles.viewPublicText}>View Public Profile</Text>
              <MaterialIcons name="open-in-new" size={16} color={Colors.gold} />
            </Pressable>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  center: { alignItems: 'center', justifyContent: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.base, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder },
  topTitle: { flex: 1, fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textPrimary },
  body: { padding: Spacing.base },
  sectionTitle: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textSecondary, marginBottom: Spacing.md, textTransform: 'uppercase', letterSpacing: 1 },
  statsGrid: { flexDirection: 'row', gap: Spacing.sm },
  actionBlock: { backgroundColor: Colors.surface, borderRadius: Radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: Colors.surfaceBorder },
  revisionBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, backgroundColor: 'rgba(33,150,243,0.1)', borderRadius: Radius.md, padding: Spacing.md, borderWidth: 1, borderColor: 'rgba(33,150,243,0.3)', marginBottom: Spacing.md },
  revisionText: { flex: 1, fontSize: Typography.sm, color: Colors.info, lineHeight: 20 },
  viewPublicBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, marginTop: Spacing.xl, paddingVertical: Spacing.md, backgroundColor: Colors.goldSurface, borderRadius: Radius.lg, borderWidth: 1, borderColor: `${Colors.gold}44` },
  viewPublicText: { fontSize: Typography.base, fontWeight: Typography.semibold, color: Colors.gold },
  noBizWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.md },
  noBizTitle: { fontSize: Typography.xl, fontWeight: Typography.black, color: Colors.textPrimary },
  noBizBody: { fontSize: Typography.base, color: Colors.textMuted, textAlign: 'center', lineHeight: 24 },
  createBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.gold, borderRadius: Radius.lg, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, marginTop: Spacing.md },
  createBtnText: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textOnGold },
});
