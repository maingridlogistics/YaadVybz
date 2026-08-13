/**
 * Promoter Ticketing Tab
 * Organizes ticket management tools: setup, dashboard, staff, scanner, door sales.
 * Routes into existing ticketing screens — no logic duplication.
 */

import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { useEvents } from '../../hooks/useEvents';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import { formatDate, isEventPassed } from '../../constants/data';
import { TICKETING_ENABLED } from '../../constants/featureFlags';

function SectionHeader({ icon, title }: { icon: string; title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionIconBg}>
        <MaterialIcons name={icon as any} size={13} color={Colors.gold} />
      </View>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

function ActionRow({
  icon,
  label,
  sub,
  color,
  onPress,
  disabled,
  badge,
}: {
  icon: string;
  label: string;
  sub?: string;
  color: string;
  onPress: () => void;
  disabled?: boolean;
  badge?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.actionRow,
        disabled && { opacity: 0.38 },
        pressed && { opacity: 0.8 },
      ]}
    >
      <View style={[styles.actionIconBg, { backgroundColor: `${color}18` }]}>
        <MaterialIcons name={icon as any} size={18} color={color} />
      </View>
      <View style={styles.actionText}>
        <Text style={styles.actionLabel}>{label}</Text>
        {sub ? <Text style={styles.actionSub}>{sub}</Text> : null}
      </View>
      {badge ? (
        <View style={[styles.badge, { backgroundColor: `${color}22`, borderColor: `${color}55` }]}>
          <Text style={[styles.badgeText, { color }]}>{badge}</Text>
        </View>
      ) : null}
      <MaterialIcons name="arrow-forward-ios" size={13} color={Colors.textMuted} />
    </Pressable>
  );
}

function EventSelector({
  label,
  icon,
  color,
  events,
  onSelect,
}: {
  label: string;
  icon: string;
  color: string;
  events: any[];
  onSelect: (eventId: string) => void;
}) {
  if (events.length === 0) return null;
  if (events.length === 1) {
    return (
      <Pressable
        onPress={() => onSelect(events[0].id)}
        style={({ pressed }) => [styles.eventSelectorRow, pressed && { opacity: 0.85 }]}
      >
        <View style={[styles.actionIconBg, { backgroundColor: `${color}18` }]}>
          <MaterialIcons name={icon as any} size={18} color={color} />
        </View>
        <View style={styles.actionText}>
          <Text style={styles.actionLabel}>{label}</Text>
          <Text style={styles.actionSub} numberOfLines={1}>{events[0].title} · {formatDate(events[0].date)}</Text>
        </View>
        <MaterialIcons name="arrow-forward-ios" size={13} color={Colors.textMuted} />
      </Pressable>
    );
  }
  return (
    <View style={styles.multiEventWrap}>
      <View style={styles.multiEventHeader}>
        <View style={[styles.actionIconBg, { backgroundColor: `${color}18` }]}>
          <MaterialIcons name={icon as any} size={18} color={color} />
        </View>
        <Text style={styles.actionLabel}>{label}</Text>
      </View>
      {events.slice(0, 4).map((evt) => (
        <Pressable
          key={evt.id}
          onPress={() => onSelect(evt.id)}
          style={({ pressed }) => [styles.multiEventItem, pressed && { opacity: 0.85 }]}
        >
          <View style={styles.multiEventDot} />
          <Text style={styles.multiEventTitle} numberOfLines={1}>{evt.title}</Text>
          <Text style={styles.multiEventDate}>{formatDate(evt.date)}</Text>
          <MaterialIcons name="arrow-forward-ios" size={11} color={Colors.textMuted} />
        </Pressable>
      ))}
    </View>
  );
}

export default function PromoterTicketingTab() {
  const { user } = useAuth();
  const { allEvents } = useEvents();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const myEvents = useMemo(
    () => (user ? allEvents.filter((e) => e.promoterId === user.id) : []),
    [allEvents, user]
  );

  const liveEvents = useMemo(
    () => myEvents.filter((e) => e.status === 'live' && !isEventPassed(e.date)),
    [myEvents]
  );

  const ticketingEvents = useMemo(
    () => myEvents.filter((e) => e.status === 'live' || e.status === 'pending'),
    [myEvents]
  );

  if (!TICKETING_ENABLED) {
    return (
      <View style={styles.container}>
        <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
          <View style={styles.header}>
            <View style={styles.headerIconWrap}>
              <MaterialIcons name="confirmation-number" size={18} color={Colors.gold} />
            </View>
            <Text style={styles.headerTitle}>Ticketing</Text>
          </View>
        </SafeAreaView>
        <View style={styles.disabledWrap}>
          <MaterialIcons name="lock" size={40} color={Colors.textMuted} />
          <Text style={styles.disabledTitle}>Ticketing Coming Soon</Text>
          <Text style={styles.disabledSub}>In-app ticketing is not yet enabled for your account.</Text>
        </View>
      </View>
    );
  }

  const noLiveEventsAlert = (feature: string) =>
    Alert.alert(`No Live Events`, `You need a live event to use ${feature}.`);

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        <View style={styles.header}>
          <View style={styles.headerIconWrap}>
            <MaterialIcons name="confirmation-number" size={18} color={Colors.gold} />
          </View>
          <View>
            <Text style={styles.headerTitle}>Ticketing</Text>
            <Text style={styles.headerSub}>{liveEvents.length} live event{liveEvents.length !== 1 ? 's' : ''}</Text>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + Spacing.xxl * 2 }]}
      >
        {liveEvents.length === 0 && (
          <Pressable
            onPress={() => router.push('/(tabs)/post' as any)}
            style={({ pressed }) => [styles.noLiveCard, pressed && { opacity: 0.85 }]}
          >
            <LinearGradient colors={[Colors.goldSurface, Colors.surface]} style={StyleSheet.absoluteFillObject} />
            <MaterialIcons name="add-circle-outline" size={28} color={Colors.gold} />
            <View style={{ flex: 1 }}>
              <Text style={styles.noLiveTitle}>No live events</Text>
              <Text style={styles.noLiveSub}>Create and publish an event to access ticketing tools</Text>
            </View>
            <MaterialIcons name="arrow-forward-ios" size={14} color={Colors.gold} />
          </Pressable>
        )}

        {/* Setup & Configuration */}
        <View style={styles.section}>
          <SectionHeader icon="settings" title="Setup & Configuration" />
          {liveEvents.length <= 1 ? (
            <ActionRow
              icon="tune"
              label="Ticket Setup"
              sub="Enable ticketing, set currency"
              color={Colors.greenLight}
              onPress={() => {
                if (liveEvents.length === 0) { noLiveEventsAlert('ticket setup'); return; }
                router.push(`/ticketing/setup/${liveEvents[0].id}` as any);
              }}
              disabled={liveEvents.length === 0}
            />
          ) : (
            <EventSelector
              label="Ticket Setup"
              icon="tune"
              color={Colors.greenLight}
              events={liveEvents}
              onSelect={(id) => router.push(`/ticketing/setup/${id}` as any)}
            />
          )}
          {liveEvents.length <= 1 ? (
            <ActionRow
              icon="layers"
              label="Ticket Tiers"
              sub="Create and manage ticket types"
              color="#42A5F5"
              onPress={() => {
                if (liveEvents.length === 0) { noLiveEventsAlert('ticket tiers'); return; }
                router.push(`/ticketing/tiers/${liveEvents[0].id}` as any);
              }}
              disabled={liveEvents.length === 0}
            />
          ) : (
            <EventSelector
              label="Ticket Tiers"
              icon="layers"
              color="#42A5F5"
              events={liveEvents}
              onSelect={(id) => router.push(`/ticketing/tiers/${id}` as any)}
            />
          )}
        </View>

        {/* Operations */}
        <View style={styles.section}>
          <SectionHeader icon="bar-chart" title="Operations & Dashboard" />
          {ticketingEvents.length <= 1 ? (
            <ActionRow
              icon="dashboard"
              label="Ticket Dashboard"
              sub="Sales, attendees, check-in stats"
              color={Colors.gold}
              onPress={() => {
                if (ticketingEvents.length === 0) { noLiveEventsAlert('ticket dashboard'); return; }
                router.push(`/ticketing/dashboard/${ticketingEvents[0].id}` as any);
              }}
              disabled={ticketingEvents.length === 0}
            />
          ) : (
            <EventSelector
              label="Ticket Dashboard"
              icon="dashboard"
              color={Colors.gold}
              events={ticketingEvents}
              onSelect={(id) => router.push(`/ticketing/dashboard/${id}` as any)}
            />
          )}
          {liveEvents.length <= 1 ? (
            <ActionRow
              icon="group"
              label="Manage Staff"
              sub="Scanners, door staff, managers"
              color="#7E57C2"
              onPress={() => {
                if (liveEvents.length === 0) { noLiveEventsAlert('staff management'); return; }
                router.push(`/ticketing/staff/${liveEvents[0].id}` as any);
              }}
              disabled={liveEvents.length === 0}
            />
          ) : (
            <EventSelector
              label="Manage Staff"
              icon="group"
              color="#7E57C2"
              events={liveEvents}
              onSelect={(id) => router.push(`/ticketing/staff/${id}` as any)}
            />
          )}
        </View>

        {/* At the Door */}
        <View style={styles.section}>
          <SectionHeader icon="meeting-room" title="At the Door" />
          {liveEvents.length <= 1 ? (
            <ActionRow
              icon="qr-code-scanner"
              label="Scan Tickets"
              sub="Verify and check in attendees"
              color="#CE93D8"
              onPress={() => {
                if (liveEvents.length === 0) { noLiveEventsAlert('scanner'); return; }
                router.push(`/ticketing/scanner/${liveEvents[0].id}` as any);
              }}
              disabled={liveEvents.length === 0}
            />
          ) : (
            <EventSelector
              label="Scan Tickets"
              icon="qr-code-scanner"
              color="#CE93D8"
              events={liveEvents}
              onSelect={(id) => router.push(`/ticketing/scanner/${id}` as any)}
            />
          )}
          {liveEvents.length <= 1 ? (
            <ActionRow
              icon="point-of-sale"
              label="Door Sales"
              sub="Sell cash or card tickets on the door"
              color="#FF9800"
              onPress={() => {
                if (liveEvents.length === 0) { noLiveEventsAlert('door sales'); return; }
                router.push(`/ticketing/door/${liveEvents[0].id}` as any);
              }}
              disabled={liveEvents.length === 0}
            />
          ) : (
            <EventSelector
              label="Door Sales"
              icon="point-of-sale"
              color="#FF9800"
              events={liveEvents}
              onSelect={(id) => router.push(`/ticketing/door/${id}` as any)}
            />
          )}
        </View>

        {/* Cancellations */}
        <View style={styles.section}>
          <SectionHeader icon="cancel" title="Cancellations" />
          {ticketingEvents.length <= 1 ? (
            <ActionRow
              icon="cancel"
              label="Cancel Event"
              sub="Submit or track cancellation requests"
              color="#FF5722"
              onPress={() => {
                if (ticketingEvents.length === 0) { Alert.alert('No Events', 'No events available to cancel.'); return; }
                router.push(`/ticketing/cancel/${ticketingEvents[0].id}` as any);
              }}
              disabled={ticketingEvents.length === 0}
            />
          ) : (
            <EventSelector
              label="Cancel Event"
              icon="cancel"
              color="#FF5722"
              events={ticketingEvents}
              onSelect={(id) => router.push(`/ticketing/cancel/${id}` as any)}
            />
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
  },
  headerIconWrap: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.goldSurface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: `${Colors.gold}44`,
  },
  headerTitle: { fontSize: Typography.lg, fontWeight: Typography.black as any, color: Colors.textPrimary },
  headerSub: { fontSize: Typography.xs, color: Colors.textMuted },
  body: { padding: Spacing.base, gap: Spacing.lg },
  disabledWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md, padding: Spacing.xl },
  disabledTitle: { fontSize: Typography.lg, fontWeight: Typography.bold as any, color: Colors.textSecondary },
  disabledSub: { fontSize: Typography.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 22 },
  noLiveCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    borderRadius: Radius.xl, padding: Spacing.base,
    borderWidth: 1.5, borderColor: `${Colors.gold}33`,
    overflow: 'hidden', position: 'relative',
  },
  noLiveTitle: { fontSize: Typography.base, fontWeight: Typography.bold as any, color: Colors.textSecondary },
  noLiveSub: { fontSize: Typography.xs, color: Colors.textMuted, lineHeight: 18 },
  section: { gap: Spacing.sm },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  sectionIconBg: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: Colors.goldSurface, alignItems: 'center', justifyContent: 'center',
  },
  sectionTitle: { fontSize: Typography.sm, fontWeight: Typography.bold as any, color: Colors.textPrimary },
  actionRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
    padding: Spacing.md,
  },
  actionIconBg: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  actionText: { flex: 1 },
  actionLabel: { fontSize: Typography.sm, fontWeight: Typography.semibold as any, color: Colors.textPrimary },
  actionSub: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 1 },
  badge: {
    paddingHorizontal: Spacing.sm, paddingVertical: 3,
    borderRadius: Radius.full, borderWidth: 1, flexShrink: 0,
  },
  badgeText: { fontSize: Typography.xs, fontWeight: Typography.bold as any },
  eventSelectorRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
    padding: Spacing.md,
  },
  multiEventWrap: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.surfaceBorder, overflow: 'hidden',
  },
  multiEventHeader: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
  },
  multiEventItem: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingVertical: Spacing.sm, paddingHorizontal: Spacing.base,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
  },
  multiEventDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.gold, flexShrink: 0 },
  multiEventTitle: { flex: 1, fontSize: Typography.sm, color: Colors.textSecondary },
  multiEventDate: { fontSize: Typography.xs, color: Colors.textMuted },
});
