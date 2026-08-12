import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  Linking,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { useEvents } from '../../hooks/useEvents';
import { useNotifications } from '../../hooks/useNotifications';
import { Colors, Typography, Spacing, Radius, Shadows } from '../../constants/theme';
import { MOCK_PROMOTER_SOCIALS, formatDate, formatCount, TYPE_COLORS, EVENT_TYPES, Event } from '../../constants/data';
import { supabase } from '../../lib/supabase';
import { getThumbUrl } from '../../lib/storage';
import { EventCard } from '../../components/feature/EventCard';

// Use component-based date parsing to avoid UTC midnight shift (Jamaica = UTC-5).
function isUpcoming(dateStr: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d) >= today;
}

// ─── Social Link Button ────────────────────────────────────────────────────────
function SocialBtn({ icon, label, value, url }: { icon: string; label: string; value: string; url: string }) {
  return (
    <Pressable
      onPress={() => Linking.openURL(url).catch(() => {})}
      style={({ pressed }) => [socialStyles.btn, pressed && { opacity: 0.75 }]}
    >
      <MaterialIcons name={icon as any} size={16} color={Colors.gold} />
      <Text style={socialStyles.label} numberOfLines={1}>{value}</Text>
      <MaterialIcons name="open-in-new" size={11} color={Colors.textMuted} />
    </Pressable>
  );
}

const socialStyles = StyleSheet.create({
  btn: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  label: { flex: 1, fontSize: Typography.sm, color: Colors.textSecondary, fontWeight: Typography.medium },
});

// ─── Event Mini Card (compact for promoter listing) ────────────────────────────
function EventMiniCard({ event, onPress }: { event: Event; onPress: () => void }) {
  const typeColor = TYPE_COLORS[event.type] ?? Colors.gold;
  const isFree = event.ticketPrice === 'Free' || event.ticketPrice === 'Free Entry';
  const past = !isUpcoming(event.date);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [miniStyles.card, past && miniStyles.pastCard, pressed && { opacity: 0.85 }]}
    >
      <View style={miniStyles.imgWrap}>
        <Image source={{ uri: getThumbUrl(event.coverImage) }} style={miniStyles.img} contentFit="cover" transition={150} cachePolicy="memory-disk" recyclingKey={event.id} priority="normal" />
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.6)']} style={StyleSheet.absoluteFillObject} />
        <View style={[miniStyles.typeDot, { backgroundColor: typeColor }]} />
        {past && (
          <View style={miniStyles.pastOverlay}>
            <Text style={miniStyles.pastText}>Passed</Text>
          </View>
        )}
      </View>
      <View style={miniStyles.info}>
        <Text style={miniStyles.title} numberOfLines={2}>{event.title}</Text>
        <View style={miniStyles.metaRow}>
          <MaterialIcons name="event" size={11} color={Colors.gold} />
          <Text style={miniStyles.meta}>{formatDate(event.date)}</Text>
        </View>
        <View style={miniStyles.metaRow}>
          <MaterialIcons name="place" size={11} color={Colors.textMuted} />
          <Text style={miniStyles.meta} numberOfLines={1}>{event.venue}</Text>
        </View>
        <View style={miniStyles.bottomRow}>
          <Text style={[miniStyles.price, isFree && miniStyles.priceFree]}>
            {isFree ? 'Free' : event.ticketPrice}
          </Text>
          <View style={miniStyles.heatRow}>
            <MaterialIcons name="people" size={10} color={Colors.textMuted} />
            <Text style={miniStyles.heatText}>{formatCount(event.goingCount + event.interestedCount)}</Text>
          </View>
        </View>
      </View>
      <MaterialIcons name="arrow-forward-ios" size={12} color={Colors.textMuted} style={{ padding: Spacing.md }} />
    </Pressable>
  );
}

const miniStyles = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
    overflow: 'hidden', marginBottom: Spacing.sm,
  },
  pastCard: { opacity: 0.65 },
  imgWrap: { width: 80, height: 80, position: 'relative', flexShrink: 0 },
  img: { width: '100%', height: '100%' },
  typeDot: { position: 'absolute', top: 6, left: 6, width: 9, height: 9, borderRadius: 5, borderWidth: 1.5, borderColor: '#fff' },
  pastOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.6)', paddingVertical: 3, alignItems: 'center',
  },
  pastText: { fontSize: 9, color: Colors.textMuted, fontWeight: Typography.bold },
  info: { flex: 1, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, gap: 3 },
  title: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textPrimary, lineHeight: 17 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  meta: { fontSize: 11, color: Colors.textMuted, flex: 1 },
  bottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 1 },
  price: { fontSize: 11, fontWeight: Typography.bold, color: Colors.gold },
  priceFree: { color: Colors.greenLight },
  heatRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  heatText: { fontSize: 10, color: Colors.textMuted },
});

// ─── Main Promoter Profile Screen ─────────────────────────────────────────────
export default function PromoterProfileScreen() {
  const { id: promoterId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, toggleFollow, isFollowing } = useAuth();
  const { events, getPromoterEvents } = useEvents();
  const { addNotification } = useNotifications();

  const [activeTab, setActiveTab] = useState<'upcoming' | 'past'>('upcoming');
  const [followLoading, setFollowLoading] = useState(false);
  const [followerCount, setFollowerCount] = useState<number | null>(null);
  const [promoterAvatarUrl, setPromoterAvatarUrl] = useState<string | null>(null);

  const promoterEvents = useMemo(
    () => getPromoterEvents(promoterId ?? ''),
    [events, promoterId, getPromoterEvents]
  );

  const upcomingEvents = useMemo(
    () => promoterEvents.filter((e) => isUpcoming(e.date)),
    [promoterEvents]
  );

  const pastEvents = useMemo(
    () => promoterEvents.filter((e) => !isUpcoming(e.date)),
    [promoterEvents]
  );

  const promoInfo = MOCK_PROMOTER_SOCIALS[promoterId ?? ''];

  // Load real follower count + promoter avatar from Supabase
  useEffect(() => {
    if (!promoterId) return;
    // Follower count
    supabase
      .from('follows')
      .select('id', { count: 'exact', head: true })
      .eq('promoter_id', promoterId)
      .then(({ count }) => {
        if (typeof count === 'number') setFollowerCount(count);
      }, () => {});
    // Promoter avatar — public read policy on user_profiles allows this
    supabase
      .from('user_profiles')
      .select('avatar_url')
      .eq('id', promoterId)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.avatar_url) setPromoterAvatarUrl(data.avatar_url as string);
      }, () => {});
  }, [promoterId]);

  const displayedFollowers = followerCount ?? promoInfo?.followerCount ?? 0;

  // Get promoter name from events
  const promoterName = promoterEvents[0]?.promoterName ?? 'Promoter';
  const avatarLetter = promoterName[0]?.toUpperCase() ?? 'P';
  // Derive verified status from the promoter's events (promoter_tier is denormalized
  // onto every event row by the Stripe webhook, so no extra DB query is needed).
  const promoterTier = promoterEvents[0]?.promoterTier ?? 'free';
  const isVerifiedPromoter = promoterTier === 'pro' || promoterTier === 'elite';
  const bio = promoInfo?.bio ?? 'Event organizer on Vybz Hub.';
  const socials = promoInfo?.socialLinks ?? {};
  const following = isFollowing(promoterId ?? '');
  const isOwnProfile = !!user && user.id === promoterId;

  const handleFollow = async () => {
    if (!user) {
      Alert.alert('Sign In Required', 'Please sign in to follow promoters.');
      return;
    }
    setFollowLoading(true);
    const { isNowFollowing } = await toggleFollow(promoterId ?? '');
    setFollowLoading(false);

    if (isNowFollowing) {
      addNotification({
        type: 'new_follower',
        title: `Now following ${promoterName}`,
        body: `You will be notified when ${promoterName} posts new events.`,
        promoterId: promoterId,
      });
      // ── new_event_promoter producer ──────────────────────────────────────
      // Fire one notification per upcoming event from this promoter (max 3)
      upcomingEvents.slice(0, 3).forEach((event) => {
        addNotification({
          type: 'new_event_promoter',
          title: `${promoterName} has an upcoming event`,
          body: `"${event.title}" — ${formatDate(event.date)} at ${event.venue}`,
          eventId: event.id,
          promoterId: promoterId,
        });
      });
    }
  };

  if (!promoterId) {
    return (
      <View style={styles.notFound}>
        <SafeAreaView edges={['top']} />
        <View style={styles.notFoundIcon}>
          <MaterialIcons name="person-off" size={40} color={Colors.textMuted} />
        </View>
        <Text style={styles.notFoundTitle}>Promoter Not Found</Text>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        <View style={styles.topBar}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backIconBtn, pressed && { opacity: 0.7 }]}
          >
            <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
          </Pressable>
          <Text style={styles.topBarTitle} numberOfLines={1}>{promoterName}</Text>
          <View style={{ width: 40 }} />
        </View>
      </SafeAreaView>

      <ScrollView showsVerticalScrollIndicator={false}>

        {/* ── Hero / Cover ── */}
        <View style={styles.heroBg}>
          {promoterEvents.length > 0 ? (
            <Image
              source={{ uri: promoterEvents[0].coverImage }}
              style={styles.heroCoverImg}
              contentFit="cover"
              transition={300}
            />
          ) : (
            <LinearGradient
              colors={[Colors.goldSurface, Colors.background]}
              style={styles.heroCoverImg}
            />
          )}
          <LinearGradient
            colors={[Colors.background + '00', Colors.background + 'DD', Colors.background]}
            style={styles.heroGradient}
          />
        </View>

        {/* ── Profile Header ── */}
        <View style={styles.profileSection}>
          {/* Avatar — shows real profile photo if available */}
          <View style={styles.avatarWrap}>
            {promoterAvatarUrl ? (
              <Image
                source={{ uri: promoterAvatarUrl }}
                style={StyleSheet.absoluteFillObject}
                contentFit="cover"
                transition={200}
              />
            ) : (
              <>
                <LinearGradient
                  colors={[Colors.gold, Colors.goldDim]}
                  style={styles.avatarGradient}
                />
                <Text style={styles.avatarLetter}>{avatarLetter}</Text>
              </>
            )}
            {isVerifiedPromoter && (
              <View style={styles.verifiedBadge}>
                <MaterialIcons name="verified" size={16} color={Colors.gold} />
              </View>
            )}
          </View>

          {/* Name + badges */}
          <View style={styles.nameBlock}>
            <View style={styles.nameRow}>
              <Text style={styles.promoterName}>{promoterName}</Text>
              {isVerifiedPromoter && (
                <View style={styles.verifiedTag}>
                  <MaterialIcons name="verified" size={11} color={Colors.gold} />
                  <Text style={styles.verifiedTagText}>Verified Promoter</Text>
                </View>
              )}
            </View>
            <View style={styles.roleTag}>
              <MaterialIcons name="campaign" size={12} color={Colors.textMuted} />
              <Text style={styles.roleTagText}>Event Promoter</Text>
            </View>
          </View>

          {/* Follow button — hidden when viewing own profile */}
          {!isOwnProfile && <Pressable
            onPress={handleFollow}
            disabled={followLoading}
            style={({ pressed }) => [
              styles.followBtn,
              following && styles.followBtnActive,
              pressed && { opacity: 0.85 },
            ]}
          >
            {following ? (
              <LinearGradient
                colors={[Colors.green, Colors.greenLight]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={StyleSheet.absoluteFillObject}
              />
            ) : (
              <LinearGradient
                colors={[Colors.gold, Colors.goldDim]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={StyleSheet.absoluteFillObject}
              />
            )}
            <MaterialIcons
              name={following ? 'check' : 'person-add'}
              size={15}
              color={following ? '#fff' : Colors.textOnGold}
            />
            <Text style={styles.followBtnText}>
              {followLoading ? '...' : following ? 'Following' : 'Follow'}
            </Text>
          </Pressable>}
        </View>

        {/* ── Stats Row ── */}
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statNum}>{promoterEvents.length}</Text>
            <Text style={styles.statLabel}>Events</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statNum}>{formatCount(upcomingEvents.length)}</Text>
            <Text style={styles.statLabel}>Upcoming</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statNum}>{formatCount(displayedFollowers)}</Text>
            <Text style={styles.statLabel}>Followers</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statNum}>
              {formatCount(promoterEvents.reduce((s, e) => s + e.goingCount + e.interestedCount, 0))}
            </Text>
            <Text style={styles.statLabel}>Total Hype</Text>
          </View>
        </View>

        {/* ── Bio ── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.goldBar} />
            <Text style={styles.sectionTitle}>About</Text>
          </View>
          <Text style={styles.bio}>{bio}</Text>
        </View>

        {/* ── Social Links ── */}
        {Object.keys(socials).length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.goldBar} />
              <Text style={styles.sectionTitle}>Connect</Text>
            </View>
            <View style={styles.socialsGrid}>
              {socials.instagram && (
                <SocialBtn
                  icon="photo-camera"
                  label="Instagram"
                  value={`@${socials.instagram}`}
                  url={`https://instagram.com/${socials.instagram}`}
                />
              )}
              {socials.facebook && (
                <SocialBtn
                  icon="people"
                  label="Facebook"
                  value={socials.facebook}
                  url={`https://facebook.com/${socials.facebook}`}
                />
              )}
              {socials.twitter && (
                <SocialBtn
                  icon="chat"
                  label="Twitter / X"
                  value={`@${socials.twitter}`}
                  url={`https://twitter.com/${socials.twitter}`}
                />
              )}
              {socials.tiktok && (
                <SocialBtn
                  icon="music-note"
                  label="TikTok"
                  value={`@${socials.tiktok}`}
                  url={`https://tiktok.com/@${socials.tiktok}`}
                />
              )}
              {socials.website && (
                <SocialBtn
                  icon="language"
                  label="Website"
                  value={socials.website.replace('https://', '')}
                  url={socials.website}
                />
              )}
            </View>
          </View>
        )}

        {/* ── Events ── */}
        <View style={styles.section}>
          <View style={[styles.sectionHeader, { marginBottom: 0 }]}>
            <View style={styles.goldBar} />
            <Text style={styles.sectionTitle}>Events</Text>
          </View>

          {/* Tab strip */}
          <View style={styles.tabStrip}>
            <Pressable
              onPress={() => setActiveTab('upcoming')}
              style={[styles.tabBtn, activeTab === 'upcoming' && styles.tabBtnActive]}
            >
              <MaterialIcons
                name="upcoming"
                size={14}
                color={activeTab === 'upcoming' ? Colors.textOnGold : Colors.textMuted}
              />
              <Text style={[styles.tabBtnText, activeTab === 'upcoming' && styles.tabBtnTextActive]}>
                Upcoming ({upcomingEvents.length})
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setActiveTab('past')}
              style={[styles.tabBtn, activeTab === 'past' && styles.tabBtnActive]}
            >
              <MaterialIcons
                name="history"
                size={14}
                color={activeTab === 'past' ? Colors.textOnGold : Colors.textMuted}
              />
              <Text style={[styles.tabBtnText, activeTab === 'past' && styles.tabBtnTextActive]}>
                Past ({pastEvents.length})
              </Text>
            </Pressable>
          </View>

          {/* Event list */}
          <View style={{ marginTop: Spacing.md }}>
            {activeTab === 'upcoming' ? (
              upcomingEvents.length > 0 ? (
                upcomingEvents.map((event) => (
                  <EventMiniCard
                    key={event.id}
                    event={event}
                    onPress={() => router.push(`/event/${event.id}` as any)}
                  />
                ))
              ) : (
                <View style={styles.emptyEvents}>
                  <MaterialIcons name="event-busy" size={32} color={Colors.textMuted} />
                  <Text style={styles.emptyEventsText}>No upcoming events right now.</Text>
                  <Text style={styles.emptyEventsSub}>Follow to get notified of new listings!</Text>
                </View>
              )
            ) : (
              pastEvents.length > 0 ? (
                pastEvents.map((event) => (
                  <EventMiniCard
                    key={event.id}
                    event={event}
                    onPress={() => router.push(`/event/${event.id}` as any)}
                  />
                ))
              ) : (
                <View style={styles.emptyEvents}>
                  <MaterialIcons name="history" size={32} color={Colors.textMuted} />
                  <Text style={styles.emptyEventsText}>No past events found.</Text>
                </View>
              )
            )}
          </View>
        </View>

        <View style={{ height: Math.max(Spacing.xxl * 2, insets.bottom + Spacing.xxl) }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  // Not found
  notFound: {
    flex: 1, backgroundColor: Colors.background,
    alignItems: 'center', justifyContent: 'center', gap: Spacing.md,
  },
  notFoundIcon: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  notFoundTitle: { fontSize: Typography.lg, fontWeight: Typography.bold, color: Colors.textSecondary },
  backBtn: {
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radius.full,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  backBtnText: { fontSize: Typography.base, color: Colors.gold, fontWeight: Typography.semibold },

  // Top bar
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
  },
  topBarTitle: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textPrimary, flex: 1, textAlign: 'center' },
  backIconBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },

  // Hero
  heroBg: { height: 160, position: 'relative' },
  heroCoverImg: { width: '100%', height: '100%' },
  heroGradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 120 },

  // Profile section
  profileSection: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingHorizontal: Spacing.base, marginTop: -40, paddingBottom: Spacing.md,
  },
  avatarWrap: {
    width: 72, height: 72, borderRadius: 36,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: Colors.background,
    overflow: 'hidden', position: 'relative',
  },
  avatarGradient: { ...StyleSheet.absoluteFillObject },
  avatarLetter: { fontSize: 28, fontWeight: Typography.black, color: Colors.textOnGold, zIndex: 1 },
  verifiedBadge: {
    position: 'absolute', bottom: -2, right: -2,
    backgroundColor: Colors.background, borderRadius: 10, padding: 1,
  },
  nameBlock: { flex: 1, gap: Spacing.xs },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
  promoterName: { fontSize: Typography.lg, fontWeight: Typography.black, color: Colors.textPrimary },
  verifiedTag: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: Colors.goldSurface, paddingHorizontal: Spacing.sm, paddingVertical: 2,
    borderRadius: Radius.full, borderWidth: 1, borderColor: `${Colors.gold}44`,
  },
  verifiedTagText: { fontSize: Typography.xs, color: Colors.gold, fontWeight: Typography.semibold },
  roleTag: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    alignSelf: 'flex-start',
  },
  roleTagText: { fontSize: Typography.xs, color: Colors.textMuted },

  // Follow button
  followBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderRadius: Radius.full, overflow: 'hidden',
    minWidth: 90, justifyContent: 'center',
    borderWidth: 1.5, borderColor: 'transparent',
  },
  followBtnActive: {},
  followBtnText: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textOnGold },

  // Stats
  statsRow: {
    flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1,
    borderColor: Colors.surfaceBorder,
    marginHorizontal: Spacing.base,
    borderRadius: Radius.lg, overflow: 'hidden',
    backgroundColor: Colors.surface,
    marginBottom: Spacing.md,
  },
  stat: { flex: 1, alignItems: 'center', paddingVertical: Spacing.md, gap: 2 },
  statNum: { fontSize: Typography.md, fontWeight: Typography.black, color: Colors.textPrimary },
  statLabel: { fontSize: 9, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.3 },
  statDivider: { width: 1, backgroundColor: Colors.surfaceBorder },

  // Sections
  section: { paddingHorizontal: Spacing.base, marginBottom: Spacing.lg },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.md,
  },
  goldBar: { width: 3, height: 18, borderRadius: 2, backgroundColor: Colors.gold },
  sectionTitle: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textPrimary },

  bio: { fontSize: Typography.base, color: Colors.textSecondary, lineHeight: 24 },

  // Socials
  socialsGrid: { gap: Spacing.sm },

  // Tab strip
  tabStrip: {
    flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md,
  },
  tabBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    paddingVertical: Spacing.sm, borderRadius: Radius.full,
    backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.surfaceBorder,
    overflow: 'hidden',
  },
  tabBtnActive: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  tabBtnText: { fontSize: Typography.xs, color: Colors.textMuted, fontWeight: Typography.medium },
  tabBtnTextActive: { color: Colors.textOnGold, fontWeight: Typography.bold },

  // Empty events
  emptyEvents: {
    alignItems: 'center', paddingVertical: Spacing.xxl, gap: Spacing.sm,
  },
  emptyEventsText: { fontSize: Typography.base, color: Colors.textSecondary, fontWeight: Typography.medium },
  emptyEventsSub: { fontSize: Typography.sm, color: Colors.textMuted, textAlign: 'center' },
});
