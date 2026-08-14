import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Event, formatDate, formatCount, TYPE_COLORS, isBoostActive } from '../../constants/data';
import { getCardUrl } from '../../lib/storage';
import { Colors, Typography, Spacing, Radius, Shadows } from '../../constants/theme';

interface EventCardFeaturedProps {
  event: Event;
}

export const EventCardFeatured = React.memo(function EventCardFeatured({ event }: EventCardFeaturedProps) {
  const router = useRouter();
  const typeColor = TYPE_COLORS[event.type] || Colors.primary;
  const isFree = event.ticketPrice === 'Free' || event.ticketPrice === 'Free Entry';

  // Parse date for the visual date badge
  const dateParts = event.date ? event.date.split('-') : [];
  const hasDate = dateParts.length === 3;
  let monthStr = '';
  let dayStr = '';
  if (hasDate) {
    const [y, m, d] = dateParts.map(Number);
    const dateObj = new Date(y, m - 1, d);
    monthStr = dateObj.toLocaleString('default', { month: 'short' }).toUpperCase();
    dayStr = d.toString();
  }

  return (
    <Pressable
      onPress={() => router.push(`/event/${event.id}`)}
      style={({ pressed }) => [
        styles.card,
        pressed && { opacity: 0.94, transform: [{ scale: 0.98 }] },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Featured: ${event.title}, ${formatDate(event.date)}`}
    >
      {/* ── Full-bleed event photography ── */}
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

      {/* Gradient — bottom-only, subtle, just for text legibility */}
      <LinearGradient
        colors={['transparent', 'rgba(10,6,4,0.45)', 'rgba(10,6,4,0.88)']}
        locations={[0.35, 0.68, 1]}
        style={styles.gradient}
      />

      {/* ── Top row: type badge + Featured badge ── */}
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

      {/* ── Bottom content ── */}
      <View style={styles.content}>
        {/* Date badge + parish row */}
        <View style={styles.metaTopRow}>
          {hasDate && (
            <View style={styles.dateBadge}>
              <Text style={styles.dateMonth}>{monthStr}</Text>
              <Text style={styles.dateDay}>{dayStr}</Text>
            </View>
          )}
          <View style={styles.metaRight}>
            <View style={styles.parishRow}>
              <MaterialIcons name="place" size={12} color={Colors.gold} />
              <Text style={styles.parishText}>{event.parish}, Jamaica</Text>
            </View>
            <Text style={styles.title} numberOfLines={2}>{event.title}</Text>
          </View>
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Footer: engagement + price */}
        <View style={styles.footer}>
          <View style={styles.countRow}>
            <MaterialIcons name="people" size={12} color="rgba(255,255,255,0.65)" />
            <Text style={styles.countText}>{formatCount(event.goingCount)} going</Text>
            <View style={styles.sep} />
            <MaterialIcons name="access-time" size={12} color="rgba(255,255,255,0.65)" />
            <Text style={styles.countText}>{event.startTime || 'TBA'}</Text>
          </View>
          <View style={styles.pricePill}>
            <Text style={[styles.priceText, isFree && styles.priceTextFree]}>
              {isFree ? 'FREE' : event.ticketPrice}
            </Text>
          </View>
        </View>
      </View>

      {/* Chevron indicator — bottom right corner */}
      <View style={styles.chevronWrap}>
        <MaterialIcons name="chevron-right" size={16} color="rgba(255,255,255,0.7)" />
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    width: 300,
    height: 380,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    marginRight: Spacing.base,
    backgroundColor: Colors.surface,
    position: 'relative',
    ...Shadows.card,
  },
  image: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  gradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '70%',
  },

  // Top row
  topRow: {
    position: 'absolute',
    top: Spacing.base,
    left: Spacing.base,
    right: Spacing.base,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  typeBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
    borderRadius: Radius.full,
  },
  typeBadgeText: {
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    color: '#fff',
    letterSpacing: 0.3,
  },
  rightBadges: {
    alignItems: 'flex-end',
    gap: 5,
  },
  boostBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(245,158,11,0.18)',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: `${Colors.gold}55`,
  },
  boostText: {
    fontSize: 9,
    fontWeight: Typography.black,
    color: Colors.gold,
    letterSpacing: 0.5,
  },
  featuredBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.gold,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  featuredText: {
    fontSize: 9,
    fontWeight: Typography.black,
    color: Colors.textOnGold,
    letterSpacing: 0.5,
  },

  // Content
  content: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.base,
    paddingTop: Spacing.sm,
    gap: Spacing.sm,
  },
  metaTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.sm,
  },

  // White date badge
  dateBadge: {
    width: 46,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: Radius.sm,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    flexShrink: 0,
  },
  dateMonth: {
    fontSize: 9,
    fontWeight: Typography.bold,
    color: Colors.gold,
    letterSpacing: 0.5,
    lineHeight: 12,
  },
  dateDay: {
    fontSize: 22,
    fontWeight: Typography.black,
    color: '#fff',
    lineHeight: 26,
  },
  metaRight: {
    flex: 1,
    gap: 4,
  },
  parishRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  parishText: {
    fontSize: Typography.xs,
    color: Colors.gold,
    fontWeight: Typography.semibold,
  },
  title: {
    fontSize: Typography.lg,
    fontWeight: Typography.black,
    color: '#fff',
    lineHeight: 26,
  },

  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },

  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  countText: {
    fontSize: Typography.xs,
    color: 'rgba(255,255,255,0.75)',
  },
  sep: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  pricePill: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
    borderRadius: Radius.full,
  },
  priceText: {
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    color: '#fff',
    letterSpacing: 0.3,
  },
  priceTextFree: {
    color: '#fff',
  },
  chevronWrap: {
    position: 'absolute',
    bottom: Spacing.base,
    right: Spacing.base + 4,
    opacity: 0,   // intentionally invisible — tap area remains clear
  },
});
