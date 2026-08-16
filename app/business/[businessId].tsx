// ─── Business Profile Page ────────────────────────────────────────────────────
// Full business profile with cover, action buttons, and tabs.
// Data: get_business_public_profile RPC + supporting table fetches.

import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import {
  fetchBusinessPublicProfile,
  fetchBusinessPhotos,
  fetchBusinessServicesById,
  fetchBusinessServiceAreas,
  fetchBusinessHours,
  isBusinessOpenNow,
  incrementBusinessView,
  BusinessPublicProfile,
  BusinessPhoto,
  BusinessServiceItem,
  BusinessServiceArea,
  BusinessHoursMap,
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

function getOpenStatusText(
  hoursMap: BusinessHoursMap
): { label: string; color: string; detail: string } {
  if (Object.keys(hoursMap).length === 0) {
    return { label: '', color: Colors.textMuted, detail: '' };
  }
  const isOpen = isBusinessOpenNow(hoursMap);
  if (isOpen === null) return { label: '', color: Colors.textMuted, detail: '' };

  // Jamaica UTC-5 current day
  const nowJam = new Date(Date.now() - 5 * 60 * 60 * 1000);
  const today = nowJam.getUTCDay();
  const todayHours = hoursMap[today];

  if (!todayHours || todayHours.closed) {
    return { label: 'Closed today', color: '#FF5722', detail: '' };
  }

  const closeStr = todayHours.close_time ? `Closes ${formatTime(todayHours.close_time)}` : '';
  const openStr = todayHours.open_time ? `Opens ${formatTime(todayHours.open_time)}` : '';

  if (isOpen) {
    return { label: 'Open now', color: '#00C853', detail: closeStr };
  }
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

// ─── Action Buttons ───────────────────────────────────────────────────────────
function ActionBtn({
  icon,
  label,
  color,
  onPress,
}: {
  icon: string;
  label: string;
  color?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [ab.btn, pressed && { opacity: 0.75 }]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={[ab.iconWrap, color ? { borderColor: `${color}55`, backgroundColor: `${color}18` } : null]}>
        <MaterialIcons name={icon as any} size={20} color={color ?? Colors.textPrimary} />
      </View>
      <Text style={[ab.label, color ? { color } : null]}>{label}</Text>
    </Pressable>
  );
}

const ab = StyleSheet.create({
  btn: { alignItems: 'center', gap: 5, flex: 1 },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.surfaceBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: Typography.semibold,
    textAlign: 'center',
  },
});

// ─── Star Rating ──────────────────────────────────────────────────────────────
function StarRating({ rating, count }: { rating: number; count: number }) {
  return (
    <View style={sr.row}>
      {Array.from({ length: 5 }).map((_, i) => (
        <MaterialIcons
          key={i}
          name={i < Math.round(rating) ? 'star' : 'star-border'}
          size={14}
          color={i < Math.round(rating) ? Colors.gold : Colors.textMuted}
        />
      ))}
      <Text style={sr.num}>{rating.toFixed(1)}</Text>
      {count > 0 && <Text style={sr.ct}>({count} review{count !== 1 ? 's' : ''})</Text>}
    </View>
  );
}

const sr = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  num: { fontSize: 13, fontWeight: Typography.bold, color: Colors.gold, marginLeft: 4 },
  ct: { fontSize: 12, color: Colors.textMuted },
});

// ─── Service row ──────────────────────────────────────────────────────────────
function ServiceRow({ service }: { service: BusinessServiceItem }) {
  return (
    <View style={srv.row}>
      <View style={srv.body}>
        <Text style={srv.name}>{service.name}</Text>
        {service.description ? (
          <Text style={srv.desc} numberOfLines={2}>
            {service.description}
          </Text>
        ) : null}
      </View>
      {service.price_text ? (
        <Text style={srv.price}>{service.price_text}</Text>
      ) : null}
    </View>
  );
}

const srv = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
    gap: Spacing.md,
  },
  body: { flex: 1, gap: 3 },
  name: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary },
  desc: { fontSize: 12, color: Colors.textMuted, lineHeight: 17 },
  price: {
    fontSize: Typography.sm,
    fontWeight: Typography.bold,
    color: Colors.gold,
    flexShrink: 0,
  },
});

// ─── Hours row ────────────────────────────────────────────────────────────────
function HoursRow({
  day,
  hours,
  isToday,
}: {
  day: string;
  hours: any;
  isToday: boolean;
}) {
  let timeStr = 'Closed';
  if (hours && !hours.closed && hours.open_time && hours.close_time) {
    timeStr = `${formatTime(hours.open_time)} – ${formatTime(hours.close_time)}`;
    if (hours.crosses_midnight) timeStr += ' (next day)';
  } else if (!hours) {
    timeStr = '—';
  }

  return (
    <View style={[hr.row, isToday && hr.rowToday]}>
      <Text style={[hr.day, isToday && hr.dayToday]}>{day}</Text>
      <Text style={[hr.time, (!hours || hours.closed) && hr.closedTime, isToday && hr.dayToday]}>
        {timeStr}
      </Text>
      {isToday && <View style={hr.todayDot} />}
    </View>
  );
}

const hr = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
    position: 'relative',
  },
  rowToday: { backgroundColor: `${Colors.gold}0A` },
  day: { width: 110, fontSize: Typography.sm, color: Colors.textSecondary, fontWeight: Typography.medium },
  dayToday: { color: Colors.gold, fontWeight: Typography.bold },
  time: { flex: 1, fontSize: Typography.sm, color: Colors.textPrimary, textAlign: 'right' },
  closedTime: { color: Colors.textMuted },
  todayDot: {
    position: 'absolute',
    left: -Spacing.base,
    top: '50%',
    marginTop: -4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.gold,
  },
});

// ─── Photo grid item ──────────────────────────────────────────────────────────
function PhotoItem({
  photo,
  size,
  onPress,
}: {
  photo: BusinessPhoto;
  size: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [{ opacity: pressed ? 0.8 : 1 }]}
    >
      <Image
        source={{ uri: photo.url }}
        style={{ width: size, height: size, borderRadius: Radius.sm }}
        contentFit="cover"
        transition={200}
      />
    </Pressable>
  );
}

// ─── Info row ─────────────────────────────────────────────────────────────────
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
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [pressed && { opacity: 0.7 }]}>
        {inner}
      </Pressable>
    );
  }
  return inner;
}

const ir = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
    gap: Spacing.md,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.goldSurface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: `${Colors.gold}2A`,
    flexShrink: 0,
  },
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

  const [profile, setProfile] = useState<BusinessPublicProfile | null>(null);
  const [photos, setPhotos] = useState<BusinessPhoto[]>([]);
  const [services, setServices] = useState<BusinessServiceItem[]>([]);
  const [serviceAreas, setServiceAreas] = useState<BusinessServiceArea[]>([]);
  const [hoursMap, setHoursMap] = useState<BusinessHoursMap>({});
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [isFavorited, setIsFavorited] = useState(false);

  // Load all data
  useEffect(() => {
    if (!businessId) return;
    let cancelled = false;

    async function loadAll() {
      setLoading(true);
      const [p, ph, sv, sa, hm] = await Promise.all([
        fetchBusinessPublicProfile(businessId),
        fetchBusinessPhotos(businessId),
        fetchBusinessServicesById(businessId),
        fetchBusinessServiceAreas(businessId),
        fetchBusinessHours(businessId),
      ]);

      if (cancelled) return;

      if (!p) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setProfile(p);
      setPhotos(ph);
      setServices(sv);
      setServiceAreas(sa);
      setHoursMap(hm);
      setLoading(false);

      // Increment view count (fire and forget)
      incrementBusinessView(businessId).catch(() => {});
    }

    loadAll();
    return () => { cancelled = true; };
  }, [businessId]);

  const openStatus = useMemo(
    () => getOpenStatusText(hoursMap),
    [hoursMap]
  );

  const jamaicaDay = useMemo(() => {
    const nowJam = new Date(Date.now() - 5 * 60 * 60 * 1000);
    return nowJam.getUTCDay();
  }, []);

  // ── Action handlers ─────────────────────────────────────────────────────────
  const handleCall = useCallback(() => {
    if (!profile?.phone) return;
    const url = `tel:${profile.phone.replace(/\s/g, '')}`;
    Linking.openURL(url).catch(() =>
      Alert.alert('Unable to call', 'This device does not support phone calls.')
    );
  }, [profile?.phone]);

  const handleWhatsApp = useCallback(() => {
    if (!profile?.whatsapp) return;
    const number = profile.whatsapp.replace(/\D/g, '');
    Linking.openURL(`https://wa.me/${number}`).catch(() => {});
  }, [profile?.whatsapp]);

  const handleDirections = useCallback(() => {
    if (!profile) return;
    if (profile.latitude && profile.longitude) {
      const url = Platform.select({
        ios: `maps://?q=${profile.name}&ll=${profile.latitude},${profile.longitude}`,
        android: `geo:${profile.latitude},${profile.longitude}?q=${encodeURIComponent(profile.name)}`,
        default: `https://maps.google.com/?q=${profile.latitude},${profile.longitude}`,
      });
      Linking.openURL(url!).catch(() => {});
    } else if (profile.town || profile.primary_parish) {
      const q = encodeURIComponent(`${profile.name} ${profile.town} ${profile.primary_parish} Jamaica`);
      Linking.openURL(`https://maps.google.com/?q=${q}`).catch(() => {});
    }
  }, [profile]);

  const handleWebsite = useCallback(() => {
    if (!profile?.website) return;
    const url = profile.website.startsWith('http')
      ? profile.website
      : `https://${profile.website}`;
    Linking.openURL(url).catch(() => {});
  }, [profile?.website]);

  const handleInstagram = useCallback(() => {
    if (!profile?.instagram) return;
    const handle = profile.instagram.replace('@', '').replace('https://instagram.com/', '');
    Linking.openURL(`https://instagram.com/${handle}`).catch(() => {});
  }, [profile?.instagram]);

  const handleSave = useCallback(() => {
    setIsFavorited((v) => !v);
    // TODO: persist to business_favorites table when auth context is wired
  }, []);

  const handleShare = useCallback(() => {
    // TODO: implement share sheet
  }, []);

  // ── Loading state ───────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={p.loadingContainer}>
        <SafeAreaView edges={['top']}>
          <View style={p.loadingHeader}>
            <Pressable onPress={() => router.back()} style={p.backBtn} hitSlop={8}>
              <MaterialIcons name="arrow-back" size={20} color={Colors.textPrimary} />
            </Pressable>
          </View>
        </SafeAreaView>
        <View style={p.loadingCenter}>
          <ActivityIndicator size="large" color={Colors.gold} />
          <Text style={p.loadingText}>Loading...</Text>
        </View>
      </View>
    );
  }

  // ── Not found state ─────────────────────────────────────────────────────────
  if (notFound || !profile) {
    return (
      <View style={p.loadingContainer}>
        <SafeAreaView edges={['top']}>
          <View style={p.loadingHeader}>
            <Pressable onPress={() => router.back()} style={p.backBtn} hitSlop={8}>
              <MaterialIcons name="arrow-back" size={20} color={Colors.textPrimary} />
            </Pressable>
          </View>
        </SafeAreaView>
        <View style={p.loadingCenter}>
          <View style={p.notFoundIcon}>
            <MaterialIcons name="storefront" size={40} color={Colors.textMuted} />
          </View>
          <Text style={p.notFoundTitle}>Business Not Found</Text>
          <Text style={p.notFoundSub}>
            This business may have been removed or is not yet live.
          </Text>
          <Pressable onPress={() => router.back()} style={p.goBackBtn}>
            <Text style={p.goBackText}>Go Back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const hasCover = !!profile.cover_url;
  const hasLocation =
    profile.location_type !== 'online' &&
    (profile.town || profile.primary_parish || profile.street_address);

  // ── Main render ─────────────────────────────────────────────────────────────
  return (
    <View style={p.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        <View style={p.header}>
          <Pressable onPress={() => router.back()} style={p.backBtn} hitSlop={8}>
            <MaterialIcons name="arrow-back" size={20} color={Colors.textPrimary} />
          </Pressable>
          <Text style={p.headerTitle} numberOfLines={1}>
            {profile.name}
          </Text>
          <View style={p.headerActions}>
            <Pressable onPress={handleSave} style={p.headerActionBtn} hitSlop={8}>
              <MaterialIcons
                name={isFavorited ? 'bookmark' : 'bookmark-border'}
                size={22}
                color={isFavorited ? Colors.gold : Colors.textPrimary}
              />
            </Pressable>
            <Pressable onPress={handleShare} style={p.headerActionBtn} hitSlop={8}>
              <MaterialIcons name="share" size={20} color={Colors.textPrimary} />
            </Pressable>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView
        style={p.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={p.scrollContent}
      >
        {/* ── Cover image ── */}
        <View style={p.coverWrap}>
          {hasCover ? (
            <Image
              source={{ uri: profile.cover_url! }}
              style={p.cover}
              contentFit="cover"
              transition={200}
            />
          ) : (
            <View style={[p.cover, p.coverPlaceholder]}>
              <LinearGradient
                colors={[`${profile.category_color}44`, `${profile.category_color}18`]}
                style={StyleSheet.absoluteFillObject}
              />
              <MaterialIcons
                name={profile.category_icon as any}
                size={60}
                color={profile.category_color}
              />
            </View>
          )}
          {/* Logo overlay */}
          {profile.logo_url && hasCover && (
            <View style={p.logoOverlay}>
              <Image
                source={{ uri: profile.logo_url }}
                style={p.logo}
                contentFit="cover"
                transition={200}
              />
            </View>
          )}
          {/* Photo count badge */}
          {photos.length > 0 && (
            <Pressable
              style={p.photoBadge}
              onPress={() => setActiveTab('photos')}
            >
              <MaterialIcons name="photo-library" size={12} color="#fff" />
              <Text style={p.photoBadgeText}>{photos.length + (hasCover ? 1 : 0)}</Text>
            </Pressable>
          )}
        </View>

        {/* ── Business info ── */}
        <View style={p.infoSection}>
          <View style={p.nameRow}>
            <Text style={p.businessName}>{profile.name}</Text>
            {profile.verified && (
              <View style={p.verifiedBadge}>
                <MaterialIcons name="verified" size={14} color={Colors.textOnGold} />
                <Text style={p.verifiedText}>Verified</Text>
              </View>
            )}
          </View>

          {/* Category + location */}
          <View style={p.metaRow}>
            <View style={[p.catDot, { backgroundColor: profile.category_color }]} />
            <Text style={[p.catText, { color: profile.category_color }]}>
              {profile.category_label}
            </Text>
            {(profile.town || profile.primary_parish) && (
              <>
                <Text style={p.metaSep}>·</Text>
                <MaterialIcons name="place" size={13} color={Colors.textMuted} />
                <Text style={p.locationText} numberOfLines={1}>
                  {profile.town ? `${profile.town}, ${profile.primary_parish}` : profile.primary_parish}
                </Text>
              </>
            )}
          </View>

          {/* Open status */}
          {openStatus.label ? (
            <View style={p.statusRow}>
              <View style={[p.statusDot, { backgroundColor: openStatus.color }]} />
              <Text style={[p.statusLabel, { color: openStatus.color }]}>
                {openStatus.label}
              </Text>
              {openStatus.detail ? (
                <Text style={p.statusDetail}>{openStatus.detail}</Text>
              ) : null}
            </View>
          ) : null}

          {/* Rating */}
          {profile.avg_rating != null && profile.avg_rating > 0 && (
            <Pressable onPress={() => setActiveTab('reviews')}>
              <StarRating rating={profile.avg_rating} count={profile.review_count} />
            </Pressable>
          )}
        </View>

        {/* ── Action buttons ── */}
        <View style={p.actionRow}>
          {profile.phone && (
            <ActionBtn icon="phone" label="Call" color="#00C853" onPress={handleCall} />
          )}
          {profile.whatsapp && (
            <ActionBtn icon="chat" label="WhatsApp" color="#25D366" onPress={handleWhatsApp} />
          )}
          {profile.location_type !== 'online' && (
            <ActionBtn icon="directions" label="Directions" color={Colors.info} onPress={handleDirections} />
          )}
          {profile.website && (
            <ActionBtn icon="language" label="Website" color={Colors.textSecondary} onPress={handleWebsite} />
          )}
          <ActionBtn
            icon={isFavorited ? 'bookmark' : 'bookmark-border'}
            label="Save"
            color={isFavorited ? Colors.gold : undefined}
            onPress={handleSave}
          />
        </View>

        {/* ── Tab strip ── */}
        <View style={p.tabStrip}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={p.tabStripContent}
          >
            {TABS.map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <Pressable
                  key={tab.key}
                  onPress={() => setActiveTab(tab.key)}
                  style={[p.tab, isActive && p.tabActive]}
                >
                  <Text style={[p.tabText, isActive && p.tabTextActive]}>
                    {tab.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* ── Tab content ── */}
        <View style={p.tabContent}>

          {/* OVERVIEW */}
          {activeTab === 'overview' && (
            <View style={p.tabPane}>
              {/* About */}
              {profile.description ? (
                <View style={p.block}>
                  <Text style={p.blockTitle}>About</Text>
                  <Text style={p.aboutText}>{profile.description}</Text>
                </View>
              ) : null}

              {/* Contact & location info */}
              <View style={p.block}>
                <Text style={p.blockTitle}>Information</Text>
                <View>
                  {profile.phone ? (
                    <InfoRow
                      icon="phone"
                      label="Phone"
                      value={profile.phone}
                      color="#00C853"
                      onPress={handleCall}
                    />
                  ) : null}
                  {profile.whatsapp ? (
                    <InfoRow
                      icon="chat"
                      label="WhatsApp"
                      value={profile.whatsapp}
                      color="#25D366"
                      onPress={handleWhatsApp}
                    />
                  ) : null}
                  {profile.website ? (
                    <InfoRow
                      icon="language"
                      label="Website"
                      value={profile.website}
                      onPress={handleWebsite}
                    />
                  ) : null}
                  {profile.instagram ? (
                    <InfoRow
                      icon="photo-camera"
                      label="Instagram"
                      value={`@${profile.instagram.replace('@', '')}`}
                      onPress={handleInstagram}
                    />
                  ) : null}
                  {profile.facebook ? (
                    <InfoRow
                      icon="facebook"
                      label="Facebook"
                      value={profile.facebook}
                    />
                  ) : null}
                  {hasLocation ? (
                    <InfoRow
                      icon="place"
                      label="Location"
                      value={
                        profile.street_address
                          ? `${profile.street_address}, ${profile.town}, ${profile.primary_parish}`
                          : profile.town
                          ? `${profile.town}, ${profile.primary_parish}`
                          : profile.primary_parish
                      }
                      onPress={handleDirections}
                    />
                  ) : null}
                  <InfoRow
                    icon="business"
                    label="Business type"
                    value={getLocationType(profile.location_type)}
                  />
                </View>
              </View>

              {/* Service areas */}
              {serviceAreas.length > 0 && (
                <View style={p.block}>
                  <Text style={p.blockTitle}>Service Areas</Text>
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

          {/* SERVICES */}
          {activeTab === 'services' && (
            <View style={p.tabPane}>
              {services.length === 0 ? (
                <View style={p.emptyTab}>
                  <MaterialIcons name="list-alt" size={36} color={Colors.textMuted} />
                  <Text style={p.emptyTabTitle}>No services listed</Text>
                  <Text style={p.emptyTabSub}>Contact the business directly for more information.</Text>
                </View>
              ) : (
                <View style={p.block}>
                  <Text style={p.blockTitle}>{services.length} Service{services.length !== 1 ? 's' : ''}</Text>
                  {services.map((svc) => (
                    <ServiceRow key={svc.id} service={svc} />
                  ))}
                </View>
              )}
            </View>
          )}

          {/* HOURS */}
          {activeTab === 'hours' && (
            <View style={p.tabPane}>
              {Object.keys(hoursMap).length === 0 ? (
                <View style={p.emptyTab}>
                  <MaterialIcons name="schedule" size={36} color={Colors.textMuted} />
                  <Text style={p.emptyTabTitle}>Hours not available</Text>
                  <Text style={p.emptyTabSub}>Contact the business for opening hours.</Text>
                </View>
              ) : (
                <View style={[p.block, { paddingLeft: Spacing.lg }]}>
                  <Text style={p.blockTitle}>Opening Hours</Text>
                  <Text style={p.hoursNote}>All times are Jamaica local time (UTC-5).</Text>
                  {DAYS.map((day, idx) => (
                    <HoursRow
                      key={day}
                      day={day}
                      hours={hoursMap[idx]}
                      isToday={idx === jamaicaDay}
                    />
                  ))}
                </View>
              )}
            </View>
          )}

          {/* PHOTOS */}
          {activeTab === 'photos' && (
            <View style={p.tabPane}>
              {photos.length === 0 && !hasCover ? (
                <View style={p.emptyTab}>
                  <MaterialIcons name="photo-library" size={36} color={Colors.textMuted} />
                  <Text style={p.emptyTabTitle}>No photos yet</Text>
                  <Text style={p.emptyTabSub}>The business has not uploaded any photos.</Text>
                </View>
              ) : (
                <View style={p.block}>
                  <Text style={p.blockTitle}>
                    {photos.length + (hasCover ? 1 : 0)} Photo{photos.length + (hasCover ? 1 : 0) !== 1 ? 's' : ''}
                  </Text>
                  <View style={p.photoGrid}>
                    {hasCover && profile.cover_url ? (
                      <PhotoItem
                        photo={{ id: 'cover', url: profile.cover_url, caption: 'Cover', business_id: profile.id, sort_order: -1, created_at: '' }}
                        size={110}
                        onPress={() => {}}
                      />
                    ) : null}
                    {photos.map((ph) => (
                      <PhotoItem key={ph.id} photo={ph} size={110} onPress={() => {}} />
                    ))}
                  </View>
                </View>
              )}
            </View>
          )}

          {/* REVIEWS */}
          {activeTab === 'reviews' && (
            <View style={p.tabPane}>
              <View style={p.emptyTab}>
                <MaterialIcons name="star-border" size={36} color={Colors.textMuted} />
                <Text style={p.emptyTabTitle}>Reviews coming soon</Text>
                <Text style={p.emptyTabSub}>
                  {profile.review_count > 0
                    ? `${profile.review_count} review${profile.review_count !== 1 ? 's' : ''} · Avg ${profile.avg_rating?.toFixed(1)}`
                    : 'Be the first to review this business.'}
                </Text>
              </View>
            </View>
          )}
        </View>

        <View style={{ height: Spacing.xxl * 2 }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const p = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  // Loading / not found
  loadingContainer: { flex: 1, backgroundColor: Colors.background },
  loadingHeader: {
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
  },
  loadingCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.xl,
  },
  loadingText: { fontSize: Typography.sm, color: Colors.textMuted },
  notFoundIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  notFoundTitle: { fontSize: Typography.lg, fontWeight: Typography.bold, color: Colors.textSecondary },
  notFoundSub: { fontSize: Typography.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 21 },
  goBackBtn: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    marginTop: Spacing.xs,
  },
  goBackText: { fontSize: Typography.sm, color: Colors.textSecondary, fontWeight: Typography.medium },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
    gap: Spacing.sm,
  },
  headerTitle: {
    flex: 1,
    fontSize: Typography.md,
    fontWeight: Typography.bold,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  headerActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },

  scroll: { flex: 1 },
  scrollContent: { paddingBottom: Spacing.xxl },

  // Cover
  coverWrap: { position: 'relative', width: '100%', height: 220 },
  cover: { width: '100%', height: 220 },
  coverPlaceholder: {
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoOverlay: {
    position: 'absolute',
    bottom: Spacing.md,
    left: Spacing.base,
    width: 56,
    height: 56,
    borderRadius: Radius.md,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: Colors.background,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 4 },
      android: { elevation: 4 },
    }),
  },
  logo: { width: 56, height: 56 },
  photoBadge: {
    position: 'absolute',
    bottom: Spacing.md,
    right: Spacing.base,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  photoBadgeText: { fontSize: 11, color: '#fff', fontWeight: Typography.semibold },

  // Info section
  infoSection: {
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    gap: Spacing.xs + 2,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flexWrap: 'wrap',
  },
  businessName: {
    fontSize: Typography.xl,
    fontWeight: Typography.black,
    color: Colors.textPrimary,
    flex: 1,
    lineHeight: 28,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.gold,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  verifiedText: { fontSize: 10, fontWeight: Typography.bold, color: Colors.textOnGold },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexWrap: 'nowrap',
  },
  catDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  catText: { fontSize: Typography.sm, fontWeight: Typography.semibold, flexShrink: 0 },
  metaSep: { color: Colors.textMuted, fontSize: Typography.sm },
  locationText: { fontSize: Typography.sm, color: Colors.textMuted, flex: 1 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusLabel: { fontSize: Typography.sm, fontWeight: Typography.bold },
  statusDetail: { fontSize: Typography.sm, color: Colors.textMuted },

  // Action row
  actionRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
    gap: 0,
    justifyContent: 'space-around',
  },

  // Tab strip
  tabStrip: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
    backgroundColor: Colors.surface,
  },
  tabStripContent: {
    paddingHorizontal: Spacing.base,
    gap: 0,
  },
  tab: {
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: Colors.gold },
  tabText: {
    fontSize: Typography.sm,
    color: Colors.textMuted,
    fontWeight: Typography.medium,
  },
  tabTextActive: { color: Colors.gold, fontWeight: Typography.bold },

  // Tab content
  tabContent: { backgroundColor: Colors.background },
  tabPane: { paddingBottom: Spacing.xl },

  block: {
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  blockTitle: {
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: Spacing.md,
  },
  aboutText: {
    fontSize: Typography.sm,
    color: Colors.textSecondary,
    lineHeight: 22,
  },

  // Service areas
  areaChips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  areaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
    borderRadius: Radius.full,
    backgroundColor: `${Colors.info}14`,
    borderWidth: 1,
    borderColor: `${Colors.info}30`,
  },
  areaChipText: { fontSize: 12, color: Colors.info, fontWeight: Typography.medium },

  // Photos
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },

  // Hours note
  hoursNote: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: -Spacing.xs,
    marginBottom: Spacing.sm,
    fontStyle: 'italic',
  },

  // Empty tabs
  emptyTab: {
    alignItems: 'center',
    paddingTop: Spacing.xxl,
    gap: Spacing.md,
    paddingHorizontal: Spacing.xl,
  },
  emptyTabTitle: {
    fontSize: Typography.md,
    fontWeight: Typography.bold,
    color: Colors.textSecondary,
  },
  emptyTabSub: {
    fontSize: Typography.sm,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 21,
  },
});
