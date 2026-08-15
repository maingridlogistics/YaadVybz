/**
 * Vybz Hub — Unified Profile Screen
 *
 * Central account and control hub for ALL roles:
 *   - Attendees: account info, my vybz, settings
 *   - Promoters: same + PROMOTER section (direct feature links)
 *   - Admins:    same + ADMIN section (direct feature links)
 *   - Multi-role: all applicable sections shown
 *
 * Navigation: ONE app, ONE tab bar, role content lives here in Profile.
 * No dashboard landing pages — every row routes directly to a feature screen.
 */

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  Modal,
  ActivityIndicator,
  Platform,
  Linking,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { createCustomerPortalSession } from '../../services/subscriptionService';
import { useNotifications } from '../../hooks/useNotifications';
import { useEvents } from '../../hooks/useEvents';
import { useLanguage } from '../../hooks/useLanguage';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import { useCategories } from '../../hooks/useCategories';
import { SUPPORT_EMAIL, SUPPORT_SUBJECT_GENERAL } from '../../constants/support';
import { LEGAL_URLS } from '../../constants/legalUrls';
import { toTitleCase } from '../../constants/textNormalization';
import { canPurchaseDigitalFeatures } from '../../constants/purchaseGate';
import { supabase } from '../../lib/supabase';
import { uploadProfilePhoto } from '../../lib/storage';
import { adminNav } from '../../lib/adminNav';
import { PhoneInput, validatePhone, parseE164 } from '../../components/ui/PhoneInput';
import { isEventPassed } from '../../constants/data';

// ─── Safe date formatter ──────────────────────────────────────────────────────
// Handles ISO timestamps (2026-08-15T12:00:00Z), YYYY-MM-DD strings, and
// undefined/null. Returns null when the date cannot be reliably parsed.
function safeMemberSince(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return null;
    // Guard against epoch zero / far-past fallback values
    if (d.getFullYear() < 2020) return null;
    return d.toLocaleDateString('en-JM', { month: 'long', year: 'numeric' });
  } catch {
    return null;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function isUpcoming(dateStr: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d) >= today;
}

// Smart event router: if exactly 1 live upcoming event go direct; else pick via events list.
// Returns the route string to push/replace with.
type SmartRouteResult = { direct: string } | { pick: string };
function smartEventRoute(
  myEvents: any[],
  destinationFn: (eventId: string) => string,
  fallbackRoute: string
): SmartRouteResult {
  const liveUpcoming = myEvents.filter(
    (e) => e.status === 'live' && !isEventPassed(e.date)
  ).sort((a, b) => a.date.localeCompare(b.date));
  if (liveUpcoming.length === 1) return { direct: destinationFn(liveUpcoming[0].id) };
  if (liveUpcoming.length > 1) return { pick: fallbackRoute };
  // No live upcoming — try any live event
  const live = myEvents.filter((e) => e.status === 'live');
  if (live.length === 1) return { direct: destinationFn(live[0].id) };
  return { pick: fallbackRoute };
}

// ─── Parish Selector Modal ─────────────────────────────────────────────────────
function ParishModal({
  visible, selected, parishes, onToggle, onClear, onSave, onClose,
}: {
  visible: boolean; selected: string[]; parishes: string[];
  onToggle: (p: string) => void; onClear: () => void;
  onSave: () => void; onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={mS.overlay} onPress={onClose}>
        <Pressable style={[mS.sheet, { paddingBottom: Math.max(Spacing.xxl, insets.bottom + Spacing.base) }]} onPress={(e) => e.stopPropagation()}>
          <View style={mS.handle} />
          <View style={mS.head}>
            <View style={{ flex: 1 }}>
              <Text style={mS.title}>Preferred Parishes</Text>
              <Text style={mS.sub}>Prioritize events from these parishes in your feed</Text>
            </View>
            <Pressable onPress={onClear} style={mS.clearBtn} hitSlop={8}>
              <Text style={mS.clearText}>Clear All</Text>
            </Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} style={mS.scroll} contentContainerStyle={mS.grid}>
            {parishes.map((parish) => {
              const active = selected.includes(parish);
              return (
                <Pressable key={parish} onPress={() => onToggle(parish)} style={({ pressed }) => [mS.chip, active && mS.chipOn, pressed && { opacity: 0.8 }]}>
                  <MaterialIcons name={active ? 'place' : 'add-location-alt'} size={13} color={active ? Colors.textOnGold : Colors.textMuted} />
                  <Text style={[mS.chipTxt, active && mS.chipTxtOn]}>{parish}</Text>
                  {active && <View style={mS.check}><MaterialIcons name="check" size={9} color={Colors.textOnGold} /></View>}
                </Pressable>
              );
            })}
          </ScrollView>
          <Pressable onPress={onSave} style={mS.saveBtn}>
            <LinearGradient colors={[Colors.gold, Colors.goldDim]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={mS.saveBtnInner}>
              <MaterialIcons name="check-circle" size={18} color={Colors.textOnGold} />
              <Text style={mS.saveTxt}>{selected.length > 0 ? `Save ${selected.length} Parish${selected.length !== 1 ? 'es' : ''}` : 'Save (None Selected)'}</Text>
            </LinearGradient>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const mS = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: Spacing.base, paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.surfaceBorder, maxHeight: '82%' },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.surfaceBorder, alignSelf: 'center', marginBottom: Spacing.base },
  head: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: Spacing.base, gap: Spacing.md },
  title: { fontSize: Typography.lg, fontWeight: Typography.black, color: Colors.textPrimary },
  sub: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2, lineHeight: 18 },
  clearBtn: { paddingHorizontal: Spacing.sm, paddingVertical: 4, backgroundColor: Colors.surfaceElevated, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.surfaceBorder, alignSelf: 'flex-start' },
  clearText: { fontSize: Typography.xs, color: Colors.textMuted, fontWeight: Typography.medium },
  scroll: { maxHeight: 320 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, paddingBottom: Spacing.md },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.full, backgroundColor: Colors.surfaceElevated, borderWidth: 1.5, borderColor: Colors.surfaceBorder },
  chipOn: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  chipTxt: { fontSize: Typography.sm, color: Colors.textMuted, fontWeight: Typography.medium },
  chipTxtOn: { color: Colors.textOnGold, fontWeight: Typography.bold },
  check: { width: 16, height: 16, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.2)', alignItems: 'center', justifyContent: 'center' },
  saveBtn: { borderRadius: Radius.lg, overflow: 'hidden', marginTop: Spacing.md },
  saveBtnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingVertical: Spacing.base },
  saveTxt: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textOnGold },
});

// ─── Menu Row ──────────────────────────────────────────────────────────────────
function MenuRow({
  icon, iconColor = Colors.textMuted, iconBg, label, badge, badgeColor, onPress, isLast = false, danger = false,
}: {
  icon: string; iconColor?: string; iconBg?: string; label: string;
  badge?: string | number; badgeColor?: string; onPress: () => void;
  isLast?: boolean; danger?: boolean;
}) {
  const bg = iconBg ?? `${iconColor}22`;
  const bc = badgeColor ?? Colors.gold;
  return (
    <>
      <Pressable onPress={onPress} style={({ pressed }) => [menuS.row, pressed && { opacity: 0.65 }]}>
        <View style={[menuS.iconWrap, { backgroundColor: bg }]}>
          <MaterialIcons name={icon as any} size={18} color={iconColor} />
        </View>
        <Text style={[menuS.label, danger && { color: '#EF5350' }]}>{label}</Text>
        {badge !== undefined ? (
          <View style={[menuS.badge, { backgroundColor: `${bc}22`, borderColor: `${bc}55` }]}>
            <Text style={[menuS.badgeText, { color: bc }]}>{badge}</Text>
          </View>
        ) : null}
        <MaterialIcons name="chevron-right" size={18} color={Colors.textMuted} />
      </Pressable>
      {!isLast && <View style={menuS.divider} />}
    </>
  );
}

const menuS = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.base, paddingVertical: 14, gap: Spacing.md, minHeight: 54 },
  iconWrap: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  label: { flex: 1, fontSize: Typography.base, color: Colors.textPrimary, fontWeight: Typography.medium },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full, borderWidth: 1 },
  badgeText: { fontSize: 11, fontWeight: Typography.bold },
  divider: { height: 1, backgroundColor: Colors.surfaceBorder, marginLeft: 66 },
});

// ─── Menu Section ──────────────────────────────────────────────────────────────
function MenuSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={secS.wrap}>
      <Text style={secS.title}>{title}</Text>
      <View style={secS.card}>{children}</View>
    </View>
  );
}

const secS = StyleSheet.create({
  wrap: { marginHorizontal: Spacing.base, marginBottom: Spacing.base },
  title: { fontSize: 11, fontWeight: Typography.bold, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: Spacing.sm, paddingLeft: 2 },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.surfaceBorder, overflow: 'hidden' },
});

// ─── Subscription Card Styles ─────────────────────────────────────────────────
const subCard = StyleSheet.create({
  card: { borderWidth: 1, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.base },
  iconWrap: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
  planName: { fontSize: Typography.base, fontWeight: Typography.black },
  verifiedBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: Radius.full, borderWidth: 1 },
  verifiedText: { fontSize: 10, fontWeight: Typography.bold },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  statusDot: { width: 7, height: 7, borderRadius: 3.5 },
  statusText: { fontSize: Typography.xs, fontWeight: Typography.semibold },
  plansBtn: { paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: Radius.full, borderWidth: 1, flexShrink: 0 },
  plansBtnText: { fontSize: Typography.xs, fontWeight: Typography.bold },
  divider: { height: 1, backgroundColor: Colors.surfaceBorder },
  boostRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.base, paddingVertical: Spacing.md },
  boostLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  boostLabel: { fontSize: Typography.sm, color: Colors.textSecondary, fontWeight: Typography.medium },
  boostCredits: { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  boostNum: { fontSize: Typography.xl, fontWeight: Typography.black },
  boostSlash: { fontSize: Typography.sm, color: Colors.textMuted },
  boostTotal: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textSecondary },
  boostLeft2: { fontSize: Typography.xs, color: Colors.textMuted, marginLeft: 3 },
  renewRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm },
  renewText: { fontSize: Typography.xs, color: Colors.textMuted, flex: 1 },
  portalBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.base, paddingVertical: Spacing.md },
  portalText: { flex: 1, fontSize: Typography.sm, fontWeight: Typography.semibold },
});

// ─── Main Screen ───────────────────────────────────────────────────────────────
export default function ProfileScreen() {
  const {
    user, signOut, updateProfile, addPromoterRole, pushTokenStatus, pushTokenError,
    retryPushToken, verifiedPromoter, remainingBoosts, monthlyBoostAllowance,
    subscriptionStatus, currentPeriodEnd, refreshProfile, deleteAccount,
  } = useAuth();
  const insets = useSafeAreaInsets();
  const { language, setLanguage } = useLanguage();
  const { parishes } = useCategories();
  const {
    events, userGoingIds, userBookmarkIds, getUserPostedEvents,
    getPendingEvents, getFlaggedEvents,
  } = useEvents();
  const router = useRouter();
  const { unreadCount } = useNotifications();

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(user?.name ?? '');
  const [savingName, setSavingName] = useState(false);
  const [editingPhone, setEditingPhone] = useState(false);
  const [phoneInput, setPhoneInput] = useState(user?.phone ?? '');
  const [phoneError, setPhoneError] = useState('');
  const [savingPhone, setSavingPhone] = useState(false);
  const [showParishModal, setShowParishModal] = useState(false);
  const [tempParishes, setTempParishes] = useState<string[]>([]);
  const [portalLoading, setPortalLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [pendingDeletion, setPendingDeletion] = useState(false);
  const [rejectedDeletion, setRejectedDeletion] = useState<{ reason?: string } | null>(null);
  const [rejectionBannerDismissed, setRejectionBannerDismissed] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);

  // Consume any pending adminNav tab request (kept for compat)
  useFocusEffect(
    useCallback(() => {
      adminNav.consumeTab();
    }, [])
  );

  // Check deletion request status
  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from('account_deletion_requests')
      .select('id, status, rejection_reason')
      .eq('user_id', user.id)
      .in('status', ['pending', 'rejected'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        if (data.status === 'pending') setPendingDeletion(true);
        if (data.status === 'rejected') setRejectedDeletion({ reason: data.rejection_reason ?? undefined });
      });
  }, [user?.id]);

  // ── Derived values ────────────────────────────────────────────────────────
  const isPromoter = user?.roles.includes('promoter') ?? false;
  const isAdmin = user?.roles.includes('admin') ?? false;
  const subscriptionTier = user?.subscriptionTier ?? 'free';
  const preferredParishes = user?.preferredParishes ?? [];
  const avatarLetter = (user?.name ?? 'G')[0].toUpperCase();
  const memberSince = safeMemberSince((user as any)?.joinedAt ?? null);

  const goingEvents = useMemo(() => events.filter((e) => userGoingIds.includes(e.id)), [events, userGoingIds]);
  const savedEvents = useMemo(() => events.filter((e) => userBookmarkIds.includes(e.id)), [events, userBookmarkIds]);
  const postedEvents = useMemo(() => (user ? getUserPostedEvents(user.id) : []), [user, getUserPostedEvents]);

  // My live events for smart routing
  const myLiveEvents = useMemo(() => postedEvents.filter(
    (e) => e.status === 'live'
  ), [postedEvents]);

  // Smart navigate helper — resolves event-dependent routes with 1-tap when possible.
  // When multiple eligible events exist, opens the dedicated picker screen that
  // preserves the user's original intent (action) rather than dumping them in My Events.
  const smartNav = useCallback((destinationFn: (id: string) => string, pickerAction: string) => {
    const result = smartEventRoute(myLiveEvents, destinationFn, `/promoter-event-picker?action=${pickerAction}`);
    if ('direct' in result) router.push(result.direct as any);
    else router.push(result.pick as any);
  }, [myLiveEvents, router]);

  // Admin counts
  const pendingEventsCount = isAdmin ? getPendingEvents().length : 0;
  const flaggedEventsCount = isAdmin ? getFlaggedEvents().length : 0;

  // ── Avatar upload ──────────────────────────────────────────────────────────
  const handleAvatarUpload = async () => {
    if (avatarUploading) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Vybz Hub needs access to your photos to upload a profile image.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });
    if (result.canceled || !result.assets[0]) return;
    setAvatarUploading(true);
    try {
      const publicUrl = await uploadProfilePhoto(result.assets[0].uri, user!.id);
      await updateProfile({ avatarUrl: publicUrl } as any);
    } catch (err: any) {
      Alert.alert('Upload Failed', err?.message ?? 'Could not upload profile photo. Please try again.');
    } finally {
      setAvatarUploading(false);
    }
  };

  // ── Name save ──────────────────────────────────────────────────────────────
  const handleSaveName = async () => {
    if (savingName) return;
    setSavingName(true);
    try {
      if (nameInput.trim()) await updateProfile({ name: toTitleCase(nameInput.trim()) });
    } finally {
      setSavingName(false);
      setEditingName(false);
    }
  };

  // ── Phone save ─────────────────────────────────────────────────────────────
  const handleSavePhone = async () => {
    if (savingPhone) return;
    setPhoneError('');
    const parsed = parseE164(phoneInput);
    if (phoneInput && !validatePhone(parsed.country, parsed.national)) {
      setPhoneError(parsed.country.code === 'JM'
        ? 'Enter a valid Jamaica number (876 or 658 area code, 10 digits).'
        : 'Please enter a valid phone number.');
      return;
    }
    setSavingPhone(true);
    try {
      await updateProfile({ phone: phoneInput || undefined } as any);
      setEditingPhone(false);
    } finally {
      setSavingPhone(false);
    }
  };

  // ── Sign out ───────────────────────────────────────────────────────────────
  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out', style: 'destructive',
        onPress: () => {
          signOut().catch(() => {});
          router.replace('/onboarding');
        },
      },
    ]);
  };

  // ── Delete account ─────────────────────────────────────────────────────────
  const handleDeleteAccount = () => {
    if (pendingDeletion) {
      Alert.alert('Request Already Submitted', 'You have a pending account deletion request. Our admin team will review it and notify you of the outcome.');
      return;
    }
    Alert.alert(
      'Request Account Deletion',
      'Your request will be reviewed by our admin team.\n\n⚠️ Once deleted it cannot be recovered. All your events, RSVPs, boosts, and data will be permanently removed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Submit Request', style: 'destructive',
          onPress: async () => {
            if (deleteLoading) return;
            setDeleteLoading(true);
            try {
              const result = await deleteAccount();
              setPendingDeletion(true);
              if (result.alreadyRequested) {
                Alert.alert('Already Requested', 'You already have a pending deletion request.');
              } else {
                Alert.alert('Request Submitted', 'Your deletion request is pending admin review. You will be notified of the outcome.');
              }
            } catch (err: any) {
              Alert.alert('Error', err.message ?? 'Failed to submit request.');
            } finally {
              setDeleteLoading(false);
            }
          },
        },
      ],
    );
  };

  // ── Parish modal ──────────────────────────────────────────────────────────
  const openParishModal = () => { setTempParishes(preferredParishes); setShowParishModal(true); };
  const toggleTempParish = (parish: string) =>
    setTempParishes((prev) => prev.includes(parish) ? prev.filter((p) => p !== parish) : [...prev, parish]);
  const saveParishes = async () => { await updateProfile({ preferredParishes: tempParishes }); setShowParishModal(false); };

  // ─────────────────────────────────────────────────────────────────────────────
  // ── GUEST VIEW ───────────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────────
  if (!user) {
    return (
      <View style={s.container}>
        <SafeAreaView edges={['top']} />
        <View style={s.guestContent}>
          <View style={s.guestAvatar}>
            <MaterialIcons name="person" size={40} color={Colors.textMuted} />
          </View>
          <Text style={s.guestTitle}>Join Vybz Hub</Text>
          <Text style={s.guestSub}>Sign in to save events, RSVP, and get personalized event recommendations.</Text>
          <Pressable onPress={() => router.push('/auth' as any)} style={({ pressed }) => [s.authBtn, pressed && { opacity: 0.85 }]}>
            <LinearGradient colors={[Colors.gold, Colors.goldDim]} style={s.authBtnInner}>
              <Text style={s.authBtnText}>Sign In / Register</Text>
            </LinearGradient>
          </Pressable>
          <View style={s.guestLegalRow}>
            <Pressable onPress={() => Linking.openURL(LEGAL_URLS.privacy)} hitSlop={8}>
              <Text style={s.guestLegalLink}>Privacy Policy</Text>
            </Pressable>
            <Text style={s.guestLegalDot}>·</Text>
            <Pressable onPress={() => Linking.openURL(LEGAL_URLS.terms)} hitSlop={8}>
              <Text style={s.guestLegalLink}>Terms of Use</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ── AUTHENTICATED VIEW ───────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <View style={s.container}>
      <ParishModal
        visible={showParishModal} selected={tempParishes} parishes={parishes}
        onToggle={toggleTempParish} onClear={() => setTempParishes([])}
        onSave={saveParishes} onClose={() => setShowParishModal(false)}
      />

      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        <View style={s.topBar}>
          <View style={{ width: 40 }} />
          <Text style={s.topBarTitle}>Profile</Text>
          <View style={s.topBarRight}>
            <Pressable onPress={() => router.push('/notifications' as any)} style={({ pressed }) => [s.iconBtn, pressed && { opacity: 0.7 }]} hitSlop={8}>
              <MaterialIcons name="notifications-none" size={22} color={Colors.textPrimary} />
              {unreadCount > 0 && (
                <View style={s.notifBadge}>
                  <Text style={s.notifBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                </View>
              )}
            </Pressable>
            <Pressable onPress={() => router.push('/notification-settings' as any)} style={({ pressed }) => [s.iconBtn, pressed && { opacity: 0.7 }]} hitSlop={8}>
              <MaterialIcons name="settings" size={22} color={Colors.textPrimary} />
            </Pressable>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[s.scroll, { paddingBottom: Math.max(Spacing.xxl * 2, insets.bottom + Spacing.xxl) }]}>

        {/* ─────────────────────────── PROFILE HEADER ─────────────────────────── */}
        <View style={s.headerCard}>
          {/* Avatar */}
          <Pressable onPress={handleAvatarUpload} style={({ pressed }) => [s.avatarWrap, pressed && { opacity: 0.85 }]}>
            {user.avatarUrl ? (
              <Image source={{ uri: user.avatarUrl }} style={s.avatar} contentFit="cover" transition={200} />
            ) : (
              <View style={[s.avatar, s.avatarLetterBg]}>
                <Text style={s.avatarLetter}>{avatarLetter}</Text>
              </View>
            )}
            <View style={s.cameraBadge}>
              {avatarUploading
                ? <ActivityIndicator size="small" color={Colors.textOnGold} />
                : <MaterialIcons name="photo-camera" size={13} color={Colors.textOnGold} />}
            </View>
            {verifiedPromoter && (
              <View style={s.verifiedBadge}>
                <MaterialIcons name="verified" size={16} color={Colors.gold} />
              </View>
            )}
          </Pressable>

          {/* Name */}
          {editingName ? (
            <View style={s.nameEditRow}>
              <TextInput
                style={s.nameInput} value={nameInput} onChangeText={setNameInput}
                autoFocus accessibilityLabel="Your name" onSubmitEditing={handleSaveName}
                placeholderTextColor={Colors.textMuted}
              />
              <Pressable onPress={handleSaveName} disabled={savingName} style={[s.nameSaveBtn, savingName && { opacity: 0.6 }]}>
                <MaterialIcons name={savingName ? 'hourglass-top' : 'check'} size={18} color={Colors.textOnGold} />
              </Pressable>
              <Pressable onPress={() => setEditingName(false)} style={s.nameCancelBtn} hitSlop={8}>
                <MaterialIcons name="close" size={16} color={Colors.textMuted} />
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={() => { setEditingName(true); setNameInput(user.name); }} style={s.nameRow}>
              <Text style={s.name}>{user.name}</Text>
              <MaterialIcons name="edit" size={14} color={Colors.textMuted} />
            </Pressable>
          )}

          {/* Email / handle */}
          <Text style={s.email} numberOfLines={1}>{user.email ?? user.phone ?? ''}</Text>

          {/* Role badges */}
          <View style={s.badgesRow}>
            <View style={[s.roleBadge, s.badgeAttendee]}>
              <MaterialIcons name="person" size={11} color={Colors.greenLight} />
              <Text style={[s.roleBadgeText, { color: Colors.greenLight }]}>Attendee</Text>
            </View>
            {isPromoter && (
              <View style={[s.roleBadge, s.badgePromoter]}>
                <MaterialIcons name="campaign" size={11} color={Colors.gold} />
                <Text style={[s.roleBadgeText, { color: Colors.gold }]}>Promoter</Text>
              </View>
            )}
            {isAdmin && (
              <View style={[s.roleBadge, s.badgeAdmin]}>
                <MaterialIcons name="admin-panel-settings" size={11} color="#F44336" />
                <Text style={[s.roleBadgeText, { color: '#F44336' }]}>Admin</Text>
              </View>
            )}
            {subscriptionTier !== 'free' && canPurchaseDigitalFeatures && (
              <View style={[s.roleBadge, { backgroundColor: subscriptionTier === 'elite' ? '#E91E6322' : Colors.goldSurface, borderColor: subscriptionTier === 'elite' ? '#E91E6344' : `${Colors.gold}44` }]}>
                <MaterialIcons name={subscriptionTier === 'elite' ? 'star' : 'verified'} size={11} color={subscriptionTier === 'elite' ? '#E91E63' : Colors.gold} />
                <Text style={[s.roleBadgeText, { color: subscriptionTier === 'elite' ? '#E91E63' : Colors.gold }]}>
                  {subscriptionTier === 'elite' ? 'Elite' : 'Pro'}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* ─────────────────────────── STATS ROW ─────────────────────────────── */}
        <View style={s.statsRow}>
          <Pressable style={s.stat} onPress={() => router.push('/my-events' as any)}>
            <Text style={s.statNum}>{postedEvents.length}</Text>
            <Text style={s.statLabel}>Events</Text>
          </Pressable>
          <View style={s.statDiv} />
          <Pressable style={s.stat} onPress={() => router.push('/my-tickets' as any)}>
            <Text style={s.statNum}>{goingEvents.length}</Text>
            <Text style={s.statLabel}>Going</Text>
          </Pressable>
          <View style={s.statDiv} />
          <Pressable style={s.stat} onPress={() => router.push('/bookmarks' as any)}>
            <Text style={s.statNum}>{savedEvents.length}</Text>
            <Text style={s.statLabel}>Saved</Text>
          </Pressable>
        </View>

        {/* ─────────────────────────── ACCOUNT ───────────────────────────────── */}
        <MenuSection title="Account">
          <MenuRow icon="person-outline" iconColor="#42A5F5" label="Edit Profile"
            onPress={() => { setEditingName(true); setNameInput(user.name); }} />
          <MenuRow icon="phone" iconColor="#66BB6A" label={user.phone ? user.phone : 'Add Phone Number'}
            onPress={() => setEditingPhone(true)} />
          {editingPhone && (
            <View style={s.inlineEdit}>
              <PhoneInput value={phoneInput} onChange={(e164) => { setPhoneInput(e164); setPhoneError(''); }} error={phoneError} disabled={savingPhone} />
              <View style={s.inlineEditBtns}>
                <Pressable onPress={() => setEditingPhone(false)} style={s.inlineCancel}>
                  <Text style={s.inlineCancelText}>Cancel</Text>
                </Pressable>
                <Pressable onPress={handleSavePhone} disabled={savingPhone} style={[s.inlineSave, savingPhone && { opacity: 0.5 }]}>
                  <Text style={s.inlineSaveText}>{savingPhone ? 'Saving...' : 'Save'}</Text>
                </Pressable>
              </View>
            </View>
          )}
          <MenuRow icon="place" iconColor={Colors.gold} label={preferredParishes.length > 0 ? `Preferred Parishes (${preferredParishes.length})` : 'Set Preferred Parishes'}
            onPress={openParishModal} />
          <MenuRow icon="notifications-none" iconColor="#AB47BC" label="Notification Settings"
            onPress={() => router.push('/notification-settings' as any)}
            badge={unreadCount > 0 ? unreadCount : undefined} badgeColor="#AB47BC" isLast />
        </MenuSection>

        {/* ─────────────────────────── MY VYBZ ───────────────────────────────── */}
        <MenuSection title="My Vybz">
          <MenuRow icon="bookmark-border" iconColor={Colors.gold} label="Saved Events"
            badge={savedEvents.length > 0 ? savedEvents.length : undefined}
            onPress={() => router.push('/bookmarks' as any)} />
          <MenuRow icon="confirmation-number" iconColor="#00BCD4" label="My Tickets"
            onPress={() => router.push('/my-tickets' as any)} />
          <MenuRow icon="people-outline" iconColor="#42A5F5" label="Following"
            onPress={() => router.push('/bookmarks' as any)} />
          <MenuRow icon="check-circle-outline" iconColor={Colors.greenLight} label="Going To"
            badge={goingEvents.filter((e) => isUpcoming(e.date)).length > 0 ? goingEvents.filter((e) => isUpcoming(e.date)).length : undefined}
            onPress={() => router.push('/bookmarks' as any)} isLast />
        </MenuSection>

        {/* ─────────────────────────── PROMOTER ──────────────────────────────── */}
        {/* Promoter tools are hidden for admin-only accounts. Admins manage events
             through the Admin Panel, not through personal promoter tools. If the
             account has BOTH admin AND promoter roles, both sections are shown. */}
        {isPromoter && !isAdmin ? (
          <>
            {/* ── PROMOTER: EVENTS ──────────────────────────────────── */}
            <MenuSection title="Events">
              <MenuRow icon="list-alt" iconColor={Colors.gold} label="My Events"
                badge={postedEvents.length > 0 ? postedEvents.length : undefined}
                onPress={() => router.push('/(promoter)/events' as any)} />
              <MenuRow icon="add-circle-outline" iconColor={Colors.greenLight} label="Create Event"
                onPress={() => router.push('/(tabs)/post' as any)} />
              <MenuRow icon="rocket-launch" iconColor="#FF6B35" label="Boost an Event"
                onPress={() => {
                  const boosted = myLiveEvents.filter((e: any) => e.boosted);
                  if (boosted.length === 1) router.push(`/monetization/boost-performance/${boosted[0].id}` as any);
                  else smartNav((id) => `/monetization/boost/${id}`, 'boost');
                }}
                isLast />
            </MenuSection>

            {/* ── PROMOTER: TICKETING ───────────────────────────────── */}
            <MenuSection title="Ticketing">
              <MenuRow icon="tune" iconColor="#9C27B0" label="Ticket Setup"
                onPress={() => smartNav((id) => `/ticketing/setup/${id}`, 'setup')} />
              <MenuRow icon="layers" iconColor="#42A5F5" label="Ticket Tiers"
                onPress={() => smartNav((id) => `/ticketing/tiers/${id}`, 'tiers')} />
              <MenuRow icon="receipt-long" iconColor="#00BCD4" label="Ticket Sales"
                onPress={() => smartNav((id) => `/ticketing/dashboard/${id}`, 'dashboard')} isLast />
            </MenuSection>

            {/* ── PROMOTER: EVENT OPERATIONS ────────────────────────── */}
            <MenuSection title="Event Operations">
              <MenuRow icon="qr-code-scanner" iconColor="#FF9800" label="Ticket Scanner"
                onPress={() => smartNav((id) => `/ticketing/scanner/${id}`, 'scanner')} />
              <MenuRow icon="people" iconColor="#7E57C2" label="Attendees"
                onPress={() => smartNav((id) => `/ticketing/attendees/${id}`, 'attendees')} />
              <MenuRow icon="groups" iconColor="#CE93D8" label="Event Staff"
                onPress={() => smartNav((id) => `/ticketing/staff/${id}`, 'staff')} isLast />
            </MenuSection>

            {/* ── PROMOTER: MONEY ───────────────────────────────────── */}
            <MenuSection title="Money">
              <MenuRow icon="account-balance-wallet" iconColor={Colors.greenLight} label="Finance"
                onPress={() => router.push('/(promoter)/finance' as any)} />
              <MenuRow icon="savings" iconColor="#66BB6A" label="Payouts"
                onPress={() => router.push('/(promoter)/payouts' as any)} />
              <MenuRow icon="undo" iconColor="#EF5350" label="Refunds"
                onPress={() => smartNav((id) => `/ticketing/finance/${id}?section=refunds`, 'refunds')} />
              <MenuRow icon="gavel" iconColor="#FF5722" label="Disputes"
                onPress={() => smartNav((id) => `/ticketing/finance/${id}?section=disputes`, 'disputes')} isLast />
            </MenuSection>

            {/* ── PROMOTER: PROFILE ─────────────────────────────────── */}
            <MenuSection title="Promoter">
              <MenuRow icon="badge" iconColor={Colors.gold} label="View Public Profile"
                onPress={() => router.push(`/promoter/${user.id}` as any)} isLast />
            </MenuSection>
          </>
        ) : !isAdmin ? (
          <MenuSection title="Become a Promoter">
            <MenuRow icon="campaign" iconColor={Colors.gold}
              label="List Your Events on Vybz Hub"
              onPress={addPromoterRole} isLast />
          </MenuSection>
        ) : null}

        {/* ─────────────────────────── ADMIN ─────────────────────────────────── */}
        {isAdmin && (
          <>
            {/* ── ADMIN: MODERATION ──────────────────────────────── */}
            <MenuSection title="Moderation">
              <MenuRow icon="pending-actions" iconColor="#FF9800" label="Event Queue"
                badge={pendingEventsCount > 0 ? pendingEventsCount : undefined} badgeColor="#FF9800"
                onPress={() => router.push('/admin/event-queue' as any)} />
              <MenuRow icon="flag" iconColor="#F44336" label="Flagged Events"
                badge={flaggedEventsCount > 0 ? flaggedEventsCount : undefined} badgeColor="#F44336"
                onPress={() => router.push('/admin/flagged-events' as any)} />
              <MenuRow icon="list-alt" iconColor="#42A5F5" label="All Events"
                onPress={() => router.push('/admin/all-events' as any)} />
              <MenuRow icon="cancel" iconColor="#FF5722" label="Cancellation Requests"
                onPress={() => router.push('/admin/cancellation-requests' as any)} isLast />
            </MenuSection>

            {/* ── ADMIN: PEOPLE ──────────────────────────────────── */}
            <MenuSection title="People">
              <MenuRow icon="people" iconColor="#9C27B0" label="Users"
                onPress={() => router.push('/admin/users' as any)} />
              <MenuRow icon="delete-forever" iconColor="#EF5350" label="Account Deletion Requests"
                onPress={() => router.push('/admin/account-deletion-requests' as any)} isLast />
            </MenuSection>

            {/* ── ADMIN: MONEY ───────────────────────────────────── */}
            <MenuSection title="Money">
              <MenuRow icon="confirmation-number" iconColor="#00BCD4" label="Ticket Orders"
                onPress={() => router.push('/admin/ticket-orders' as any)} />
              <MenuRow icon="account-balance-wallet" iconColor={Colors.greenLight} label="Payouts"
                onPress={() => router.push('/admin/payouts' as any)} />
              <MenuRow icon="gavel" iconColor="#FF5722" label="Disputes"
                onPress={() => router.push('/admin/disputes' as any)} />
              <MenuRow icon="subscriptions" iconColor="#CE93D8" label="Subscriptions"
                onPress={() => router.push('/admin/subscriptions' as any)} isLast />
            </MenuSection>

            {/* ── ADMIN: CONTENT & APP ───────────────────────────── */}
            <MenuSection title="Content & App">
              <MenuRow icon="campaign" iconColor={Colors.gold} label="Ads"
                onPress={() => router.push('/admin/ads-management' as any)} />
              <MenuRow icon="event-available" iconColor="#FF9800" label="Event Settings"
                onPress={() => router.push('/admin/event-settings' as any)} />
              <MenuRow icon="category" iconColor="#7C4DFF" label="Categories"
                onPress={() => router.push('/admin/categories' as any)} />
              <MenuRow icon="build" iconColor={Colors.textMuted} label="System Tools"
                onPress={() => router.push('/admin/system-tools' as any)} isLast />
            </MenuSection>
          </>
        )}

        {/* ─────────────────────────── SUBSCRIPTION ──────────────────────────── */}
        {subscriptionTier !== 'free' && (() => {
          const isElite = subscriptionTier === 'elite';
          const accentColor = isElite ? '#E91E63' : Colors.gold;
          const planName = isElite ? 'Elite' : 'Promoter Pro';
          const isActive = subscriptionStatus === 'active' || subscriptionStatus === 'trialing';
          const isPastDue = subscriptionStatus === 'past_due';
          const renewalDate = currentPeriodEnd
            ? new Date(currentPeriodEnd).toLocaleDateString('en-JM', { month: 'short', day: 'numeric', year: 'numeric' })
            : null;

          return (
            <MenuSection title="Subscription">
              <View style={[subCard.card, { borderColor: `${accentColor}33` }]}>
                <View style={subCard.header}>
                  <View style={[subCard.iconWrap, { backgroundColor: `${accentColor}18` }]}>
                    <MaterialIcons name={isElite ? 'star' : 'campaign'} size={20} color={accentColor} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={subCard.nameLine}>
                      <Text style={[subCard.planName, { color: accentColor }]}>{planName}</Text>
                      {verifiedPromoter && (
                        <View style={[subCard.verifiedBadge, { backgroundColor: `${accentColor}18`, borderColor: `${accentColor}44` }]}>
                          <MaterialIcons name="verified" size={11} color={accentColor} />
                          <Text style={[subCard.verifiedText, { color: accentColor }]}>Verified</Text>
                        </View>
                      )}
                    </View>
                    <View style={subCard.statusRow}>
                      <View style={[subCard.statusDot, { backgroundColor: isPastDue ? '#FF9800' : isActive ? Colors.greenLight : '#F44336' }]} />
                      <Text style={[subCard.statusText, { color: isPastDue ? '#FF9800' : isActive ? Colors.greenLight : '#F44336' }]}>
                        {subscriptionStatus === 'trialing' ? 'Trial active' : isPastDue ? 'Payment past due' : isActive ? 'Active' : subscriptionStatus === 'canceled' ? 'Canceled' : subscriptionStatus}
                      </Text>
                    </View>
                  </View>
                  <Pressable onPress={() => router.push('/monetization/upgrade' as any)} style={({ pressed }) => [subCard.plansBtn, { backgroundColor: `${accentColor}18`, borderColor: `${accentColor}44` }, pressed && { opacity: 0.75 }]}>
                    <Text style={[subCard.plansBtnText, { color: accentColor }]}>Plans</Text>
                  </Pressable>
                </View>
                {monthlyBoostAllowance > 0 && (
                  <>
                    <View style={subCard.divider} />
                    <View style={subCard.boostRow}>
                      <View style={subCard.boostLeft}>
                        <MaterialIcons name="rocket-launch" size={14} color={accentColor} />
                        <Text style={subCard.boostLabel}>Monthly Boost Credits</Text>
                      </View>
                      <View style={subCard.boostCredits}>
                        <Text style={[subCard.boostNum, { color: accentColor }]}>{remainingBoosts}</Text>
                        <Text style={subCard.boostSlash}>/</Text>
                        <Text style={subCard.boostTotal}>{monthlyBoostAllowance}</Text>
                        <Text style={subCard.boostLeft2}>remaining</Text>
                      </View>
                    </View>
                  </>
                )}
                {renewalDate && (
                  <>
                    <View style={subCard.divider} />
                    <View style={subCard.renewRow}>
                      <MaterialIcons name="event" size={12} color={Colors.textMuted} />
                      <Text style={subCard.renewText}>
                        {isPastDue ? 'Payment overdue — update billing' : subscriptionStatus === 'canceled' ? `Access until ${renewalDate}` : `Renews ${renewalDate}`}
                      </Text>
                    </View>
                  </>
                )}
                <View style={subCard.divider} />
                {Platform.OS === 'ios' ? (
                  <Pressable onPress={() => Linking.openURL('itms-apps://apps.apple.com/account/subscriptions').catch(() => Linking.openURL('https://apps.apple.com/account/subscriptions'))} style={({ pressed }) => [subCard.portalBtn, pressed && { opacity: 0.8 }]}>
                    <MaterialIcons name="settings" size={14} color={accentColor} />
                    <Text style={[subCard.portalText, { color: accentColor }]}>Manage in App Store Settings</Text>
                    <MaterialIcons name="arrow-forward-ios" size={11} color={accentColor} />
                  </Pressable>
                ) : Platform.OS === 'android' ? (
                  <Pressable onPress={() => Linking.openURL('https://play.google.com/store/account/subscriptions')} style={({ pressed }) => [subCard.portalBtn, pressed && { opacity: 0.8 }]}>
                    <MaterialIcons name="android" size={14} color={accentColor} />
                    <Text style={[subCard.portalText, { color: accentColor }]}>Manage in Google Play</Text>
                    <MaterialIcons name="arrow-forward-ios" size={11} color={accentColor} />
                  </Pressable>
                ) : (
                  <Pressable onPress={async () => {
                    if (portalLoading) return;
                    setPortalLoading(true);
                    try {
                      const { url, error } = await createCustomerPortalSession();
                      if (url) { await Linking.openURL(url); setTimeout(() => refreshProfile(), 3000); }
                      else Alert.alert('Error', error ?? 'Could not open billing portal.');
                    } finally { setPortalLoading(false); }
                  }} style={({ pressed }) => [subCard.portalBtn, pressed && { opacity: 0.8 }]}>
                    <MaterialIcons name={portalLoading ? 'hourglass-top' : 'open-in-new'} size={14} color={accentColor} />
                    <Text style={[subCard.portalText, { color: accentColor }]}>{portalLoading ? 'Opening...' : 'Manage Billing & Subscription'}</Text>
                    <MaterialIcons name="arrow-forward-ios" size={11} color={accentColor} />
                  </Pressable>
                )}
              </View>
            </MenuSection>
          );
        })()}

        {/* Upgrade CTA (free promoters) */}
        {subscriptionTier === 'free' && isPromoter && (
          <MenuSection title="Subscription">
            <Pressable onPress={() => router.push('/monetization/upgrade' as any)} style={({ pressed }) => [s.upgradeRow, pressed && { opacity: 0.85 }]}>
              <View style={s.upgradeIcon}>
                <MaterialIcons name="rocket-launch" size={20} color={Colors.gold} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.upgradeTitle}>Upgrade to Promoter Pro</Text>
                <Text style={s.upgradeSub}>Unlimited posts, analytics, verified badge</Text>
              </View>
              {Platform.OS !== 'ios' && (
                <View style={s.upgradePill}>
                  <Text style={s.upgradePillText}>$9.99/mo</Text>
                </View>
              )}
              <MaterialIcons name="chevron-right" size={18} color={Colors.gold} />
            </Pressable>
          </MenuSection>
        )}

        {/* ─────────────────────────── SETTINGS & SUPPORT ─────────────────────── */}
        <MenuSection title="Settings & Support">
          <MenuRow icon="language" iconColor="#CE93D8" label={`Language: ${language === 'patois' ? 'Patois 🇯🇲' : 'English 🇬🇧'}`}
            onPress={() => setLanguage(language === 'en' ? 'patois' : 'en')} />
          <MenuRow icon="place" iconColor={Colors.gold} label="Home Parish" onPress={openParishModal} />
          <MenuRow icon="help-outline" iconColor="#42A5F5" label="Help & Support"
            onPress={() => Linking.openURL(SUPPORT_SUBJECT_GENERAL)} />
          <MenuRow icon="email" iconColor={Colors.textMuted} label={SUPPORT_EMAIL}
            onPress={() => Linking.openURL(SUPPORT_SUBJECT_GENERAL)} />
          <MenuRow icon="gavel" iconColor={Colors.textMuted} label="Terms of Use"
            onPress={() => Linking.openURL(LEGAL_URLS.terms)} />
          <MenuRow icon="privacy-tip" iconColor={Colors.textMuted} label="Privacy Policy"
            onPress={() => Linking.openURL(LEGAL_URLS.privacy)} />
          <MenuRow icon="autorenew" iconColor={Colors.textMuted} label="Subscription Terms"
            onPress={() => Linking.openURL(LEGAL_URLS.subscriptionTerms)} />
          <MenuRow icon="replay" iconColor={Colors.textMuted} label="Refund & Cancellation Policy"
            onPress={() => Linking.openURL(LEGAL_URLS.refundPolicy)} />
          <MenuRow icon="info-outline" iconColor={Colors.textMuted} label="About Vybz Hub"
            onPress={() => Linking.openURL('https://vybzhub.com')} isLast />
        </MenuSection>

        {/* Push notification status */}
        {pushTokenStatus !== 'registered' && pushTokenStatus !== 'web' && (
          <View style={s.pushRow}>
            <MaterialIcons name="error-outline" size={14} color={pushTokenStatus === 'denied' ? '#FF7043' : Colors.textMuted} />
            <Text style={[s.pushText, { color: pushTokenStatus === 'denied' ? '#FF7043' : Colors.textMuted }]}>
              {pushTokenStatus === 'denied' ? 'Push notifications denied' : pushTokenStatus === 'failed' ? 'Push registration failed' : 'Push not enabled'}
            </Text>
            {(pushTokenStatus === 'failed' || pushTokenStatus === 'denied') && (
              <Pressable onPress={retryPushToken} style={s.retryBtn} hitSlop={8}>
                <MaterialIcons name="refresh" size={12} color={Colors.gold} />
                <Text style={s.retryText}>Retry</Text>
              </Pressable>
            )}
          </View>
        )}

        {/* ─────────────────────────── ACCOUNT ACTIONS ────────────────────────── */}
        <MenuSection title="Account Actions">
          {rejectedDeletion !== null && !rejectionBannerDismissed && (
            <View style={s.rejectedBanner}>
              <MaterialIcons name="info" size={14} color="#42A5F5" />
              <Text style={s.rejectedText}>
                {rejectedDeletion.reason
                  ? `Deletion not approved: ${rejectedDeletion.reason}`
                  : 'Your deletion request was not approved. Contact support for more info.'}
              </Text>
              <Pressable onPress={() => setRejectionBannerDismissed(true)} hitSlop={8}>
                <MaterialIcons name="close" size={16} color={Colors.textMuted} />
              </Pressable>
            </View>
          )}
          {pendingDeletion ? (
            <View style={s.pendingRow}>
              <MaterialIcons name="hourglass-empty" size={14} color="#FF9800" />
              <Text style={s.pendingText}>Deletion requested — pending admin review</Text>
            </View>
          ) : (
            <MenuRow icon="delete-forever" iconColor="#EF5350" iconBg="rgba(239,83,80,0.1)"
              label={deleteLoading ? 'Submitting...' : 'Delete Account'}
              danger onPress={handleDeleteAccount} />
          )}
          <MenuRow icon="logout" iconColor={Colors.textMuted} label="Sign Out"
            onPress={handleSignOut} isLast />
        </MenuSection>

        {/* Member since — hidden when date is unavailable or invalid */}
        {memberSince !== null && (
          <View style={s.joinedRow}>
            <MaterialIcons name="calendar-today" size={12} color={Colors.textMuted} />
            <Text style={s.joinedText}>Member since {memberSince}</Text>
          </View>
        )}

        <View style={{ height: Spacing.xxl }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles — Dark Theme Only ──────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  // Guest
  guestContent: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl, gap: Spacing.base },
  guestAvatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: Colors.surfaceBorder },
  guestTitle: { fontSize: 26, fontWeight: Typography.black, color: Colors.textPrimary, textAlign: 'center' },
  guestSub: { fontSize: Typography.base, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  guestLegalRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.xs },
  guestLegalLink: { fontSize: Typography.xs, color: Colors.textMuted, textDecorationLine: 'underline' },
  guestLegalDot: { fontSize: Typography.xs, color: Colors.textMuted },
  authBtn: { width: '100%', borderRadius: Radius.md, overflow: 'hidden' },
  authBtnInner: { paddingVertical: Spacing.base, alignItems: 'center' },
  authBtnText: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textOnGold },

  // Top bar
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.base, paddingVertical: Spacing.md },
  topBarTitle: { fontSize: Typography.lg, fontWeight: Typography.black, color: Colors.textPrimary },
  topBarRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  notifBadge: { position: 'absolute', top: 4, right: 4, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: Colors.gold, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2, borderWidth: 1.5, borderColor: Colors.background },
  notifBadgeText: { fontSize: 8, fontWeight: Typography.black, color: Colors.textOnGold },

  scroll: { paddingTop: Spacing.xs },

  // Header card — dark background
  headerCard: { alignItems: 'center', paddingTop: Spacing.lg, paddingBottom: Spacing.lg, paddingHorizontal: Spacing.base, backgroundColor: Colors.background },
  avatarWrap: { position: 'relative', marginBottom: Spacing.base },
  avatar: { width: 88, height: 88, borderRadius: 44 },
  avatarLetterBg: { backgroundColor: Colors.goldSurface, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: Colors.gold },
  avatarLetter: { fontSize: 36, fontWeight: Typography.black, color: Colors.gold },
  cameraBadge: { position: 'absolute', bottom: 2, right: 2, width: 26, height: 26, borderRadius: 13, backgroundColor: Colors.gold, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: Colors.background },
  verifiedBadge: { position: 'absolute', top: 0, right: 0, backgroundColor: Colors.background, borderRadius: 10, padding: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginBottom: 4 },
  name: { fontSize: 22, fontWeight: Typography.black, color: Colors.textPrimary },
  nameEditRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center', marginBottom: 4 },
  nameInput: { flex: 1, fontSize: Typography.lg, color: Colors.textPrimary, backgroundColor: Colors.surface, borderRadius: Radius.md, paddingHorizontal: Spacing.md, borderWidth: 1.5, borderColor: Colors.gold, height: 42 },
  nameSaveBtn: { width: 42, height: 42, borderRadius: Radius.md, backgroundColor: Colors.gold, alignItems: 'center', justifyContent: 'center' },
  nameCancelBtn: { width: 42, height: 42, borderRadius: Radius.md, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.surfaceBorder },
  email: { fontSize: Typography.sm, color: Colors.textMuted, marginBottom: Spacing.sm },
  badgesRow: { flexDirection: 'row', gap: Spacing.xs, flexWrap: 'wrap', justifyContent: 'center' },
  roleBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.full, borderWidth: 1 },
  badgeAttendee: { backgroundColor: Colors.greenSurface, borderColor: `${Colors.greenLight}44` },
  badgePromoter: { backgroundColor: Colors.goldSurface, borderColor: `${Colors.gold}44` },
  badgeAdmin: { backgroundColor: 'rgba(244,67,54,0.1)', borderColor: 'rgba(244,67,54,0.3)' },
  roleBadgeText: { fontSize: 11, fontWeight: Typography.semibold },

  // Stats row — dark surface
  statsRow: { flexDirection: 'row', backgroundColor: Colors.surface, marginHorizontal: Spacing.base, borderRadius: Radius.xl, marginBottom: Spacing.lg, borderWidth: 1, borderColor: Colors.surfaceBorder, overflow: 'hidden' },
  stat: { flex: 1, alignItems: 'center', paddingVertical: Spacing.base, gap: 2 },
  statNum: { fontSize: Typography.xl, fontWeight: Typography.black, color: Colors.textPrimary },
  statLabel: { fontSize: 10, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.3 },
  statDiv: { width: 1, backgroundColor: Colors.surfaceBorder },

  // Inline phone edit
  inlineEdit: { paddingHorizontal: Spacing.base, paddingBottom: Spacing.md, gap: Spacing.sm },
  inlineEditBtns: { flexDirection: 'row', gap: Spacing.sm },
  inlineCancel: { flex: 1, paddingVertical: Spacing.sm, alignItems: 'center', backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.surfaceBorder },
  inlineCancelText: { fontSize: Typography.sm, color: Colors.textSecondary },
  inlineSave: { flex: 1, paddingVertical: Spacing.sm, alignItems: 'center', backgroundColor: Colors.gold, borderRadius: Radius.md },
  inlineSaveText: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textOnGold },

  // Upgrade CTA
  upgradeRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.base, paddingVertical: 15, gap: Spacing.md, minHeight: 64 },
  upgradeIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: Colors.goldSurface, alignItems: 'center', justifyContent: 'center' },
  upgradeTitle: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.gold },
  upgradeSub: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 1 },
  upgradePill: { backgroundColor: Colors.gold, paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: Radius.full },
  upgradePillText: { fontSize: 11, color: Colors.textOnGold, fontWeight: Typography.bold },

  // Push status
  pushRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginHorizontal: Spacing.base, marginBottom: Spacing.sm, padding: Spacing.md, backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.surfaceBorder },
  pushText: { flex: 1, fontSize: Typography.xs },
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: Spacing.sm, paddingVertical: 3, backgroundColor: Colors.goldSurface, borderRadius: Radius.full, borderWidth: 1, borderColor: `${Colors.gold}44` },
  retryText: { fontSize: 11, color: Colors.gold, fontWeight: Typography.semibold },

  // Account actions
  rejectedBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder },
  rejectedText: { flex: 1, fontSize: Typography.xs, color: '#42A5F5', lineHeight: 17 },
  pendingRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.base, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder },
  pendingText: { flex: 1, fontSize: Typography.sm, color: '#FF9800' },

  joinedRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, justifyContent: 'center', paddingVertical: Spacing.md },
  joinedText: { fontSize: Typography.xs, color: Colors.textMuted },
});
