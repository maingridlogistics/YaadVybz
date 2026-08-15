/**
 * Promoter Event Picker
 *
 * Shared "Choose an Event" screen for ALL event-dependent promoter actions.
 *
 * Usage:
 *   router.push('/promoter-event-picker?action=scanner')
 *   router.push('/promoter-event-picker?action=tiers')
 *
 * Supported action values → destination route template:
 *   scanner   → /ticketing/scanner/[eventId]
 *   attendees → /ticketing/dashboard/[eventId]
 *   staff     → /ticketing/staff/[eventId]
 *   setup     → /ticketing/setup/[eventId]
 *   tiers     → /ticketing/tiers/[eventId]
 *   dashboard → /ticketing/dashboard/[eventId]
 *   boost     → /monetization/boost/[eventId]
 *   finance   → /ticketing/finance/[eventId]
 *   cancel    → /ticketing/cancel/[eventId]
 *
 * Behavior:
 *   0 eligible events → empty state with "Create Event" CTA
 *   1 eligible event  → skips selection, navigates directly (handled by Profile
 *                        smartNav before this screen is even opened)
 *   2+ eligible events → shows this picker
 *
 * Back navigation: always goes back to Profile (replaces /profile in stack).
 */

import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../hooks/useAuth';
import { useEvents } from '../hooks/useEvents';
import { Colors, Typography, Spacing, Radius } from '../constants/theme';
import { formatDate } from '../constants/data';
import { getCardUrl } from '../lib/storage';

// ─── Action → Destination mapping ────────────────────────────────────────────

type PromoterAction =
  | 'scanner'
  | 'attendees'
  | 'staff'
  | 'setup'
  | 'tiers'
  | 'dashboard'
  | 'boost'
  | 'boost-performance'
  | 'finance'
  | 'refunds'
  | 'disputes'
  | 'cancel';

const ACTION_CONFIG: Record<
  PromoterAction,
  {
    label: string;
    subtitle: string;
    icon: string;
    iconColor: string;
    route: (eventId: string) => string;
    /** If true, only show live events. If false, show all non-archived. */
    liveOnly?: boolean;
  }
> = {
  scanner: {
    label: 'Ticket Scanner',
    subtitle: 'Choose the event you want to scan tickets for.',
    icon: 'qr-code-scanner',
    iconColor: '#FF9800',
    route: (id) => `/ticketing/scanner/${id}`,
    liveOnly: true,
  },
  attendees: {
    label: 'Attendees',
    subtitle: 'Choose the event you want to manage attendees for.',
    icon: 'people',
    iconColor: '#7E57C2',
    route: (id) => `/ticketing/attendees/${id}`,
    liveOnly: true,
  },
  staff: {
    label: 'Event Staff',
    subtitle: 'Choose the event you want to manage staff for.',
    icon: 'groups',
    iconColor: '#CE93D8',
    route: (id) => `/ticketing/staff/${id}`,
    liveOnly: true,
  },
  setup: {
    label: 'Ticket Setup',
    subtitle: 'Choose the event you want to configure ticketing for.',
    icon: 'tune',
    iconColor: '#9C27B0',
    route: (id) => `/ticketing/setup/${id}`,
    liveOnly: true,
  },
  tiers: {
    label: 'Ticket Tiers',
    subtitle: 'Choose the event you want to manage ticket tiers for.',
    icon: 'layers',
    iconColor: '#42A5F5',
    route: (id) => `/ticketing/tiers/${id}`,
    liveOnly: true,
  },
  dashboard: {
    label: 'Ticket Dashboard',
    subtitle: 'Choose the event you want to view the ticket dashboard for.',
    icon: 'dashboard',
    iconColor: '#26C6DA',
    route: (id) => `/ticketing/dashboard/${id}`,
    liveOnly: true,
  },
  boost: {
    label: 'Boost Event',
    subtitle: 'Choose the event you want to boost.',
    icon: 'rocket-launch',
    iconColor: '#FF6B35',
    route: (id) => `/monetization/boost/${id}`,
    liveOnly: true,
  },
  'boost-performance': {
    label: 'Boost Performance',
    subtitle: 'Choose a boosted event to view its performance.',
    icon: 'bar-chart',
    iconColor: '#FF6B35',
    route: (id) => `/monetization/boost-performance/${id}`,
    liveOnly: false,
  },
  finance: {
    label: 'Event Finance',
    subtitle: 'Choose the event to view finance and payout details for.',
    icon: 'account-balance-wallet',
    iconColor: Colors.gold,
    route: (id) => `/ticketing/finance/${id}`,
    liveOnly: false,
  },
  refunds: {
    label: 'Refunds',
    subtitle: 'Choose the event to view refund information for.',
    icon: 'undo',
    iconColor: '#EF5350',
    route: (id) => `/ticketing/finance/${id}?section=refunds`,
    liveOnly: false,
  },
  disputes: {
    label: 'Disputes',
    subtitle: 'Choose the event to view payment disputes for.',
    icon: 'gavel',
    iconColor: '#FF5722',
    route: (id) => `/ticketing/finance/${id}?section=disputes`,
    liveOnly: false,
  },
  cancel: {
    label: 'Cancel Event',
    subtitle: 'Choose the event you want to request a cancellation for.',
    icon: 'cancel',
    iconColor: '#EF5350',
    route: (id) => `/ticketing/cancel/${id}`,
    liveOnly: true,
  },
};

// ─── Event Row ─────────────────────────────────────────────────────────────────

function EventRow({
  event,
  onPress,
}: {
  event: any;
  onPress: () => void;
}) {
  const coverUrl = event.coverImage ? getCardUrl(event.coverImage) : null;
  const statusColors: Record<string, string> = {
    live: Colors.greenLight,
    pending: '#FFD54F',
    flagged: '#FF9800',
    rejected: '#FF5252',
  };
  const sc = statusColors[event.status] ?? Colors.textMuted;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.eventRow, pressed && { opacity: 0.78 }]}
    >
      {/* Thumbnail */}
      {coverUrl ? (
        <Image
          source={{ uri: coverUrl }}
          style={s.thumb}
          contentFit="cover"
          transition={200}
        />
      ) : (
        <View style={[s.thumb, s.thumbFallback]}>
          <MaterialIcons name="event" size={22} color={Colors.textMuted} />
        </View>
      )}

      {/* Info */}
      <View style={s.eventInfo}>
        <Text style={s.eventTitle} numberOfLines={2}>{event.title}</Text>
        <View style={s.eventMeta}>
          <MaterialIcons name="event" size={12} color={Colors.textMuted} />
          <Text style={s.eventMetaText}>{formatDate(event.date)}</Text>
          {event.startTime ? (
            <Text style={s.eventMetaText}>{event.startTime}</Text>
          ) : null}
        </View>
        <View style={s.eventMeta}>
          <MaterialIcons name="place" size={12} color={Colors.textMuted} />
          <Text style={s.eventMetaText} numberOfLines={1}>
            {event.parish}{event.venue ? ` · ${event.venue}` : ''}
          </Text>
        </View>
      </View>

      {/* Status badge + chevron */}
      <View style={s.eventRight}>
        <View style={[s.statusDot, { backgroundColor: sc }]} />
        <MaterialIcons name="chevron-right" size={20} color={Colors.textMuted} />
      </View>
    </Pressable>
  );
}

// ─── Main Screen ───────────────────────────────────────────────────────────────

export default function PromoterEventPickerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { getUserPostedEvents } = useEvents();
  const { action } = useLocalSearchParams<{ action?: string }>();

  const config = ACTION_CONFIG[action as PromoterAction] ?? ACTION_CONFIG.dashboard;

  const postedEvents = useMemo(
    () => (user ? getUserPostedEvents(user.id) : []),
    [user, getUserPostedEvents]
  );

  // Filter: live-only actions only show live events; boost-performance shows only boosted events; others show all non-archived
  const eligibleEvents = useMemo(() => {
    if (action === 'boost-performance') {
      return postedEvents
        .filter((e) => (e as any).boosted === true)
        .sort((a, b) => a.date.localeCompare(b.date));
    }
    if (config.liveOnly) {
      return postedEvents
        .filter((e) => e.status === 'live')
        .sort((a, b) => a.date.localeCompare(b.date));
    }
    return postedEvents
      .filter((e) => e.status !== 'archived')
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [postedEvents, config.liveOnly]);

  const handleSelect = (eventId: string) => {
    router.push(config.route(eventId) as any);
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/profile' as any);
    }
  };

  return (
    <View style={s.container}>
      {/* ── Header ────────────────────────────────────────────────────── */}
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        <View style={s.header}>
          <Pressable
            onPress={handleBack}
            style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.7 }]}
            hitSlop={8}
          >
            <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
          </Pressable>
          <View style={[s.headerIconWrap, { backgroundColor: `${config.iconColor}18` }]}>
            <MaterialIcons name={config.icon as any} size={18} color={config.iconColor} />
          </View>
          <View style={s.headerText}>
            <Text style={s.headerTitle}>Choose an Event</Text>
            <Text style={s.headerSub}>{config.label}</Text>
          </View>
        </View>
      </SafeAreaView>

      {/* ── Content ───────────────────────────────────────────────────── */}
      {eligibleEvents.length === 0 ? (
        /* ── Empty state ──────────────────────────────────────────────── */
        <View style={s.empty}>
          <View style={s.emptyIconWrap}>
            <MaterialIcons name={config.icon as any} size={36} color={Colors.textMuted} />
          </View>
          <Text style={s.emptyTitle}>No eligible events</Text>
          <Text style={s.emptySub}>
            {action === 'boost-performance'
              ? 'You have no currently or previously boosted events. Boost an event first to view its performance data.'
              : config.liveOnly
              ? `You need at least one live event to use ${config.label}. Create and publish an event first.`
              : `You have no events yet. Create and publish an event to use ${config.label}.`}
          </Text>
          <Pressable
            onPress={() => router.push('/(tabs)/post' as any)}
            style={({ pressed }) => [s.createBtn, pressed && { opacity: 0.85 }]}
          >
            <LinearGradient
              colors={[Colors.gold, Colors.goldDim]}
              style={s.createBtnInner}
            >
              <MaterialIcons name="add" size={18} color={Colors.textOnGold} />
              <Text style={s.createBtnText}>Create an Event</Text>
            </LinearGradient>
          </Pressable>
          <Pressable onPress={handleBack} style={s.backLink} hitSlop={8}>
            <Text style={s.backLinkText}>← Back to Profile</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            s.list,
            { paddingBottom: Math.max(Spacing.xxl * 2, insets.bottom + Spacing.xxl) },
          ]}
        >
          {/* Subtitle */}
          <Text style={s.subtitle}>{config.subtitle}</Text>

          {/* Event list */}
          <View style={s.eventsCard}>
            {eligibleEvents.map((event, index) => (
              <React.Fragment key={event.id}>
                <EventRow
                  event={event}
                  onPress={() => handleSelect(event.id)}
                />
                {index < eligibleEvents.length - 1 && (
                  <View style={s.divider} />
                )}
              </React.Fragment>
            ))}
          </View>

          {/* Count summary */}
          <Text style={s.countNote}>
            {eligibleEvents.length} event{eligibleEvents.length !== 1 ? 's' : ''} available
            {config.liveOnly ? ' · Live events only' : ''}
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

// ─── Styles — Dark Theme ───────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  headerIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  headerText: { flex: 1 },
  headerTitle: {
    fontSize: Typography.lg,
    fontWeight: Typography.black,
    color: Colors.textPrimary,
  },
  headerSub: {
    fontSize: Typography.xs,
    color: Colors.textMuted,
    marginTop: 1,
  },

  list: {
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.base,
    gap: Spacing.md,
  },

  subtitle: {
    fontSize: Typography.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },

  eventsCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    overflow: 'hidden',
  },

  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.base,
    minHeight: 72,
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: Radius.md,
    flexShrink: 0,
  },
  thumbFallback: {
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventInfo: { flex: 1, gap: 3 },
  eventTitle: {
    fontSize: Typography.base,
    fontWeight: Typography.bold,
    color: Colors.textPrimary,
    lineHeight: 22,
  },
  eventMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  eventMetaText: {
    fontSize: Typography.xs,
    color: Colors.textMuted,
  },
  eventRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    flexShrink: 0,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },

  divider: {
    height: 1,
    backgroundColor: Colors.surfaceBorder,
    marginHorizontal: Spacing.base,
  },

  countNote: {
    fontSize: Typography.xs,
    color: Colors.textMuted,
    textAlign: 'center',
  },

  // Empty state
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    gap: Spacing.base,
  },
  emptyIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  emptyTitle: {
    fontSize: Typography.lg,
    fontWeight: Typography.black,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  emptySub: {
    fontSize: Typography.base,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 300,
  },
  createBtn: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
    marginTop: Spacing.xs,
    alignSelf: 'stretch',
  },
  createBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.base,
  },
  createBtnText: {
    fontSize: Typography.md,
    fontWeight: Typography.bold,
    color: Colors.textOnGold,
  },
  backLink: { marginTop: Spacing.xs },
  backLinkText: {
    fontSize: Typography.sm,
    color: Colors.textMuted,
    textDecorationLine: 'underline',
  },
});
