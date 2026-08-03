import React from 'react';
import { View, Text, Pressable, StyleSheet, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Event, formatDate, formatCount, TYPE_COLORS, isToday } from '../../constants/data';
import { Colors, Typography, Spacing, Radius, Shadows } from '../../constants/theme';

interface EventCardProps {
  event: Event;
  isGoing?: boolean;
  isInterested?: boolean;
  onToggleGoing?: () => void;
  onToggleInterested?: () => void;
  compact?: boolean;
}

const CARD_WIDTH = Dimensions.get('window').width - Spacing.base * 2;

export function EventCard({
  event,
  isGoing = false,
  isInterested = false,
  onToggleGoing,
  onToggleInterested,
  compact = false,
}: EventCardProps) {
  const router = useRouter();
  const typeColor = TYPE_COLORS[event.type] || Colors.gold;
  const isEventToday = isToday(event.date);
  // Parse as local date (not UTC) to prevent off-by-one day in UTC-offset timezones
  const isPast = !isEventToday && (() => {
    const [y, m, d] = event.date.split('-').map(Number);
    const evtLocal = new Date(y, m - 1, d);
    const todayLocal = new Date(); todayLocal.setHours(0, 0, 0, 0);
    return evtLocal < todayLocal;
  })();

  return (
    <Pressable
      onPress={() => router.push(`/event/${event.id}`)}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.92, transform: [{ scale: 0.99 }] }]}
    >
      <View style={styles.imageContainer}>
        <Image
          source={{ uri: event.coverImage }}
          style={styles.image}
          contentFit="cover"
          transition={200}
        />
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.85)']}
          style={styles.gradient}
        />
        <View style={[styles.typeBadge, { backgroundColor: `${typeColor}EE` }]}>
          <Text style={[styles.typeBadgeText, { color: '#fff' }]}>{event.typeLabel}</Text>
        </View>
        <View style={styles.parishBadge}>
          <MaterialIcons name="place" size={11} color={Colors.gold} />
          <Text style={styles.parishBadgeText}>{event.parish}</Text>
        </View>
        {isEventToday ? (
          <View style={styles.todayBadge}>
            <View style={styles.todayDot} />
            <Text style={styles.todayBadgeText}>Today</Text>
          </View>
        ) : isPast ? (
          <View style={styles.pastBadge}>
            <MaterialIcons name="history" size={10} color="rgba(255,255,255,0.7)" />
            <Text style={styles.pastBadgeText}>Past</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={2}>{event.title}</Text>
        <View style={styles.metaRow}>
          <MaterialIcons name="event" size={14} color={Colors.textMuted} />
          <Text style={styles.metaText}>{formatDate(event.date)} · {event.startTime}</Text>
        </View>
        <View style={styles.metaRow}>
          <MaterialIcons name="location-on" size={14} color={Colors.textMuted} />
          <Text style={styles.metaText} numberOfLines={1}>{event.venue}</Text>
        </View>

        {!compact && (
          <View style={styles.footer}>
            <View style={styles.counts}>
              <MaterialIcons name="check-circle" size={14} color={Colors.greenLight} />
              <Text style={styles.countText}>{formatCount(event.goingCount)} going</Text>
              <MaterialIcons name="star" size={14} color={Colors.gold} style={{ marginLeft: Spacing.sm }} />
              <Text style={styles.countText}>{formatCount(event.interestedCount)} interested</Text>
            </View>
            <Text style={[styles.price, event.ticketPrice === 'Free' || event.ticketPrice === 'Free Entry' ? styles.priceFree : {}]}>
              {event.ticketPrice}
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    marginBottom: Spacing.base,
    ...Shadows.card,
  },
  imageContainer: {
    height: 160,
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  gradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 80,
  },
  typeBadge: {
    position: 'absolute',
    top: Spacing.sm,
    left: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  typeBadgeText: {
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
  },
  parishBadge: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: Spacing.xs + 2,
    paddingVertical: 3,
    borderRadius: Radius.full,
    gap: 2,
  },
  parishBadgeText: {
    fontSize: Typography.xs,
    color: Colors.gold,
    fontWeight: Typography.semibold,
  },
  content: {
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  title: {
    fontSize: Typography.md,
    fontWeight: Typography.bold,
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  metaText: {
    fontSize: Typography.sm,
    color: Colors.textSecondary,
    flex: 1,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.xs,
  },
  counts: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  countText: {
    fontSize: Typography.xs,
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
  todayBadge: {
    position: 'absolute',
    bottom: Spacing.sm,
    left: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FF5722',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  todayDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#fff',
  },
  todayBadgeText: {
    fontSize: 10,
    color: '#fff',
    fontWeight: Typography.bold,
  },
  pastBadge: {
    position: 'absolute',
    bottom: Spacing.sm,
    left: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  pastBadgeText: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: Typography.semibold,
  },
});
