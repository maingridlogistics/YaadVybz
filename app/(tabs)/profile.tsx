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
import { EventCard } from '../../components/feature/EventCard';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import { formatDate } from '../../constants/data';
import { useCategories } from '../../hooks/useCategories';
import { SUPPORT_EMAIL, SUPPORT_SUBJECT_GENERAL } from '../../constants/support';
import { LEGAL_URLS } from '../../constants/legalUrls';
import { toTitleCase } from '../../constants/textNormalization';
import { usePromoterMode } from '../../hooks/usePromoterMode';
import { canPurchaseDigitalFeatures } from '../../constants/purchaseGate';
import { supabase } from '../../lib/supabase';
import { uploadProfilePhoto } from '../../lib/storage';
import AdminScreen from '../admin/index';
import { adminNav } from '../../lib/adminNav';
import { PhoneInput, validatePhone, parseE164 } from '../../components/ui/PhoneInput';

type ProfileTab = 'going' | 'interested' | 'saved' | 'posted';

// ─── Helper ───────────────────────────────────────────────────────────────────
// Use component-based date parsing to avoid UTC midnight shift (Jamaica = UTC-5).
// `new Date('2026-08-15')` parses as UTC and shows as Aug 14 before 5 AM local time.
function isUpcoming(dateStr: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d) >= today;
}

// ─── Parish Selector Modal ────────────────────────────────────────────────────
function ParishModal({
  visible,
  selected,
  parishes,
  onToggle,
  onClear,
  onSave,
  onClose,
}: {
  visible: boolean;
  selected: string[];
  parishes: string[];
  onToggle: (p: string) => void;
  onClear: () => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={mStyles.overlay} onPress={onClose}>
        <Pressable style={[mStyles.sheet, { paddingBottom: Math.max(Spacing.xxl, insets.bottom + Spacing.base) }]} onPress={(e) => e.stopPropagation()}>
          <View style={mStyles.handle} />
          <View style={mStyles.head}>
            <View style={{ flex: 1 }}>
              <Text style={mStyles.title}>Preferred Parishes</Text>
              <Text style={mStyles.sub}>Prioritize events from these parishes in your feed</Text>
            </View>
            <Pressable onPress={onClear} style={mStyles.clearBtn} hitSlop={8}>
              <Text style={mStyles.clearText}>Clear All</Text>
            </Pressable>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            style={mStyles.scroll}
            contentContainerStyle={mStyles.grid}
          >
            {parishes.map((parish) => {
              const active = selected.includes(parish);
              return (
                <Pressable
                  key={parish}
                  onPress={() => onToggle(parish)}
                  style={({ pressed }) => [
                    mStyles.chip,
                    active && mStyles.chipOn,
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  <MaterialIcons
                    name={active ? 'place' : 'add-location-alt'}
                    size={13}
                    color={active ? Colors.textOnGold : Colors.textMuted}
                  />
                  <Text style={[mStyles.chipTxt, active && mStyles.chipTxtOn]}>{parish}</Text>
                  {active && (
                    <View style={mStyles.check}>
                      <MaterialIcons name="check" size={9} color={Colors.textOnGold} />
                    </View>
                  )}
                </Pressable>
              );
            })}
          </ScrollView>

          <Pressable onPress={onSave} style={mStyles.saveBtn}>
            <LinearGradient
              colors={[Colors.gold, Colors.goldDim]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={mStyles.saveBtnInner}
            >
              <MaterialIcons name="check-circle" size={18} color={Colors.textOnGold} />
              <Text style={mStyles.saveTxt}>
                {selected.length > 0
                  ? `Save ${selected.length} Parish${selected.length !== 1 ? 'es' : ''}`
                  : 'Save (None Selected)'}
              </Text>
            </LinearGradient>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const mStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.md,
    // paddingBottom applied dynamically via useSafeAreaInsets
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
    maxHeight: '82%',
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: Colors.surfaceBorder, alignSelf: 'center', marginBottom: Spacing.base,
  },
  head: {
    flexDirection: 'row', alignItems: 'flex-start',
    justifyContent: 'space-between', marginBottom: Spacing.base, gap: Spacing.md,
  },
  title: { fontSize: Typography.lg, fontWeight: Typography.black, color: Colors.textPrimary },
  sub: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2, lineHeight: 18 },
  clearBtn: {
    paddingHorizontal: Spacing.sm, paddingVertical: 4,
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.full,
    borderWidth: 1, borderColor: Colors.surfaceBorder, alignSelf: 'flex-start',
  },
  clearText: { fontSize: Typography.xs, color: Colors.textMuted, fontWeight: Typography.medium },
  scroll: { maxHeight: 320 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, paddingBottom: Spacing.md },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderRadius: Radius.full, backgroundColor: Colors.surfaceElevated,
    borderWidth: 1.5, borderColor: Colors.surfaceBorder,
  },
  chipOn: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  chipTxt: { fontSize: Typography.sm, color: Colors.textMuted, fontWeight: Typography.medium },
  chipTxtOn: { color: Colors.textOnGold, fontWeight: Typography.bold },
  check: {
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.2)', alignItems: 'center', justifyContent: 'center',
  },
  saveBtn: { borderRadius: Radius.lg, overflow: 'hidden', marginTop: Spacing.md },
  saveBtnInner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, paddingVertical: Spacing.base,
  },
  saveTxt: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textOnGold },
});

// ─── Saved Event Row ──────────────────────────────────────────────────────────
function SavedEventRow({
  event,
  onUnsave,
  onPress,
}: {
  event: any;
  onUnsave: () => void;
  onPress: () => void;
}) {
  const isFree = event.ticketPrice === 'Free' || event.ticketPrice === 'Free Entry';
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [savedStyles.card, pressed && { opacity: 0.88 }]}
    >
      <View style={savedStyles.imgWrap}>
        <Image
          source={{ uri: event.coverImage }}
          placeholder={require('../../assets/images/icon.png')}
          placeholderContentFit="cover"
          style={savedStyles.img}
          contentFit="cover"
          transition={200}
        />
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.6)']}
          style={StyleSheet.absoluteFillObject}
        />
      </View>
      <View style={savedStyles.info}>
        <Text style={savedStyles.title} numberOfLines={1}>{event.title}</Text>
        <View style={savedStyles.metaRow}>
          <MaterialIcons name="event" size={11} color={Colors.gold} />
          <Text style={savedStyles.meta}>{formatDate(event.date)}</Text>
          <View style={savedStyles.dot} />
          <MaterialIcons name="place" size={11} color={Colors.textMuted} />
          <Text style={savedStyles.meta} numberOfLines={1}>{event.parish}</Text>
        </View>
        <View style={savedStyles.bottomRow}>
          <Text style={[savedStyles.price, isFree && { color: Colors.greenLight }]}>
            {isFree ? 'Free Entry' : event.ticketPrice}
          </Text>
          <View style={savedStyles.heatRow}>
            <MaterialIcons name="people" size={11} color={Colors.textMuted} />
            <Text style={savedStyles.heatText}>
              {event.goingCount + event.interestedCount} interested
            </Text>
          </View>
        </View>
      </View>
      <Pressable onPress={onUnsave} style={savedStyles.unsaveBtn} hitSlop={8}>
        <MaterialIcons name="bookmark" size={22} color={Colors.gold} />
      </Pressable>
    </Pressable>
  );
}

const savedStyles = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
    overflow: 'hidden', marginBottom: Spacing.sm,
  },
  imgWrap: { width: 76, height: 76, flexShrink: 0, position: 'relative' },
  img: { width: '100%', height: '100%' },
  info: { flex: 1, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, gap: 3 },
  title: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textPrimary, lineHeight: 18 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  meta: { fontSize: 11, color: Colors.textMuted },
  dot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: Colors.surfaceBorder },
  bottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 1 },
  price: { fontSize: 11, fontWeight: Typography.bold, color: Colors.gold },
  heatRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  heatText: { fontSize: 10, color: Colors.textMuted },
  unsaveBtn: { padding: Spacing.md, flexShrink: 0 },
});

// ─── Activity Section Label ───────────────────────────────────────────────────
function ActivityLabel({ icon, label, count }: { icon: string; label: string; count: number }) {
  return (
    <View style={labelStyles.row}>
      <MaterialIcons name={icon as any} size={13} color={Colors.gold} />
      <Text style={labelStyles.text}>{label}</Text>
      <View style={labelStyles.badge}>
        <Text style={labelStyles.badgeTxt}>{count}</Text>
      </View>
    </View>
  );
}

const labelStyles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.xs,
    paddingVertical: Spacing.sm, marginBottom: Spacing.xs,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
  },
  text: {
    flex: 1, fontSize: Typography.xs, fontWeight: Typography.bold,
    color: Colors.gold, textTransform: 'uppercase', letterSpacing: 0.8,
  },
  badge: {
    paddingHorizontal: Spacing.sm, paddingVertical: 2,
    backgroundColor: Colors.goldSurface, borderRadius: Radius.full,
    borderWidth: 1, borderColor: `${Colors.gold}33`,
  },
  badgeTxt: { fontSize: 10, fontWeight: Typography.bold, color: Colors.gold },
});

// ─── Empty Activity ───────────────────────────────────────────────────────────
function EmptyActivity({ icon, message }: { icon: string; message: string }) {
  const router = useRouter();
  return (
    <View style={emptyStyles.container}>
      <View style={emptyStyles.iconWrap}>
        <MaterialIcons name={icon as any} size={36} color={Colors.textMuted} />
      </View>
      <Text style={emptyStyles.message}>{message}</Text>
      <Pressable
        onPress={() => router.push('/(tabs)/browse' as any)}
        style={({ pressed }) => [emptyStyles.btn, pressed && { opacity: 0.8 }]}
      >
        <Text style={emptyStyles.btnText}>Explore Events</Text>
      </Pressable>
    </View>
  );
}

const emptyStyles = StyleSheet.create({
  container: {
    alignItems: 'center', paddingVertical: Spacing.xxl,
    gap: Spacing.md, paddingHorizontal: Spacing.xl,
  },
  iconWrap: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  message: { fontSize: Typography.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 20 },
  btn: {
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm,
    backgroundColor: Colors.goldSurface, borderRadius: Radius.full,
    borderWidth: 1, borderColor: `${Colors.gold}44`,
  },
  btnText: { fontSize: Typography.sm, color: Colors.gold, fontWeight: Typography.semibold },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function ProfileScreen() {
  const { user, signOut, updateProfile, addPromoterRole, pushTokenStatus, pushTokenError, retryPushToken, verifiedPromoter, remainingBoosts, monthlyBoostAllowance, subscriptionStatus, currentPeriodEnd, refreshProfile, deleteAccount } = useAuth();
  const insets = useSafeAreaInsets();
  const { language, setLanguage, t } = useLanguage();
  const { parishes, eventTypes } = useCategories();
  const {
    events,
    userGoingIds,
    userInterestedIds,
    userBookmarkIds,
    toggleGoing,
    toggleInterested,
    toggleBookmark,
    getUserPostedEvents,
  } = useEvents();
  const router = useRouter();
  const { unreadCount } = useNotifications();

  const { switchToPromoter } = usePromoterMode();
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(user?.name ?? '');
  const [savingName, setSavingName] = useState(false);
  const [editingPhone, setEditingPhone] = useState(false);
  const [phoneInput, setPhoneInput] = useState(user?.phone ?? '');
  const [phoneError, setPhoneError] = useState('');
  const [savingPhone, setSavingPhone] = useState(false);
  const [activeTab, setActiveTab] = useState<ProfileTab>('going');
  const [showParishModal, setShowParishModal] = useState(false);
  const [tempParishes, setTempParishes] = useState<string[]>([]);
  const [goingSubTab, setGoingSubTab] = useState<'upcoming' | 'past'>('upcoming');
  const [interestedSubTab, setInterestedSubTab] = useState<'upcoming' | 'past'>('upcoming');
  const [portalLoading, setPortalLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [pendingDeletion, setPendingDeletion] = useState(false);
  const [rejectedDeletion, setRejectedDeletion] = useState<{ reason?: string } | null>(null);
  const [rejectionBannerDismissed, setRejectionBannerDismissed] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [adminRequestedTab, setAdminRequestedTab] = useState<string | null>(null);

  // When the Profile tab regains focus, check if another screen (e.g. the admin
  // gate in post.tsx) requested a specific admin tab to be shown.
  useFocusEffect(
    useCallback(() => {
      const tab = adminNav.consumeTab();
      if (tab) setAdminRequestedTab(tab);
    }, [])
  );

  // Check deletion request status (pending = show banner; rejected = show rejection banner)
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

  // ── Event Groups ──────────────────────────────────────────────────────────
  const goingEvents = useMemo(
    () => events.filter((e) => userGoingIds.includes(e.id)),
    [events, userGoingIds]
  );
  const interestedEvents = useMemo(
    () => events.filter((e) => userInterestedIds.includes(e.id)),
    [events, userInterestedIds]
  );
  const savedEvents = useMemo(
    () => events.filter((e) => userBookmarkIds.includes(e.id)),
    [events, userBookmarkIds]
  );
  const postedEvents = useMemo(
    () => (user ? getUserPostedEvents(user.id) : []),
    [user, getUserPostedEvents]
  );

  const upcomingGoing = useMemo(() => goingEvents.filter((e) => isUpcoming(e.date)), [goingEvents]);
  const pastGoing = useMemo(() => goingEvents.filter((e) => !isUpcoming(e.date)), [goingEvents]);
  const upcomingInterested = useMemo(
    () => interestedEvents.filter((e) => isUpcoming(e.date)),
    [interestedEvents]
  );
  const pastInterested = useMemo(
    () => interestedEvents.filter((e) => !isUpcoming(e.date)),
    [interestedEvents]
  );

  // ── Admin users see the full admin panel directly on the Profile tab ────────
  if (user?.roles.includes('admin')) {
    return (
      <AdminScreen
        embedded
        requestedTab={adminRequestedTab}
        onTabConsumed={() => setAdminRequestedTab(null)}
      />
    );
  }

  const isPromoter = user?.roles.includes('promoter') ?? false;
  const preferredParishes = user?.preferredParishes ?? [];
  const avatarLetter = (user?.name ?? 'G')[0].toUpperCase();

  // ── Avatar upload ──────────────────────────────────────────────────────────
  const handleAvatarUpload = async () => {
    if (avatarUploading) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Vybz Hub needs access to your photos so you can select event flyers and profile images to upload.');
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
  const subscriptionTier = user?.subscriptionTier ?? 'free';

  // ── Handlers ──────────────────────────────────────────────────────────────
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

  const handleSavePhone = async () => {
    if (savingPhone) return;
    setPhoneError('');
    const parsed = parseE164(phoneInput);
    if (phoneInput && !validatePhone(parsed.country, parsed.national)) {
      if (parsed.country.code === 'JM') {
        setPhoneError('Enter a valid Jamaica number (876 or 658 area code, 10 digits).');
      } else {
        setPhoneError('Please enter a valid phone number.');
      }
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

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: () => {
          // Fire sign-out and navigate immediately — do not await.
          // Awaiting signOut() causes iOS to block the Alert dismiss
          // while removePushToken / supabase.auth.signOut() are in flight,
          // making the button appear to do nothing.
          signOut().catch(() => {});
          router.replace('/onboarding');
        },
      },
    ]);
  };

  const handleDeleteAccount = () => {
    if (pendingDeletion) {
      Alert.alert(
        'Request Already Submitted',
        'You have a pending account deletion request. Our admin team will review it and you will be notified of the outcome.',
      );
      return;
    }
    Alert.alert(
      'Request Account Deletion',
      'Your request will be reviewed by our admin team.\n\n\u26a0\ufe0f Once your account is deleted it cannot be recovered. All your events, RSVPs, boosts, and data will be permanently removed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Submit Request',
          style: 'destructive',
          onPress: async () => {
            if (deleteLoading) return;
            setDeleteLoading(true);
            try {
              const result = await deleteAccount();
              setPendingDeletion(true);
              if (result.alreadyRequested) {
                Alert.alert('Already Requested', 'You already have a pending deletion request. Our team will review it shortly.');
              } else {
                Alert.alert('Request Submitted', 'Your account deletion request has been submitted and is pending admin review. You will be notified of the outcome.');
              }
            } catch (err: any) {
              Alert.alert('Error', err.message ?? 'Failed to submit request. Please try again.');
            } finally {
              setDeleteLoading(false);
            }
          },
        },
      ],
    );
  };

  const openParishModal = () => {
    setTempParishes(preferredParishes);
    setShowParishModal(true);
  };

  const toggleTempParish = (parish: string) =>
    setTempParishes((prev) =>
      prev.includes(parish) ? prev.filter((p) => p !== parish) : [...prev, parish]
    );

  const saveParishes = async () => {
    await updateProfile({ preferredParishes: tempParishes });
    setShowParishModal(false);
  };

  // ── Tab config ────────────────────────────────────────────────────────────
  const TABS: { key: ProfileTab; label: string; count: number; icon: string }[] = [
    { key: 'going',      label: 'Going',      count: goingEvents.length,    icon: 'check-circle' },
    { key: 'interested', label: 'Interested', count: interestedEvents.length, icon: 'star' },
    { key: 'saved',      label: 'Saved',      count: savedEvents.length,    icon: 'bookmark' },
    { key: 'posted',     label: 'Posted',     count: postedEvents.length,   icon: 'campaign' },
  ];

  // ── Tab content ───────────────────────────────────────────────────────────
  const renderTabContent = () => {
    switch (activeTab) {
      case 'going': {
        if (goingEvents.length === 0) {
          return (
            <EmptyActivity
              icon="check-circle-outline"
              message="No events marked as going yet. Explore events and tap the Going button!"
            />
          );
        }
        const displayedGoing = goingSubTab === 'upcoming' ? upcomingGoing : pastGoing;
        return (
          <>
            {/* Sub-tabs */}
            <View style={styles.subTabRow}>
              <Pressable
                onPress={() => setGoingSubTab('upcoming')}
                style={[styles.subTab, goingSubTab === 'upcoming' && styles.subTabActive]}
              >
                <MaterialIcons
                  name="upcoming"
                  size={13}
                  color={goingSubTab === 'upcoming' ? Colors.textOnGold : Colors.textMuted}
                />
                <Text style={[styles.subTabText, goingSubTab === 'upcoming' && styles.subTabTextActive]}>
                  Upcoming ({upcomingGoing.length})
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setGoingSubTab('past')}
                style={[styles.subTab, goingSubTab === 'past' && styles.subTabActive]}
              >
                <MaterialIcons
                  name="history"
                  size={13}
                  color={goingSubTab === 'past' ? Colors.textOnGold : Colors.textMuted}
                />
                <Text style={[styles.subTabText, goingSubTab === 'past' && styles.subTabTextActive]}>
                  Past ({pastGoing.length})
                </Text>
              </Pressable>
            </View>

            {displayedGoing.length === 0 ? (
              <EmptyActivity
                icon={goingSubTab === 'upcoming' ? 'check-circle-outline' : 'history'}
                message={
                  goingSubTab === 'upcoming'
                    ? 'No upcoming events going — check back after RSVPing to new events!'
                    : 'No past events yet — your history will appear here once events pass.'
                }
              />
            ) : (
              displayedGoing.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  isGoing={true}
                  isInterested={userInterestedIds.includes(event.id)}
                  onToggleGoing={() => toggleGoing(event.id)}
                  onToggleInterested={() => toggleInterested(event.id)}
                />
              ))
            )}
          </>
        );
      }

      case 'interested': {
        if (interestedEvents.length === 0) {
          return (
            <EmptyActivity
              icon="star-outline"
              message="No events saved as interested yet. Star events you want to keep on your radar!"
            />
          );
        }
        const displayedInterested = interestedSubTab === 'upcoming' ? upcomingInterested : pastInterested;
        return (
          <>
            {/* Sub-tabs */}
            <View style={styles.subTabRow}>
              <Pressable
                onPress={() => setInterestedSubTab('upcoming')}
                style={[styles.subTab, interestedSubTab === 'upcoming' && styles.subTabActive]}
              >
                <MaterialIcons
                  name="upcoming"
                  size={13}
                  color={interestedSubTab === 'upcoming' ? Colors.textOnGold : Colors.textMuted}
                />
                <Text style={[styles.subTabText, interestedSubTab === 'upcoming' && styles.subTabTextActive]}>
                  Upcoming ({upcomingInterested.length})
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setInterestedSubTab('past')}
                style={[styles.subTab, interestedSubTab === 'past' && styles.subTabActive]}
              >
                <MaterialIcons
                  name="history"
                  size={13}
                  color={interestedSubTab === 'past' ? Colors.textOnGold : Colors.textMuted}
                />
                <Text style={[styles.subTabText, interestedSubTab === 'past' && styles.subTabTextActive]}>
                  Past ({pastInterested.length})
                </Text>
              </Pressable>
            </View>

            {displayedInterested.length === 0 ? (
              <EmptyActivity
                icon={interestedSubTab === 'upcoming' ? 'star-outline' : 'history'}
                message={
                  interestedSubTab === 'upcoming'
                    ? 'No upcoming events saved as interested — star events to track them!'
                    : 'No past interested events yet — history appears here once events pass.'
                }
              />
            ) : (
              displayedInterested.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  isGoing={userGoingIds.includes(event.id)}
                  isInterested={true}
                  onToggleGoing={() => toggleGoing(event.id)}
                  onToggleInterested={() => toggleInterested(event.id)}
                />
              ))
            )}
          </>
        );
      }

      case 'saved': {
        if (savedEvents.length === 0) {
          return (
            <EmptyActivity
              icon="bookmark-border"
              message="No saved events yet. Tap the bookmark icon on any event to save it here."
            />
          );
        }
        return (
          <>
            <ActivityLabel icon="bookmark" label="Saved Events" count={savedEvents.length} />
            <View style={styles.savedNote}>
              <MaterialIcons name="info-outline" size={13} color={Colors.textMuted} />
              <Text style={styles.savedNoteText}>Tap the bookmark to unsave an event</Text>
            </View>
            {savedEvents.map((event) => (
              <SavedEventRow
                key={event.id}
                event={event}
                onUnsave={() => toggleBookmark(event.id)}
                onPress={() => router.push(`/event/${event.id}` as any)}
              />
            ))}
          </>
        );
      }

      case 'posted': {
        if (postedEvents.length === 0) {
          return (
            <View style={styles.emptyPosted}>
              <View style={styles.emptyPostedIcon}>
                <MaterialIcons name="add-circle-outline" size={40} color={Colors.textMuted} />
              </View>
              <Text style={styles.emptyPostedTitle}>No Events Posted Yet</Text>
              <Text style={styles.emptyPostedSub}>
                {isPromoter
                  ? 'Start listing your events and reach thousands of party-goers across Jamaica.'
                  : 'Activate your promoter account to start posting events.'}
              </Text>
              {!isPromoter && (
                <Pressable
                  onPress={addPromoterRole}
                  style={({ pressed }) => [styles.becomeBtn, pressed && { opacity: 0.8 }]}
                >
                  <MaterialIcons name="campaign" size={15} color={Colors.gold} />
                  <Text style={styles.becomeBtnText}>Activate Promoter</Text>
                </Pressable>
              )}
              <Pressable
                onPress={() => router.push('/(tabs)/post' as any)}
                style={styles.postEventBtn}
              >
                <LinearGradient
                  colors={[Colors.gold, Colors.goldDim]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.postEventBtnInner}
                >
                  <MaterialIcons name="add" size={16} color={Colors.textOnGold} />
                  <Text style={styles.postEventBtnText}>Post an Event</Text>
                </LinearGradient>
              </Pressable>
            </View>
          );
        }
        return (
          <>
            <ActivityLabel icon="list-alt" label="Your Events" count={postedEvents.length} />
            {postedEvents.map((event) => (
              <View key={event.id} style={styles.postedWrap}>
                <EventCard event={event} compact />
                <Pressable
                  onPress={() => router.push(`/edit-event/${event.id}` as any)}
                  style={styles.editBadge}
                >
                  <MaterialIcons name="edit" size={11} color={Colors.gold} />
                  <Text style={styles.editBadgeText}>Edit</Text>
                </Pressable>
                {event.boosted && (
                  <Pressable
                    onPress={() => router.push(`/monetization/boost-performance/${event.id}` as any)}
                    style={styles.statsBadge}
                  >
                    <MaterialIcons name="bar-chart" size={11} color="#00BCD4" />
                    <Text style={styles.statsBadgeText}>Stats</Text>
                  </Pressable>
                )}
              </View>
            ))}
            <Pressable
              onPress={() => router.push('/my-events' as any)}
              style={({ pressed }) => [styles.manageLink, pressed && { opacity: 0.7 }]}
            >
              <MaterialIcons name="open-in-new" size={14} color={Colors.gold} />
              <Text style={styles.manageLinkText}>Manage All Events</Text>
            </Pressable>
          </>
        );
      }
    }
  };

  // ── Guest view ────────────────────────────────────────────────────────────
  if (!user) {
    return (
      <View style={styles.guestContainer}>
        <SafeAreaView edges={['top']} />
        <View style={styles.guestContent}>
          <View style={styles.guestAvatar}>
            <MaterialIcons name="person" size={40} color={Colors.textMuted} />
          </View>
          <Text style={styles.guestTitle}>Join Vybz Hub</Text>
          <Text style={styles.guestSub}>
            Sign in to save events, RSVP, and get personalized event recommendations.
          </Text>
          <Pressable
            onPress={() => router.push('/auth' as any)}
            style={({ pressed }) => [styles.authBtn, pressed && { opacity: 0.85 }]}
          >
            <LinearGradient colors={[Colors.gold, Colors.goldDim]} style={styles.authBtnInner}>
              <Text style={styles.authBtnText}>Sign In / Register</Text>
            </LinearGradient>
          </Pressable>
          <View style={styles.guestLegalRow}>
            <Pressable onPress={() => Linking.openURL('https://vybzhub.com/privacy')} hitSlop={8}>
              <Text style={styles.guestLegalLink}>Privacy Policy</Text>
            </Pressable>
            <Text style={styles.guestLegalDot}>·</Text>
            <Pressable onPress={() => Linking.openURL('https://vybzhub.com/terms')} hitSlop={8}>
              <Text style={styles.guestLegalLink}>Terms of Use</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  // ── Main view ─────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* Preferred Parishes Modal */}
      <ParishModal
        visible={showParishModal}
        selected={tempParishes}
        parishes={parishes}
        onToggle={toggleTempParish}
        onClear={() => setTempParishes([])}
        onSave={saveParishes}
        onClose={() => setShowParishModal(false)}
      />

      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        <View style={styles.topBar}>
          <Text style={styles.topBarTitle}>{t.profileTitle}</Text>
          <View style={styles.topBarRight}>
            <Pressable
              onPress={() => router.push('/notifications' as any)}
              style={({ pressed }) => [styles.topBarBellBtn, pressed && { opacity: 0.8 }]}
              hitSlop={8}
            >
              <MaterialIcons name="notifications" size={20} color={Colors.textPrimary} />
              {unreadCount > 0 && (
                <View style={styles.topBarBellBadge}>
                  <Text style={styles.topBarBellBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                </View>
              )}
            </Pressable>
            <Pressable onPress={handleSignOut} style={styles.signOutBtn} hitSlop={8}>
              <MaterialIcons name="logout" size={20} color={Colors.textMuted} />
            </Pressable>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.scroll, { paddingBottom: Math.max(Spacing.xxl, insets.bottom + Spacing.lg) }]}>

        {/* ── Profile Card ── */}
        <View style={styles.profileCard}>
          <LinearGradient
            colors={['#001A0D', Colors.surface]}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={styles.avatarRow}>
            <Pressable
              onPress={handleAvatarUpload}
              style={({ pressed }) => [styles.avatarWrap, pressed && { opacity: 0.85 }]}
            >
              {user.avatarUrl ? (
                <Image
                  source={{ uri: user.avatarUrl }}
                  style={styles.avatar}
                  contentFit="cover"
                  transition={200}
                />
              ) : (
                <View style={[styles.avatar, styles.avatarLetterBg]}>
                  <Text style={styles.avatarLetter}>{avatarLetter}</Text>
                </View>
              )}
              <View style={styles.avatarCameraBadge}>
                {avatarUploading ? (
                  <ActivityIndicator size="small" color={Colors.textOnGold} />
                ) : (
                  <MaterialIcons name="photo-library" size={14} color={Colors.textOnGold} />
                )}
              </View>
            </Pressable>
            <View style={styles.nameSection}>
              {editingName ? (
                <View style={styles.nameEditRow}>
                  <TextInput
                    style={styles.nameInput}
                    value={nameInput}
                    onChangeText={setNameInput}
                    autoFocus
                    accessibilityLabel="Your name"
                    onSubmitEditing={handleSaveName}
                  />
                  <Pressable onPress={handleSaveName} disabled={savingName} style={[styles.nameSaveBtn, savingName && { opacity: 0.6 }]}>
                    <MaterialIcons name={savingName ? 'hourglass-top' : 'check'} size={18} color={Colors.textOnGold} />
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  onPress={() => { setEditingName(true); setNameInput(user.name); }}
                  style={styles.nameRow}
                >
                  <Text style={styles.name}>{user.name}</Text>
                  <MaterialIcons name="edit" size={14} color={Colors.textMuted} />
                </Pressable>
              )}
              <Text style={styles.contact} numberOfLines={1}>
                {user.email ?? user.phone ?? 'Guest Account'}
              </Text>
              <View style={styles.rolesRow}>
                <View style={styles.roleBadge}>
                  <MaterialIcons name="person" size={11} color={Colors.greenLight} />
                  <Text style={styles.roleBadgeText}>Attendee</Text>
                </View>
                {isPromoter && (
                  <View style={[styles.roleBadge, styles.roleBadgePromoter]}>
                    <MaterialIcons name="campaign" size={11} color={Colors.gold} />
                    <Text style={[styles.roleBadgeText, { color: Colors.gold }]}>Promoter</Text>
                  </View>
                )}
                {subscriptionTier !== 'free' && canPurchaseDigitalFeatures && (
                  <View style={[styles.roleBadge, { backgroundColor: subscriptionTier === 'elite' ? '#E91E6322' : Colors.goldSurface, borderColor: subscriptionTier === 'elite' ? '#E91E6344' : `${Colors.gold}44` }]}>
                    <MaterialIcons name={subscriptionTier === 'elite' ? 'star' : 'campaign'} size={11} color={subscriptionTier === 'elite' ? '#E91E63' : Colors.gold} />
                    <Text style={[styles.roleBadgeText, { color: subscriptionTier === 'elite' ? '#E91E63' : Colors.gold }]}>
                      {subscriptionTier === 'elite' ? 'Elite' : 'Pro'}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </View>

            {/* 4-stat row — tappable to switch tabs */}
          <View style={styles.statsRow}>
            {TABS.map((tab, idx) => (
              <React.Fragment key={tab.key}>
                <Pressable
                  onPress={() => setActiveTab(tab.key)}
                  style={styles.stat}
                >
                  <MaterialIcons
                    name={tab.icon as any}
                    size={14}
                    color={activeTab === tab.key ? Colors.gold : Colors.textMuted}
                  />
                  <Text style={[styles.statNum, activeTab === tab.key && { color: Colors.gold }]}>
                    {tab.count}
                  </Text>
                  <Text style={[styles.statLabel, activeTab === tab.key && { color: Colors.gold }]}>
                    {tab.label}
                  </Text>
                </Pressable>
                {idx < TABS.length - 1 && <View style={styles.statDivider} />}
              </React.Fragment>
            ))}
          </View>
        </View>

        {/* ── Info Card ── */}
        <View style={styles.infoCard}>
          {/* Phone Number */}
          <View style={styles.infoRow}>
            <View style={[styles.infoIconBg, { backgroundColor: '#1565C018' }]}>
              <MaterialIcons name="phone" size={16} color="#42A5F5" />
            </View>
            <View style={[styles.infoContent, { gap: 4 }]}>
              <View style={styles.infoLabelRow}>
                <Text style={styles.infoLabel}>Phone Number</Text>
                <Pressable
                  onPress={() => { setEditingPhone(!editingPhone); setPhoneInput(user.phone ?? ''); setPhoneError(''); }}
                  style={styles.editChipBtn} hitSlop={8}
                >
                  <MaterialIcons name={editingPhone ? 'close' : 'edit'} size={12} color={Colors.gold} />
                  <Text style={styles.editChipBtnText}>{editingPhone ? 'Cancel' : 'Edit'}</Text>
                </Pressable>
              </View>
              {editingPhone ? (
                <View style={{ gap: Spacing.sm }}>
                  <PhoneInput
                    value={phoneInput}
                    onChange={(e164) => { setPhoneInput(e164); setPhoneError(''); }}
                    error={phoneError}
                    disabled={savingPhone}
                  />
                  <Pressable
                    onPress={handleSavePhone}
                    disabled={savingPhone}
                    style={({ pressed }) => [profilePhoneStyles.saveBtn, pressed && { opacity: 0.8 }, savingPhone && { opacity: 0.5 }]}
                  >
                    <MaterialIcons name={savingPhone ? 'hourglass-top' : 'check'} size={15} color={Colors.textOnGold} />
                    <Text style={profilePhoneStyles.saveBtnText}>{savingPhone ? 'Saving...' : 'Save Phone'}</Text>
                  </Pressable>
                </View>
              ) : (
                <Text style={styles.infoValue}>
                  {user.phone ? user.phone : 'Not set'}
                </Text>
              )}
            </View>
          </View>

          <View style={styles.infoDivider} />

          {/* Home Parish */}
          <View style={styles.infoRow}>
            <View style={[styles.infoIconBg, { backgroundColor: `${Colors.gold}18` }]}>
              <MaterialIcons name="home" size={16} color={Colors.gold} />
            </View>
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Home Parish</Text>
              <Text style={styles.infoValue}>{user.homeParish || 'Not set'}</Text>
            </View>
          </View>

          <View style={styles.infoDivider} />

          {/* Preferred Parishes (editable) */}
          <View style={styles.infoRow}>
            <View style={[styles.infoIconBg, { backgroundColor: `${Colors.gold}18` }]}>
              <MaterialIcons name="map" size={16} color={Colors.gold} />
            </View>
            <View style={[styles.infoContent, { gap: 6 }]}>
              <View style={styles.infoLabelRow}>
                <Text style={styles.infoLabel}>Preferred Parishes</Text>
                <Pressable onPress={openParishModal} style={styles.editChipBtn} hitSlop={8}>
                  <MaterialIcons name="edit" size={12} color={Colors.gold} />
                  <Text style={styles.editChipBtnText}>Edit</Text>
                </Pressable>
              </View>
              {preferredParishes.length > 0 ? (
                <View style={styles.parishChips}>
                  {preferredParishes.slice(0, 5).map((p) => (
                    <View key={p} style={styles.parishChip}>
                      <MaterialIcons name="place" size={10} color={Colors.gold} />
                      <Text style={styles.parishChipText}>{p}</Text>
                    </View>
                  ))}
                  {preferredParishes.length > 5 && (
                    <Pressable
                      onPress={openParishModal}
                      style={[styles.parishChip, { backgroundColor: Colors.goldSurface, borderColor: `${Colors.gold}44` }]}
                    >
                      <Text style={[styles.parishChipText, { color: Colors.gold }]}>
                        +{preferredParishes.length - 5} more
                      </Text>
                    </Pressable>
                  )}
                </View>
              ) : (
                <Pressable onPress={openParishModal} style={styles.setParishCta}>
                  <MaterialIcons name="add-location-alt" size={14} color={Colors.gold} />
                  <Text style={styles.setParishCtaText}>Add preferred parishes →</Text>
                </Pressable>
              )}
            </View>
          </View>

          <View style={styles.infoDivider} />

          {/* Interests */}
          <View style={styles.infoRow}>
            <View style={[styles.infoIconBg, { backgroundColor: '#E91E6318' }]}>
              <MaterialIcons name="favorite" size={16} color="#E91E63" />
            </View>
            <View style={[styles.infoContent, { gap: 6 }]}>
              <Text style={styles.infoLabel}>Event Interests</Text>
              {user.interests.length > 0 ? (
                <View style={styles.parishChips}>
                  {user.interests.map((id) => {
                    const type = eventTypes.find((t) => t.id === id);
                    return type ? (
                      <View
                        key={id}
                        style={[styles.parishChip, {
                          backgroundColor: `${type.color}15`,
                          borderColor: `${type.color}44`,
                        }]}
                      >
                        <MaterialIcons name={type.icon as any} size={10} color={type.color} />
                        <Text style={[styles.parishChipText, { color: type.color }]}>
                          {type.label}
                        </Text>
                      </View>
                    ) : null;
                  })}
                </View>
              ) : (
                <Text style={styles.infoValue}>None selected</Text>
              )}
            </View>
          </View>
        </View>

        {/* ── PRIORITY 1: Promoter Dashboard (promoters only) ── */}
        {isPromoter && (
          <Pressable
            onPress={() => {
              switchToPromoter();
              router.replace('/(promoter)' as any);
            }}
            style={({ pressed }) => [styles.promoterDashCard, pressed && { opacity: 0.88 }]}
          >
            <LinearGradient
              colors={['#071508', '#0D2010', '#061004']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFillObject}
            />
            <View style={styles.promoterDashIcon}>
              <MaterialIcons name="dashboard" size={22} color={Colors.gold} />
            </View>
            <View style={styles.promoterDashText}>
              <Text style={styles.promoterDashTitle}>Promoter Dashboard</Text>
              <Text style={styles.promoterDashSub}>Switch to your business workspace</Text>
            </View>
            <View style={styles.promoterDashArrow}>
              <MaterialIcons name="arrow-forward-ios" size={14} color={Colors.gold} />
            </View>
          </Pressable>
        )}

        {/* ── PRIORITY 2: My Tickets (all users) ── */}
        <Pressable
          onPress={() => router.push('/my-tickets' as any)}
          style={({ pressed }) => [styles.promoterCard, { borderColor: `${Colors.gold}44` }, pressed && { opacity: 0.85 }]}
        >
          <LinearGradient
            colors={[Colors.goldSurface, Colors.surface]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.promoterCardInner}
          >
            <MaterialIcons name="confirmation-number" size={24} color={Colors.gold} />
            <View style={styles.promoterCardText}>
              <Text style={styles.promoterCardTitle}>My Tickets</Text>
              <Text style={styles.promoterCardSub}>View purchased event tickets &amp; QR codes</Text>
            </View>
            <MaterialIcons name="arrow-forward-ios" size={16} color={Colors.gold} />
          </LinearGradient>
        </Pressable>

        {/* ── Promoter / Become Promoter Card ── */}
        {isPromoter ? (
          <Pressable
            onPress={() => router.push('/my-events' as any)}
            style={({ pressed }) => [styles.promoterCard, pressed && { opacity: 0.85 }]}
          >
            <LinearGradient
              colors={[Colors.goldSurface, Colors.surface]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.promoterCardInner}
            >
              <MaterialIcons name="list-alt" size={24} color={Colors.gold} />
              <View style={styles.promoterCardText}>
                <Text style={styles.promoterCardTitle}>My Events</Text>
                <Text style={styles.promoterCardSub}>
                  {postedEvents.length} published · Manage listings
                </Text>
              </View>
              <MaterialIcons name="arrow-forward-ios" size={16} color={Colors.gold} />
            </LinearGradient>
          </Pressable>
        ) : (
          <Pressable
            onPress={addPromoterRole}
            style={({ pressed }) => [styles.promoterCard, pressed && { opacity: 0.85 }]}
          >
            <LinearGradient
              colors={[Colors.goldSurface, Colors.surface]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.promoterCardInner}
            >
              <MaterialIcons name="campaign" size={24} color={Colors.gold} />
              <View style={styles.promoterCardText}>
                <Text style={styles.promoterCardTitle}>Become a Promoter</Text>
                <Text style={styles.promoterCardSub}>List events and reach the island</Text>
              </View>
              <MaterialIcons name="arrow-forward-ios" size={16} color={Colors.gold} />
            </LinearGradient>
          </Pressable>
        )}

        {/* ── Saved Events quick link ── */}
        <Pressable
          onPress={() => router.push('/bookmarks' as any)}
          style={({ pressed }) => [styles.promoterCard, { borderColor: `${Colors.gold}22` }, pressed && { opacity: 0.85 }]}
        >
          <LinearGradient
            colors={[Colors.goldSurface, Colors.surface]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.promoterCardInner}
          >
            <MaterialIcons name="bookmark" size={24} color={Colors.gold} />
            <View style={styles.promoterCardText}>
              <Text style={styles.promoterCardTitle}>Saved Events</Text>
              <Text style={styles.promoterCardSub}>
                {savedEvents.length} bookmarked · view your list
              </Text>
            </View>
            <MaterialIcons name="arrow-forward-ios" size={16} color={Colors.gold} />
          </LinearGradient>
        </Pressable>

        {/* ── Subscription Status Card (paid users) ── */}
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
            <View style={[subCard.card, { borderColor: `${accentColor}44` }]}>
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
                      {subscriptionStatus === 'trialing' ? 'Trial active'
                        : isPastDue ? 'Payment past due'
                        : isActive ? 'Active'
                        : subscriptionStatus === 'canceled' ? 'Canceled'
                        : subscriptionStatus}
                    </Text>
                  </View>
                </View>
                {/* Plans button — routes to upgrade.tsx which handles both Apple IAP (iOS) and Stripe (Web/Android) */}
                <Pressable
                  onPress={() => router.push('/monetization/upgrade' as any)}
                  style={({ pressed }) => [subCard.manageBtn, { backgroundColor: `${accentColor}18`, borderColor: `${accentColor}44` }, pressed && { opacity: 0.75 }]}
                >
                  <Text style={[subCard.manageBtnText, { color: accentColor }]}>Plans</Text>
                </Pressable>
              </View>

              {/* Boost credits row */}
              {monthlyBoostAllowance > 0 && (
                <View style={subCard.divider} />
                )}
              {monthlyBoostAllowance > 0 && (
                <View style={subCard.boostRow}>
                  <View style={subCard.boostLeft}>
                    <MaterialIcons name="rocket-launch" size={14} color={accentColor} />
                    <Text style={subCard.boostLabel}>Monthly Boost Credits</Text>
                  </View>
                  <View style={subCard.boostCredits}>
                    <Text style={[subCard.boostCreditNum, { color: accentColor }]}>{remainingBoosts}</Text>
                    <Text style={subCard.boostCreditSlash}>/</Text>
                    <Text style={subCard.boostCreditTotal}>{monthlyBoostAllowance}</Text>
                    <Text style={subCard.boostCreditLabel}>remaining</Text>
                  </View>
                </View>
              )}

              {/* Renewal / expiry date */}
              {renewalDate && (
                <>
                  {monthlyBoostAllowance === 0 && <View style={subCard.divider} />}
                  <View style={subCard.renewRow}>
                    <MaterialIcons name="event" size={12} color={Colors.textMuted} />
                    <Text style={subCard.renewText}>
                      {isPastDue ? 'Payment overdue — update billing to keep access'
                        : subscriptionStatus === 'canceled' ? `Access until ${renewalDate}`
                        : `Renews ${renewalDate}`}
                    </Text>
                  </View>
                </>
              )}

              {/* Payment past due warning */}
              {isPastDue && (
                <View style={subCard.warnRow}>
                  <MaterialIcons name="warning" size={12} color="#FF9800" />
                  <Text style={subCard.warnText}>Update your payment method to keep your subscription active.</Text>
                </View>
              )}

              {/* Subscription management — provider-aware.                          */}
              {/* iOS (Apple IAP): link to App Store Settings.                          */}
              {/* Android/Web (Stripe): open Stripe Customer Portal.                   */}
              <>
                <View style={subCard.divider} />
                {Platform.OS === 'ios' ? (
                  <Pressable
                    onPress={() => {
                      Linking.openURL('itms-apps://apps.apple.com/account/subscriptions').catch(() => {
                        Linking.openURL('https://apps.apple.com/account/subscriptions');
                      });
                    }}
                    style={({ pressed }) => [subCard.portalBtn, pressed && { opacity: 0.8 }]}
                  >
                    <MaterialIcons name="settings" size={14} color={accentColor} />
                    <Text style={[subCard.portalBtnText, { color: accentColor }]}>
                      Manage in App Store Settings
                    </Text>
                    <MaterialIcons name="arrow-forward-ios" size={11} color={accentColor} />
                  </Pressable>
                ) : Platform.OS === 'android' ? (
                  <Pressable
                    onPress={() => Linking.openURL('https://play.google.com/store/account/subscriptions')}
                    style={({ pressed }) => [subCard.portalBtn, pressed && { opacity: 0.8 }]}
                  >
                    <MaterialIcons name="android" size={14} color={accentColor} />
                    <Text style={[subCard.portalBtnText, { color: accentColor }]}>
                      Manage in Google Play
                    </Text>
                    <MaterialIcons name="arrow-forward-ios" size={11} color={accentColor} />
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={async () => {
                      if (portalLoading) return;
                      setPortalLoading(true);
                      try {
                        const { url, error } = await createCustomerPortalSession();
                        if (url) {
                          await Linking.openURL(url);
                          setTimeout(() => refreshProfile(), 3000);
                        } else {
                          Alert.alert('Error', error ?? 'Could not open billing portal.');
                        }
                      } finally {
                        setPortalLoading(false);
                      }
                    }}
                    style={({ pressed }) => [subCard.portalBtn, pressed && { opacity: 0.8 }]}
                  >
                    <MaterialIcons name={portalLoading ? 'hourglass-top' : 'open-in-new'} size={14} color={accentColor} />
                    <Text style={[subCard.portalBtnText, { color: accentColor }]}>
                      {portalLoading ? 'Opening...' : 'Manage Billing & Subscription'}
                    </Text>
                    <MaterialIcons name="arrow-forward-ios" size={11} color={accentColor} />
                  </Pressable>
                )}
              </>
            </View>
          );
        })()}

        {/* ── Upgrade CTA (free promoters) ── */}
        {subscriptionTier === 'free' && isPromoter && (
          <Pressable
            onPress={() => router.push('/monetization/upgrade' as any)}
            style={({ pressed }) => [styles.promoterCard, { borderColor: `${Colors.gold}55` }, pressed && { opacity: 0.85 }]}
          >
            <LinearGradient
              colors={['#1A0E00', Colors.surface]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.promoterCardInner}
            >
              <MaterialIcons name="rocket-launch" size={24} color={Colors.gold} />
              <View style={styles.promoterCardText}>
                <Text style={styles.promoterCardTitle}>Upgrade to Pro</Text>
                <Text style={styles.promoterCardSub}>Unlimited posts, analytics, verified badge</Text>
              </View>
              {/* Do not show hardcoded price on iOS — StoreKit provides the localized price on the plans screen */}
              {Platform.OS !== 'ios' && (
                <View style={{ backgroundColor: Colors.gold, paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: Radius.full }}>
                  <Text style={{ fontSize: Typography.xs, color: Colors.textOnGold, fontWeight: Typography.bold }}>$9.99/mo</Text>
                </View>
              )}
            </LinearGradient>
          </Pressable>
        )}

        {/* ── Support & Help ── */}
        <View style={styles.langCard}>
          <View style={[styles.infoIconBg, { backgroundColor: '#1565C018' }]}>
            <MaterialIcons name="support-agent" size={16} color="#42A5F5" />
          </View>
          <View style={styles.infoContent}>
            <Text style={styles.infoLabel}>Help & Support</Text>
            <Pressable
              onPress={() => Linking.openURL(SUPPORT_SUBJECT_GENERAL)}
              style={({ pressed }) => [styles.supportBtn, pressed && { opacity: 0.75 }]}
            >
              <MaterialIcons name="email" size={14} color={Colors.gold} />
              <Text style={styles.supportBtnText}>Contact Support</Text>
              <Text style={styles.supportBtnEmail}>{SUPPORT_EMAIL}</Text>
            </Pressable>
          </View>
        </View>

        {/* ── Legal / Policies ── */}
        <View style={styles.legalCard}>
          <Pressable
            onPress={() => Linking.openURL(LEGAL_URLS.terms)}
            style={({ pressed }) => [styles.legalRow, pressed && { opacity: 0.7 }]}
            accessibilityLabel="Terms of Use"
          >
            <MaterialIcons name="gavel" size={16} color={Colors.textMuted} />
            <Text style={styles.legalText}>Terms of Use</Text>
            <MaterialIcons name="open-in-new" size={13} color={Colors.textMuted} />
          </Pressable>
          <View style={styles.legalDivider} />
          <Pressable
            onPress={() => Linking.openURL(LEGAL_URLS.privacy)}
            style={({ pressed }) => [styles.legalRow, pressed && { opacity: 0.7 }]}
            accessibilityLabel="Privacy Policy"
          >
            <MaterialIcons name="privacy-tip" size={16} color={Colors.textMuted} />
            <Text style={styles.legalText}>Privacy Policy</Text>
            <MaterialIcons name="open-in-new" size={13} color={Colors.textMuted} />
          </Pressable>
          <View style={styles.legalDivider} />
          <Pressable
            onPress={() => Linking.openURL(LEGAL_URLS.subscriptionTerms)}
            style={({ pressed }) => [styles.legalRow, pressed && { opacity: 0.7 }]}
            accessibilityLabel="Subscription Terms"
          >
            <MaterialIcons name="autorenew" size={16} color={Colors.textMuted} />
            <Text style={styles.legalText}>Subscription Terms</Text>
            <MaterialIcons name="open-in-new" size={13} color={Colors.textMuted} />
          </Pressable>
          <View style={styles.legalDivider} />
          <Pressable
            onPress={() => Linking.openURL(LEGAL_URLS.refundPolicy)}
            style={({ pressed }) => [styles.legalRow, pressed && { opacity: 0.7 }]}
            accessibilityLabel="Refund Policy"
          >
            <MaterialIcons name="replay" size={16} color={Colors.textMuted} />
            <Text style={styles.legalText}>Refund &amp; Cancellation Policy</Text>
            <MaterialIcons name="open-in-new" size={13} color={Colors.textMuted} />
          </Pressable>
          <View style={styles.legalDivider} />
          <Pressable
            onPress={() => Linking.openURL(LEGAL_URLS.transferPolicy)}
            style={({ pressed }) => [styles.legalRow, pressed && { opacity: 0.7 }]}
            accessibilityLabel="Ticket Transfer Policy"
          >
            <MaterialIcons name="swap-horiz" size={16} color={Colors.textMuted} />
            <Text style={styles.legalText}>Ticket Transfer Policy</Text>
            <MaterialIcons name="open-in-new" size={13} color={Colors.textMuted} />
          </Pressable>
          <View style={styles.legalDivider} />
          <Pressable
            onPress={() => Linking.openURL(LEGAL_URLS.acceptableUse)}
            style={({ pressed }) => [styles.legalRow, pressed && { opacity: 0.7 }]}
            accessibilityLabel="Acceptable Use Policy"
          >
            <MaterialIcons name="rule" size={16} color={Colors.textMuted} />
            <Text style={styles.legalText}>Acceptable Use</Text>
            <MaterialIcons name="open-in-new" size={13} color={Colors.textMuted} />
          </Pressable>
          <View style={styles.legalDivider} />
          <Pressable
            onPress={() => Linking.openURL(LEGAL_URLS.accessibility)}
            style={({ pressed }) => [styles.legalRow, pressed && { opacity: 0.7 }]}
            accessibilityLabel="Accessibility"
          >
            <MaterialIcons name="accessibility" size={16} color={Colors.textMuted} />
            <Text style={styles.legalText}>Accessibility</Text>
            <MaterialIcons name="open-in-new" size={13} color={Colors.textMuted} />
          </Pressable>
        </View>

        {/* ── Notification Settings ── */}
        {user && (() => {
          const enabledCount = [
            (user as any).emailNotifNewParish,
            (user as any).emailNotifNewPromoter,
            (user as any).emailNotifEventChange,
            (user as any).emailNotifEventReminder,
          ].filter((v) => v !== false).length;

          const pushStatusColor =
            pushTokenStatus === 'registered' ? Colors.greenLight
            : pushTokenStatus === 'denied' ? '#FF7043'
            : pushTokenStatus === 'failed' ? '#FF7043'
            : Colors.textMuted;
          const pushStatusLabel =
            pushTokenStatus === 'registered' ? 'Push active'
            : pushTokenStatus === 'denied' ? 'Push permission denied — tap to fix'
            : pushTokenStatus === 'failed' ? 'Push registration failed — tap to retry'
            : pushTokenStatus === 'web' ? 'Push not supported on web'
            : 'Push not enabled — go to Notification Settings';

          return (
            <View style={[styles.langCard, { borderColor: '#1565C033', padding: 0, overflow: 'hidden' }]}>
              <Pressable
                onPress={() => router.push('/notification-settings' as any)}
                style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.base }, pressed && { opacity: 0.8 }]}
              >
                <View style={[styles.infoIconBg, { backgroundColor: '#1565C018' }]}>
                  <MaterialIcons name="notifications" size={16} color="#42A5F5" />
                </View>
                <View style={[styles.infoContent, { flex: 1 }]}>
                  <Text style={styles.infoLabel}>Notification Settings</Text>
                  <Text style={styles.prefSubtext}>
                    {enabledCount === 4
                      ? 'All email notifications enabled'
                      : enabledCount === 0
                      ? 'All notifications muted'
                      : `${enabledCount} of 4 notifications enabled`}
                  </Text>
                </View>
                <MaterialIcons name="arrow-forward-ios" size={14} color={Colors.textMuted} style={{ marginTop: 2 }} />
              </Pressable>

              {/* Push token status row */}
              <View style={styles.pushStatusRow}>
                <MaterialIcons
                  name={pushTokenStatus === 'registered' ? 'check-circle' : pushTokenStatus === 'idle' ? 'hourglass-top' : 'error-outline'}
                  size={13}
                  color={pushStatusColor}
                />
                <Text style={[styles.pushStatusText, { color: pushStatusColor }]}>
                  {pushStatusLabel}
                </Text>
                {(pushTokenStatus === 'failed' || pushTokenStatus === 'denied') && (
                  <Pressable
                    onPress={retryPushToken}
                    style={({ pressed }) => [styles.retryBtn, pressed && { opacity: 0.7 }]}
                  >
                    <MaterialIcons name="refresh" size={12} color={Colors.gold} />
                    <Text style={styles.retryBtnText}>Retry</Text>
                  </Pressable>
                )}
              </View>
              {pushTokenStatus === 'failed' && pushTokenError ? (
                <Text style={styles.pushErrorText} numberOfLines={2}>
                  {pushTokenError}
                </Text>
              ) : null}
            </View>
          );
        })()}

        {/* ── Language Toggle ── */}
        <View style={styles.langCard}>
          <View style={[styles.infoIconBg, { backgroundColor: '#9C27B018' }]}>
            <MaterialIcons name="translate" size={16} color="#CE93D8" />
          </View>
          <View style={styles.infoContent}>
            <Text style={styles.infoLabel}>{t.language}</Text>
            <View style={styles.langBtnRow}>
              <Pressable
                onPress={() => setLanguage('en')}
                style={[styles.langBtn, language === 'en' && styles.langBtnActive]}
              >
                <Text style={[styles.langBtnText, language === 'en' && styles.langBtnTextActive]}>
                  English 🇬🇧
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setLanguage('patois')}
                style={[styles.langBtn, language === 'patois' && styles.langBtnActivePatois]}
              >
                <Text style={[styles.langBtnText, language === 'patois' && styles.langBtnTextActive]}>
                  Patois 🇯🇲
                </Text>
              </Pressable>
            </View>
            {language === 'patois' && (
              <Text style={styles.patoisNote}>Big up di whole ah Jamaica! 🙌</Text>
            )}
          </View>
        </View>

        {/* Joined */}
        <View style={styles.joinedRow}>
          <MaterialIcons name="calendar-today" size={13} color={Colors.textMuted} />
          <Text style={styles.joinedText}>Member since {formatDate(user.joinedAt)}</Text>
        </View>

        {/* ── Deletion rejection banner ── */}
        {rejectedDeletion !== null && !rejectionBannerDismissed && (
          <View style={styles.deletionRejectedBanner}>
            <MaterialIcons name="info" size={16} color={Colors.textPrimary} style={{ flexShrink: 0 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.deletionRejectedTitle}>Deletion Request Not Approved</Text>
              <Text style={styles.deletionRejectedBody}>
                {rejectedDeletion.reason
                  ? `Your account deletion request was not approved. Reason: ${rejectedDeletion.reason}`
                  : 'Your account deletion request was not approved at this time. Contact support for more information.'}
              </Text>
            </View>
            <Pressable
              onPress={() => setRejectionBannerDismissed(true)}
              hitSlop={8}
              style={{ flexShrink: 0 }}
            >
              <MaterialIcons name="close" size={18} color={Colors.textMuted} />
            </Pressable>
          </View>
        )}

        {/* ── Delete Account ── */}
        {pendingDeletion ? (
          <View style={styles.deletePendingBanner}>
            <MaterialIcons name="hourglass-empty" size={16} color="#FF9800" />
            <Text style={styles.deletePendingText}>Deletion requested — pending admin review</Text>
          </View>
        ) : (
          <Pressable
            onPress={handleDeleteAccount}
            disabled={deleteLoading}
            style={({ pressed }) => [
              styles.deleteAccountBtn,
              pressed && { opacity: 0.75 },
              deleteLoading && { opacity: 0.5 },
            ]}
          >
            <MaterialIcons
              name={deleteLoading ? 'hourglass-top' : 'delete-forever'}
              size={16}
              color="#EF5350"
            />
            <Text style={styles.deleteAccountText}>
              {deleteLoading ? 'Submitting...' : 'Delete Account'}
            </Text>
          </Pressable>
        )}

        {/* ── Activity Section ── */}
        <View style={styles.activityHeader}>
          <View style={styles.goldBar} />
          <Text style={styles.activityTitle}>My Activity</Text>
        </View>

        {/* Scrollable tab strip */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabRow}
          style={styles.tabScroll}
        >
          {TABS.map((tab) => (
            <Pressable
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              style={[styles.tabBtn, activeTab === tab.key && styles.tabBtnActive]}
            >
              <MaterialIcons
                name={tab.icon as any}
                size={14}
                color={activeTab === tab.key ? Colors.textOnGold : Colors.textMuted}
              />
              <Text style={[styles.tabBtnText, activeTab === tab.key && styles.tabBtnTextActive]}>
                {tab.label}
              </Text>
              {tab.count > 0 && (
                <View style={[styles.tabCount, activeTab === tab.key && styles.tabCountActive]}>
                  <Text style={[styles.tabCountText, activeTab === tab.key && styles.tabCountTextActive]}>
                    {tab.count}
                  </Text>
                </View>
              )}
            </Pressable>
          ))}
        </ScrollView>

        {/* Tab content */}
        <View style={styles.tabContent}>
          {renderTabContent()}
        </View>

        <View style={{ height: Spacing.xxl * 2 }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  // Guest
  guestContainer: { flex: 1, backgroundColor: Colors.background },
  guestContent: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: Spacing.xl, gap: Spacing.base,
  },
  guestAvatar: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: Colors.surfaceBorder,
  },
  guestTitle: { fontSize: 26, fontWeight: Typography.black, color: Colors.textPrimary, textAlign: 'center' },
  guestSub: { fontSize: Typography.base, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22 },

  guestLegalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  guestLegalLink: {
    fontSize: Typography.xs,
    color: Colors.textMuted,
    textDecorationLine: 'underline',
  },
  guestLegalDot: {
    fontSize: Typography.xs,
    color: Colors.textMuted,
  },

  // Language card
  langCard: {
    flexDirection: 'row', gap: Spacing.md, marginHorizontal: Spacing.base, marginTop: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: '#9C27B033', padding: Spacing.base, alignItems: 'flex-start',
  },
  langBtnRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  langBtn: {
    flex: 1, paddingVertical: Spacing.sm, alignItems: 'center',
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md,
    borderWidth: 1.5, borderColor: Colors.surfaceBorder,
  },
  langBtnActive: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  langBtnActivePatois: { backgroundColor: Colors.green, borderColor: Colors.greenLight },
  langBtnText: { fontSize: Typography.sm, color: Colors.textMuted, fontWeight: Typography.semibold },
  langBtnTextActive: { color: '#fff', fontWeight: Typography.bold },
  patoisNote: { fontSize: 11, color: '#CE93D8', marginTop: Spacing.sm, fontStyle: 'italic' },

  authBtn: { width: '100%', borderRadius: Radius.md, overflow: 'hidden' },
  authBtnInner: { paddingVertical: Spacing.base, alignItems: 'center' },
  authBtnText: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textOnGold },

  // Top bar
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
  },
  topBarTitle: { fontSize: Typography.xl, fontWeight: Typography.black, color: Colors.textPrimary },
  topBarRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  topBarBellBtn: { position: 'relative', padding: Spacing.xs },
  topBarBellBadge: {
    position: 'absolute', top: 0, right: 0,
    minWidth: 16, height: 16, borderRadius: 8,
    backgroundColor: Colors.gold,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 2,
    borderWidth: 1.5, borderColor: Colors.background,
  },
  topBarBellBadgeText: { fontSize: 8, fontWeight: Typography.black, color: Colors.textOnGold },
  signOutBtn: { padding: Spacing.xs },

  scroll: { paddingBottom: Spacing.xxl },

  // Profile card
  profileCard: {
    margin: Spacing.base, borderRadius: Radius.xl, overflow: 'hidden',
    borderWidth: 1, borderColor: Colors.surfaceBorder,
    paddingTop: Spacing.lg, paddingHorizontal: Spacing.base,
  },
  avatarRow: {
    flexDirection: 'row', gap: Spacing.base,
    alignItems: 'flex-start', marginBottom: Spacing.base,
  },
  avatarWrap: {
    width: 64, height: 64, borderRadius: 32,
    position: 'relative', flexShrink: 0,
  },
  avatar: {
    width: 64, height: 64, borderRadius: 32,
    borderWidth: 2, borderColor: Colors.gold,
  },
  avatarLetterBg: {
    backgroundColor: Colors.goldSurface, alignItems: 'center', justifyContent: 'center',
  },
  avatarCameraBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: Colors.gold,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: Colors.background,
  },
  avatarLetter: { fontSize: 28, fontWeight: Typography.black, color: Colors.gold },
  nameSection: { flex: 1, gap: Spacing.xs },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  name: { fontSize: Typography.lg, fontWeight: Typography.black, color: Colors.textPrimary },
  contact: { fontSize: Typography.sm, color: Colors.textMuted },
  rolesRow: { flexDirection: 'row', gap: Spacing.xs, flexWrap: 'wrap' },
  roleBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: Colors.greenSurface, paddingHorizontal: Spacing.sm, paddingVertical: 3,
    borderRadius: Radius.full, borderWidth: 1, borderColor: `${Colors.green}44`,
  },
  roleBadgePromoter: { backgroundColor: Colors.goldSurface, borderColor: `${Colors.gold}44` },
  roleBadgeText: { fontSize: Typography.xs, color: Colors.greenLight, fontWeight: Typography.semibold },
  nameEditRow: { flexDirection: 'row', gap: Spacing.sm },
  nameInput: {
    flex: 1, fontSize: Typography.md, color: Colors.textPrimary,
    backgroundColor: Colors.surface, borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm, borderWidth: 1, borderColor: Colors.gold, height: 36,
  },
  nameSaveBtn: {
    width: 36, height: 36, borderRadius: Radius.sm,
    backgroundColor: Colors.gold, alignItems: 'center', justifyContent: 'center',
  },

  // Stats row
  statsRow: {
    flexDirection: 'row', borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder, paddingVertical: Spacing.md,
  },
  stat: { flex: 1, alignItems: 'center', gap: 3 },
  statNum: { fontSize: Typography.lg, fontWeight: Typography.black, color: Colors.textPrimary },
  statLabel: { fontSize: 9, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.3 },
  statDivider: { width: 1, backgroundColor: Colors.surfaceBorder },

  // Info card
  infoCard: {
    marginHorizontal: Spacing.base, backgroundColor: Colors.surface,
    borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.surfaceBorder, overflow: 'hidden',
  },
  infoRow: {
    flexDirection: 'row', gap: Spacing.md,
    padding: Spacing.base, alignItems: 'flex-start',
  },
  infoIconBg: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2,
  },
  infoContent: { flex: 1 },
  infoLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  infoLabel: {
    fontSize: Typography.xs, color: Colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  infoValue: { fontSize: Typography.base, color: Colors.textSecondary, marginTop: 3 },
  infoDivider: { height: 1, backgroundColor: Colors.surfaceBorder },
  editChipBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: Colors.goldSurface, paddingHorizontal: Spacing.sm, paddingVertical: 3,
    borderRadius: Radius.full, borderWidth: 1, borderColor: `${Colors.gold}33`,
  },
  editChipBtnText: { fontSize: Typography.xs, color: Colors.gold, fontWeight: Typography.semibold },

  // Parish chips
  parishChips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  parishChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: Spacing.sm, paddingVertical: 4,
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.full,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  parishChipText: { fontSize: 11, color: Colors.textSecondary, fontWeight: Typography.medium },
  setParishCta: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  setParishCtaText: { fontSize: Typography.sm, color: Colors.gold, fontWeight: Typography.medium },

  // Promoter Dashboard switch card
  promoterDashCard: {
    marginHorizontal: Spacing.base,
    marginTop: Spacing.md,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: `${Colors.gold}55`,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.base + 2,
    gap: Spacing.md,
    position: 'relative',
  },
  promoterDashIcon: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: Colors.goldSurface,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: `${Colors.gold}55`, flexShrink: 0,
  },
  promoterDashText: { flex: 1 },
  promoterDashTitle: {
    fontSize: Typography.base, fontWeight: Typography.black, color: Colors.gold,
  },
  promoterDashSub: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2 },
  promoterDashArrow: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: `${Colors.gold}18`,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: `${Colors.gold}33`, flexShrink: 0,
  },

  // Promoter card
  promoterCard: {
    marginHorizontal: Spacing.base, marginTop: Spacing.md,
    borderRadius: Radius.lg, overflow: 'hidden',
    borderWidth: 1, borderColor: `${Colors.gold}33`,
  },
  promoterCardInner: {
    flexDirection: 'row', alignItems: 'center',
    gap: Spacing.md, padding: Spacing.base,
  },
  promoterCardText: { flex: 1 },
  promoterCardTitle: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.gold },
  promoterCardSub: { fontSize: Typography.sm, color: Colors.textMuted, marginTop: 1 },

  // Joined
  joinedRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.xs,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm, marginTop: Spacing.sm,
  },
  joinedText: { fontSize: Typography.xs, color: Colors.textMuted },

  // Deletion rejected banner
  deletionRejectedBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    marginHorizontal: Spacing.base,
    marginTop: Spacing.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.base,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#42A5F555',
    backgroundColor: 'rgba(66,165,245,0.08)',
  },
  deletionRejectedTitle: {
    fontSize: Typography.sm,
    fontWeight: Typography.bold,
    color: Colors.textPrimary,
    marginBottom: 3,
  },
  deletionRejectedBody: {
    fontSize: Typography.xs,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  // Delete pending banner
  deletePendingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginHorizontal: Spacing.base,
    marginTop: Spacing.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.base,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#FF980033',
    backgroundColor: 'rgba(255,152,0,0.08)',
  },
  deletePendingText: {
    flex: 1,
    fontSize: Typography.sm,
    color: '#FF9800',
    fontWeight: Typography.medium,
  },
  // Delete account
  deleteAccountBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginHorizontal: Spacing.base,
    marginTop: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#EF535033',
    backgroundColor: '#EF535010',
  },
  deleteAccountText: {
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    color: '#EF5350',
  },

  // Legal links
  legalCard: {
    marginHorizontal: Spacing.base,
    marginTop: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    overflow: 'hidden',
  },
  legalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
  },
  legalText: {
    flex: 1,
    fontSize: Typography.sm,
    color: Colors.textSecondary,
    fontWeight: Typography.medium,
  },
  legalDivider: {
    height: 1,
    backgroundColor: Colors.surfaceBorder,
  },

  // Support button
  supportBtn: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.sm,
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  supportBtnText: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.gold },
  supportBtnEmail: { fontSize: Typography.xs, color: Colors.textMuted, marginLeft: 'auto' },
  prefSubtext: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2, marginBottom: Spacing.sm },
  prefToggleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: Spacing.xs + 2,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
  },
  prefToggleLabel: { flex: 1, fontSize: Typography.sm, color: Colors.textSecondary, paddingRight: Spacing.md },

  // Activity header
  activityHeader: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.base, marginTop: Spacing.lg, marginBottom: Spacing.sm,
  },
  goldBar: { width: 3, height: 18, borderRadius: 2, backgroundColor: Colors.gold },
  activityTitle: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textPrimary },

  // Tab strip
  tabScroll: { borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder },
  tabRow: {
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm,
    gap: Spacing.sm, flexDirection: 'row', alignItems: 'center',
  },
  tabBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderRadius: Radius.full, backgroundColor: Colors.surface,
    borderWidth: 1.5, borderColor: Colors.surfaceBorder,
  },
  tabBtnActive: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  tabBtnText: { fontSize: Typography.xs, color: Colors.textMuted, fontWeight: Typography.medium },
  tabBtnTextActive: { color: Colors.textOnGold, fontWeight: Typography.bold },
  tabCount: {
    minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: Colors.surfaceElevated, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
  },
  tabCountActive: { backgroundColor: 'rgba(0,0,0,0.2)' },
  tabCountText: { fontSize: 9, fontWeight: Typography.bold, color: Colors.textMuted },
  tabCountTextActive: { color: Colors.textOnGold },

  // Tab content
  tabContent: { paddingHorizontal: Spacing.base, paddingTop: Spacing.md },

  // Saved note
  savedNote: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    marginBottom: Spacing.md,
  },
  savedNoteText: { fontSize: Typography.xs, color: Colors.textMuted },

  // Past events — now handled by sub-tabs within Going/Interested; keeping wrapper for Posted tab
  postedWrap: { position: 'relative', marginBottom: Spacing.xs },
  editBadge: {
    position: 'absolute', top: 10, right: 10, zIndex: 2,
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: Colors.goldSurface, borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm, paddingVertical: 4,
    borderWidth: 1, borderColor: `${Colors.gold}55`,
  },
  editBadgeText: { fontSize: 10, color: Colors.gold, fontWeight: Typography.semibold },
  statsBadge: {
    position: 'absolute', top: 10, left: 10, zIndex: 2,
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(0,188,212,0.15)', borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm, paddingVertical: 4,
    borderWidth: 1, borderColor: 'rgba(0,188,212,0.4)',
  },
  statsBadgeText: { fontSize: 10, color: '#00BCD4', fontWeight: Typography.semibold },
  manageLink: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.xs,
    justifyContent: 'center', paddingVertical: Spacing.md,
    borderTopWidth: 1, borderTopColor: Colors.surfaceBorder, marginTop: Spacing.sm,
  },
  manageLinkText: { fontSize: Typography.sm, color: Colors.gold, fontWeight: Typography.medium },

  // Empty posted
  emptyPosted: {
    alignItems: 'center', paddingVertical: Spacing.xxl,
    gap: Spacing.md, paddingHorizontal: Spacing.md,
  },
  emptyPostedIcon: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  emptyPostedTitle: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textSecondary },
  emptyPostedSub: { fontSize: Typography.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 20 },
  becomeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm,
    backgroundColor: Colors.goldSurface, borderRadius: Radius.full,
    borderWidth: 1, borderColor: `${Colors.gold}44`,
  },
  becomeBtnText: { fontSize: Typography.sm, color: Colors.gold, fontWeight: Typography.semibold },
  postEventBtn: { borderRadius: Radius.lg, overflow: 'hidden', alignSelf: 'stretch' },
  postEventBtnInner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, paddingVertical: Spacing.md,
  },
  postEventBtnText: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textOnGold },

  // Going / Interested sub-tabs
  subTabRow: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: 3,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    gap: 3,
    marginBottom: Spacing.md,
  },
  subTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.sm,
  },
  subTabActive: { backgroundColor: Colors.gold },
  subTabText: { fontSize: Typography.xs, color: Colors.textMuted, fontWeight: Typography.medium },
  subTabTextActive: { color: Colors.textOnGold, fontWeight: Typography.bold },

  // Push token status
  pushStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.surfaceElevated,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
  },
  pushStatusText: {
    flex: 1,
    fontSize: 11,
    fontWeight: Typography.medium,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    backgroundColor: Colors.goldSurface,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: `${Colors.gold}44`,
  },
  retryBtnText: { fontSize: 11, color: Colors.gold, fontWeight: Typography.semibold },
  pushErrorText: {
    fontSize: 10,
    color: '#FF7043',
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.sm,
    backgroundColor: Colors.surfaceElevated,
    fontFamily: 'monospace',
  },
});

// ─── Phone Edit Styles ───────────────────────────────────────────────────────
const profilePhoneStyles = StyleSheet.create({
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, paddingVertical: Spacing.sm + 2,
    backgroundColor: Colors.gold, borderRadius: Radius.md,
  },
  saveBtnText: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textOnGold },
});

// ─── Subscription Status Card Styles ─────────────────────────────────────────
const subCard = StyleSheet.create({
  card: {
    marginHorizontal: Spacing.base, marginTop: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    borderWidth: 1.5, overflow: 'hidden',
  },
  header: {
    flexDirection: 'row', alignItems: 'center',
    gap: Spacing.md, padding: Spacing.base,
  },
  iconWrap: {
    width: 42, height: 42, borderRadius: 21,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
  planName: { fontSize: Typography.base, fontWeight: Typography.black },
  verifiedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: Spacing.sm, paddingVertical: 2,
    borderRadius: Radius.full, borderWidth: 1,
  },
  verifiedText: { fontSize: 10, fontWeight: Typography.bold },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  statusDot: { width: 7, height: 7, borderRadius: 3.5 },
  statusText: { fontSize: Typography.xs, fontWeight: Typography.semibold },
  manageBtn: {
    paddingHorizontal: Spacing.md, paddingVertical: 6,
    borderRadius: Radius.full, borderWidth: 1, flexShrink: 0,
  },
  manageBtnText: { fontSize: Typography.xs, fontWeight: Typography.bold },
  divider: { height: 1, backgroundColor: Colors.surfaceBorder },
  boostRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
  },
  boostLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  boostLabel: { fontSize: Typography.sm, color: Colors.textSecondary, fontWeight: Typography.medium },
  boostCredits: { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  boostCreditNum: { fontSize: Typography.xl, fontWeight: Typography.black },
  boostCreditSlash: { fontSize: Typography.sm, color: Colors.textMuted },
  boostCreditTotal: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textSecondary },
  boostCreditLabel: { fontSize: Typography.xs, color: Colors.textMuted, marginLeft: 3 },
  renewRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm,
  },
  renewText: { fontSize: Typography.xs, color: Colors.textMuted, flex: 1 },
  warnRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.xs,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm,
    backgroundColor: 'rgba(255,152,0,0.06)',
  },
  warnText: { flex: 1, fontSize: Typography.xs, color: '#FF9800', lineHeight: 17 },
  portalBtn: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
  },
  portalBtnText: { flex: 1, fontSize: Typography.sm, fontWeight: Typography.semibold },
});
