// ─── Business Profile Page ────────────────────────────────────────────────────
// Full public-facing profile with:
//   • Cover + logo identity
//   • Action row (Call / WhatsApp / Directions / Website / Save)
//   • Tabbed content: Overview | Services | Hours | Photos | Reviews
//   • Real Favorites persisted to business_favorites table
//   • Real Reviews with write/update support
//   • Share via native share sheet
//   • Privacy-safe Directions (only when public coordinates available)
//   • View count guarded to fire only once per mount

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Linking,
  Platform,
  ActivityIndicator,
  Alert,
  Share,
  Modal,
  TextInput,
  RefreshControl,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import { useAuth } from '../../hooks/useAuth';
import {
  fetchBusinessPublicProfile,
  fetchBusinessPhotos,
  fetchBusinessServicesById,
  fetchBusinessServiceAreas,
  fetchBusinessHours,
  fetchBusinessReviews,
  fetchMyBusinessReview,
  fetchOwnerBusinessRecord,
  upsertBusinessReview,
  isBusinessOpenNow,
  incrementBusinessView,
  checkBusinessFavorited,
  addBusinessFavorite,
  removeBusinessFavorite,
  BusinessPublicProfile,
  BusinessPhoto,
  BusinessServiceItem,
  BusinessServiceArea,
  BusinessHoursMap,
  BusinessReview,
} from '../../services/businessService';

// ─── Tab type ─────────────────────────────────────────────────────────────────
type Tab = 'overview' | 'services' | 'hours' | 'photos' | 'reviews';

const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'services', label: 'Services' },
  { key: 'hours', label: 'Hours' },
  { key: 'photos', label: 'Photos' },
  { key: 'reviews', label: 'Reviews' },
];

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatTime(t: string | null): string {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
}

function getOpenStatusText(hoursMap: BusinessHoursMap): { label: string; color: string; detail: string } {
  if (Object.keys(hoursMap).length === 0) return { label: '', color: Colors.textMuted, detail: '' };
  const isOpen = isBusinessOpenNow(hoursMap);
  if (isOpen === null) return { label: '', color: Colors.textMuted, detail: '' };

  const nowJam = new Date(Date.now() - 5 * 60 * 60 * 1000);
  const today = nowJam.getUTCDay();
  const todayHours = hoursMap[today];

  if (!todayHours || todayHours.closed) {
    return { label: 'Closed today', color: '#FF5722', detail: '' };
  }

  const closeStr = todayHours.close_time ? `Closes ${formatTime(todayHours.close_time)}` : '';
  const openStr = todayHours.open_time ? `Opens ${formatTime(todayHours.open_time)}` : '';

  if (isOpen) return { label: 'Open now', color: '#00C853', detail: closeStr };
  return { label: 'Closed', color: '#FF5722', detail: openStr };
}

function getLocationType(lt: string): string {
  const map: Record<string, string> = {
    physical: 'Physical Location',
    home_based: 'Home-based',
    mobile: 'Mobile / Travelling',
    online: 'Online Only',
    hybrid: 'Physical + Online',
  };
  return map[lt] ?? lt;
}

function formatRelativeDate(iso: string): string {
  try {
    const d = new Date(iso);
    const diffMs = Date.now() - d.getTime();
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 30) return `${diffDays}d ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
    return d.toLocaleDateString('en-JM', { month: 'short', year: 'numeric' });
  } catch {
    return '';
  }
}

// ─── Action Button ────────────────────────────────────────────────────────────
function ActionBtn({ icon, label, color, active, onPress }: {
  icon: string; label: string; color?: string; active?: boolean; onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [ab.btn, pressed && { opacity: 0.75 }]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={[ab.iconWrap, (active || color) ? { borderColor: `${color ?? Colors.gold}55`, backgroundColor: `${color ?? Colors.gold}18` } : null]}>
        <MaterialIcons name={icon as any} size={20} color={active ? Colors.gold : (color ?? Colors.textPrimary)} />
      </View>
      <Text style={[ab.label, color ? { color } : active ? { color: Colors.gold } : null]}>{label}</Text>
    </Pressable>
  );
}

const ab = StyleSheet.create({
  btn: { alignItems: 'center', gap: 5, flex: 1, minWidth: 52 },
  iconWrap: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.surfaceBorder,
    alignItems: 'center', justifyContent: 'center',
  },
  label: { fontSize: 10, color: Colors.textSecondary, fontWeight: Typography.semibold, textAlign: 'center' },
});

// ─── Star Rating ──────────────────────────────────────────────────────────────
function StarRating({ rating, count, size = 14, onPress }: { rating: number; count: number; size?: number; onPress?: () => void }) {
  const content = (
    <View style={sr.row}>
      {Array.from({ length: 5 }).map((_, i) => (
        <MaterialIcons key={i} name={i < Math.round(rating) ? 'star' : 'star-border'} size={size} color={i < Math.round(rating) ? Colors.gold : Colors.textMuted} />
      ))}
      <Text style={sr.num}>{rating.toFixed(1)}</Text>
      {count > 0 && <Text style={sr.ct}>({count} review{count !== 1 ? 's' : ''})</Text>}
    </View>
  );
  if (onPress) return <Pressable onPress={onPress} hitSlop={8}>{content}</Pressable>;
  return content;
}

const sr = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  num: { fontSize: 13, fontWeight: Typography.bold, color: Colors.gold, marginLeft: 4 },
  ct: { fontSize: 12, color: Colors.textMuted },
});

// ─── Star Picker (for writing a review) ──────────────────────────────────────
function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Pressable key={star} onPress={() => onChange(star)} hitSlop={8}>
          <MaterialIcons name={value >= star ? 'star' : 'star-border'} size={32} color={value >= star ? Colors.gold : Colors.textMuted} />
        </Pressable>
      ))}
    </View>
  );
}

// ─── Review Row ───────────────────────────────────────────────────────────────
function ReviewRow({ review, isOwn }: { review: BusinessReview; isOwn: boolean }) {
  const initial = (review.reviewer_name ?? 'A')[0].toUpperCase();
  return (
    <View style={rv.card}>
      <View style={rv.header}>
        <View style={rv.avatar}>
          {review.reviewer_avatar ? (
            <Image source={{ uri: review.reviewer_avatar }} style={{ width: 36, height: 36, borderRadius: 18 }} contentFit="cover" />
          ) : (
            <Text style={rv.avatarLetter}>{initial}</Text>
          )}
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={rv.name} numberOfLines={1}>{review.reviewer_name ?? 'Anonymous'}</Text>
            {isOwn && <View style={rv.ownBadge}><Text style={rv.ownText}>Your review</Text></View>}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <MaterialIcons key={i} name={i < review.rating ? 'star' : 'star-border'} size={11} color={i < review.rating ? Colors.gold : Colors.textMuted} />
            ))}
            <Text style={rv.date}>{formatRelativeDate(review.created_at)}</Text>
          </View>
        </View>
      </View>
      {review.body ? <Text style={rv.body}>{review.body}</Text> : null}
    </View>
  );
}

const rv = StyleSheet.create({
  card: { paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder, gap: Spacing.sm },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.goldSurface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: `${Colors.gold}33`, flexShrink: 0 },
  avatarLetter: { fontSize: 16, fontWeight: Typography.bold, color: Colors.gold },
  name: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary, flex: 1 },
  ownBadge: { paddingHorizontal: 6, paddingVertical: 2, backgroundColor: Colors.goldSurface, borderRadius: Radius.full, borderWidth: 1, borderColor: `${Colors.gold}44` },
  ownText: { fontSize: 9, color: Colors.gold, fontWeight: Typography.bold },
  date: { fontSize: 10, color: Colors.textMuted },
  body: { fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 20, paddingLeft: 52 },
});

// ─── Write Review Modal ───────────────────────────────────────────────────────
function WriteReviewModal({
  visible,
  existingReview,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  existingReview: BusinessReview | null;
  onClose: () => void;
  onSubmit: (rating: number, body: string) => Promise<void>;
}) {
  const [rating, setRating] = useState(existingReview?.rating ?? 0);
  const [body, setBody] = useState(existingReview?.body ?? '');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (visible) {
      setRating(existingReview?.rating ?? 0);
      setBody(existingReview?.body ?? '');
    }
  }, [visible, existingReview]);

  const handleSubmit = async () => {
    if (rating === 0) { Alert.alert('Rating required', 'Please select a star rating.'); return; }
    setSubmitting(true);
    await onSubmit(rating, body.trim());
    setSubmitting(false);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={wr.overlay}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
        <View style={wr.sheet}>
          <View style={wr.handle} />
          <Text style={wr.title}>{existingReview ? 'Update Your Review' : 'Write a Review'}</Text>
          <Text style={wr.sub}>Rate your experience with this business</Text>
          <View style={{ alignItems: 'center', paddingVertical: Spacing.md }}>
            <StarPicker value={rating} onChange={setRating} />
          </View>
          <TextInput
            style={wr.input}
            value={body}
            onChangeText={setBody}
            placeholder="Share your experience (optional)..."
            placeholderTextColor={Colors.textMuted}
            multiline
            maxLength={500}
            textAlignVertical="top"
          />
          <Text style={wr.charCount}>{body.length}/500</Text>
          <Pressable onPress={handleSubmit} disabled={submitting || rating === 0} style={({ pressed }) => [wr.submitBtn, (submitting || rating === 0) && { opacity: 0.5 }, pressed && { opacity: 0.85 }]}>
            <LinearGradient colors={[Colors.gold, Colors.goldDim]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={wr.submitBtnInner}>
              {submitting ? <ActivityIndicator size="small" color={Colors.textOnGold} /> : (
                <>
                  <MaterialIcons name="star" size={16} color={Colors.textOnGold} />
                  <Text style={wr.submitText}>{existingReview ? 'Update Review' : 'Submit Review'}</Text>
                </>
              )}
            </LinearGradient>
          </Pressable>
          <Pressable onPress={onClose} style={wr.cancelBtn} hitSlop={8}>
            <Text style={wr.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const wr = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.7)' },
  sheet: {
    backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: Spacing.base, paddingTop: Spacing.md, paddingBottom: 36,
    borderTopWidth: 1, borderTopColor: Colors.surfaceBorder, gap: Spacing.sm,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.surfaceBorder, alignSelf: 'center', marginBottom: Spacing.sm },
  title: { fontSize: Typography.md, fontWeight: Typography.black, color: Colors.textPrimary, textAlign: 'center' },
  sub: { fontSize: Typography.xs, color: Colors.textMuted, textAlign: 'center' },
  input: {
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, borderWidth: 1.5,
    borderColor: Colors.surfaceBorder, padding: Spacing.md, color: Colors.textPrimary,
    fontSize: Typography.sm, minHeight: 100, marginTop: Spacing.xs,
  },
  charCount: { fontSize: 10, color: Colors.textMuted, textAlign: 'right', marginTop: -4 },
  submitBtn: { borderRadius: Radius.lg, overflow: 'hidden', marginTop: Spacing.xs },
  submitBtnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingVertical: Spacing.base },
  submitText: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textOnGold },
  cancelBtn: { alignItems: 'center', paddingVertical: Spacing.sm },
  cancelText: { fontSize: Typography.sm, color: Colors.textMuted, textDecorationLine: 'underline' },
});

// ─── Service Row ──────────────────────────────────────────────────────────────
function ServiceRow({ service }: { service: BusinessServiceItem }) {
  return (
    <View style={srv.row}>
      <View style={srv.body}>
        <Text style={srv.name}>{service.name}</Text>
        {service.description ? <Text style={srv.desc} numberOfLines={3}>{service.description}</Text> : null}
      </View>
      {service.price_text ? <Text style={srv.price}>{service.price_text}</Text> : null}
    </View>
  );
}

const srv = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder, gap: Spacing.md },
  body: { flex: 1, gap: 3 },
  name: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  desc: { fontSize: 12, color: Colors.textMuted, lineHeight: 17 },
  price: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.gold, flexShrink: 0 },
});

// ─── Hours Row ────────────────────────────────────────────────────────────────
function HoursRow({ day, hours, isToday }: { day: string; hours: any; isToday: boolean }) {
  let timeStr = 'Closed';
  if (hours && !hours.closed && hours.open_time && hours.close_time) {
    timeStr = `${formatTime(hours.open_time)} – ${formatTime(hours.close_time)}`;
    if (hours.crosses_midnight) timeStr += ' (+next day)';
  } else if (!hours) {
    timeStr = '—';
  }

  return (
    <View style={[hr.row, isToday && hr.rowToday]}>
      {isToday && <View style={hr.todayBar} />}
      <Text style={[hr.day, isToday && hr.dayToday]}>{day}</Text>
      <Text style={[hr.time, (!hours || hours.closed) && hr.closedTime, isToday && { color: Colors.gold }]}>
        {timeStr}
      </Text>
    </View>
  );
}

const hr = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder, position: 'relative', paddingLeft: 12 },
  rowToday: { backgroundColor: `${Colors.gold}0A` },
  todayBar: { position: 'absolute', left: 0, top: 4, bottom: 4, width: 3, borderRadius: 2, backgroundColor: Colors.gold },
  day: { width: 110, fontSize: Typography.sm, color: Colors.textSecondary, fontWeight: Typography.medium },
  dayToday: { color: Colors.gold, fontWeight: Typography.bold },
  time: { flex: 1, fontSize: Typography.sm, color: Colors.textPrimary, textAlign: 'right' },
  closedTime: { color: Colors.textMuted },
});

// ─── Info Row ─────────────────────────────────────────────────────────────────
function InfoRow({ icon, label, value, onPress, color }: { icon: string; label: string; value: string; onPress?: () => void; color?: string }) {
  const inner = (
    <View style={ir.row}>
      <View style={ir.iconWrap}>
        <MaterialIcons name={icon as any} size={16} color={color ?? Colors.gold} />
      </View>
      <View style={ir.body}>
        <Text style={ir.label}>{label}</Text>
        <Text style={[ir.value, color ? { color } : null]} numberOfLines={2}>{value}</Text>
      </View>
      {onPress ? <MaterialIcons name="chevron-right" size={18} color={Colors.textMuted} /> : null}
    </View>
  );
  if (onPress) return <Pressable onPress={onPress} style={({ pressed }) => [pressed && { opacity: 0.7 }]}>{inner}</Pressable>;
  return inner;
}

const ir = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder, gap: Spacing.md },
  iconWrap: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.goldSurface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: `${Colors.gold}2A`, flexShrink: 0 },
  body: { flex: 1, gap: 2 },
  label: { fontSize: 11, color: Colors.textMuted },
  value: { fontSize: Typography.sm, color: Colors.textPrimary, fontWeight: Typography.medium },
});

// ─────────────────────────────────────────────────────────────────────────────
// Main Screen
// ─────────────────────────────────────────────────────────────────────────────
export default function BusinessProfileScreen() {
  const { businessId } = useLocalSearchParams<{ businessId: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const [profile, setProfile] = useState<BusinessPublicProfile | null>(null);
  const [photos, setPhotos] = useState<BusinessPhoto[]>([]);
  const [services, setServices] = useState<BusinessServiceItem[]>([]);
  const [serviceAreas, setServiceAreas] = useState<BusinessServiceArea[]>([]);
  const [hoursMap, setHoursMap] = useState<BusinessHoursMap>({});
  const [reviews, setReviews] = useState<BusinessReview[]>([]);
  const [myReview, setMyReview] = useState<BusinessReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [isFavorited, setIsFavorited] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [isOwnerState, setIsOwnerState] = useState(false);

  // View count guard — only fire once per businessId mount
  const viewFired = useRef(false);

  const loadAll = useCallback(async (isRefresh = false) => {
    if (!businessId) return;
    if (!isRefresh) setLoading(true);

    const [p, ph, sv, sa, hm, rv] = await Promise.all([
      fetchBusinessPublicProfile(businessId),
      fetchBusinessPhotos(businessId),
      fetchBusinessServicesById(businessId),
      fetchBusinessServiceAreas(businessId),
      fetchBusinessHours(businessId),
      fetchBusinessReviews(businessId),
    ]);

    if (!p) {
      setNotFound(true);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    setProfile(p);
    setPhotos(ph);
    setServices(sv);
    setServiceAreas(sa);
    setHoursMap(hm);
    setReviews(rv);
    setLoading(false);
    setRefreshing(false);

    // View count — fire exactly once
    if (!viewFired.current) {
      viewFired.current = true;
      incrementBusinessView(businessId).catch(() => {});
    }

    // Parallel: check favorites, my review, and ownership
    if (user) {
      const [fav, mine, ownerRecord] = await Promise.all([
        checkBusinessFavorited(user.id, businessId),
        fetchMyBusinessReview(businessId, user.id),
        // fetchOwnerBusinessRecord returns null when caller is NOT the owner (RLS-enforced)
        fetchOwnerBusinessRecord(businessId),
      ]);
      setIsFavorited(fav);
      setMyReview(mine);
      setIsOwnerState(!!ownerRecord);
    }
  }, [businessId, user]);

  useEffect(() => { loadAll(false); }, [loadAll]);

  const handleRefresh = useCallback(() => { setRefreshing(true); loadAll(true); }, [loadAll]);

  const openStatus = useMemo(() => getOpenStatusText(hoursMap), [hoursMap]);
  const jamaicaDay = useMemo(() => {
    const nowJam = new Date(Date.now() - 5 * 60 * 60 * 1000);
    return nowJam.getUTCDay();
  }, []);

  // ── Action Handlers ─────────────────────────────────────────────────────────
  const handleCall = useCallback(() => {
    if (!profile?.phone) return;
    Linking.openURL(`tel:${profile.phone.replace(/\s/g, '')}`).catch(() =>
      Alert.alert('Unable to call', 'This device does not support phone calls.')
    );
  }, [profile?.phone]);

  const handleWhatsApp = useCallback(() => {
    if (!profile?.whatsapp) return;
    const number = profile.whatsapp.replace(/\D/g, '');
    Linking.openURL(`https://wa.me/${number}`).catch(() =>
      Alert.alert('WhatsApp', 'Unable to open WhatsApp. Please ensure it is installed.')
    );
  }, [profile?.whatsapp]);

  const handleDirections = useCallback(() => {
    if (!profile) return;
    // Only navigate when the RPC returned non-null public coordinates.
    // home_based / mobile / online / private hybrid → server returns null.
    if (profile.latitude != null && profile.longitude != null) {
      const url = Platform.select({
        ios: `maps://?q=${encodeURIComponent(profile.name)}&ll=${profile.latitude},${profile.longitude}`,
        android: `geo:${profile.latitude},${profile.longitude}?q=${encodeURIComponent(profile.name)}`,
        default: `https://maps.google.com/?q=${profile.latitude},${profile.longitude}`,
      });
      Linking.openURL(url!).catch(() => {});
    } else if (profile.street_address) {
      const q = encodeURIComponent(`${profile.street_address}, ${profile.town ?? ''}, ${profile.primary_parish}, Jamaica`);
      Linking.openURL(`https://maps.google.com/?q=${q}`).catch(() => {});
    }
  }, [profile]);

  const handleWebsite = useCallback(() => {
    if (!profile?.website) return;
    const url = profile.website.startsWith('http') ? profile.website : `https://${profile.website}`;
    Linking.openURL(url).catch(() => {});
  }, [profile?.website]);

  const handleInstagram = useCallback(() => {
    if (!profile?.instagram) return;
    const handle = profile.instagram.replace('@', '').replace(/https?:\/\/(www\.)?instagram\.com\//i, '');
    Linking.openURL(`https://instagram.com/${handle}`).catch(() => {});
  }, [profile?.instagram]);

  const handleFacebook = useCallback(() => {
    if (!profile?.facebook) return;
    const url = profile.facebook.startsWith('http') ? profile.facebook : `https://${profile.facebook}`;
    Linking.openURL(url).catch(() => {});
  }, [profile?.facebook]);

  const handleFavorite = useCallback(async () => {
    if (!user) {
      Alert.alert('Sign In Required', 'Sign in to save businesses to your favourites.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign In', onPress: () => router.push('/auth' as any) },
      ]);
      return;
    }
    if (!businessId) return;
    const prev = isFavorited;
    setIsFavorited(!prev);
    if (prev) {
      await removeBusinessFavorite(user.id, businessId);
    } else {
      await addBusinessFavorite(user.id, businessId);
    }
  }, [user, businessId, isFavorited, router]);

  const handleShare = useCallback(() => {
    if (!profile) return;
    const message = `Check out ${profile.name} on Vybz Hub — Jamaica's #1 Event & Business Discovery app!`;
    Share.share({ message, title: profile.name }).catch(() => {});
  }, [profile]);

  // ── Reviews ─────────────────────────────────────────────────────────────────
  const handleWriteReview = useCallback(() => {
    if (!user) {
      Alert.alert('Sign In Required', 'Sign in to write a review.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign In', onPress: () => router.push('/auth' as any) },
      ]);
      return;
    }
    setShowReviewModal(true);
  }, [user, router]);

  const handleSubmitReview = useCallback(async (rating: number, body: string) => {
    if (!user || !businessId) return;
    const { error } = await upsertBusinessReview(businessId, user.id, rating, body);
    if (error) {
      Alert.alert('Error', error);
      return;
    }
    setShowReviewModal(false);
    // Refresh reviews + profile (rating may have updated)
    const [rv, mine, p] = await Promise.all([
      fetchBusinessReviews(businessId),
      fetchMyBusinessReview(businessId, user.id),
      fetchBusinessPublicProfile(businessId),
    ]);
    setReviews(rv);
    setMyReview(mine);
    if (p) setProfile(p);
  }, [user, businessId]);

  // ── Loading / not found states ───────────────────────────────────────────────
  if (loading) {
    return (
      <View style={p.loadingContainer}>
        <SafeAreaView edges={['top']}>
          <Pressable onPress={() => router.back()} style={p.backBtn} hitSlop={8}>
            <MaterialIcons name="arrow-back" size={20} color={Colors.textPrimary} />
          </Pressable>
        </SafeAreaView>
        <View style={p.center}>
          <ActivityIndicator size="large" color={Colors.gold} />
          <Text style={p.loadingText}>Loading...</Text>
        </View>
      </View>
    );
  }

  if (notFound || !profile) {
    return (
      <View style={p.loadingContainer}>
        <SafeAreaView edges={['top']}>
          <Pressable onPress={() => router.back()} style={p.backBtn} hitSlop={8}>
            <MaterialIcons name="arrow-back" size={20} color={Colors.textPrimary} />
          </Pressable>
        </SafeAreaView>
        <View style={p.center}>
          <View style={p.notFoundIcon}><MaterialIcons name="storefront" size={40} color={Colors.textMuted} /></View>
          <Text style={p.notFoundTitle}>Business Not Found</Text>
          <Text style={p.notFoundSub}>This business may have been removed or is not yet live.</Text>
          <Pressable onPress={() => router.back()} style={p.goBackBtn}>
            <Text style={p.goBackText}>Go Back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const hasCover = !!profile.cover_url;
  const hasDirections = profile.latitude != null && profile.longitude != null;
  const hasLocation = profile.location_type !== 'online' && (profile.town || profile.primary_parish || profile.street_address);
  const isOwner = isOwnerState;
  const canReview = !!user && !isOwner;

  // Rating distribution
  const ratingCounts = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: reviews.filter((r) => r.rating === star).length,
  }));

  return (
    <View style={p.container}>
      {/* Review Modal */}
      <WriteReviewModal
        visible={showReviewModal}
        existingReview={myReview}
        onClose={() => setShowReviewModal(false)}
        onSubmit={handleSubmitReview}
      />

      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        <View style={p.header}>
          <Pressable onPress={() => router.back()} style={p.backBtn} hitSlop={8}>
            <MaterialIcons name="arrow-back" size={20} color={Colors.textPrimary} />
          </Pressable>
          <Text style={p.headerTitle} numberOfLines={1}>{profile.name}</Text>
          <View style={p.headerActions}>
            <Pressable onPress={handleShare} style={p.headerActionBtn} hitSlop={8}>
              <MaterialIcons name="share" size={20} color={Colors.textPrimary} />
            </Pressable>
            {isOwner && (
              <Pressable onPress={() => router.push(`/business/edit/${businessId}` as any)} style={p.headerActionBtn} hitSlop={8}>
                <MaterialIcons name="edit" size={20} color={Colors.gold} />
              </Pressable>
            )}
            {isOwner && (
              <Pressable onPress={() => router.push(`/business/promote/${businessId}` as any)} style={p.headerActionBtn} hitSlop={8}>
                <MaterialIcons name="rocket-launch" size={20} color={Colors.gold} />
              </Pressable>
            )}
          </View>
        </View>
      </SafeAreaView>

      <ScrollView
        style={p.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.gold} />}
      >
        {/* Cover */}
        <View style={p.coverWrap}>
          {hasCover ? (
            <Image source={{ uri: profile.cover_url! }} style={p.cover} contentFit="cover" transition={200} />
          ) : (
            <View style={[p.cover, p.coverPlaceholder]}>
              <LinearGradient colors={[`${profile.category_color}44`, `${profile.category_color}18`]} style={StyleSheet.absoluteFillObject} />
              <MaterialIcons name={profile.category_icon as any} size={64} color={profile.category_color} />
            </View>
          )}
          {/* Logo overlay */}
          {profile.logo_url && (
            <View style={p.logoOverlay}>
              <Image source={{ uri: profile.logo_url }} style={p.logo} contentFit="cover" transition={200} />
            </View>
          )}
          {/* Photos count badge */}
          {photos.length > 0 && (
            <Pressable style={p.photoBadge} onPress={() => setActiveTab('photos')}>
              <MaterialIcons name="photo-library" size={11} color="#fff" />
              <Text style={p.photoBadgeText}>{photos.length + (hasCover ? 1 : 0)}</Text>
            </Pressable>
          )}
        </View>

        {/* Identity */}
        <View style={p.infoSection}>
          <View style={p.nameRow}>
            <Text style={p.businessName}>{profile.name}</Text>
            {profile.verified && (
              <View style={p.verifiedBadge}>
                <MaterialIcons name="verified" size={13} color={Colors.textOnGold} />
                <Text style={p.verifiedText}>Verified</Text>
              </View>
            )}
          </View>

          <View style={p.metaRow}>
            <View style={[p.catDot, { backgroundColor: profile.category_color }]} />
            <Text style={[p.catText, { color: profile.category_color }]}>{profile.category_label}</Text>
            {(profile.town || profile.primary_parish) && (
              <>
                <Text style={p.metaSep}>·</Text>
                <MaterialIcons name="place" size={12} color={Colors.textMuted} />
                <Text style={p.locationText} numberOfLines={1}>
                  {profile.town ? `${profile.town}, ${profile.primary_parish}` : profile.primary_parish}
                </Text>
              </>
            )}
          </View>

          {openStatus.label ? (
            <View style={p.statusRow}>
              <View style={[p.statusDot, { backgroundColor: openStatus.color }]} />
              <Text style={[p.statusLabel, { color: openStatus.color }]}>{openStatus.label}</Text>
              {openStatus.detail ? <Text style={p.statusDetail}> · {openStatus.detail}</Text> : null}
            </View>
          ) : null}

          {profile.avg_rating != null && profile.avg_rating > 0 ? (
            <StarRating rating={profile.avg_rating} count={profile.review_count} onPress={() => setActiveTab('reviews')} />
          ) : (
            <Text style={p.noRatingText}>No reviews yet</Text>
          )}
        </View>

        {/* Action Row */}
        <View style={p.actionRow}>
          {profile.phone && (
            <ActionBtn icon="phone" label="Call" color="#00C853" onPress={handleCall} />
          )}
          {profile.whatsapp && (
            <ActionBtn icon="chat" label="WhatsApp" color="#25D366" onPress={handleWhatsApp} />
          )}
          {hasDirections && (
            <ActionBtn icon="directions" label="Directions" color={Colors.info} onPress={handleDirections} />
          )}
          {profile.website && (
            <ActionBtn icon="language" label="Website" onPress={handleWebsite} />
          )}
          <ActionBtn
            icon={isFavorited ? 'bookmark' : 'bookmark-border'}
            label={isFavorited ? 'Saved' : 'Save'}
            active={isFavorited}
            onPress={handleFavorite}
          />
        </View>

        {/* Tab Strip */}
        <View style={p.tabStrip}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={p.tabStripContent}>
            {TABS.map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <Pressable key={tab.key} onPress={() => setActiveTab(tab.key)} style={[p.tab, isActive && p.tabActive]}>
                  <Text style={[p.tabText, isActive && p.tabTextActive]}>{tab.label}</Text>
                  {tab.key === 'reviews' && profile.review_count > 0 && (
                    <View style={p.tabBadge}>
                      <Text style={p.tabBadgeText}>{profile.review_count}</Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* Tab Content */}
        <View style={p.tabContent}>

          {/* ── OVERVIEW ── */}
          {activeTab === 'overview' && (
            <View style={p.tabPane}>
              {profile.description ? (
                <View style={p.block}>
                  <Text style={p.blockTitle}>About</Text>
                  <Text style={p.aboutText}>{profile.description}</Text>
                </View>
              ) : null}

              <View style={p.block}>
                <Text style={p.blockTitle}>Information</Text>
                {profile.phone ? (
                  <InfoRow icon="phone" label="Phone" value={profile.phone} color="#00C853" onPress={handleCall} />
                ) : null}
                {profile.whatsapp ? (
                  <InfoRow icon="chat" label="WhatsApp" value={profile.whatsapp} color="#25D366" onPress={handleWhatsApp} />
                ) : null}
                {profile.website ? (
                  <InfoRow icon="language" label="Website" value={profile.website} onPress={handleWebsite} />
                ) : null}
                {profile.instagram ? (
                  <InfoRow icon="photo-camera" label="Instagram" value={`@${profile.instagram.replace('@', '')}`} onPress={handleInstagram} />
                ) : null}
                {profile.facebook ? (
                  <InfoRow icon="facebook" label="Facebook" value={profile.facebook} onPress={handleFacebook} />
                ) : null}
                {hasLocation ? (
                  <InfoRow
                    icon="place"
                    label="Location"
                    value={
                      profile.street_address
                        ? `${profile.street_address}, ${profile.town ?? ''}, ${profile.primary_parish}`
                        : profile.town
                        ? `${profile.town}, ${profile.primary_parish}`
                        : profile.primary_parish
                    }
                    onPress={hasDirections ? handleDirections : undefined}
                  />
                ) : null}
                {profile.location_type === 'online' ? (
                  <InfoRow icon="language" label="Business Type" value="Online Only" />
                ) : (
                  <InfoRow icon="business" label="Business Type" value={getLocationType(profile.location_type)} />
                )}
              </View>

              {serviceAreas.length > 0 && (
                <View style={p.block}>
                  <Text style={p.blockTitle}>Areas Served</Text>
                  <View style={p.areaChips}>
                    {serviceAreas.map((sa) => (
                      <View key={sa.id} style={p.areaChip}>
                        <MaterialIcons name="near-me" size={11} color={Colors.info} />
                        <Text style={p.areaChipText}>{sa.parish}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </View>
          )}

          {/* ── SERVICES ── */}
          {activeTab === 'services' && (
            <View style={p.tabPane}>
              {services.length === 0 ? (
                <View style={p.emptyTab}>
                  <MaterialIcons name="list-alt" size={36} color={Colors.textMuted} />
                  <Text style={p.emptyTabTitle}>No services listed</Text>
                  <Text style={p.emptyTabSub}>Contact this business directly for more information.</Text>
                </View>
              ) : (
                <View style={p.block}>
                  <Text style={p.blockTitle}>{services.length} Service{services.length !== 1 ? 's' : ''}</Text>
                  {services.map((svc) => <ServiceRow key={svc.id} service={svc} />)}
                </View>
              )}
            </View>
          )}

          {/* ── HOURS ── */}
          {activeTab === 'hours' && (
            <View style={p.tabPane}>
              {Object.keys(hoursMap).length === 0 ? (
                <View style={p.emptyTab}>
                  <MaterialIcons name="schedule" size={36} color={Colors.textMuted} />
                  <Text style={p.emptyTabTitle}>Hours not available</Text>
                  <Text style={p.emptyTabSub}>Contact this business for opening hours.</Text>
                </View>
              ) : (
                <View style={[p.block, { paddingLeft: Spacing.base + 4 }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.sm }}>
                    <Text style={p.blockTitle}>Opening Hours</Text>
                    {openStatus.label ? (
                      <View style={[p.openPill, { backgroundColor: `${openStatus.color}18`, borderColor: `${openStatus.color}44` }]}>
                        <View style={[p.openDot, { backgroundColor: openStatus.color }]} />
                        <Text style={[p.openPillText, { color: openStatus.color }]}>{openStatus.label}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={p.hoursNote}>Jamaica local time (UTC-5, no DST)</Text>
                  {DAYS.map((day, idx) => (
                    <HoursRow key={day} day={day} hours={hoursMap[idx]} isToday={idx === jamaicaDay} />
                  ))}
                </View>
              )}
            </View>
          )}

          {/* ── PHOTOS ── */}
          {activeTab === 'photos' && (
            <View style={p.tabPane}>
              {photos.length === 0 && !hasCover ? (
                <View style={p.emptyTab}>
                  <MaterialIcons name="photo-library" size={36} color={Colors.textMuted} />
                  <Text style={p.emptyTabTitle}>No photos yet</Text>
                  <Text style={p.emptyTabSub}>This business has not uploaded any photos.</Text>
                </View>
              ) : (
                <View style={p.block}>
                  <Text style={p.blockTitle}>{photos.length + (hasCover ? 1 : 0)} Photo{photos.length + (hasCover ? 1 : 0) !== 1 ? 's' : ''}</Text>
                  <View style={p.photoGrid}>
                    {hasCover && profile.cover_url && (
                      <Pressable style={({ pressed }) => [{ opacity: pressed ? 0.8 : 1 }]}>
                        <Image source={{ uri: profile.cover_url }} style={p.photoItem} contentFit="cover" transition={200} />
                      </Pressable>
                    )}
                    {photos.map((ph) => (
                      <Pressable key={ph.id} style={({ pressed }) => [{ opacity: pressed ? 0.8 : 1 }]}>
                        <Image source={{ uri: ph.url }} style={p.photoItem} contentFit="cover" transition={200} />
                        {ph.caption ? (
                          <Text style={p.photoCaption} numberOfLines={1}>{ph.caption}</Text>
                        ) : null}
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}
            </View>
          )}

          {/* ── REVIEWS ── */}
          {activeTab === 'reviews' && (
            <View style={p.tabPane}>
              {/* Rating summary */}
              <View style={p.block}>
                <View style={p.reviewSummary}>
                  <View style={p.ratingBig}>
                    <Text style={p.ratingBigNum}>{profile.avg_rating != null && profile.avg_rating > 0 ? profile.avg_rating.toFixed(1) : '—'}</Text>
                    <View style={{ flexDirection: 'row', gap: 2 }}>
                      {Array.from({ length: 5 }).map((_, i) => (
                        <MaterialIcons key={i} name={profile.avg_rating != null && i < Math.round(profile.avg_rating) ? 'star' : 'star-border'} size={16} color={Colors.gold} />
                      ))}
                    </View>
                    <Text style={p.ratingBigCount}>{profile.review_count} review{profile.review_count !== 1 ? 's' : ''}</Text>
                  </View>
                  <View style={p.ratingBars}>
                    {ratingCounts.map(({ star, count }) => {
                      const pct = profile.review_count > 0 ? (count / profile.review_count) : 0;
                      return (
                        <View key={star} style={p.ratingBarRow}>
                          <Text style={p.ratingBarStar}>{star}</Text>
                          <MaterialIcons name="star" size={10} color={Colors.gold} />
                          <View style={p.ratingBarTrack}>
                            <View style={[p.ratingBarFill, { width: `${pct * 100}%` }]} />
                          </View>
                          <Text style={p.ratingBarCount}>{count}</Text>
                        </View>
                      );
                    })}
                  </View>
                </View>

                {/* Write review CTA */}
                {canReview && (
                  <Pressable onPress={handleWriteReview} style={({ pressed }) => [p.writeReviewBtn, pressed && { opacity: 0.8 }]}>
                    <MaterialIcons name={myReview ? 'edit' : 'rate-review'} size={16} color={Colors.gold} />
                    <Text style={p.writeReviewText}>{myReview ? 'Update Your Review' : 'Write a Review'}</Text>
                  </Pressable>
                )}
                {isOwner && (
                  <View style={p.ownerReviewNote}>
                    <MaterialIcons name="info-outline" size={13} color={Colors.textMuted} />
                    <Text style={p.ownerReviewNoteText}>Business owners cannot review their own listing.</Text>
                  </View>
                )}
                {!user && (
                  <Pressable onPress={() => router.push('/auth' as any)} style={({ pressed }) => [p.writeReviewBtn, pressed && { opacity: 0.8 }]}>
                    <MaterialIcons name="rate-review" size={16} color={Colors.gold} />
                    <Text style={p.writeReviewText}>Sign in to write a review</Text>
                  </Pressable>
                )}
              </View>

              {/* Review list */}
              {reviews.length === 0 ? (
                <View style={p.emptyTab}>
                  <MaterialIcons name="star-border" size={36} color={Colors.textMuted} />
                  <Text style={p.emptyTabTitle}>No reviews yet</Text>
                  <Text style={p.emptyTabSub}>Be the first to share your experience with this business.</Text>
                </View>
              ) : (
                <View style={[p.block, { paddingTop: 0 }]}>
                  {reviews.map((r) => (
                    <ReviewRow key={r.id} review={r} isOwn={user?.id === r.user_id} />
                  ))}
                </View>
              )}
            </View>
          )}
        </View>

        <View style={{ height: 80 }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const p = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loadingContainer: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md, paddingHorizontal: Spacing.xl },
  loadingText: { fontSize: Typography.sm, color: Colors.textMuted },
  notFoundIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.surfaceBorder },
  notFoundTitle: { fontSize: Typography.lg, fontWeight: Typography.bold, color: Colors.textSecondary },
  notFoundSub: { fontSize: Typography.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 21 },
  goBackBtn: { paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm, backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.surfaceBorder, marginTop: Spacing.xs },
  goBackText: { fontSize: Typography.sm, color: Colors.textSecondary, fontWeight: Typography.medium },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.surfaceBorder },

  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.base, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder, gap: Spacing.sm },
  headerTitle: { flex: 1, fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textPrimary, textAlign: 'center' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  headerActionBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.surfaceBorder },

  scroll: { flex: 1 },

  // Cover
  coverWrap: { position: 'relative', width: '100%', height: 220 },
  cover: { width: '100%', height: 220 },
  coverPlaceholder: { backgroundColor: Colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  logoOverlay: {
    position: 'absolute', bottom: Spacing.md, left: Spacing.base,
    width: 60, height: 60, borderRadius: Radius.md, overflow: 'hidden',
    borderWidth: 2.5, borderColor: Colors.background,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.5, shadowRadius: 6 },
      android: { elevation: 6 },
    }),
  },
  logo: { width: 60, height: 60 },
  photoBadge: {
    position: 'absolute', bottom: Spacing.md, right: Spacing.base,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.65)', paddingHorizontal: Spacing.sm, paddingVertical: 4,
    borderRadius: Radius.full,
  },
  photoBadgeText: { fontSize: 11, color: '#fff', fontWeight: Typography.semibold },

  // Identity
  infoSection: {
    paddingHorizontal: Spacing.base, paddingTop: Spacing.md, paddingBottom: Spacing.sm,
    gap: 7, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
  businessName: { fontSize: Typography.xl, fontWeight: Typography.black, color: Colors.textPrimary, flex: 1, lineHeight: 28 },
  verifiedBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.gold, paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: Radius.full },
  verifiedText: { fontSize: 10, fontWeight: Typography.bold, color: Colors.textOnGold },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  catDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  catText: { fontSize: Typography.sm, fontWeight: Typography.semibold, flexShrink: 0 },
  metaSep: { color: Colors.textMuted, fontSize: Typography.sm },
  locationText: { fontSize: Typography.sm, color: Colors.textMuted, flex: 1 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusLabel: { fontSize: Typography.sm, fontWeight: Typography.bold },
  statusDetail: { fontSize: Typography.sm, color: Colors.textMuted },
  noRatingText: { fontSize: Typography.xs, color: Colors.textMuted, fontStyle: 'italic' },

  // Actions
  actionRow: {
    flexDirection: 'row', paddingHorizontal: Spacing.sm, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder, justifyContent: 'space-around',
  },

  // Tabs
  tabStrip: { borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder, backgroundColor: Colors.surface },
  tabStripContent: { paddingHorizontal: Spacing.sm, gap: 0 },
  tab: { paddingHorizontal: Spacing.base, paddingVertical: Spacing.md, borderBottomWidth: 2, borderBottomColor: 'transparent', flexDirection: 'row', alignItems: 'center', gap: 5 },
  tabActive: { borderBottomColor: Colors.gold },
  tabText: { fontSize: Typography.sm, color: Colors.textMuted, fontWeight: Typography.medium },
  tabTextActive: { color: Colors.gold, fontWeight: Typography.bold },
  tabBadge: { backgroundColor: Colors.goldSurface, borderRadius: Radius.full, paddingHorizontal: 5, paddingVertical: 1, borderWidth: 1, borderColor: `${Colors.gold}44` },
  tabBadgeText: { fontSize: 10, color: Colors.gold, fontWeight: Typography.bold },

  tabContent: { backgroundColor: Colors.background },
  tabPane: { paddingBottom: Spacing.xl },

  block: { paddingHorizontal: Spacing.base, paddingTop: Spacing.lg, paddingBottom: Spacing.sm },
  blockTitle: { fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: Spacing.md },
  aboutText: { fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 22 },

  // Hours
  openPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: Radius.full, borderWidth: 1 },
  openDot: { width: 7, height: 7, borderRadius: 3.5 },
  openPillText: { fontSize: 11, fontWeight: Typography.bold },
  hoursNote: { fontSize: 10, color: Colors.textMuted, fontStyle: 'italic', marginTop: -Spacing.xs, marginBottom: Spacing.sm },

  // Service areas
  areaChips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  areaChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing.sm, paddingVertical: 5, borderRadius: Radius.full, backgroundColor: `${Colors.info}14`, borderWidth: 1, borderColor: `${Colors.info}30` },
  areaChipText: { fontSize: 12, color: Colors.info, fontWeight: Typography.medium },

  // Photos
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.xs },
  photoItem: { width: 110, height: 110, borderRadius: Radius.sm },
  photoCaption: { fontSize: 9, color: Colors.textMuted, width: 110, marginTop: 2 },

  // Reviews
  reviewSummary: { flexDirection: 'row', gap: Spacing.lg, alignItems: 'flex-start', paddingBottom: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder, marginBottom: Spacing.md },
  ratingBig: { alignItems: 'center', gap: 4, minWidth: 60 },
  ratingBigNum: { fontSize: 40, fontWeight: Typography.black, color: Colors.textPrimary, lineHeight: 44 },
  ratingBigCount: { fontSize: 10, color: Colors.textMuted },
  ratingBars: { flex: 1, gap: 4 },
  ratingBarRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  ratingBarStar: { fontSize: 10, color: Colors.textMuted, width: 8, textAlign: 'right' },
  ratingBarTrack: { flex: 1, height: 6, backgroundColor: Colors.surfaceBorder, borderRadius: 3, overflow: 'hidden' },
  ratingBarFill: { height: 6, backgroundColor: Colors.gold, borderRadius: 3 },
  ratingBarCount: { fontSize: 10, color: Colors.textMuted, width: 16, textAlign: 'right' },
  writeReviewBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.base, backgroundColor: Colors.goldSurface, borderRadius: Radius.lg, borderWidth: 1, borderColor: `${Colors.gold}33`, marginTop: Spacing.sm },
  writeReviewText: { fontSize: Typography.sm, color: Colors.gold, fontWeight: Typography.semibold, flex: 1 },
  ownerReviewNote: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginTop: Spacing.sm },
  ownerReviewNoteText: { fontSize: Typography.xs, color: Colors.textMuted, flex: 1 },

  // Empty tab
  emptyTab: { alignItems: 'center', paddingTop: Spacing.xxl, gap: Spacing.md, paddingHorizontal: Spacing.xl },
  emptyTabTitle: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textSecondary },
  emptyTabSub: { fontSize: Typography.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 21 },
});
