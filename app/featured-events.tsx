import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEvents } from '../hooks/useEvents';
import { Colors, Typography, Spacing, Radius } from '../constants/theme';
import { formatDate, formatCount, TYPE_COLORS, isBoostActive } from '../constants/data';
import { getCardUrl } from '../lib/storage';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_IMAGE_HEIGHT = Math.round(SCREEN_WIDTH * 0.55);

// ─── Featured Event Card (full-width vertical layout) ────────────────────────
function FeaturedCard({ event, index }: { event: any; index: number }) {
  const router = useRouter();
  const typeColor = TYPE_COLORS[event.type] || Colors.gold;
  const isFree = event.ticketPrice === 'Free' || event.ticketPrice === 'Free Entry';

  return (
    <Pressable
      onPress={() => router.push(`/event/${event.id}` as any)}
      style={({ pressed }) => [
        cardStyles.card,
        pressed && { opacity: 0.92, transform: [{ scale: 0.985 }] },
      ]}
    >
      {/* Rank number */}
      <View style={cardStyles.rankBadge}>
        <Text style={cardStyles.rankText}>{index + 1}</Text>
      </View>

      {/* Hero image */}
      <View style={[cardStyles.imageWrap, { height: CARD_IMAGE_HEIGHT }]}>
        <Image
          source={{ uri: getCardUrl(event.coverImage) }}
          placeholder={require('../assets/images/icon.png')}
          placeholderContentFit="cover"
          style={StyleSheet.absoluteFillObject}
          contentFit="cover"
          transition={200}
          cachePolicy="memory-disk"
          recyclingKey={event.id}
          priority="high"
        />
        <LinearGradient
          colors={['rgba(0,0,0,0.05)', 'rgba(0,0,0,0.35)']}
          style={StyleSheet.absoluteFillObject}
        />
        {/* Gold featured border overlay */}
        <View style={cardStyles.goldBorder} />

        {/* Top badges */}
        <View style={cardStyles.imageBadges}>
          <View style={[cardStyles.typeBadge, { backgroundColor: `${typeColor}EE` }]}>
            <Text style={cardStyles.typeBadgeText}>{event.typeLabel}</Text>
          </View>
          <View style={cardStyles.topRightBadges}>
            {isBoostActive(event) && (
              <View style={cardStyles.boostBadge}>
                <MaterialIcons name="rocket-launch" size={10} color={Colors.gold} />
                <Text style={cardStyles.boostBadgeText}>BOOSTED</Text>
              </View>
            )}
            <View style={cardStyles.featuredBadge}>
              <MaterialIcons name="star" size={10} color={Colors.textOnGold} />
              <Text style={cardStyles.featuredBadgeText}>FEATURED</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Info panel */}
      <View style={cardStyles.info}>
        {/* Parish + venue row */}
        <View style={cardStyles.locationRow}>
          <MaterialIcons name="place" size={13} color={Colors.gold} />
          <Text style={cardStyles.location} numberOfLines={1}>
            {event.parish}, Jamaica
            {event.venue ? ` · ${event.venue}` : ''}
          </Text>
        </View>

        {/* Title */}
        <Text style={cardStyles.title} numberOfLines={2}>{event.title}</Text>

        {/* Date + time */}
        <View style={cardStyles.metaRow}>
          <View style={cardStyles.metaItem}>
            <MaterialIcons name="event" size={13} color={Colors.textMuted} />
            <Text style={cardStyles.metaText}>{formatDate(event.date)}</Text>
          </View>
          {event.startTime && event.startTime !== 'TBA' && (
            <View style={cardStyles.metaItem}>
              <MaterialIcons name="access-time" size={13} color={Colors.textMuted} />
              <Text style={cardStyles.metaText}>{event.startTime}</Text>
            </View>
          )}
        </View>

        {/* Footer: going count + price */}
        <View style={cardStyles.footer}>
          <View style={cardStyles.goingRow}>
            <MaterialIcons name="people" size={14} color={Colors.textSecondary} />
            <Text style={cardStyles.goingText}>
              {formatCount(event.goingCount + event.interestedCount)} interested
            </Text>
          </View>
          <View style={[cardStyles.priceBadge, isFree && cardStyles.priceBadgeFree]}>
            <Text style={[cardStyles.priceText, isFree && cardStyles.priceTextFree]}>
              {isFree ? 'Free Entry' : event.ticketPrice}
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    borderWidth: 1.5,
    borderColor: `${Colors.gold}44`,
    overflow: 'hidden',
    marginBottom: Spacing.base,
  },
  rankBadge: {
    position: 'absolute',
    top: Spacing.md,
    left: Spacing.md,
    zIndex: 10,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.gold,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.6,
    shadowRadius: 6,
    elevation: 5,
  },
  rankText: {
    fontSize: 12,
    fontWeight: Typography.black,
    color: Colors.textOnGold,
  },
  imageWrap: {
    width: '100%',
    position: 'relative',
    overflow: 'hidden',
  },
  goldBorder: {
    ...StyleSheet.absoluteFillObject,
    borderBottomWidth: 2,
    borderBottomColor: `${Colors.gold}66`,
  },
  imageBadges: {
    position: 'absolute',
    top: Spacing.md,
    left: Spacing.md + 36, // offset past rank badge
    right: Spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  typeBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  typeBadgeText: {
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    color: '#fff',
  },
  topRightBadges: {
    alignItems: 'flex-end',
    gap: 4,
  },
  boostBadge: {
    backgroundColor: 'rgba(255,215,0,0.18)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: `${Colors.gold}55`,
  },
  boostBadgeText: {
    fontSize: 9,
    fontWeight: Typography.black,
    color: Colors.gold,
    letterSpacing: 0.5,
  },
  featuredBadge: {
    backgroundColor: Colors.gold,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  featuredBadgeText: {
    fontSize: 9,
    fontWeight: Typography.black,
    color: Colors.textOnGold,
    letterSpacing: 0.5,
  },
  info: {
    padding: Spacing.base,
    gap: Spacing.xs,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  location: {
    flex: 1,
    fontSize: Typography.xs,
    color: Colors.gold,
    fontWeight: Typography.semibold,
  },
  title: {
    fontSize: Typography.lg,
    fontWeight: Typography.black,
    color: Colors.textPrimary,
    lineHeight: 26,
    marginTop: 2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginTop: 2,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: Typography.sm,
    color: Colors.textSecondary,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
  },
  goingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  goingText: {
    fontSize: Typography.sm,
    color: Colors.textSecondary,
  },
  priceBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    borderRadius: Radius.full,
    backgroundColor: Colors.goldSurface,
    borderWidth: 1,
    borderColor: `${Colors.gold}44`,
  },
  priceBadgeFree: {
    backgroundColor: Colors.greenSurface,
    borderColor: `${Colors.greenLight}44`,
  },
  priceText: {
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    color: Colors.gold,
  },
  priceTextFree: {
    color: Colors.greenLight,
  },
});

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function FeaturedEventsScreen() {
  const router = useRouter();
  const { getFeaturedEvents, events } = useEvents();
  const featured = useMemo(() => getFeaturedEvents(), [getFeaturedEvents]);

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        {/* Header */}
        <LinearGradient
          colors={['#001A0D', Colors.background]}
          style={styles.headerGradient}
        >
          <View style={styles.header}>
            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
            >
              <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <View style={styles.titleRow}>
                <MaterialIcons name="star" size={18} color={Colors.gold} />
                <Text style={styles.title}>Featured Events</Text>
              </View>
              <Text style={styles.sub}>
                {featured.length > 0
                  ? `${featured.length} curated event${featured.length !== 1 ? 's' : ''} by Vybz Hub`
                  : 'Curated by Vybz Hub'}
              </Text>
            </View>
          </View>
        </LinearGradient>
      </SafeAreaView>

      {featured.length === 0 ? (
        /* ── Empty State ── */
        <View style={styles.emptyState}>
          <View style={styles.emptyIconWrap}>
            <MaterialIcons name="star-border" size={44} color={Colors.gold} />
          </View>
          <Text style={styles.emptyTitle}>No Featured Events</Text>
          <Text style={styles.emptySub}>
            Featured events are hand-picked by our team. Check back soon for highlighted events across Jamaica.
          </Text>
          <Pressable
            onPress={() => router.push('/(tabs)/browse' as any)}
            style={({ pressed }) => [styles.browseBtn, pressed && { opacity: 0.85 }]}
          >
            <LinearGradient
              colors={[Colors.gold, Colors.goldDim]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.browseBtnInner}
            >
              <MaterialIcons name="search" size={16} color={Colors.textOnGold} />
              <Text style={styles.browseBtnText}>Browse All Events</Text>
            </LinearGradient>
          </Pressable>
        </View>
      ) : (
        /* ── Featured List ── */
        <FlatList
          data={featured}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.list}
          renderItem={({ item, index }) => (
            <FeaturedCard event={item} index={index} />
          )}
          ListHeaderComponent={
            <View style={styles.listHeader}>
              <LinearGradient
                colors={[Colors.goldSurface, 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.listHeaderGradient}
              >
                <MaterialIcons name="auto-awesome" size={14} color={Colors.gold} />
                <Text style={styles.listHeaderText}>
                  Hand-picked by the Vybz Hub team · Updated regularly
                </Text>
              </LinearGradient>
            </View>
          }
          ListFooterComponent={<View style={{ height: Spacing.xxl * 2 }} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  headerGradient: {
    paddingBottom: Spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  title: {
    fontSize: Typography.xl,
    fontWeight: Typography.black,
    color: Colors.textPrimary,
  },
  sub: {
    fontSize: Typography.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },

  list: {
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.md,
  },
  listHeader: {
    marginBottom: Spacing.md,
    borderRadius: Radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: `${Colors.gold}22`,
  },
  listHeaderGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
  },
  listHeaderText: {
    flex: 1,
    fontSize: Typography.xs,
    color: Colors.gold,
    lineHeight: 17,
  },

  // Empty state
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    gap: Spacing.lg,
  },
  emptyIconWrap: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.goldSurface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: `${Colors.gold}44`,
  },
  emptyTitle: {
    fontSize: Typography.xl,
    fontWeight: Typography.black,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  emptySub: {
    fontSize: Typography.base,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
  },
  browseBtn: {
    alignSelf: 'stretch',
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  browseBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.base,
  },
  browseBtnText: {
    fontSize: Typography.base,
    fontWeight: Typography.bold,
    color: Colors.textOnGold,
  },
});
