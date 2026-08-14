import React from 'react';
import { View, Text, Pressable, StyleSheet, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Event, formatDate, formatCount, TYPE_COLORS, isToday, isBoostActive } from '../../constants/data';
import { getThumbUrl, getCardUrl } from '../../lib/storage';
import { Colors, Typography, Spacing, Radius, Shadows } from '../../constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface EventCardProps {
  event: Event;
  isGoing?: boolean;
  isInterested?: boolean;
  onToggleGoing?: () => void;
  onToggleInterested?: () => void;
  compact?: boolean;
  variant?: 'default' | 'row';
}

// ─── Date Badge ───────────────────────────────────────────────────────────────
function DateBadge({ dateStr }: { dateStr: string }) {
  if (!dateStr) return null;
  const parts = dateStr.split('-');
  if (parts.length !== 3) return null;
  const [y, m, d] = parts.map(Number);
  const date = new Date(y, m - 1, d);
  const month = date.toLocaleString('default', { month: 'short' }).toUpperCase();
  const day = d.toString();
  return (
    <View style={dateBadge.container}>
      <Text style={dateBadge.month}>{month}</Text>
      <Text style={dateBadge.day}>{day}</Text>
    </View>
  );
}

const dateBadge = StyleSheet.create({
  container: {
    width: 42,
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.sm,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    flexShrink: 0,
    ...Shadows.card,
  },
  month: {
    fontSize: 9,
    fontWeight: Typography.bold,
    color: Colors.primary,
    letterSpacing: 0.5,
    lineHeight: 12,
  },
  day: {
    fontSize: 18,
    fontWeight: Typography.black,
    color: Colors.textPrimary,
    lineHeight: 22,
  },
});

export const EventCard = React.memo(function EventCard({
  event,
  isGoing = false,
  isInterested = false,
  onToggleGoing,
  onToggleInterested,
  compact = false,
  variant = 'default',
}: EventCardProps) {
  const router = useRouter();
  const typeColor = TYPE_COLORS[event.type] || Colors.primary;
  const isEventToday = isToday(event.date);
  const isFree = event.ticketPrice === 'Free' || event.ticketPrice === 'Free Entry';
  const isActive = isBoostActive(event);

  // ── Row variant — horizontal compact card ─────────────────────────────────
  if (variant === 'row') {
    return (
      <Pressable
        onPress={() => router.push(`/event/${event.id}`)}
        style={({ pressed }) => [rowStyles.card, pressed && { opacity: 0.88, transform: [{ scale: 0.99 }] }]}
        accessibilityRole="button"
        accessibilityLabel={`${event.title}, ${formatDate(event.date)}`}
      >
        {/* Image */}
        <View style={rowStyles.imgWrap}>
          <Image
            source={{ uri: getThumbUrl(event.coverImage) }}
            placeholder={require('../../assets/images/icon.png')}
            placeholderContentFit="cover"
            style={rowStyles.img}
            contentFit="cover"
            transition={150}
            cachePolicy="memory-disk"
            recyclingKey={event.id}
          />
          {/* Today indicator */}
          {isEventToday && <View style={rowStyles.todayStripe} />}
        </View>

        {/* Date badge sitting between image and content */}
        <DateBadge dateStr={event.date} />

        {/* Info */}
        <View style={rowStyles.info}>
          <Text style={rowStyles.title} numberOfLines={2}>{event.title}</Text>
          <View style={rowStyles.metaRow}>
            <MaterialIcons name="place" size={11} color={Colors.textMuted} />
            <Text style={rowStyles.meta} numberOfLines={1}>{event.venue}, {event.parish}</Text>
          </View>
          <View style={rowStyles.footer}>
            <View style={[rowStyles.typePill, { backgroundColor: `${typeColor}18`, borderColor: `${typeColor}40` }]}>
              <Text style={[rowStyles.typePillText, { color: typeColor }]}>{event.typeLabel}</Text>
            </View>
            <Text style={[rowStyles.price, isFree && rowStyles.priceFree]}>
              {isFree ? 'Free' : event.ticketPrice}
            </Text>
          </View>
        </View>

        {/* RSVP pill stack — far right */}
        {(onToggleGoing || onToggleInterested) && (
          <View style={rowStyles.rsvpStack}>
            {onToggleGoing && (
              <Pressable
                onPress={(e) => { e.stopPropagation(); onToggleGoing(); }}
                style={[rowStyles.rsvpBtn, isGoing && rowStyles.rsvpGoing]}
                hitSlop={6}
                accessibilityLabel="Toggle going"
              >
                <MaterialIcons name="check" size={12} color={isGoing ? Colors.textOnPrimary : Colors.textMuted} />
                <Text style={[rowStyles.rsvpCount, isGoing && { color: Colors.textOnPrimary }]}>
                  {formatCount(event.goingCount)}
                </Text>
              </Pressable>
            )}
            {onToggleInterested && (
              <Pressable
                onPress={(e) => { e.stopPropagation(); onToggleInterested(); }}
                style={[rowStyles.rsvpBtn, isInterested && rowStyles.rsvpInterested]}
                hitSlop={6}
                accessibilityLabel="Toggle interested"
              >
                <MaterialIcons name="star" size={12} color={isInterested ? '#fff' : Colors.textMuted} />
                <Text style={[rowStyles.rsvpCount, isInterested && { color: '#fff' }]}>
                  {formatCount(event.interestedCount)}
                </Text>
              </Pressable>
            )}
          </View>
        )}
      </Pressable>
    );
  }

  // ── Default vertical card — COMPLETELY redesigned ─────────────────────────
  return (
    <Pressable
      onPress={() => router.push(`/event/${event.id}`)}
      style={({ pressed }) => [
        styles.card,
        pressed && { opacity: 0.94, transform: [{ scale: 0.99 }] },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${event.title}, ${formatDate(event.date)}`}
    >
      {/* ── Image area ── */}
      <View style={styles.imageWrap}>
        <Image
          source={{ uri: getCardUrl(event.coverImage) }}
          placeholder={require('../../assets/images/icon.png')}
          placeholderContentFit="cover"
          style={styles.image}
          contentFit="cover"
          transition={200}
          cachePolicy="memory-disk"
          recyclingKey={event.id}
          priority="normal"
        />

        {/* Subtle bottom fade ONLY — no heavy dark overlay */}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.35)']}
          style={styles.imageGradient}
        />

        {/* Top-left: type badge */}
        <View style={[styles.typeBadge, { backgroundColor: `${typeColor}EE` }]}>
          <Text style={styles.typeBadgeText}>{event.typeLabel}</Text>
        </View>

        {/* Top-right: parish pill */}
        <View style={styles.parishPill}>
          <MaterialIcons name="place" size={10} color={Colors.gold} />
          <Text style={styles.parishText}>{event.parish}</Text>
        </View>

        {/* Bottom-left: Today / status badges */}
        {isEventToday && (
          <View style={styles.todayBadge}>
            <View style={styles.todayDot} />
            <Text style={styles.todayText}>Today</Text>
          </View>
        )}

        {/* Bottom-right: Boost / Verified */}
        {isActive && (
          <View style={styles.boostBadge}>
            <MaterialIcons name="rocket-launch" size={9} color={Colors.textOnGold} />
            <Text style={styles.boostText}>BOOSTED</Text>
          </View>
        )}
      </View>

      {/* ── Content area — sits BELOW image on white card ── */}
      <View style={styles.content}>
        {/* Title + price row */}
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={2}>{event.title}</Text>
          <Text style={[styles.price, isFree && styles.priceFree]}>
            {isFree ? 'Free' : event.ticketPrice}
          </Text>
        </View>

        {/* Date + time */}
        <View style={styles.metaRow}>
          <MaterialIcons name="calendar-today" size={13} color={Colors.primary} />
          <Text style={styles.metaText}>
            {formatDate(event.date)}{event.startTime && event.startTime !== 'TBA' ? ` · ${event.startTime}` : ''}
          </Text>
        </View>

        {/* Venue */}
        <View style={styles.metaRow}>
          <MaterialIcons name="location-on" size={13} color={Colors.textMuted} />
          <Text style={styles.metaText} numberOfLines={1}>{event.venue}</Text>
        </View>

        {/* Footer: RSVP counts + action */}
        {!compact && (
          <View style={styles.cardFooter}>
            <View style={styles.engagementRow}>
              <View style={styles.engagementPill}>
                <MaterialIcons name="people" size={12} color={Colors.textMuted} />
                <Text style={styles.engagementText}>{formatCount(event.goingCount)} going</Text>
              </View>
              <View style={styles.engagementPill}>
                <MaterialIcons name="star-outline" size={12} color={Colors.textMuted} />
                <Text style={styles.engagementText}>{formatCount(event.interestedCount)}</Text>
              </View>
            </View>

            {/* RSVP buttons */}
            {(onToggleGoing || onToggleInterested) && (
              <View style={styles.rsvpRow}>
                {onToggleGoing && (
                  <Pressable
                    onPress={(e) => { e.stopPropagation(); onToggleGoing(); }}
                    style={[styles.rsvpBtn, isGoing && styles.rsvpBtnActive]}
                    hitSlop={6}
                    accessibilityLabel="Toggle going"
                  >
                    <MaterialIcons
                      name={isGoing ? 'check-circle' : 'check-circle-outline'}
                      size={14}
                      color={isGoing ? Colors.textOnPrimary : Colors.textMuted}
                    />
                    <Text style={[styles.rsvpBtnText, isGoing && { color: Colors.textOnPrimary }]}>Going</Text>
                  </Pressable>
                )}
                {onToggleInterested && (
                  <Pressable
                    onPress={(e) => { e.stopPropagation(); onToggleInterested(); }}
                    style={[styles.rsvpBtn, isInterested && styles.rsvpBtnGold]}
                    hitSlop={6}
                    accessibilityLabel="Toggle interested"
                  >
                    <MaterialIcons
                      name={isInterested ? 'star' : 'star-outline'}
                      size={14}
                      color={isInterested ? Colors.textOnGold : Colors.textMuted}
                    />
                    <Text style={[styles.rsvpBtnText, isInterested && { color: Colors.textOnGold }]}>Interested</Text>
                  </Pressable>
                )}
              </View>
            )}
          </View>
        )}
      </View>
    </Pressable>
  );
});

// ─── Row variant styles ────────────────────────────────────────────────────────
const rowStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    overflow: 'hidden',
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
    ...Shadows.card,
  },
  imgWrap: {
    width: 88,
    height: 88,
    flexShrink: 0,
    position: 'relative',
    overflow: 'hidden',
  },
  img: { width: '100%', height: '100%' },
  todayStripe: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 3,
    height: '100%',
    backgroundColor: Colors.primary,
  },
  info: {
    flex: 1,
    paddingVertical: Spacing.sm,
    gap: 4,
    justifyContent: 'center',
    minWidth: 0,
  },
  title: {
    fontSize: Typography.sm,
    fontWeight: Typography.bold,
    color: Colors.textPrimary,
    lineHeight: 18,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  meta: { fontSize: 11, color: Colors.textMuted, flex: 1 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.xs,
    marginTop: 2,
  },
  typePill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.full,
    borderWidth: 1,
    maxWidth: 100,
  },
  typePillText: { fontSize: 10, fontWeight: Typography.semibold },
  price: {
    fontSize: 11,
    fontWeight: Typography.bold,
    color: Colors.primary,
    flexShrink: 0,
  },
  priceFree: { color: Colors.success },

  // RSVP
  rsvpStack: {
    paddingRight: Spacing.md,
    gap: 5,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  rsvpBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    height: 26,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  rsvpGoing: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  rsvpInterested: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  rsvpCount: { fontSize: 10, color: Colors.textMuted, fontWeight: Typography.semibold },
});

// ─── Default vertical card styles ────────────────────────────────────────────
const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    marginBottom: Spacing.base,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    ...Shadows.card,
  },

  // Image
  imageWrap: {
    height: 200,
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imageGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 60,
  },

  // Overlay badges
  typeBadge: {
    position: 'absolute',
    top: Spacing.md,
    left: Spacing.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  typeBadgeText: {
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    color: '#fff',
  },
  parishPill: {
    position: 'absolute',
    top: Spacing.md,
    right: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(0,0,0,0.52)',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  parishText: {
    fontSize: Typography.xs,
    color: Colors.gold,
    fontWeight: Typography.semibold,
  },
  todayBadge: {
    position: 'absolute',
    bottom: Spacing.sm,
    left: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  todayDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#fff',
  },
  todayText: {
    fontSize: 10,
    color: '#fff',
    fontWeight: Typography.bold,
  },
  boostBadge: {
    position: 'absolute',
    bottom: Spacing.sm,
    right: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.gold,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  boostText: {
    fontSize: 9,
    color: Colors.textOnGold,
    fontWeight: Typography.black,
    letterSpacing: 0.5,
  },

  // Content below image
  content: {
    padding: Spacing.base,
    gap: Spacing.xs + 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  title: {
    flex: 1,
    fontSize: Typography.md,
    fontWeight: Typography.bold,
    color: Colors.textPrimary,
    lineHeight: 24,
  },
  price: {
    fontSize: Typography.sm,
    fontWeight: Typography.bold,
    color: Colors.primary,
    flexShrink: 0,
    marginTop: 3,
  },
  priceFree: {
    color: Colors.success,
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

  // Footer
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
  },
  engagementRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'center',
  },
  engagementPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  engagementText: {
    fontSize: Typography.xs,
    color: Colors.textMuted,
  },
  rsvpRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  rsvpBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  rsvpBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  rsvpBtnGold: {
    backgroundColor: Colors.gold,
    borderColor: Colors.gold,
  },
  rsvpBtnText: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: Typography.semibold,
  },
});
