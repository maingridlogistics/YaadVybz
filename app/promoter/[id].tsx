// ─── Promoter / Creator Profile Page ─────────────────────────────────────────
// Public-facing creator profile for Pro and Elite creators.
// Shows: avatar, name, tier badge, custom Elite banner, stats, bio, events.
// Privacy: avatar via get_public_promoter_profiles RPC (public-safe fields only).
// Custom Creator Banner: Elite-only feature. Stored at profile-images/{userId}/banner.*

import React, { useState, useMemo, useEffect } from 'react';
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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { useEvents } from '../../hooks/useEvents';
import { useNotifications } from '../../hooks/useNotifications';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import { formatDate, formatCount, TYPE_COLORS, Event, SocialLinks } from '../../constants/data';
import { getSupabaseClient } from '../../lib/supabase';
import { getThumbUrl } from '../../lib/storage';

// ─── Date helpers ─────────────────────────────────────────────────────────────
function isUpcoming(dateStr: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d) >= today;
}

// ─── Social Link Button ───────────────────────────────────────────────────────
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

// ─── Event Mini Card ──────────────────────────────────────────────────────────
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
  pastOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.6)', paddingVertical: 3, alignItems: 'center' },
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

// ─── Public Promoter Profile Data ────────────────────────────────────────────
interface PublicProfile {
  avatar_url: string | null;
  banner_url: string | null;
  subscription_tier: string | null;
  name: string | null;
}

// ─── Main Creator Profile Screen ─────────────────────────────────────────────
export default function PromoterProfileScreen() {
  const { id: promoterId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, toggleFollow, isFollowing } = useAuth();
  const { getPromoterEvents } = useEvents();
  const { addNotification } = useNotifications();

  const [activeTab, setActiveTab] = useState<'upcoming' | 'past'>('upcoming');
  const [followLoading, setFollowLoading] = useState(false);
  const [followerCount, setFollowerCount] = useState<number | null>(null);
  const [publicProfile, setPublicProfile] = useState<PublicProfile | null>(null);

  const promoterEvents = useMemo(
    () => getPromoterEvents(promoterId ?? ''),
    [promoterId, getPromoterEvents]
  );

  const upcomingEvents = useMemo(
    () => promoterEvents.filter((e) => isUpcoming(e.date)),
    [promoterEvents]
  );

  const pastEvents = useMemo(
    () => promoterEvents.filter((e) => !isUpcoming(e.date)),
    [promoterEvents]
  );

  // Load real follower count + public profile (avatar, banner, tier)
  useEffect(() => {
    if (!promoterId) return;
    const supabase = getSupabaseClient();

    // Follower count
    supabase
      .from('follows')
      .select('id', { count: 'exact', head: true })
      .eq('promoter_id', promoterId)
      .then(({ count }) => {
        if (typeof count === 'number') setFollowerCount(count);
      }, () => {});

    // Public profile via RPC — returns only public-safe fields including banner_url
    supabase
      .rpc('get_public_promoter_profiles', { p_promoter_ids: [promoterId] })
      .then(({ data }) => {
        const profile = Array.isArray(data) && data.length > 0 ? data[0] : null;
        if (profile) {
          setPublicProfile({
            avatar_url: profile.avatar_url ?? null,
            banner_url: profile.banner_url ?? null,
            subscription_tier: profile.subscription_tier ?? null,
            name: profile.name ?? null,
          });
        }
      }, () => {});
  }, [promoterId]);

  const displayedFollowers = followerCount ?? 0;
  const promoterName = publicProfile?.name ?? promoterEvents[0]?.promoterName ?? 'Creator';
  const avatarLetter = promoterName[0]?.toUpperCase() ?? 'C';

  // Live tier from public profile (more current than denormalized event field)
  const liveTier = publicProfile?.subscription_tier ?? promoterEvents[0]?.promoterTier ?? 'free';
  const isPro = liveTier === 'pro';
  const isElite = liveTier === 'elite';
  const isPaid = isPro || isElite;

  // Custom Creator Banner: Elite-only feature
  const bannerUrl = isElite ? (publicProfile?.banner_url ?? null) : null;

  const bio = 'Event organizer on Vybz Hub.';
  const socials: SocialLinks = {};
  const following = isFollowing(promoterId ?? '');
  const isOwnProfile = !!user && user.id === promoterId;

  const handleFollow = async () => {
    if (!user) {
      Alert.alert('Sign In Required', 'Please sign in to follow creators.');
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
        <Text style={styles.notFoundTitle}>Creator Not Found</Text>
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

        {/* ── Elite Custom Creator Banner or fallback hero ── */}
        <View style={styles.heroBg}>
          {bannerUrl ? (
            // Elite Custom Creator Banner — full-width branded header
            <Image
              source={{ uri: bannerUrl }}
              style={styles.heroCoverImg}
              contentFit="cover"
              transition={300}
            />
          ) : promoterEvents.length > 0 ? (
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
          {/* Elite banner label */}
          {bannerUrl && isElite && (
            <View style={styles.eliteBannerLabel}>
              <MaterialIcons name="star" size={10} color={Colors.gold} />
              <Text style={styles.eliteBannerLabelText}>Elite Creator</Text>
            </View>
          )}
        </View>

        {/* ── Profile Header ── */}
        <View style={styles.profileSection}>
          <View style={styles.avatarWrap}>
            {publicProfile?.avatar_url ? (
              <Image
                source={{ uri: publicProfile.avatar_url }}
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
            {isPaid && (
              <View style={styles.tierBadge}>
                <MaterialIcons name={isElite ? 'star' : 'verified'} size={14} color={isElite ? '#E91E63' : Colors.gold} />
              </View>
            )}
          </View>

          <View style={styles.nameBlock}>
            <View style={styles.nameRow}>
              <Text style={styles.promoterName}>{promoterName}</Text>
              {isElite && (
                <View style={[styles.tierTag, { backgroundColor: 'rgba(233,30,99,0.12)', borderColor: 'rgba(233,30,99,0.3)' }]}>
                  <MaterialIcons name="star" size={10} color="#E91E63" />
                  <Text style={[styles.tierTagText, { color: '#E91E63' }]}>Elite</Text>
                </View>
              )}
              {isPro && !isElite && (
                <View style={[styles.tierTag, { backgroundColor: Colors.goldSurface, borderColor: `${Colors.gold}44` }]}>
                  <MaterialIcons name="verified" size={10} color={Colors.gold} />
                  <Text style={[styles.tierTagText, { color: Colors.gold }]}>Pro</Text>
                </View>
              )}
            </View>
            <View style={styles.roleTag}>
              <MaterialIcons name="campaign" size={12} color={Colors.textMuted} />
              <Text style={styles.roleTagText}>Event Creator</Text>
            </View>
          </View>

          {!isOwnProfile && (
            <Pressable
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
            </Pressable>
          )}
          {isOwnProfile && isElite && (
            <Pressable
              onPress={() => router.push('/creator-analytics' as any)}
              style={({ pressed }) => [styles.ownProfileBtn, pressed && { opacity: 0.8 }]}
            >
              <MaterialIcons name="bar-chart" size={14} color={Colors.gold} />
              <Text style={styles.ownProfileBtnText}>Analytics</Text>
            </Pressable>
          )}
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
              {(socials as any).instagram && (
                <SocialBtn icon="photo-camera" label="Instagram" value={`@${(socials as any).instagram}`} url={`https://instagram.com/${(socials as any).instagram}`} />
              )}
              {(socials as any).facebook && (
                <SocialBtn icon="people" label="Facebook" value={(socials as any).facebook} url={`https://facebook.com/${(socials as any).facebook}`} />
              )}
              {(socials as any).twitter && (
                <SocialBtn icon="chat" label="Twitter / X" value={`@${(socials as any).twitter}`} url={`https://twitter.com/${(socials as any).twitter}`} />
              )}
              {(socials as any).website && (
                <SocialBtn icon="language" label="Website" value={(socials as any).website.replace('https://', '')} url={(socials as any).website} />
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

          <View style={styles.tabStrip}>
            <Pressable
              onPress={() => setActiveTab('upcoming')}
              style={[styles.tabBtn, activeTab === 'upcoming' && styles.tabBtnActive]}
            >
              <MaterialIcons name="upcoming" size={14} color={activeTab === 'upcoming' ? Colors.textOnGold : Colors.textMuted} />
              <Text style={[styles.tabBtnText, activeTab === 'upcoming' && styles.tabBtnTextActive]}>
                Upcoming ({upcomingEvents.length})
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setActiveTab('past')}
              style={[styles.tabBtn, activeTab === 'past' && styles.tabBtnActive]}
            >
              <MaterialIcons name="history" size={14} color={activeTab === 'past' ? Colors.textOnGold : Colors.textMuted} />
              <Text style={[styles.tabBtnText, activeTab === 'past' && styles.tabBtnTextActive]}>
                Past ({pastEvents.length})
              </Text>
            </Pressable>
          </View>

          <View style={{ marginTop: Spacing.md }}>
            {activeTab === 'upcoming' ? (
              upcomingEvents.length > 0 ? (
                upcomingEvents.map((event) => (
                  <EventMiniCard key={event.id} event={event} onPress={() => router.push(`/event/${event.id}` as any)} />
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
                  <EventMiniCard key={event.id} event={event} onPress={() => router.push(`/event/${event.id}` as any)} />
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  notFound: { flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
  notFoundIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.surfaceBorder },
  notFoundTitle: { fontSize: Typography.lg, fontWeight: Typography.bold, color: Colors.textSecondary },
  backBtn: { paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, backgroundColor: Colors.surface, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.surfaceBorder },
  backBtnText: { fontSize: Typography.base, color: Colors.gold, fontWeight: Typography.semibold },

  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.base, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder },
  topBarTitle: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textPrimary, flex: 1, textAlign: 'center' },
  backIconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.surfaceBorder },

  // Hero — taller to accommodate Elite banner
  heroBg: { height: 180, position: 'relative' },
  heroCoverImg: { width: '100%', height: '100%' },
  heroGradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 120 },
  eliteBannerLabel: {
    position: 'absolute', top: 10, right: 12,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: Spacing.sm, paddingVertical: 4,
    borderRadius: Radius.full, borderWidth: 1, borderColor: `${Colors.gold}44`,
  },
  eliteBannerLabelText: { fontSize: 10, color: Colors.gold, fontWeight: Typography.bold, letterSpacing: 0.5 },

  profileSection: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.base, marginTop: -48, paddingBottom: Spacing.md },
  avatarWrap: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: Colors.background, overflow: 'hidden', position: 'relative' },
  avatarGradient: { ...StyleSheet.absoluteFillObject },
  avatarLetter: { fontSize: 32, fontWeight: Typography.black, color: Colors.textOnGold, zIndex: 1 },
  tierBadge: { position: 'absolute', bottom: -2, right: -2, backgroundColor: Colors.background, borderRadius: 10, padding: 1 },

  nameBlock: { flex: 1, gap: Spacing.xs },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
  promoterName: { fontSize: Typography.lg, fontWeight: Typography.black, color: Colors.textPrimary },
  tierTag: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: Radius.full, borderWidth: 1 },
  tierTagText: { fontSize: Typography.xs, fontWeight: Typography.semibold },
  roleTag: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
  roleTagText: { fontSize: Typography.xs, color: Colors.textMuted },

  followBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.full, overflow: 'hidden', minWidth: 90, justifyContent: 'center', borderWidth: 1.5, borderColor: 'transparent' },
  followBtnActive: {},
  followBtnText: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textOnGold },

  ownProfileBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.full, backgroundColor: Colors.goldSurface, borderWidth: 1, borderColor: `${Colors.gold}44` },
  ownProfileBtnText: { fontSize: Typography.sm, color: Colors.gold, fontWeight: Typography.semibold },

  statsRow: { flexDirection: 'row', marginHorizontal: Spacing.base, borderRadius: Radius.lg, overflow: 'hidden', backgroundColor: Colors.surface, marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.surfaceBorder },
  stat: { flex: 1, alignItems: 'center', paddingVertical: Spacing.base, gap: 3 },
  statNum: { fontSize: Typography.md, fontWeight: Typography.black, color: Colors.textPrimary },
  statLabel: { fontSize: 9, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 },
  statDivider: { width: 1, backgroundColor: Colors.surfaceBorder },

  section: { paddingHorizontal: Spacing.base, marginBottom: Spacing.lg },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.md },
  goldBar: { width: 3, height: 18, borderRadius: 2, backgroundColor: Colors.gold },
  sectionTitle: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textPrimary },
  bio: { fontSize: Typography.base, color: Colors.textSecondary, lineHeight: 24 },
  socialsGrid: { gap: Spacing.sm },

  tabStrip: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: Spacing.sm, borderRadius: Radius.full, backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.surfaceBorder, overflow: 'hidden' },
  tabBtnActive: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  tabBtnText: { fontSize: Typography.xs, color: Colors.textMuted, fontWeight: Typography.medium },
  tabBtnTextActive: { color: Colors.textOnGold, fontWeight: Typography.bold },

  emptyEvents: { alignItems: 'center', paddingVertical: Spacing.xxl, gap: Spacing.sm },
  emptyEventsText: { fontSize: Typography.base, color: Colors.textSecondary, fontWeight: Typography.medium },
  emptyEventsSub: { fontSize: Typography.sm, color: Colors.textMuted, textAlign: 'center' },
});
