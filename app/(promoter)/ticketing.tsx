/**
 * Promoter Ticketing Tab — Event-First Architecture
 *
 * The promoter selects ONE event at the top. Every action below operates
 * on that single selected event. Event names are never repeated.
 *
 * Information hierarchy:
 *   1. Event Selector (select / change the active event)
 *   2. Sales Overview (compact stats from server-authoritative summary)
 *   3. Manage Tickets (Setup, Tiers, Dashboard, Attendees)
 *   4. Event Operations (Scanner, Door Sales, Staff)
 *   5. Event Management (Cancellation — separated, consequential)
 *
 * Routes into existing screens — zero business logic duplication.
 * Backend, RPCs, fees, and Stripe remain completely unchanged.
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Modal,
  ActivityIndicator,
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
import { getEventTicketSummary, type EventTicketSummary } from '../../services/ticketingService';
import { getSupabaseClient } from '../../lib/supabase';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function salesStatusLabel(status: string): string {
  const map: Record<string, string> = {
    draft:    'Draft',
    on_sale:  'Active Sales',
    paused:   'Sales Paused',
    ended:    'Sales Ended',
    cancelled:'Cancelled',
  };
  return map[status] ?? status;
}

function salesStatusColor(status: string): string {
  const map: Record<string, string> = {
    draft:    Colors.textMuted,
    on_sale:  Colors.greenLight,
    paused:   Colors.gold,
    ended:    Colors.textMuted,
    cancelled:'#FF5722',
  };
  return map[status] ?? Colors.textMuted;
}

// Pick the best default event: nearest upcoming live event first,
// then any live event, then any event.
function pickDefaultEvent(events: any[]): any | null {
  if (events.length === 0) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const liveUpcoming = events.filter(
    (e) => e.status === 'live' && !isEventPassed(e.date)
  ).sort((a, b) => a.date.localeCompare(b.date));
  if (liveUpcoming.length > 0) return liveUpcoming[0];

  const live = events.filter((e) => e.status === 'live')
    .sort((a, b) => b.date.localeCompare(a.date));
  if (live.length > 0) return live[0];

  return events[0];
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ title }: { title: string }) {
  return (
    <View style={styles.sectionLabel}>
      <View style={styles.sectionBar} />
      <Text style={styles.sectionLabelText}>{title}</Text>
    </View>
  );
}

function ActionRow({
  icon,
  label,
  sub,
  color,
  onPress,
  isLast,
}: {
  icon: string;
  label: string;
  sub?: string;
  color: string;
  onPress: () => void;
  isLast?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionRow,
        !isLast && styles.actionRowDivider,
        pressed && { opacity: 0.75 },
      ]}
    >
      <View style={[styles.actionIcon, { backgroundColor: `${color}18` }]}>
        <MaterialIcons name={icon as any} size={18} color={color} />
      </View>
      <View style={styles.actionText}>
        <Text style={styles.actionLabel}>{label}</Text>
        {sub ? <Text style={styles.actionSub}>{sub}</Text> : null}
      </View>
      <MaterialIcons name="arrow-forward-ios" size={13} color={Colors.textMuted} />
    </Pressable>
  );
}

function StatMini({
  icon,
  value,
  label,
  color,
}: {
  icon: string;
  value: string | number;
  label: string;
  color: string;
}) {
  return (
    <View style={styles.statMini}>
      <MaterialIcons name={icon as any} size={16} color={color} />
      <Text style={[styles.statMiniValue, { color }]}>{value}</Text>
      <Text style={styles.statMiniLabel}>{label}</Text>
    </View>
  );
}

// ─── Event Picker Modal ───────────────────────────────────────────────────────

function EventPickerModal({
  visible,
  events,
  selectedId,
  onSelect,
  onClose,
}: {
  visible: boolean;
  events: any[];
  selectedId: string | null;
  onSelect: (event: any) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={pickerStyles.overlay}>
        <Pressable style={pickerStyles.backdrop} onPress={onClose} />
        <View style={[pickerStyles.sheet, { paddingBottom: Math.max(Spacing.xxl, insets.bottom + Spacing.base) }]}>
          <View style={pickerStyles.handle} />
          <Text style={pickerStyles.title}>Select Event</Text>

          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 420 }}>
            {events.map((evt, i) => {
              const isPast = isEventPassed(evt.date);
              const isSelected = evt.id === selectedId;
              return (
                <Pressable
                  key={evt.id}
                  onPress={() => { onSelect(evt); onClose(); }}
                  style={({ pressed }) => [
                    pickerStyles.eventRow,
                    i > 0 && { borderTopWidth: 1, borderTopColor: Colors.surfaceBorder },
                    isSelected && pickerStyles.eventRowSelected,
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={[pickerStyles.eventName, isPast && { color: Colors.textMuted }]} numberOfLines={1}>
                      {evt.title}
                    </Text>
                    <View style={pickerStyles.eventMeta}>
                      <MaterialIcons name="event" size={11} color={Colors.textMuted} />
                      <Text style={pickerStyles.eventDate}>{formatDate(evt.date)}</Text>
                      {isPast && (
                        <View style={pickerStyles.pastPill}>
                          <Text style={pickerStyles.pastPillText}>Past</Text>
                        </View>
                      )}
                    </View>
                  </View>
                  {isSelected && (
                    <MaterialIcons name="check-circle" size={18} color={Colors.gold} />
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const pickerStyles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    backgroundColor: Colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: Spacing.base, paddingTop: Spacing.md,
    borderTopWidth: 1, borderColor: Colors.surfaceBorder, gap: Spacing.md,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.surfaceBorder, alignSelf: 'center', marginBottom: 4 },
  title: { fontSize: Typography.md, fontWeight: Typography.bold as any, color: Colors.textPrimary, paddingBottom: Spacing.sm },
  eventRow: { paddingVertical: Spacing.md, flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  eventRowSelected: { backgroundColor: Colors.goldSurface, borderRadius: Radius.md, paddingHorizontal: Spacing.sm, marginHorizontal: -Spacing.sm },
  eventName: { fontSize: Typography.base, fontWeight: Typography.semibold as any, color: Colors.textPrimary },
  eventMeta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  eventDate: { fontSize: Typography.xs, color: Colors.textMuted },
  pastPill: {
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.full,
    paddingHorizontal: 6, paddingVertical: 1,
  },
  pastPillText: { fontSize: 9, color: Colors.textMuted, fontWeight: Typography.semibold as any },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function PromoterTicketingTab() {
  const { user } = useAuth();
  const { allEvents } = useEvents();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // All events owned by this promoter
  const myEvents = useMemo(
    () => (user ? allEvents.filter((e) => e.promoterId === user.id) : []),
    [allEvents, user]
  );

  // Default: pick the best event automatically
  const defaultEvent = useMemo(() => pickDefaultEvent(myEvents), [myEvents]);

  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);

  // Sales summary loaded from the RPC
  const [summary, setSummary] = useState<EventTicketSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  // Ticket settings loaded from event_ticket_settings (authoritative source)
  const [ticketSettings, setTicketSettings] = useState<{
    enabled: boolean;
    sales_status: string;
  } | null>(null);

  // Auto-select default event on mount / when events change
  useEffect(() => {
    if (!selectedEvent && defaultEvent) {
      setSelectedEvent(defaultEvent);
    }
  }, [defaultEvent, selectedEvent]);

  // Load summary + ticket settings when selected event changes.
  // event_ticket_settings.enabled is the single authoritative source for
  // "is Vybz Hub ticketing on" — events.selling_tickets_in_app is only
  // event-creation metadata and must NOT be used for operational state.
  const loadEventData = useCallback(async (eventId: string) => {
    setSummary(null);
    setTicketSettings(null);
    setSummaryLoading(true);

    const supabase = getSupabaseClient();
    const [summaryResult, settingsResult] = await Promise.all([
      getEventTicketSummary(eventId),
      supabase
        .from('event_ticket_settings')
        .select('enabled, sales_status')
        .eq('event_id', eventId)
        .maybeSingle(),
    ]);

    if (summaryResult.data) setSummary(summaryResult.data);

    const settings = settingsResult.data as any;
    setTicketSettings({
      enabled: settings?.enabled ?? false,
      sales_status: settings?.sales_status ?? 'draft',
    });

    setSummaryLoading(false);
  }, []);

  useEffect(() => {
    if (selectedEvent?.id) {
      loadEventData(selectedEvent.id);
    }
  }, [selectedEvent, loadEventData]);

  // Reload ticket settings every time this tab comes into focus so that
  // changes made in Ticket Setup are immediately reflected here without
  // requiring a logout, restart, or manual pull-to-refresh.
  useFocusEffect(
    useCallback(() => {
      if (selectedEvent?.id) {
        loadEventData(selectedEvent.id);
      }
    }, [selectedEvent?.id, loadEventData]),
  );

  const handleChangeEvent = (event: any) => {
    setSelectedEvent(event);
  };

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
        <View style={styles.centered}>
          <MaterialIcons name="lock" size={40} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>Ticketing Coming Soon</Text>
          <Text style={styles.emptySub}>In-app ticketing is not yet enabled for your account.</Text>
        </View>
      </View>
    );
  }

  const eid = selectedEvent?.id ?? null;

  // event_ticket_settings.enabled is the authoritative "Vybz Hub ticketing on" flag.
  // A null ticketSettings means no row exists yet → ticketing is off.
  const isVybzHubTicketing = ticketSettings?.enabled === true;
  const isPastEvent = selectedEvent ? isEventPassed(selectedEvent.date) : false;
  const isCancelledEvent = selectedEvent?.status === 'cancelled' ||
    (selectedEvent as any)?.cancellation_status === 'cancellation_approved';

  return (
    <View style={styles.container}>
      {/* ── Header ─────────────────────────────────────────────────── */}
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        <View style={styles.header}>
          <View style={styles.headerIconWrap}>
            <MaterialIcons name="confirmation-number" size={18} color={Colors.gold} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Ticketing</Text>
            <Text style={styles.headerSub}>Manage ticket sales and event operations</Text>
          </View>
        </View>
      </SafeAreaView>

      {/* ── Zero events state ───────────────────────────────────────── */}
      {myEvents.length === 0 ? (
        <View style={styles.centered}>
          <View style={styles.emptyIconWrap}>
            <MaterialIcons name="event-available" size={36} color={Colors.textMuted} />
          </View>
          <Text style={styles.emptyTitle}>No Events Yet</Text>
          <Text style={styles.emptySub}>
            Create an event to start setting up tickets and managing sales.
          </Text>
          <Pressable
            onPress={() => router.push('/(tabs)/post' as any)}
            style={({ pressed }) => [styles.emptyBtn, pressed && { opacity: 0.85 }]}
          >
            <LinearGradient colors={[Colors.gold, Colors.goldDim]} style={styles.emptyBtnInner}>
              <MaterialIcons name="add" size={18} color={Colors.textOnGold} />
              <Text style={styles.emptyBtnText}>Create Event</Text>
            </LinearGradient>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.body,
            { paddingBottom: Math.max(Spacing.xxl * 2, insets.bottom + Spacing.xxl) },
          ]}
        >
          {/* ── 1. Event Selector ──────────────────────────────────── */}
          <View style={styles.eventSelectorCard}>
            <View style={styles.eventSelectorTop}>
              <View style={styles.eventSelectorLabel}>
                <MaterialIcons name="event" size={13} color={Colors.gold} />
                <Text style={styles.eventSelectorLabelText}>SELECTED EVENT</Text>
              </View>
              {myEvents.length > 1 && (
                <Pressable
                  onPress={() => setPickerVisible(true)}
                  style={({ pressed }) => [styles.changeEventBtn, pressed && { opacity: 0.7 }]}
                  hitSlop={8}
                >
                  <Text style={styles.changeEventText}>Change Event</Text>
                  <MaterialIcons name="expand-more" size={16} color={Colors.gold} />
                </Pressable>
              )}
            </View>

            {selectedEvent ? (
              <Pressable
                onPress={myEvents.length > 1 ? () => setPickerVisible(true) : undefined}
                style={({ pressed }) => [
                  styles.selectedEventBody,
                  myEvents.length > 1 && pressed && { opacity: 0.8 },
                ]}
              >
                <View style={{ flex: 1, gap: 6 }}>
                  <Text style={styles.selectedEventTitle} numberOfLines={2}>
                    {selectedEvent.title}
                  </Text>
                  <View style={styles.selectedEventMeta}>
                    <MaterialIcons name="event" size={13} color={Colors.textMuted} />
                    <Text style={styles.selectedEventDate}>{formatDate(selectedEvent.date)}</Text>
                    {selectedEvent.parish ? (
                      <>
                        <Text style={styles.selectedEventDot}>·</Text>
                        <Text style={styles.selectedEventDate} numberOfLines={1}>
                          {selectedEvent.parish}
                        </Text>
                      </>
                    ) : null}
                  </View>
                  {ticketSettings !== null ? (
                    <View style={styles.salesStatusRow}>
                      <View style={[
                        styles.salesStatusDot,
                        { backgroundColor: isVybzHubTicketing
                            ? salesStatusColor(ticketSettings.sales_status)
                            : Colors.textMuted },
                      ]} />
                      <Text style={[
                        styles.salesStatusText,
                        { color: isVybzHubTicketing
                            ? salesStatusColor(ticketSettings.sales_status)
                            : Colors.textMuted },
                      ]}>
                        {isVybzHubTicketing
                          ? salesStatusLabel(ticketSettings.sales_status)
                          : 'Vybz Hub Ticketing Off'}
                      </Text>
                    </View>
                  ) : null}
                </View>
                {isPastEvent && (
                  <View style={styles.pastEventBadge}>
                    <Text style={styles.pastEventBadgeText}>Past</Text>
                  </View>
                )}
                {isCancelledEvent && (
                  <View style={[styles.pastEventBadge, { backgroundColor: 'rgba(255,87,34,0.15)' }]}>
                    <Text style={[styles.pastEventBadgeText, { color: '#FF5722' }]}>Cancelled</Text>
                  </View>
                )}
              </Pressable>
            ) : (
              <ActivityIndicator color={Colors.gold} style={{ marginTop: Spacing.sm }} />
            )}
          </View>

          {/* ── 2. Sales Overview ──────────────────────────────────── */}
          {selectedEvent && (
            <View style={styles.section}>
              <SectionLabel title="Sales Overview" />
              {summaryLoading ? (
                <View style={styles.statsCard}>
                  <ActivityIndicator color={Colors.gold} />
                </View>
              ) : !isVybzHubTicketing ? (
                // CASE A — Vybz Hub ticketing is OFF
                <View style={styles.noTicketingCard}>
                  <MaterialIcons name="info-outline" size={20} color={Colors.textMuted} />
                  <Text style={styles.noTicketingText}>
                    This event is not selling tickets through Vybz Hub. Enable in-app ticket sales in Ticket Setup to manage sales here.
                  </Text>
                  <Pressable
                    onPress={() => eid && router.push(`/ticketing/setup/${eid}` as any)}
                    style={({ pressed }) => [styles.setupTicketsBtn, pressed && { opacity: 0.8 }]}
                  >
                    <MaterialIcons name="tune" size={14} color={Colors.gold} />
                    <Text style={styles.setupTicketsBtnText}>Enable Ticketing</Text>
                  </Pressable>
                </View>
              ) : ticketSettings?.sales_status === 'draft' ? (
                // CASE B — Ticketing ENABLED but Draft
                <View style={styles.noTicketingCard}>
                  <MaterialIcons name="edit" size={22} color={Colors.gold} />
                  <Text style={[styles.noTicketingText, { color: Colors.gold }]}>
                    Ticketing is enabled — sales are in Draft.
                  </Text>
                  <Text style={styles.noTicketingText}>
                    Add ticket tiers and set Sales Status to "On Sale" in Ticket Setup to begin selling.
                  </Text>
                  <Pressable
                    onPress={() => eid && router.push(`/ticketing/setup/${eid}` as any)}
                    style={({ pressed }) => [styles.setupTicketsBtn, pressed && { opacity: 0.8 }]}
                  >
                    <MaterialIcons name="tune" size={14} color={Colors.gold} />
                    <Text style={styles.setupTicketsBtnText}>Complete Setup</Text>
                  </Pressable>
                </View>
              ) : summary ? (
                // CASE C — On Sale / Paused / Ended: show real authoritative stats
                <View style={styles.statsCard}>
                  <StatMini
                    icon="confirmation-number"
                    value={summary.total_tickets}
                    label="Sold"
                    color={Colors.textPrimary}
                  />
                  <View style={styles.statsDivider} />
                  <StatMini
                    icon="check-circle"
                    value={summary.checked_in}
                    label="Checked In"
                    color={Colors.greenLight}
                  />
                  <View style={styles.statsDivider} />
                  <StatMini
                    icon="pending"
                    value={summary.not_checked_in}
                    label="Not In Yet"
                    color={Colors.gold}
                  />
                  <View style={styles.statsDivider} />
                  <StatMini
                    icon="group"
                    value={summary.valid}
                    label="Valid"
                    color={Colors.info}
                  />
                </View>
              ) : (
                // CASE C fallback — ticketing on_sale but no sales yet
                <View style={styles.noTicketingCard}>
                  <MaterialIcons name="bar-chart" size={24} color={Colors.textMuted} />
                  <Text style={styles.noTicketingText}>No ticket sales yet for this event.</Text>
                </View>
              )}
            </View>
          )}

          {/* ── 3. Manage Tickets ──────────────────────────────────── */}
          {selectedEvent && (
            <View style={styles.section}>
              <SectionLabel title="Manage Tickets" />
              <View style={styles.actionsCard}>
                <ActionRow
                  icon="tune"
                  label="Ticket Setup"
                  sub="Enable ticketing, set currency and availability"
                  color={Colors.greenLight}
                  onPress={() => eid && router.push(`/ticketing/setup/${eid}` as any)}
                />
                <ActionRow
                  icon="layers"
                  label="Ticket Tiers"
                  sub="Create and manage ticket types and pricing"
                  color="#42A5F5"
                  onPress={() => eid && router.push(`/ticketing/tiers/${eid}` as any)}
                />
                <ActionRow
                  icon="dashboard"
                  label="Ticket Dashboard"
                  sub="Sales stats, orders, and check-in overview"
                  color={Colors.gold}
                  onPress={() => eid && router.push(`/ticketing/dashboard/${eid}` as any)}
                />
                <ActionRow
                  icon="people"
                  label="Attendees"
                  sub="View ticket holders and check-in status"
                  color="#7E57C2"
                  onPress={() => eid && router.push(`/ticketing/dashboard/${eid}` as any)}
                  isLast
                />
              </View>
            </View>
          )}

          {/* ── 4. Event Operations ────────────────────────────────── */}
          {selectedEvent && !isCancelledEvent && (
            <View style={styles.section}>
              <SectionLabel title="Event Operations" />
              <View style={styles.actionsCard}>
                <ActionRow
                  icon="qr-code-scanner"
                  label="Scan Tickets"
                  sub="Verify and check in attendees at the door"
                  color="#CE93D8"
                  onPress={() => eid && router.push(`/ticketing/scanner/${eid}` as any)}
                />
                <ActionRow
                  icon="point-of-sale"
                  label="Door Sales"
                  sub="Sell cash or card tickets at the venue"
                  color="#FF9800"
                  onPress={() => eid && router.push(`/ticketing/door/${eid}` as any)}
                />
                <ActionRow
                  icon="group"
                  label="Manage Staff"
                  sub="Add scanners, door staff and managers"
                  color="#7E57C2"
                  onPress={() => eid && router.push(`/ticketing/staff/${eid}` as any)}
                  isLast
                />
              </View>
            </View>
          )}

          {/* ── 5. Event Management (Cancellation — bottom, separated) */}
          {selectedEvent && (
            <View style={styles.section}>
              <SectionLabel title="Event Management" />
              <View style={styles.actionsCard}>
                <ActionRow
                  icon="cancel"
                  label="Cancellation & Refunds"
                  sub="Request event cancellation and review refund information"
                  color="#FF5722"
                  onPress={() => eid && router.push(`/ticketing/cancel/${eid}` as any)}
                  isLast
                />
              </View>
              <Text style={styles.cancellationNote}>
                Cancellation requires admin approval. If paid tickets have been sold, refunds are handled automatically.
              </Text>
            </View>
          )}
        </ScrollView>
      )}

      {/* ── Event Picker Modal ──────────────────────────────────────── */}
      <EventPickerModal
        visible={pickerVisible}
        events={myEvents}
        selectedId={selectedEvent?.id ?? null}
        onSelect={handleChangeEvent}
        onClose={() => setPickerVisible(false)}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
  },
  headerIconWrap: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.goldSurface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: `${Colors.gold}44`, flexShrink: 0,
  },
  headerTitle: { fontSize: Typography.lg, fontWeight: Typography.black as any, color: Colors.textPrimary },
  headerSub: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 1 },

  // Empty state
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md, padding: Spacing.xl },
  emptyIconWrap: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  emptyTitle: { fontSize: Typography.lg, fontWeight: Typography.black as any, color: Colors.textPrimary, textAlign: 'center' },
  emptySub: { fontSize: Typography.base, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22, maxWidth: 280 },
  emptyBtn: { borderRadius: Radius.lg, overflow: 'hidden', marginTop: Spacing.sm },
  emptyBtnInner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingVertical: Spacing.base, paddingHorizontal: Spacing.xl,
  },
  emptyBtnText: { fontSize: Typography.md, fontWeight: Typography.bold as any, color: Colors.textOnGold },

  body: { padding: Spacing.base, gap: Spacing.xl },

  // Section label
  sectionLabel: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  sectionBar: { width: 3, height: 14, borderRadius: 2, backgroundColor: Colors.gold },
  sectionLabelText: {
    fontSize: Typography.xs, fontWeight: Typography.bold as any,
    color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1,
  },
  section: { gap: Spacing.sm },

  // Event selector card
  eventSelectorCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    borderWidth: 1.5, borderColor: `${Colors.gold}44`,
    padding: Spacing.base, gap: Spacing.sm,
    overflow: 'hidden',
  },
  eventSelectorTop: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  eventSelectorLabel: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  eventSelectorLabelText: {
    fontSize: 10, fontWeight: Typography.bold as any,
    color: Colors.gold, letterSpacing: 1.2,
  },
  changeEventBtn: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  changeEventText: { fontSize: Typography.xs, color: Colors.gold, fontWeight: Typography.semibold as any },

  selectedEventBody: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  selectedEventTitle: {
    fontSize: Typography.md, fontWeight: Typography.black as any, color: Colors.textPrimary, lineHeight: 24,
  },
  selectedEventMeta: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  selectedEventDate: { fontSize: Typography.xs, color: Colors.textMuted },
  selectedEventDot: { fontSize: Typography.xs, color: Colors.textMuted },

  salesStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  salesStatusDot: { width: 6, height: 6, borderRadius: 3 },
  salesStatusText: { fontSize: Typography.xs, fontWeight: Typography.semibold as any },

  pastEventBadge: {
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md,
    paddingHorizontal: Spacing.sm, paddingVertical: 4,
    alignSelf: 'flex-start', flexShrink: 0,
  },
  pastEventBadgeText: { fontSize: Typography.xs, color: Colors.textMuted, fontWeight: Typography.semibold as any },

  // Stats row
  statsCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.surfaceBorder, overflow: 'hidden',
  },
  statMini: {
    flex: 1, alignItems: 'center', gap: 4,
    paddingVertical: Spacing.base, paddingHorizontal: Spacing.xs,
  },
  statMiniValue: { fontSize: Typography.lg, fontWeight: Typography.black as any },
  statMiniLabel: { fontSize: 9, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, textAlign: 'center' },
  statsDivider: { width: 1, height: 40, backgroundColor: Colors.surfaceBorder },

  // No ticketing state
  noTicketingCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
    padding: Spacing.lg, alignItems: 'center', gap: Spacing.md,
  },
  noTicketingText: {
    fontSize: Typography.sm, color: Colors.textSecondary,
    textAlign: 'center', lineHeight: 20, maxWidth: 280,
  },
  setupTicketsBtn: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.xs,
    backgroundColor: Colors.goldSurface, borderRadius: Radius.full,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm,
    borderWidth: 1, borderColor: `${Colors.gold}44`,
  },
  setupTicketsBtnText: { fontSize: Typography.sm, color: Colors.gold, fontWeight: Typography.semibold as any },

  // Actions card
  actionsCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.surfaceBorder, overflow: 'hidden',
  },
  actionRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.base,
  },
  actionRowDivider: { borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder },
  actionIcon: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  actionText: { flex: 1 },
  actionLabel: { fontSize: Typography.sm, fontWeight: Typography.semibold as any, color: Colors.textPrimary },
  actionSub: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2, lineHeight: 17 },

  // Cancellation note
  cancellationNote: {
    fontSize: Typography.xs, color: Colors.textMuted,
    lineHeight: 18, paddingHorizontal: Spacing.xs,
  },
});
