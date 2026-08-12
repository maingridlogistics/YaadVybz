import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Event, formatDate, formatCount, TYPE_COLORS, isBoostActive } from '../../constants/data';
import { getCardUrl } from '../../lib/storage';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';

interface EventCardFeaturedProps {
  event: Event;
}

export const EventCardFeatured = React.memo(function EventCardFeatured({ event }: EventCardFeaturedProps) {
  const router = useRouter();
  const typeColor = TYPE_COLORS[event.type] || Colors.gold;

  return (
    <Pressable
      onPress={() => router.push(`/event/${event.id}`)}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.93, transform: [{ scale: 0.99 }] }]}
    >
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
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.92)']}
        style={styles.gradient}
      />

      {/* Featured glow border */}
      <View style={styles.goldBorder} />

      <View style={styles.badges}>
        <View style={[styles.typeBadge, { backgroundColor: `${typeColor}EE` }]}>
          <Text style={styles.typeBadgeText}>{event.typeLabel}</Text>
        </View>
        <View style={styles.rightBadges}>
          {isBoostActive(event) && (
            <View style={styles.boostBadge}>
              <MaterialIcons name="rocket-launch" size={10} color={Colors.gold} />
              <Text style={styles.boostBadgeText}>BOOSTED</Text>
            </View>
          )}
          <View style={styles.featuredBadge}>
            <MaterialIcons name="star" size={10} color={Colors.textOnGold} />
            <Text style={styles.featuredBadgeText}>FEATURED</Text>
          </View>
        </View>
      </View>

      <View style={styles.content}>
        <View style={styles.parishRow}>
          <MaterialIcons name="place" size={13} color={Colors.gold} />
          <Text style={styles.parish}>{event.parish}, Jamaica</Text>
        </View>
        <Text style={styles.title} numberOfLines={2}>{event.title}</Text>
        <View style={styles.dateRow}>
          <MaterialIcons name="event" size={13} color={Colors.textSecondary} />
          <Text style={styles.date}>{formatDate(event.date)} · {event.startTime}</Text>
        </View>
        <View style={styles.footer}>
          <View style={styles.counts}>
            <MaterialIcons name="people" size={13} color={Colors.textSecondary} />
            <Text style={styles.countText}>{formatCount(event.goingCount)} going</Text>
          </View>
          <Text style={[styles.price, (event.ticketPrice === 'Free' || event.ticketPrice === 'Free Entry') && styles.priceFree]}>
            {event.ticketPrice}
          </Text>
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
    marginRight: Spacing.md,
    backgroundColor: Colors.surface,
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  gradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '65%',
  },
  goldBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: Radius.xl,
    borderWidth: 1.5,
    borderColor: 'rgba(255,215,0,0.4)',
  },
  badges: {
    position: 'absolute',
    top: Spacing.md,
    left: Spacing.md,
    right: Spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  rightBadges: {
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
  content: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: Spacing.base,
    gap: Spacing.xs,
  },
  parishRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  parish: {
    fontSize: Typography.xs,
    color: Colors.gold,
    fontWeight: Typography.semibold,
  },
  title: {
    fontSize: Typography.lg,
    fontWeight: Typography.black,
    color: Colors.textPrimary,
    lineHeight: 26,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  date: {
    fontSize: Typography.sm,
    color: Colors.textSecondary,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  counts: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  countText: {
    fontSize: Typography.sm,
    color: Colors.textSecondary,
  },
  price: {
    fontSize: Typography.sm,
    fontWeight: Typography.bold,
    color: Colors.gold,
  },
  priceFree: {
    color: Colors.greenLight,
  },
});
