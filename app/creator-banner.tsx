// ─── Pro/Elite Custom Creator Banner Management ─────────────────────────────
// Pro and above feature. Allows Pro/Elite creators to upload / replace / remove a
// custom banner image that appears at the top of their public Creator Profile.
//
// Storage path: profile-images/{userId}/banner.{ext}
// Bucket: profile-images (public, with owner-scoped INSERT/UPDATE/DELETE RLS)
//
// Security:
//   - Server-authoritative Pro check via `user_profiles` fields
//   - Storage path scoped to authenticated user ID
//   - Non-Pro users see a gate screen — no upload UI exposed
//
// Route: /creator-banner

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useAuth } from '../hooks/useAuth';
import { getSupabaseClient } from '../lib/supabase';
import { Colors, Typography, Spacing, Radius } from '../constants/theme';

const BANNER_BUCKET = 'profile-images';
const BANNER_MAX_MB = 5;
const BANNER_MAX_BYTES = BANNER_MAX_MB * 1024 * 1024;

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function CreatorBannerScreen() {
  const router = useRouter();
  const { user, refreshProfile } = useAuth();

  const isAdminUser = user?.roles?.includes('admin') ?? false;
  const tier = user?.subscriptionTier ?? 'free';
  // hasPremiumAccess: lifetime_pro_owned OR admin_pro_granted OR admin role
  const hasPremiumAccess = isAdminUser
    || user?.lifetimeProOwned === true
    || user?.adminProGranted === true
    || (user?.adminElite === true)   // legacy compat
    || tier === 'pro';

  const [currentBannerUrl, setCurrentBannerUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [loading, setLoading] = useState(true);

  // Fetch current banner URL from user_profiles
  const fetchBanner = useCallback(async () => {
    if (!user?.id || !hasPremiumAccess) { setLoading(false); return; }
    const supabase = getSupabaseClient();
    const { data } = await supabase
      .from('user_profiles')
      .select('banner_url')
      .eq('id', user.id)
      .maybeSingle();
    setCurrentBannerUrl((data as any)?.banner_url ?? null);
    setLoading(false);
  }, [user?.id, isElite]);

  useEffect(() => { fetchBanner(); }, [fetchBanner]);

  // Upload new banner
  const handleUpload = useCallback(async () => {
    if (!user?.id || !hasPremiumAccess) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please allow photo library access to upload a banner.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [16, 5],  // Wide banner aspect ratio
      quality: 0.9,
    });
    if (result.canceled || !result.assets[0]) return;

    const uri = result.assets[0].uri;
    const supabase = getSupabaseClient();
    setUploading(true);
    try {
      // Verify session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        Alert.alert('Session Expired', 'Please sign in again and retry.');
        return;
      }
      // Server-authoritative Elite check — re-verify tier before upload
      const { data: profileData } = await supabase
        .from('user_profiles')
        .select('subscription_tier, lifetime_pro_owned, admin_elite, roles')
        .eq('id', session.user.id)
        .maybeSingle();
      const pd = profileData as any;
      const hasAccess = pd?.lifetime_pro_owned === true || pd?.admin_pro_granted === true
        || pd?.admin_elite === true   // legacy
        || (pd?.roles ?? []).includes('admin')
        || pd?.subscription_tier === 'pro';
      if (!hasAccess) {
        Alert.alert('Pro Required', 'The Custom Creator Banner is a Pro feature. Upgrade to Pro to use it.');
        return;
      }

      // Build path — owner-scoped so Storage RLS allows the upload
      const rawExt = (uri.split('.').pop() ?? 'jpg').toLowerCase();
      const ext = rawExt === 'png' ? 'png' : rawExt === 'webp' ? 'webp' : 'jpeg';
      const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
      const storagePath = `${session.user.id}/banner.${ext}`;

      // Fetch as ArrayBuffer — Hermes-safe pattern
      const arrayBuffer = await fetch(uri).then((r) => r.arrayBuffer());

      if (arrayBuffer.byteLength > BANNER_MAX_BYTES) {
        Alert.alert('File Too Large', `Banner must be under ${BANNER_MAX_MB}MB. Please choose a smaller image.`);
        return;
      }

      const { error: uploadError } = await supabase.storage
        .from(BANNER_BUCKET)
        .upload(storagePath, arrayBuffer, { contentType: mimeType, upsert: true });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from(BANNER_BUCKET).getPublicUrl(storagePath);
      // Append cache-buster so expo-image fetches the new image even if the path is unchanged
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      // Persist banner_url to user_profiles
      const { error: updateError } = await supabase
        .from('user_profiles')
        .update({ banner_url: publicUrl } as any)
        .eq('id', session.user.id);
      if (updateError) throw updateError;

      setCurrentBannerUrl(publicUrl);
      await refreshProfile();
      Alert.alert('Banner Updated', 'Your custom creator banner is now live on your profile.');
    } catch (e: any) {
      Alert.alert('Upload Failed', e.message ?? 'Could not upload banner. Please try again.');
    } finally {
      setUploading(false);
    }
  }, [user?.id, isElite, refreshProfile]);

  // Remove banner
  const handleRemove = useCallback(async () => {
    if (!user?.id || !currentBannerUrl) return;
    Alert.alert(
      'Remove Banner',
      'Remove your custom creator banner? Your profile will show the default event cover image.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive',
          onPress: async () => {
            setRemoving(true);
            try {
              const supabase = getSupabaseClient();
              const { error } = await supabase
                .from('user_profiles')
                .update({ banner_url: null } as any)
                .eq('id', user.id);
              if (error) throw error;
              setCurrentBannerUrl(null);
              await refreshProfile();
            } catch (e: any) {
              Alert.alert('Error', e.message ?? 'Could not remove banner.');
            } finally {
              setRemoving(false);
            }
          },
        },
      ]
    );
  }, [user?.id, currentBannerUrl, refreshProfile]);

  // ── Loading ──
  if (loading) {
    return (
      <View style={s.container}>
        <SafeAreaView edges={['top']} />
        <View style={s.center}><ActivityIndicator size="large" color={Colors.gold} /></View>
      </View>
    );
  }

  // ── Pro gate ──
  if (!hasPremiumAccess) {
    return (
      <View style={s.container}>
        <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
          <View style={s.header}>
            <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={8}>
              <MaterialIcons name="arrow-back" size={20} color={Colors.textPrimary} />
            </Pressable>
            <Text style={s.headerTitle}>Custom Creator Banner</Text>
          </View>
        </SafeAreaView>
        <ScrollView contentContainerStyle={s.gateContent}>
          <View style={s.gateIconWrap}>
            <LinearGradient colors={['rgba(233,30,99,0.2)', 'rgba(233,30,99,0.05)']} style={s.gateIconBg}>
              <MaterialIcons name="star" size={48} color="#E91E63" />
            </LinearGradient>
          </View>
          <Text style={s.gateTitle}>Pro Feature</Text>
          <Text style={s.gateBody}>
            Custom Creator Banners are available to Pro creators. Upgrade to Pro to personalize your public Creator Profile with a branded full-width banner.
          </Text>
          <View style={s.gateFeatureList}>
            {[
              'Full-width banner on your Creator Profile',
              'Unique branded presence on Vybz Hub',
              'Replace or remove at any time',
              'Supports JPG, PNG, and WebP',
            ].map((f) => (
              <View key={f} style={s.gateFeatureRow}>
                <MaterialIcons name="check-circle" size={14} color="#E91E63" />
                <Text style={s.gateFeatureText}>{f}</Text>
              </View>
            ))}
          </View>
          <Pressable
            onPress={() => router.push('/monetization/upgrade' as any)}
            style={({ pressed }) => [s.upgradeBtn, pressed && { opacity: 0.85 }]}
          >
            <LinearGradient colors={['#E91E63', '#AD1457']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.upgradeBtnInner}>
              <MaterialIcons name="star" size={16} color="#fff" />
              <Text style={s.upgradeBtnText}>Upgrade to Pro</Text>
            </LinearGradient>
          </Pressable>
        </ScrollView>
      </View>
    );
  }

  // ── Pro management UI ──
  return (
    <View style={s.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        <View style={s.header}>
          <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={8}>
            <MaterialIcons name="arrow-back" size={20} color={Colors.textPrimary} />
          </Pressable>
          <Text style={s.headerTitle}>Custom Creator Banner</Text>
          <View style={[s.eliteBadge, { backgroundColor: Colors.goldSurface, borderColor: `${Colors.gold}44` }]}>
            <MaterialIcons name="verified" size={10} color={Colors.gold} />
            <Text style={[s.eliteBadgeText, { color: Colors.gold }]}>Pro</Text>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.content}>
        {/* Banner preview */}
        <View style={s.previewSection}>
          <Text style={s.sectionLabel}>Current Banner</Text>
          <View style={s.bannerPreview}>
            {currentBannerUrl ? (
              <Image
                source={{ uri: currentBannerUrl }}
                style={s.bannerImg}
                contentFit="cover"
                transition={200}
              />
            ) : (
              <View style={s.bannerPlaceholder}>
                <MaterialIcons name="image" size={36} color={Colors.textMuted} />
                <Text style={s.bannerPlaceholderText}>No banner set</Text>
                <Text style={s.bannerPlaceholderSub}>Your profile uses the first event cover as the default background.</Text>
              </View>
            )}
          </View>

          {/* Dimensions hint */}
          <View style={s.dimensionsHint}>
            <MaterialIcons name="info-outline" size={12} color={Colors.textMuted} />
            <Text style={s.dimensionsHintText}>
              Recommended: 1200×375px (16:5 ratio) · JPG, PNG, WebP · Max {BANNER_MAX_MB}MB
            </Text>
          </View>
        </View>

        {/* Upload / Replace button */}
        <Pressable
          onPress={handleUpload}
          disabled={uploading || removing}
          style={({ pressed }) => [s.uploadBtn, (uploading || removing) && { opacity: 0.5 }, pressed && { opacity: 0.85 }]}
        >
          <LinearGradient colors={['#E91E63', '#AD1457']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.uploadBtnInner}>
            {uploading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <MaterialIcons name={currentBannerUrl ? 'photo-camera' : 'add-photo-alternate'} size={18} color="#fff" />
            )}
            <Text style={s.uploadBtnText}>
              {uploading ? 'Uploading…' : currentBannerUrl ? 'Replace Banner' : 'Upload Banner'}
            </Text>
          </LinearGradient>
        </Pressable>

        {/* Remove button — only shown when banner exists */}
        {currentBannerUrl ? (
          <Pressable
            onPress={handleRemove}
            disabled={uploading || removing}
            style={({ pressed }) => [s.removeBtn, (uploading || removing) && { opacity: 0.5 }, pressed && { opacity: 0.7 }]}
          >
            {removing ? (
              <ActivityIndicator size="small" color="#EF5350" />
            ) : (
              <MaterialIcons name="delete-outline" size={18} color="#EF5350" />
            )}
            <Text style={s.removeBtnText}>{removing ? 'Removing…' : 'Remove Banner'}</Text>
          </Pressable>
        ) : null}

        {/* Info cards */}
        <View style={s.infoCard}>
          <MaterialIcons name="visibility" size={16} color={Colors.gold} />
          <View style={{ flex: 1 }}>
            <Text style={s.infoCardTitle}>Where it appears</Text>
            <Text style={s.infoCardBody}>Your banner is displayed at the top of your public Creator Profile, visible to all Vybz Hub users when they view your profile.</Text>
          </View>
        </View>

        <View style={s.infoCard}>
          <MaterialIcons name="check-circle" size={16} color={Colors.greenLight} />
          <View style={{ flex: 1 }}>
            <Text style={s.infoCardTitle}>Tips for best results</Text>
            <Text style={s.infoCardBody}>Use a wide, landscape image. Avoid important content at the edges — the bottom portion may be covered by your avatar and name on the profile page.</Text>
          </View>
        </View>

        {/* View profile link */}
        <Pressable
          onPress={() => router.push(`/promoter/${user?.id}` as any)}
          style={({ pressed }) => [s.viewProfileBtn, pressed && { opacity: 0.8 }]}
        >
          <MaterialIcons name="person" size={14} color={Colors.gold} />
          <Text style={s.viewProfileBtnText}>View My Public Profile</Text>
          <MaterialIcons name="arrow-forward" size={14} color={Colors.gold} />
        </Pressable>

        <View style={{ height: 80 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
  },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.surfaceBorder },
  headerTitle: { flex: 1, fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textPrimary },
  eliteBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(233,30,99,0.12)', paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: Radius.full, borderWidth: 1, borderColor: 'rgba(233,30,99,0.3)' },
  eliteBadgeText: { fontSize: 10, color: '#E91E63', fontWeight: Typography.bold },

  // Gate
  gateContent: { padding: Spacing.base, alignItems: 'center', gap: Spacing.lg, paddingTop: Spacing.xxl },
  gateIconWrap: { borderRadius: 48, overflow: 'hidden' },
  gateIconBg: { width: 96, height: 96, alignItems: 'center', justifyContent: 'center', borderRadius: 48 },
  gateTitle: { fontSize: Typography.xl, fontWeight: Typography.black, color: Colors.textPrimary, textAlign: 'center' },
  gateBody: { fontSize: Typography.base, color: Colors.textSecondary, textAlign: 'center', lineHeight: 24 },
  gateFeatureList: { alignSelf: 'stretch', gap: Spacing.sm },
  gateFeatureRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.surface, padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.surfaceBorder },
  gateFeatureText: { flex: 1, fontSize: Typography.sm, color: Colors.textSecondary },
  upgradeBtn: { alignSelf: 'stretch', borderRadius: Radius.lg, overflow: 'hidden' },
  upgradeBtnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingVertical: Spacing.base },
  upgradeBtnText: { fontSize: Typography.base, fontWeight: Typography.bold, color: '#fff' },

  // Main
  content: { padding: Spacing.base, gap: Spacing.md },
  previewSection: { gap: Spacing.sm },
  sectionLabel: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 },
  bannerPreview: { height: 140, borderRadius: Radius.lg, overflow: 'hidden', borderWidth: 1.5, borderColor: Colors.surfaceBorder, backgroundColor: Colors.surface },
  bannerImg: { width: '100%', height: '100%' },
  bannerPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, padding: Spacing.base },
  bannerPlaceholderText: { fontSize: Typography.sm, color: Colors.textMuted, fontWeight: Typography.semibold },
  bannerPlaceholderSub: { fontSize: Typography.xs, color: Colors.textMuted, textAlign: 'center', lineHeight: 18 },
  dimensionsHint: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  dimensionsHintText: { flex: 1, fontSize: Typography.xs, color: Colors.textMuted, lineHeight: 16 },

  uploadBtn: { borderRadius: Radius.lg, overflow: 'hidden' },
  uploadBtnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingVertical: Spacing.base },
  uploadBtnText: { fontSize: Typography.base, fontWeight: Typography.bold, color: '#fff' },

  removeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingVertical: Spacing.md, borderRadius: Radius.lg, borderWidth: 1.5, borderColor: 'rgba(239,83,80,0.3)', backgroundColor: 'rgba(239,83,80,0.06)' },
  removeBtnText: { fontSize: Typography.base, color: '#EF5350', fontWeight: Typography.semibold },

  infoCard: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.surfaceBorder },
  infoCardTitle: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textPrimary, marginBottom: 3 },
  infoCardBody: { fontSize: Typography.xs, color: Colors.textSecondary, lineHeight: 18 },

  viewProfileBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, justifyContent: 'center', paddingVertical: Spacing.md, backgroundColor: Colors.goldSurface, borderRadius: Radius.lg, borderWidth: 1, borderColor: `${Colors.gold}44` },
  viewProfileBtnText: { fontSize: Typography.sm, color: Colors.gold, fontWeight: Typography.semibold },
});
