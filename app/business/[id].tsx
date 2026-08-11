import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator,
  Linking, Alert, Platform, Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import { fetchBusinessById, trackBusinessEvent } from '../../services/businessService';
import { Business, BusinessLocation, getLocationHoursStatus, DAY_NAMES, DAY_LABELS } from '../../types/business';
import { useAuth } from '../../hooks/useAuth';
import { useEvents } from '../../hooks/useEvents';

const { width: SCREEN_W } = Dimensions.get('window');

// ─── Contact action button ───────────────────────────────────────────────────
function ContactBtn({ icon, label, color, onPress }: { icon: string; label: string; color: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [ctStyles.btn, pressed && { opacity: 0.8 }]}>
      <View style={[ctStyles.icon, { backgroundColor: `${color}22` }]}>
        <MaterialIcons name={icon as any} size={20} color={color} />
      </View>
      <Text style={ctStyles.label}>{label}</Text>
    </Pressable>
  );
}
const ctStyles = StyleSheet.create({
  btn: { alignItems: 'center', gap: 4, flex: 1 },
  icon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 10, color: Colors.textSecondary, textAlign: 'center', fontWeight: Typography.medium },
});

// ─── Hours display ────────────────────────────────────────────────────────────
function HoursSection({ location }: { location: BusinessLocation }) {
  const [expanded, setExpanded] = useState(false);
  const status = getLocationHoursStatus(location.openingHours);
  return (
    <View style={hoStyles.wrap}>
      <Pressable onPress={() => setExpanded((v) => !v)} style={hoStyles.header}>
        <View style={hoStyles.statusRow}>
          <View style={[hoStyles.dot, status.type === 'open' ? { backgroundColor: Colors.success } : { backgroundColor: Colors.error }]} />
          <Text style={[hoStyles.status, status.type === 'open' ? { color: Colors.success } : { color: Colors.error }]}>
            {status.type === 'open' ? `Open · Closes ${status.closesAt}` : status.type === 'closed' && status.opensAt ? `Closed · Opens ${status.opensAt}` : 'Closed'}
          </Text>
        </View>
        <MaterialIcons name={expanded ? 'expand-less' : 'expand-more'} size={20} color={Colors.textMuted} />
      </Pressable>
      {expanded && (
        <View style={hoStyles.table}>
          {DAY_NAMES.map((day) => {
            const h = location.openingHours?.[day];
            return (
              <View key={day} style={hoStyles.row}>
                <Text style={hoStyles.day}>{DAY_LABELS[day]}</Text>
                <Text style={h?.closed ? hoStyles.closed : hoStyles.time}>
                  {h?.closed ? 'Closed' : h ? `${h.open} – ${h.close}` : '—'}
                </Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}
const hoStyles = StyleSheet.create({
  wrap: { backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, overflow: 'hidden', marginBottom: Spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.md },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  status: { fontSize: Typography.base, fontWeight: Typography.semibold },
  table: { borderTopWidth: 1, borderTopColor: Colors.surfaceBorder, paddingHorizontal: Spacing.md, paddingBottom: Spacing.md },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  day: { fontSize: Typography.sm, color: Colors.textSecondary, width: 110 },
  time: { fontSize: Typography.sm, color: Colors.textPrimary },
  closed: { fontSize: Typography.sm, color: Colors.textMuted },
});

// ─── Location card ────────────────────────────────────────────────────────────
function LocationCard({ location, businessId, onDirections }: { location: BusinessLocation; businessId: string; onDirections: () => void }) {
  return (
    <View style={locStyles.card}>
      {location.branchName ? (
        <Text style={locStyles.branchName}>{location.branchName}</Text>
      ) : null}
      <View style={locStyles.row}>
        <MaterialIcons name="place" size={14} color={Colors.textMuted} />
        <Text style={locStyles.address}>{[location.address, location.city, location.parish].filter(Boolean).join(', ')}</Text>
      </View>
      <HoursSection location={location} />
      <View style={locStyles.actions}>
        {location.phone ? (
          <ContactBtn icon="phone" label="Call" color={Colors.success}
            onPress={() => { trackBusinessEvent({ businessId, eventType: 'phone_click', locationId: location.id }); Linking.openURL(`tel:${location.phone}`); }} />
        ) : null}
        {location.whatsapp ? (
          <ContactBtn icon="chat" label="WhatsApp" color="#25D366"
            onPress={() => { trackBusinessEvent({ businessId, eventType: 'whatsapp_click', locationId: location.id }); Linking.openURL(`https://wa.me/${location.whatsapp.replace(/\D/g, '')}`); }} />
        ) : null}
        {location.email ? (
          <ContactBtn icon="email" label="Email" color={Colors.info}
            onPress={() => { trackBusinessEvent({ businessId, eventType: 'email_click', locationId: location.id }); Linking.openURL(`mailto:${location.email}`); }} />
        ) : null}
        {(location.latitude && location.longitude) ? (
          <ContactBtn icon="directions" label="Directions" color={Colors.gold} onPress={onDirections} />
        ) : null}
      </View>
    </View>
  );
}
const locStyles = StyleSheet.create({
  card: { backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.surfaceBorder },
  branchName: { fontSize: Typography.md, fontWeight: Typography.semibold, color: Colors.textPrimary, marginBottom: Spacing.sm },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: Spacing.md },
  address: { flex: 1, fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 20 },
  actions: { flexDirection: 'row', paddingTop: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.surfaceBorder },
});

// ─── Social links ─────────────────────────────────────────────────────────────
function SocialRow({ business, trackClick }: { business: Business; trackClick: (col: string) => void }) {
  const items = [
    { key: 'instagram', icon: 'photo-camera', label: 'Instagram', url: business.instagram ? `https://instagram.com/${business.instagram.replace('@', '')}` : '' },
    { key: 'facebook', icon: 'facebook', label: 'Facebook', url: business.facebook ? `https://facebook.com/${business.facebook}` : '' },
    { key: 'tiktok', icon: 'music-video', label: 'TikTok', url: business.tiktok ? `https://tiktok.com/@${business.tiktok.replace('@', '')}` : '' },
  ].filter((i) => i.url);
  if (items.length === 0) return null;
  return (
    <View style={soStyles.row}>
      {items.map((i) => (
        <Pressable key={i.key} onPress={() => { trackClick('website_click'); Linking.openURL(i.url); }}
          style={({ pressed }) => [soStyles.btn, pressed && { opacity: 0.8 }]}>
          <MaterialIcons name={i.icon as any} size={20} color={Colors.textSecondary} />
          <Text style={soStyles.label}>{i.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}
const soStyles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.full, backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: Colors.surfaceBorder },
  label: { fontSize: Typography.sm, color: Colors.textSecondary },
});

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function BusinessDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { events } = useEvents();

  const [business, setBusiness] = useState<Business | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const tracked = useRef(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const result = await fetchBusinessById(id);
      if (result.error) setError(result.error);
      else setBusiness(result.data);
      setLoading(false);
    })();
  }, [id]);

  useEffect(() => {
    if (business && !tracked.current) {
      tracked.current = true;
      trackBusinessEvent({ businessId: business.id, eventType: 'profile_view' });
    }
  }, [business]);

  const businessEvent = events.find((e) => e.promoterId === business?.ownerId && e.status === 'live');

  const openDirections = (loc: BusinessLocation) => {
    if (!loc.latitude || !loc.longitude) return;
    const addr = encodeURIComponent([loc.address, loc.city, loc.parish].filter(Boolean).join(', '));
    const url = Platform.OS === 'ios'
      ? `maps://?q=${addr}&ll=${loc.latitude},${loc.longitude}`
      : `https://www.google.com/maps/dir/?api=1&destination=${loc.latitude},${loc.longitude}`;
    trackBusinessEvent({ businessId: business!.id, eventType: 'directions_click', locationId: loc.id });
    Linking.openURL(url);
  };

  if (loading) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={Colors.gold} size="large" />
      </View>
    );
  }
  if (error || !business) {
    return (
      <View style={[styles.root, styles.center, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <MaterialIcons name="error-outline" size={48} color={Colors.textMuted} />
        <Text style={styles.errorText}>{error ?? 'Business not found'}</Text>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const isOwner = user?.id === business.ownerId;
  const activeLocations = (business.locations ?? []).filter((l) => l.active);
  const activeServices = (business.services ?? []).filter((s) => s.active);
  const today = new Date().toISOString().slice(0, 10);
  const activePromos = (business.promotions ?? []).filter((p) => p.active && p.status === 'live' && (!p.endDate || p.endDate >= today));

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView showsVerticalScrollIndicator={false} bounces>
        {/* Cover */}
        <View style={styles.coverWrap}>
          <Image
            source={{ uri: business.coverUrl || 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=900&q=75' }}
            style={styles.cover}
            contentFit="cover"
            transition={300}
          />
          <LinearGradient colors={['transparent', Colors.background]} style={styles.coverGrad} />
          {/* Back button */}
          <Pressable onPress={() => router.back()} style={[styles.backCircle, { top: insets.top + 8 }]}>
            <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
          </Pressable>
          {isOwner && (
            <Pressable onPress={() => router.push('/business-dashboard' as any)} style={[styles.editCircle, { top: insets.top + 8 }]}>
              <MaterialIcons name="dashboard" size={18} color={Colors.gold} />
            </Pressable>
          )}
          {/* Logo */}
          <View style={styles.logoWrap}>
            {business.logoUrl ? (
              <Image source={{ uri: business.logoUrl }} style={styles.logo} contentFit="cover" />
            ) : (
              <View style={[styles.logo, styles.logoFallback]}>
                <MaterialIcons name="store" size={32} color={Colors.gold} />
              </View>
            )}
          </View>
        </View>

        <View style={styles.body}>
          {/* Name & badges */}
          <View style={styles.nameRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{business.name}</Text>
              <View style={styles.metaRow}>
                {business.category && (
                  <Text style={styles.catLabel}>{business.category.name}</Text>
                )}
                {business.priceRange ? <Text style={styles.price}>{business.priceRange}</Text> : null}
              </View>
            </View>
            <View style={styles.badges}>
              {business.verified && (
                <View style={styles.verifiedBadge}>
                  <MaterialIcons name="verified" size={14} color={Colors.info} />
                  <Text style={styles.verifiedText}>Verified</Text>
                </View>
              )}
              {business.featured && (
                <View style={styles.featuredBadge}>
                  <MaterialIcons name="star" size={12} color={Colors.textOnGold} />
                  <Text style={styles.featuredText}>Featured</Text>
                </View>
              )}
            </View>
          </View>

          {/* Global contact actions */}
          {(business.phone || business.whatsapp || business.email || business.website) && (
            <View style={styles.contactRow}>
              {business.phone && (
                <ContactBtn icon="phone" label="Call" color={Colors.success}
                  onPress={() => { trackBusinessEvent({ businessId: business.id, eventType: 'phone_click' }); Linking.openURL(`tel:${business.phone}`); }} />
              )}
              {business.whatsapp && (
                <ContactBtn icon="chat" label="WhatsApp" color="#25D366"
                  onPress={() => { trackBusinessEvent({ businessId: business.id, eventType: 'whatsapp_click' }); Linking.openURL(`https://wa.me/${business.whatsapp.replace(/\D/g, '')}`); }} />
              )}
              {business.email && (
                <ContactBtn icon="email" label="Email" color={Colors.info}
                  onPress={() => { trackBusinessEvent({ businessId: business.id, eventType: 'email_click' }); Linking.openURL(`mailto:${business.email}`); }} />
              )}
              {business.website && (
                <ContactBtn icon="language" label="Website" color={Colors.gold}
                  onPress={() => { trackBusinessEvent({ businessId: business.id, eventType: 'website_click' }); Linking.openURL(business.website.startsWith('http') ? business.website : `https://${business.website}`); }} />
              )}
            </View>
          )}

          {/* About */}
          {business.description ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>About</Text>
              <Text style={styles.description}>{business.description}</Text>
            </View>
          ) : null}

          {/* Active Promotion */}
          {activePromos.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Current Promotions</Text>
              {activePromos.map((promo) => (
                <Pressable key={promo.id} style={promoStyles.card}
                  onPress={() => trackBusinessEvent({ businessId: business.id, eventType: 'promotion_view', promotionId: promo.id })}>
                  {promo.imageUrl && (
                    <Image source={{ uri: promo.imageUrl }} style={promoStyles.img} contentFit="cover" />
                  )}
                  <View style={promoStyles.info}>
                    <Text style={promoStyles.title}>{promo.title}</Text>
                    {promo.description ? <Text style={promoStyles.desc}>{promo.description}</Text> : null}
                    {promo.promoCode && (
                      <View style={promoStyles.codeRow}>
                        <Text style={promoStyles.codeLabel}>Code: </Text>
                        <Text style={promoStyles.code}>{promo.promoCode}</Text>
                      </View>
                    )}
                    {promo.endDate && (
                      <Text style={promoStyles.expiry}>Expires {promo.endDate}</Text>
                    )}
                  </View>
                </Pressable>
              ))}
            </View>
          )}

          {/* Services */}
          {activeServices.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Services</Text>
              {activeServices.map((svc) => (
                <View key={svc.id} style={svcStyles.card}>
                  {svc.imageUrl && (
                    <Image source={{ uri: svc.imageUrl }} style={svcStyles.img} contentFit="cover" />
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={svcStyles.name}>{svc.name}</Text>
                    {svc.description ? <Text style={svcStyles.desc}>{svc.description}</Text> : null}
                    {svc.startingPrice && <Text style={svcStyles.price}>From {svc.startingPrice}</Text>}
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Gallery */}
          {business.galleryUrls.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Gallery</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={galStyles.row}>
                {business.galleryUrls.map((url, i) => (
                  <Image key={i} source={{ uri: url }} style={galStyles.img} contentFit="cover" transition={200} />
                ))}
              </ScrollView>
            </View>
          )}

          {/* Locations */}
          {activeLocations.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                {activeLocations.length === 1 ? 'Location' : `Locations (${activeLocations.length})`}
              </Text>
              {activeLocations.map((loc) => (
                <LocationCard key={loc.id} location={loc} businessId={business.id} onDirections={() => openDirections(loc)} />
              ))}
            </View>
          )}

          {/* Social */}
          {(business.instagram || business.facebook || business.tiktok) && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Social Media</Text>
              <SocialRow business={business} trackClick={(col) => trackBusinessEvent({ businessId: business.id, eventType: 'website_click' })} />
            </View>
          )}

          {/* Business event */}
          {businessEvent && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Upcoming Event</Text>
              <Pressable
                style={({ pressed }) => [evtStyles.card, pressed && { opacity: 0.85 }]}
                onPress={() => { trackBusinessEvent({ businessId: business.id, eventType: 'business_event_view' }); router.push(`/event/${businessEvent.id}` as any); }}
              >
                {businessEvent.coverImage ? (
                  <Image source={{ uri: businessEvent.coverImage }} style={evtStyles.img} contentFit="cover" />
                ) : null}
                <View style={evtStyles.info}>
                  <Text style={evtStyles.title} numberOfLines={2}>{businessEvent.title}</Text>
                  <Text style={evtStyles.meta}>{businessEvent.date} · {businessEvent.parish}</Text>
                  <Text style={evtStyles.price}>{businessEvent.ticketPrice}</Text>
                </View>
                <MaterialIcons name="chevron-right" size={20} color={Colors.gold} />
              </Pressable>
            </View>
          )}

          <View style={{ height: insets.bottom + 32 }} />
        </View>
      </ScrollView>
    </View>
  );
}

const promoStyles = StyleSheet.create({
  card: { backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, overflow: 'hidden', marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.surfaceBorder },
  img: { width: '100%', height: 140 },
  info: { padding: Spacing.md, gap: Spacing.xs },
  title: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textPrimary },
  desc: { fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 20 },
  codeRow: { flexDirection: 'row', alignItems: 'center' },
  codeLabel: { fontSize: Typography.sm, color: Colors.textMuted },
  code: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.gold, letterSpacing: 1 },
  expiry: { fontSize: 11, color: Colors.textMuted },
});

const svcStyles = StyleSheet.create({
  card: { flexDirection: 'row', gap: Spacing.md, alignItems: 'flex-start', paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder },
  img: { width: 64, height: 64, borderRadius: Radius.sm, flexShrink: 0 },
  name: { fontSize: Typography.base, fontWeight: Typography.semibold, color: Colors.textPrimary },
  desc: { fontSize: Typography.sm, color: Colors.textSecondary, marginTop: 2, lineHeight: 20 },
  price: { fontSize: Typography.sm, color: Colors.gold, marginTop: 4, fontWeight: Typography.medium },
});

const galStyles = StyleSheet.create({
  row: { gap: Spacing.sm, paddingBottom: Spacing.xs },
  img: { width: 140, height: 140, borderRadius: Radius.md },
});

const evtStyles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, overflow: 'hidden', borderWidth: 1, borderColor: Colors.surfaceBorder },
  img: { width: 80, height: 80, flexShrink: 0 },
  info: { flex: 1, paddingVertical: Spacing.sm, gap: 4 },
  title: { fontSize: Typography.base, fontWeight: Typography.semibold, color: Colors.textPrimary },
  meta: { fontSize: Typography.sm, color: Colors.textMuted },
  price: { fontSize: Typography.sm, color: Colors.gold, fontWeight: Typography.medium },
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  center: { alignItems: 'center', justifyContent: 'center' },
  coverWrap: { position: 'relative', height: 280 },
  cover: { width: '100%', height: 280 },
  coverGrad: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 120 },
  backCircle: { position: 'absolute', left: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  editCircle: { position: 'absolute', right: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  logoWrap: { position: 'absolute', bottom: -32, left: 20 },
  logo: { width: 80, height: 80, borderRadius: Radius.lg, borderWidth: 3, borderColor: Colors.background },
  logoFallback: { backgroundColor: Colors.goldSurface, alignItems: 'center', justifyContent: 'center' },
  body: { paddingTop: 48, paddingHorizontal: Spacing.base },
  nameRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  name: { fontSize: Typography.xl, fontWeight: Typography.black, color: Colors.textPrimary, lineHeight: 28 },
  metaRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: 4, flexWrap: 'wrap' },
  catLabel: { fontSize: Typography.sm, color: Colors.textMuted },
  price: { fontSize: Typography.sm, color: Colors.gold, fontWeight: Typography.semibold },
  badges: { gap: Spacing.xs, alignItems: 'flex-end' },
  verifiedBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(33,150,243,0.15)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full },
  verifiedText: { fontSize: 11, color: Colors.info, fontWeight: Typography.medium },
  featuredBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.gold, paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full },
  featuredText: { fontSize: 11, color: Colors.textOnGold, fontWeight: Typography.bold },
  contactRow: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: Spacing.lg, marginTop: Spacing.md, backgroundColor: Colors.surfaceElevated, borderRadius: Radius.lg, marginBottom: Spacing.md },
  section: { marginBottom: Spacing.lg },
  sectionTitle: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textPrimary, marginBottom: Spacing.md },
  description: { fontSize: Typography.base, color: Colors.textSecondary, lineHeight: 24 },
  errorText: { fontSize: Typography.base, color: Colors.textSecondary, textAlign: 'center', marginTop: Spacing.md },
  backBtn: { marginTop: Spacing.lg, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, backgroundColor: Colors.surfaceElevated, borderRadius: Radius.lg },
  backBtnText: { color: Colors.gold, fontWeight: Typography.semibold },
});
