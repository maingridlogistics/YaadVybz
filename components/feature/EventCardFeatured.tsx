import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Event, formatDate, formatCount, TYPE_COLORS, isBoostActive } from '../../constants/data';
import { getCardUrl } from '../../lib/storage';
import { LegacyColors as Colors, Typography, Spacing, Radius } from '../../constants/theme';

interface EventCardFeaturedProps {
  event: Event;
}

export const EventCardFeatured = React.memo(function EventCardFeatured({ event }: EventCardFeaturedProps) {
  const router = useRouter();
  const typeColor = TYPE_COLORS[event.type] || Colors.gold;
  const isFree = event.ticketPrice === 'Free' || event.ticketPrice === 'Free Entry';

  return (
    <Pressable
      onPress={() => router.push(`/event/${event.id}`)}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.92, transform: [{ scale: 0.98 }] }]}
      accessibilityRole="button"
      accessibilityLabel={`Featured: ${event.title}, ${formatDate(event.date)}`}
    >
      {/* Full-bleed event image */}
      <Image
        source={{ uri: getCardUrl(event.coverImage) }}
        placeholder={require('../../assets/images/icon.png')}
        placeholderContentFit="cover"
        style={styles.image}
        contentFit="cover"
        transition={200}
        cachePolicy="memory-disk"
        recyclingKey={event.id}
        priority="high"
      />

      {/* Dark gradient for legibility */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.45)', 'rgba(0,0,0,0.88)']}
        locations={[0.3, 0.62, 1]}
        style={styles.gradient}
      />

      {/* Top badges */}
      <View style={styles.topRow}>
        <View style={[styles.typeBadge, { backgroundColor: `${typeColor}EE` }]}>
          <Text style={styles.typeBadgeText}>{event.typeLabel}</Text>
        </View>
        <View style={styles.rightBadges}>
          {isBoostActive(event) && (
            <View style={styles.boostBadge}>
              <MaterialIcons name="rocket-launch" size={9} color={Colors.gold} />
              <Text style={styles.boostText}>BOOSTED</Text>
            </View>
          )}
          <View style={styles.featuredBadge}>
            <MaterialIcons name="star" size={9} color={Colors.textOnGold} />
            <Text style={styles.featuredText}>FEATURED</Text>
          </View>
        </View>
      </View>

      {/* Bottom content */}
      <View style={styles.content}>
        {/* Parish */}
        <View style={styles.parishRow}>
          <MaterialIcons name="place" size={12} color={Colors.gold} />
          <Text style={styles.parishText}>{event.parish}, Jamaica</Text>
        </View>

        {/* Title */}
        <Text style={styles.title} numberOfLines={2}>{event.title}</Text>

        {/* Meta row */}
        <View style={styles.metaRow}>
          <MaterialIcons name="event" size={12} color="rgba(255,255,255,0.65)" />
          <Text style={styles.metaText}>{formatDate(event.date)}</Text>
          {event.startTime && event.startTime !== 'TBA' && (
            <>
              <View style={styles.sep} />
              <MaterialIcons name="access-time" size={12} color="rgba(255,255,255,0.65)" />
              <Text style={styles.metaText}>{event.startTime}</Text>
            </>
          )}
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <View style={styles.countRow}>
            <MaterialIcons name="people" size={12} color="rgba(255,255,255,0.65)" />
            <Text style={styles.countText}>{formatCount(event.goingCount)} going</Text>
          </View>
          <View style={[styles.pricePill, isFree && styles.pricePillFree]}>
            <Text style={styles.priceText}>{isFree ? 'FREE' : event.ticketPrice}</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    width: 280,
    height: 340,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    marginRight: Spacing.base,
    backgroundColor: Colors.surface,
    position: 'relative',
    borderWidth: 1,
    borderColor: `${Colors.gold}33`,
  },
  image: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
  },
  gradient: {
    position: 'absolute', left: 0, right: 0, bottom: 0, height: '65%',
  },

  topRow: {
    position: 'absolute', top: Spacing.base, left: Spacing.base, right: Spacing.base,
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
  },
  typeBadge: {
    paddingHorizontal: Spacing.sm, paddingVertical: 5, borderRadius: Radius.full,
  },
  typeBadgeText: { fontSize: Typography.xs, fontWeight: Typography.bold, color: '#fff', letterSpacing: 0.3 },
  rightBadges: { alignItems: 'flex-end', gap: 5 },
  boostBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: `${Colors.gold}22`,
    paddingHorizontal: Spacing.sm, paddingVertical: 4,
    borderRadius: Radius.full, borderWidth: 1, borderColor: `${Colors.gold}55`,
  },
  boostText: { fontSize: 9, fontWeight: Typography.black, color: Colors.gold, letterSpacing: 0.5 },
  featuredBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: Colors.gold, paddingHorizontal: Spacing.sm,
    paddingVertical: 4, borderRadius: Radius.full,
  },
  featuredText: { fontSize: 9, fontWeight: Typography.black, color: Colors.textOnGold, letterSpacing: 0.5 },

  content: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: Spacing.base, paddingBottom: Spacing.base, paddingTop: Spacing.sm,
    gap: 6,
  },
  parishRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  parishText: { fontSize: Typography.xs, color: Colors.gold, fontWeight: Typography.semibold },
  title: { fontSize: Typography.lg, fontWeight: Typography.black, color: '#fff', lineHeight: 26 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText: { fontSize: Typography.xs, color: 'rgba(255,255,255,0.75)' },
  sep: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: 'rgba(255,255,255,0.3)' },

  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  countRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  countText: { fontSize: Typography.xs, color: 'rgba(255,255,255,0.75)' },
  pricePill: {
    backgroundColor: Colors.gold, paddingHorizontal: Spacing.sm,
    paddingVertical: 5, borderRadius: Radius.full,
  },
  pricePillFree: { backgroundColor: Colors.green },
  priceText: { fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.textOnGold, letterSpacing: 0.3 },
});
