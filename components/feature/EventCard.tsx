import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Event, formatDate, formatCount, TYPE_COLORS, isToday, isBoostActive } from '../../constants/data';
import { getThumbUrl, getCardUrl } from '../../lib/storage';
import { LegacyColors as Colors, Typography, Spacing, Radius } from '../../constants/theme';

interface EventCardProps {
  event: Event;
  isGoing?: boolean;
  isInterested?: boolean;
  onToggleGoing?: () => void;
  onToggleInterested?: () => void;
  compact?: boolean;
  variant?: 'default' | 'row';
}

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
  const typeColor = TYPE_COLORS[event.type] || Colors.gold;
  const isEventToday = isToday(event.date);
  const isFree = event.ticketPrice === 'Free' || event.ticketPrice === 'Free Entry';
  const isActive = isBoostActive(event);

  // ── Row variant ────────────────────────────────────────────────────────────
  if (variant === 'row') {
    return (
      <Pressable
        onPress={() => router.push(`/event/${event.id}`)}
        style={({ pressed }) => [rowStyles.card, pressed && { opacity: 0.88 }]}
        accessibilityRole="button"
        accessibilityLabel={`${event.title}, ${formatDate(event.date)}`}
      >
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
          {isEventToday && <View style={rowStyles.todayStripe} />}
        </View>
        <View style={rowStyles.info}>
          <Text style={rowStyles.title} numberOfLines={2}>{event.title}</Text>
          <View style={rowStyles.metaRow}>
            <MaterialIcons name="event" size={11} color={Colors.gold} />
            <Text style={rowStyles.meta}>{formatDate(event.date)}</Text>
          </View>
          <View style={rowStyles.metaRow}>
            <MaterialIcons name="place" size={11} color={Colors.textMuted} />
            <Text style={rowStyles.meta} numberOfLines={1}>{event.venue}, {event.parish}</Text>
          </View>
          <View style={rowStyles.footer}>
            <View style={[rowStyles.typePill, { backgroundColor: `${typeColor}22`, borderColor: `${typeColor}44` }]}>
              <Text style={[rowStyles.typePillText, { color: typeColor }]}>{event.typeLabel}</Text>
            </View>
            <Text style={[rowStyles.price, isFree && { color: Colors.greenLight }]}>
              {isFree ? 'Free' : event.ticketPrice}
            </Text>
          </View>
        </View>
        {(onToggleGoing || onToggleInterested) && (
          <View style={rowStyles.rsvpStack}>
            {onToggleGoing && (
              <Pressable
                onPress={(e) => { e.stopPropagation(); onToggleGoing(); }}
                style={[rowStyles.rsvpBtn, isGoing && rowStyles.rsvpGoing]}
                hitSlop={6}
                accessibilityLabel="Toggle going"
              >
                <MaterialIcons name="check" size={12} color={isGoing ? Colors.textOnGold : Colors.textMuted} />
                <Text style={[rowStyles.rsvpCount, isGoing && { color: Colors.textOnGold }]}>
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
                <MaterialIcons name="star" size={12} color={isInterested ? Colors.textOnGold : Colors.textMuted} />
                <Text style={[rowStyles.rsvpCount, isInterested && { color: Colors.textOnGold }]}>
                  {formatCount(event.interestedCount)}
                </Text>
              </Pressable>
            )}
          </View>
        )}
      </Pressable>
    );
  }

  // ── Default vertical card ──────────────────────────────────────────────────
  return (
    <Pressable
      onPress={() => router.push(`/event/${event.id}`)}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.92 }]}
      accessibilityRole="button"
      accessibilityLabel={`${event.title}, ${formatDate(event.date)}`}
    >
      {/* Image */}
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
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.72)']}
          style={styles.gradient}
        />

        {/* Type badge */}
        <View style={[styles.typeBadge, { backgroundColor: `${typeColor}EE` }]}>
          <Text style={styles.typeBadgeText}>{event.typeLabel}</Text>
        </View>

        {/* Today badge */}
        {isEventToday && (
          <View style={styles.todayBadge}>
            <View style={styles.todayDot} />
            <Text style={styles.todayText}>Today</Text>
          </View>
        )}

        {/* Boost badge */}
        {isActive && (
          <View style={styles.boostBadge}>
            <MaterialIcons name="rocket-launch" size={9} color={Colors.textOnGold} />
            <Text style={styles.boostText}>BOOSTED</Text>
          </View>
        )}

        {/* Bottom info overlay */}
        <View style={styles.overlay}>
          <Text style={styles.title} numberOfLines={2}>{event.title}</Text>
          <View style={styles.metaRow}>
            <MaterialIcons name="event" size={12} color={Colors.gold} />
            <Text style={styles.meta}>{formatDate(event.date)}{event.startTime && event.startTime !== 'TBA' ? ` · ${event.startTime}` : ''}</Text>
          </View>
          <View style={styles.metaRow}>
            <MaterialIcons name="place" size={12} color={Colors.textMuted} />
            <Text style={styles.meta} numberOfLines={1}>{event.venue}, {event.parish}</Text>
          </View>
          <View style={styles.bottomRow}>
            <Text style={[styles.price, isFree && { color: Colors.greenLight }]}>
              {isFree ? 'Free Entry' : event.ticketPrice}
            </Text>
            {!compact && (
              <View style={styles.engagementRow}>
                <MaterialIcons name="people" size={12} color={Colors.textMuted} />
                <Text style={styles.engagementText}>{formatCount(event.goingCount)}</Text>
                <MaterialIcons name="star" size={12} color={Colors.textMuted} />
                <Text style={styles.engagementText}>{formatCount(event.interestedCount)}</Text>
              </View>
            )}
          </View>
        </View>
      </View>

      {/* RSVP footer */}
      {!compact && (onToggleGoing || onToggleInterested) && (
        <View style={styles.rsvpRow}>
          {onToggleGoing && (
            <Pressable
              onPress={(e) => { e.stopPropagation(); onToggleGoing(); }}
              style={[styles.rsvpBtn, isGoing && styles.rsvpBtnGoing]}
              hitSlop={6}
              accessibilityLabel="Toggle going"
            >
              <MaterialIcons
                name={isGoing ? 'check-circle' : 'check-circle-outline'}
                size={14}
                color={isGoing ? Colors.textOnGold : Colors.textMuted}
              />
              <Text style={[styles.rsvpBtnText, isGoing && { color: Colors.textOnGold }]}>Going</Text>
            </Pressable>
          )}
          {onToggleInterested && (
            <Pressable
              onPress={(e) => { e.stopPropagation(); onToggleInterested(); }}
              style={[styles.rsvpBtn, isInterested && styles.rsvpBtnInterested]}
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
    </Pressable>
  );
});

// ─── Row variant styles ────────────────────────────────────────────────────────
const rowStyles = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.surfaceBorder,
    overflow: 'hidden', marginBottom: Spacing.sm, gap: Spacing.sm,
  },
  imgWrap: { width: 82, height: 82, flexShrink: 0, position: 'relative', overflow: 'hidden' },
  img: { width: '100%', height: '100%' },
  todayStripe: {
    position: 'absolute', top: 0, left: 0, width: 3, height: '100%',
    backgroundColor: Colors.gold,
  },
  info: { flex: 1, paddingVertical: Spacing.sm, gap: 3, justifyContent: 'center', minWidth: 0 },
  title: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textPrimary, lineHeight: 17 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  meta: { fontSize: 11, color: Colors.textMuted, flex: 1 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  typePill: {
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: Radius.full, borderWidth: 1, maxWidth: 100,
  },
  typePillText: { fontSize: 10, fontWeight: Typography.semibold },
  price: { fontSize: 11, fontWeight: Typography.bold, color: Colors.gold, flexShrink: 0 },
  rsvpStack: { paddingRight: Spacing.md, gap: 5, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  rsvpBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 7, height: 26, borderRadius: Radius.full,
    backgroundColor: Colors.surfaceSecondary, borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  rsvpGoing: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  rsvpInterested: { backgroundColor: Colors.goldDim, borderColor: Colors.goldDim },
  rsvpCount: { fontSize: 10, color: Colors.textMuted, fontWeight: Typography.semibold },
});

// ─── Default card styles ───────────────────────────────────────────────────────
const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    marginBottom: Spacing.base,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  imageWrap: { height: 200, position: 'relative' },
  image: { width: '100%', height: '100%' },
  gradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '65%' },

  typeBadge: {
    position: 'absolute', top: Spacing.md, left: Spacing.md,
    paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: Radius.full,
  },
  typeBadgeText: { fontSize: Typography.xs, fontWeight: Typography.bold, color: '#fff' },

  todayBadge: {
    position: 'absolute', bottom: 52, left: Spacing.md,
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: Colors.gold, paddingHorizontal: Spacing.sm,
    paddingVertical: 4, borderRadius: Radius.full,
  },
  todayDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: Colors.textOnGold },
  todayText: { fontSize: 10, color: Colors.textOnGold, fontWeight: Typography.bold },

  boostBadge: {
    position: 'absolute', top: Spacing.md, right: Spacing.md,
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: Colors.gold, paddingHorizontal: 6, paddingVertical: 3,
    borderRadius: Radius.full,
  },
  boostText: { fontSize: 9, color: Colors.textOnGold, fontWeight: Typography.black, letterSpacing: 0.5 },

  overlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: Spacing.base, gap: 4,
  },
  title: { fontSize: Typography.md, fontWeight: Typography.bold, color: '#fff', lineHeight: 22 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  meta: { fontSize: Typography.xs, color: 'rgba(255,255,255,0.75)', flex: 1 },
  bottomRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginTop: 2,
  },
  price: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.gold },
  engagementRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  engagementText: { fontSize: Typography.xs, color: Colors.textMuted },

  rsvpRow: {
    flexDirection: 'row', gap: Spacing.sm,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm,
    backgroundColor: Colors.surfaceSecondary,
    borderTopWidth: 1, borderTopColor: Colors.surfaceBorder,
  },
  rsvpBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, paddingVertical: Spacing.sm,
    borderRadius: Radius.md, backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  rsvpBtnGoing: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  rsvpBtnInterested: { backgroundColor: Colors.goldDim, borderColor: Colors.goldDim },
  rsvpBtnText: { fontSize: Typography.xs, color: Colors.textMuted, fontWeight: Typography.semibold },
});
