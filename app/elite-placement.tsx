// ─── Elite Homepage Placement Manager ────────────────────────────────────────
// Elite-only screen to select, switch, or remove a Homepage Placement.
// One selection: an owned live Event OR an owned live Business (not both).
//
// Product Rules (from roadmap):
//   - Elite subscription + active period required (server-authoritative)
//   - Only live, owned, non-past Events qualify
//   - Only live, owned Businesses qualify
//   - Switching target works (replaces previous)
//   - Remove works (clears both columns)
//   - Pro denied server-side via set_elite_placement() RPC
//   - Free denied server-side via set_elite_placement() RPC
//   - Expired/revoked Elite denied server-side
//   - Does NOT consume Boost credits
//   - Does NOT label target as "Boosted"
//   - Does NOT touch events.featured (editorial feature separate)
//   - Business Verification untouched
//
// Server Authority: set_elite_placement() SECURITY DEFINER RPC validates:
//   a) authenticated + elite tier
//   b) active subscription period
//   c) ownership of target
//   d) target is live + not past
//
// Route: /elite-placement

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  Platform,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { useAuth } from '../hooks/useAuth';
import { getSupabaseClient } from '../lib/supabase';
import { Colors, Typography, Spacing, Radius } from '../constants/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

interface OwnedEvent {
  id: string;
  title: string;
  date: string;
  venue: string;
  parish: string;
  cover_image: string;
  ticket_price: string;
  going_count: number;
  status: string;
}

interface OwnedBusiness {
  id: string;
  name: string;
  primary_parish: string;
  town: string;
  logo_url: string | null;
  cover_url: string | null;
  status: string;
  category_label: string;
  category_icon: string;
  category_color: string;
  verified: boolean;
}

interface CurrentPlacement {
  type: 'event' | 'business' | null;
  target_id: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isEventUpcoming(dateStr: string): boolean {
  // Matches isEventPassed() semantics: date + 36 hours
  const [y, m, d] = dateStr.split('-').map(Number);
  const eventMs = Date.UTC(y, m - 1, d) + 36 * 60 * 60 * 1000;
  return eventMs > Date.now();
}

// ─── Event Selection Card ─────────────────────────────────────────────────────
function EventSelectionCard({
  event,
  isSelected,
  onSelect,
}: {
  event: OwnedEvent;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const isFree = event.ticket_price === 'Free' || !event.ticket_price;
  return (
    <Pressable
      onPress={onSelect}
      style={({ pressed }) => [
        card.wrap,
        isSelected && card.wrapSelected,
        pressed && { opacity: 0.85 },
      ]}
    >
      <View style={card.imgWrap}>
        {event.cover_image ? (
          <Image source={{ uri: event.cover_image }} style={card.img} contentFit="cover" transition={200} />
        ) : (
          <View style={[card.img, card.imgPlaceholder]}>
            <MaterialIcons name="event" size={28} color={Colors.textMuted} />
          </View>
        )}
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.65)']} style={StyleSheet.absoluteFillObject} />
        {isSelected && (
          <View style={card.selectedOverlay}>
            <View style={card.selectedCheck}>
              <MaterialIcons name="check" size={18} color="#fff" />
            </View>
          </View>
        )}
      </View>
      <View style={card.info}>
        <Text style={card.title} numberOfLines={2}>{event.title}</Text>
        <View style={card.metaRow}>
          <MaterialIcons name="event" size={11} color={Colors.gold} />
          <Text style={card.meta}>{event.date}</Text>
        </View>
        <View style={card.metaRow}>
          <MaterialIcons name="place" size={11} color={Colors.textMuted} />
          <Text style={card.meta} numberOfLines={1}>{event.venue}, {event.parish}</Text>
        </View>
        <View style={card.bottomRow}>
          <Text style={[card.price, isFree && card.priceFree]}>{isFree ? 'Free' : event.ticket_price}</Text>
          <View style={card.goingRow}>
            <MaterialIcons name="people" size={10} color={Colors.textMuted} />
            <Text style={card.goingText}>{event.going_count}</Text>
          </View>
        </View>
      </View>
      {isSelected && (
        <View style={card.selectedBadge}>
          <MaterialIcons name="star" size={10} color={Colors.textOnGold} />
          <Text style={card.selectedBadgeText}>Placed</Text>
        </View>
      )}
    </Pressable>
  );
}

// ─── Business Selection Card ──────────────────────────────────────────────────
function BusinessSelectionCard({
  biz,
  isSelected,
  onSelect,
}: {
  biz: OwnedBusiness;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <Pressable
      onPress={onSelect}
      style={({ pressed }) => [
        card.wrap,
        isSelected && card.wrapSelected,
        pressed && { opacity: 0.85 },
      ]}
    >
      <View style={card.imgWrap}>
        {biz.cover_url ?? biz.logo_url ? (
          <Image source={{ uri: (biz.cover_url ?? biz.logo_url)! }} style={card.img} contentFit="cover" transition={200} />
        ) : (
          <View style={[card.img, card.imgPlaceholder]}>
            <MaterialIcons name={biz.category_icon as any} size={32} color={biz.category_color} />
          </View>
        )}
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.65)']} style={StyleSheet.absoluteFillObject} />
        {isSelected && (
          <View style={card.selectedOverlay}>
            <View style={card.selectedCheck}>
              <MaterialIcons name="check" size={18} color="#fff" />
            </View>
          </View>
        )}
        {biz.verified && (
          <View style={card.verifiedBadgeImg}>
            <MaterialIcons name="verified" size={14} color={Colors.gold} />
          </View>
        )}
      </View>
      <View style={card.info}>
        <Text style={card.title} numberOfLines={1}>{biz.name}</Text>
        <Text style={[card.meta, { color: biz.category_color, fontWeight: Typography.semibold }]} numberOfLines={1}>
          {biz.category_label}
        </Text>
        <View style={card.metaRow}>
          <MaterialIcons name="place" size={11} color={Colors.textMuted} />
          <Text style={card.meta} numberOfLines={1}>{biz.town ? `${biz.town}, ` : ''}{biz.primary_parish}</Text>
        </View>
      </View>
      {isSelected && (
        <View style={card.selectedBadge}>
          <MaterialIcons name="star" size={10} color={Colors.textOnGold} />
          <Text style={card.selectedBadgeText}>Placed</Text>
        </View>
      )}
    </Pressable>
  );
}

const card = StyleSheet.create({
  wrap: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.surfaceBorder,
    overflow: 'hidden',
    marginBottom: Spacing.sm,
    position: 'relative',
  },
  wrapSelected: {
    borderColor: Colors.gold,
    borderWidth: 2,
  },
  imgWrap: { height: 100, position: 'relative' },
  img: { width: '100%', height: '100%' },
  imgPlaceholder: { backgroundColor: Colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  selectedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedCheck: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  verifiedBadgeImg: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 10,
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { padding: Spacing.md, gap: 3 },
  title: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textPrimary, lineHeight: 18 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  meta: { fontSize: Typography.xs, color: Colors.textMuted, flex: 1 },
  bottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  price: { fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.gold },
  priceFree: { color: Colors.greenLight },
  goingRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  goingText: { fontSize: Typography.xs, color: Colors.textMuted },
  selectedBadge: {
    position: 'absolute',
    top: Spacing.sm,
    left: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.gold,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  selectedBadgeText: { fontSize: 9, fontWeight: Typography.black, color: Colors.textOnGold },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ElitePlacementScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const [tab, setTab] = useState<'event' | 'business'>('event');
  const [ownedEvents, setOwnedEvents] = useState<OwnedEvent[]>([]);
  const [ownedBusinesses, setOwnedBusinesses] = useState<OwnedBusiness[]>([]);
  const [currentPlacement, setCurrentPlacement] = useState<CurrentPlacement>({ type: null, target_id: null });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [, setPendingSelection] = useState<{ type: 'event' | 'business'; id: string } | null>(null);
  const [alertState, setAlertState] = useState<{ visible: boolean; title: string; message: string; onOk?: () => void }>({ visible: false, title: '', message: '' });

  // ── Entitlement check ───────────────────────────────────────────────────
  const isElite = user?.subscriptionTier === 'elite';
  const isActive = !['expired', 'revoked', 'refunded'].includes(user?.subscriptionStatus ?? '');
  const hasPlacementAccess = isElite && isActive;

  // ── Load data ────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!user?.id) return;
    const supabase = getSupabaseClient();

    try {
      const [eventsRes, bizRes, profileRes] = await Promise.all([
        // Only live, upcoming events owned by this user
        supabase
          .from('events')
          .select('id, title, date, venue, parish, cover_image, ticket_price, going_count, status')
          .eq('promoter_id', user.id)
          .eq('status', 'live')
          .order('date', { ascending: true })
          .limit(50),

        // Only live businesses owned by this user
        supabase
          .from('businesses')
          .select(`
            id, name, primary_parish, town, logo_url, cover_url, status, verified,
            business_categories!inner(label, icon, color)
          `)
          .eq('owner_id', user.id)
          .eq('status', 'live')
          .order('name', { ascending: true })
          .limit(50),

        // Current placement from user_profiles
        supabase
          .from('user_profiles')
          .select('elite_placement_type, elite_placement_target_id')
          .eq('id', user.id)
          .single(),
      ]);

      // Filter events: only upcoming (not past)
      const allEvents = (eventsRes.data ?? []) as OwnedEvent[];
      setOwnedEvents(allEvents.filter((e) => isEventUpcoming(e.date)));

      // Map businesses
      const allBiz = (bizRes.data ?? []) as any[];
      setOwnedBusinesses(allBiz.map((b) => ({
        id: b.id,
        name: b.name,
        primary_parish: b.primary_parish,
        town: b.town ?? '',
        logo_url: b.logo_url ?? null,
        cover_url: b.cover_url ?? null,
        status: b.status,
        category_label: b.business_categories?.label ?? '',
        category_icon: b.business_categories?.icon ?? 'storefront',
        category_color: b.business_categories?.color ?? Colors.gold,
        verified: b.verified ?? false,
      })));

      // Current placement
      const profile = profileRes.data as any;
      setCurrentPlacement({
        type: profile?.elite_placement_type ?? null,
        target_id: profile?.elite_placement_target_id ?? null,
      });
    } catch {
      // Fail gracefully
    }
  }, [user?.id]);

  useEffect(() => {
    setLoading(true);
    loadData().finally(() => setLoading(false));
  }, [loadData]);

  // ── Apply placement via RPC ──────────────────────────────────────────────
  const applyPlacement = useCallback(async (type: 'event' | 'business', targetId: string) => {
    if (!user) return;
    setSaving(true);

    const supabase = getSupabaseClient();
    const { data: rpcData, error: rpcError } = await supabase.rpc('set_elite_placement', {
      p_type: type,
      p_target: targetId,
    });

    setSaving(false);

    if (rpcError) {
      setAlertState({ visible: true, title: 'Error', message: rpcError.message });
      return;
    }

    const result = rpcData as any;
    if (!result?.ok) {
      setAlertState({ visible: true, title: 'Cannot Set Placement', message: result?.error ?? 'Failed to set placement.' });
      return;
    }

    setCurrentPlacement({ type, target_id: targetId });
    setPendingSelection(null);
    setAlertState({
      visible: true,
      title: 'Placement Set',
      message: `Your ${type} has been set as your Elite Homepage Placement. It will appear at the top of the Home feed for other users.`,
    });
  }, [user]);

  // ── Remove placement ─────────────────────────────────────────────────────
  const removePlacement = useCallback(async () => {
    if (!user) return;
    setSaving(true);

    const supabase = getSupabaseClient();
    const { error: rpcError } = await supabase.rpc('set_elite_placement', {
      p_type: null,
      p_target: null,
    });

    setSaving(false);

    if (rpcError) {
      setAlertState({ visible: true, title: 'Error', message: rpcError.message });
      return;
    }

    setCurrentPlacement({ type: null, target_id: null });
    setAlertState({ visible: true, title: 'Placement Removed', message: 'Your Homepage Placement has been removed.' });
  }, [user]);

  // ── Handle selection ─────────────────────────────────────────────────────
  const handleSelect = useCallback((type: 'event' | 'business', id: string) => {
    const isCurrentSelection = currentPlacement.type === type && currentPlacement.target_id === id;

    if (isCurrentSelection) {
      // Tapping the already-selected item → offer to remove
      Alert.alert(
        'Remove Placement',
        'Remove this item from your Elite Homepage Placement?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Remove', style: 'destructive', onPress: removePlacement },
        ],
      );
      return;
    }

    // If there's an existing placement of a different target, warn about switch
    if (currentPlacement.type !== null && currentPlacement.target_id !== null) {
      Alert.alert(
        'Switch Placement',
        `This will replace your current Homepage Placement with the selected ${type}. Continue?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Switch', onPress: () => applyPlacement(type, id) },
        ],
      );
      return;
    }

    applyPlacement(type, id);
  }, [currentPlacement, applyPlacement, removePlacement]);

  // ── Access denied ────────────────────────────────────────────────────────
  if (!hasPlacementAccess) {
    return (
      <View style={s.container}>
        <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
          <View style={s.header}>
            <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={8}>
              <MaterialIcons name="arrow-back" size={20} color={Colors.textPrimary} />
            </Pressable>
            <Text style={s.headerTitle}>Elite Homepage Placement</Text>
            <View style={{ width: 36 }} />
          </View>
        </SafeAreaView>
        <View style={s.lockedState}>
          <LinearGradient colors={[Colors.goldSurface, Colors.surface]} style={s.lockedIcon}>
            <MaterialIcons name="star" size={40} color={Colors.gold} />
          </LinearGradient>
          <Text style={s.lockedTitle}>Elite Feature</Text>
          <Text style={s.lockedBody}>
            Elite Homepage Placement lets you pin one of your Events or Businesses to the top of the Vybz Hub Home feed, giving you premium visibility with every visitor.
          </Text>
          <Text style={s.lockedBody}>
            This feature is exclusive to active Elite subscribers.
          </Text>
          <Pressable
            onPress={() => router.push('/monetization/upgrade' as any)}
            style={({ pressed }) => [s.upgradeCta, pressed && { opacity: 0.85 }]}
          >
            <LinearGradient colors={[Colors.gold, Colors.goldDim]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.upgradeCtaInner}>
              <MaterialIcons name="star" size={18} color={Colors.textOnGold} />
              <Text style={s.upgradeCtaText}>Upgrade to Elite</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        <View style={s.header}>
          <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={8}>
            <MaterialIcons name="arrow-back" size={20} color={Colors.textPrimary} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>Elite Homepage Placement</Text>
            <Text style={s.headerSub}>Pin one item to the top of the Home feed</Text>
          </View>
          {currentPlacement.type !== null && (
            <Pressable
              onPress={removePlacement}
              style={({ pressed }) => [s.removeBtn, pressed && { opacity: 0.7 }]}
              hitSlop={8}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color={Colors.error ?? '#FF4444'} />
              ) : (
                <MaterialIcons name="close" size={16} color={Colors.error ?? '#FF4444'} />
              )}
            </Pressable>
          )}
        </View>

        {/* Current placement status */}
        {currentPlacement.type !== null && (
          <View style={s.currentBar}>
            <MaterialIcons name="star" size={14} color={Colors.gold} />
            <Text style={s.currentBarText}>
              Active placement: {currentPlacement.type === 'event' ? 'Event' : 'Business'}
            </Text>
            <View style={s.activeDot} />
          </View>
        )}

        {/* Tab selector */}
        <View style={s.tabStrip}>
          <Pressable
            onPress={() => setTab('event')}
            style={[s.tabBtn, tab === 'event' && s.tabBtnActive]}
          >
            <MaterialIcons name="event" size={14} color={tab === 'event' ? Colors.textOnGold : Colors.textMuted} />
            <Text style={[s.tabBtnText, tab === 'event' && s.tabBtnTextActive]}>Events ({ownedEvents.length})</Text>
          </Pressable>
          <Pressable
            onPress={() => setTab('business')}
            style={[s.tabBtn, tab === 'business' && s.tabBtnActive]}
          >
            <MaterialIcons name="storefront" size={14} color={tab === 'business' ? Colors.textOnGold : Colors.textMuted} />
            <Text style={[s.tabBtnText, tab === 'business' && s.tabBtnTextActive]}>Businesses ({ownedBusinesses.length})</Text>
          </Pressable>
        </View>
      </SafeAreaView>

      {loading ? (
        <View style={s.loadingState}>
          <ActivityIndicator size="large" color={Colors.gold} />
          <Text style={s.loadingText}>Loading your content…</Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.content}>
          {/* Explanation card */}
          <View style={s.infoCard}>
            <MaterialIcons name="info-outline" size={14} color={Colors.gold} />
            <Text style={s.infoText}>
              {tab === 'event'
                ? 'Select an upcoming live Event to display at the top of the Vybz Hub Home feed. Switching to another event or business replaces the current selection.'
                : 'Select a live Business to display at the top of the Vybz Hub Home feed. All users will see it in the Elite placements section.'}
            </Text>
          </View>

          {saving && (
            <View style={s.savingBar}>
              <ActivityIndicator size="small" color={Colors.gold} />
              <Text style={s.savingText}>Saving placement…</Text>
            </View>
          )}

          {/* Event list */}
          {tab === 'event' && (
            ownedEvents.length > 0 ? (
              ownedEvents.map((ev) => (
                <EventSelectionCard
                  key={ev.id}
                  event={ev}
                  isSelected={currentPlacement.type === 'event' && currentPlacement.target_id === ev.id}
                  onSelect={() => handleSelect('event', ev.id)}
                />
              ))
            ) : (
              <View style={s.emptyState}>
                <MaterialIcons name="event-busy" size={40} color={Colors.textMuted} />
                <Text style={s.emptyTitle}>No upcoming live events</Text>
                <Text style={s.emptyBody}>
                  Publish a live event to use it as your Homepage Placement. Only live, upcoming events are eligible.
                </Text>
                <Pressable onPress={() => router.push('/my-events' as any)} style={s.emptyAction}>
                  <Text style={s.emptyActionText}>View My Events →</Text>
                </Pressable>
              </View>
            )
          )}

          {/* Business list */}
          {tab === 'business' && (
            ownedBusinesses.length > 0 ? (
              ownedBusinesses.map((biz) => (
                <BusinessSelectionCard
                  key={biz.id}
                  biz={biz}
                  isSelected={currentPlacement.type === 'business' && currentPlacement.target_id === biz.id}
                  onSelect={() => handleSelect('business', biz.id)}
                />
              ))
            ) : (
              <View style={s.emptyState}>
                <MaterialIcons name="storefront" size={40} color={Colors.textMuted} />
                <Text style={s.emptyTitle}>No live businesses</Text>
                <Text style={s.emptyBody}>
                  List a business and get it approved to use it as your Homepage Placement.
                </Text>
                <Pressable onPress={() => router.push('/business/manage' as any)} style={s.emptyAction}>
                  <Text style={s.emptyActionText}>Manage Businesses →</Text>
                </Pressable>
              </View>
            )
          )}

          {/* Disclaimer */}
          <View style={s.disclaimer}>
            <MaterialIcons name="verified" size={12} color={Colors.textMuted} />
            <Text style={s.disclaimerText}>
              Placement is separate from Boost credits and does not consume your included credits. Business Verification status is unaffected by this feature.
            </Text>
          </View>

          <View style={{ height: 80 }} />
        </ScrollView>
      )}

      {/* Web-safe alert modal */}
      {Platform.OS === 'web' && alertState.visible && (
        <Modal visible transparent animationType="fade">
          <View style={s.alertOverlay}>
            <View style={s.alertBox}>
              <Text style={s.alertTitle}>{alertState.title}</Text>
              <Text style={s.alertMsg}>{alertState.message}</Text>
              <Pressable
                style={s.alertOkBtn}
                onPress={() => {
                  alertState.onOk?.();
                  setAlertState((prev) => ({ ...prev, visible: false }));
                }}
              >
                <Text style={s.alertOkBtnText}>OK</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  headerTitle: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textPrimary },
  headerSub: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 1 },
  removeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,68,68,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,68,68,0.2)',
  },

  currentBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.goldSurface,
    borderBottomWidth: 1,
    borderBottomColor: `${Colors.gold}22`,
  },
  currentBarText: { flex: 1, fontSize: Typography.xs, color: Colors.gold, fontWeight: Typography.medium },
  activeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.greenLight },

  tabStrip: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.surfaceBorder,
  },
  tabBtnActive: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  tabBtnText: { fontSize: Typography.xs, color: Colors.textMuted, fontWeight: Typography.medium },
  tabBtnTextActive: { color: Colors.textOnGold, fontWeight: Typography.bold },

  content: { padding: Spacing.base },

  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    backgroundColor: Colors.goldSurface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: `${Colors.gold}22`,
    marginBottom: Spacing.md,
  },
  infoText: { flex: 1, fontSize: Typography.xs, color: Colors.gold, lineHeight: 17 },

  savingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
  },
  savingText: { fontSize: Typography.sm, color: Colors.textMuted },

  loadingState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
  loadingText: { fontSize: Typography.sm, color: Colors.textMuted },

  lockedState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
  },
  lockedIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  lockedTitle: { fontSize: Typography.xl, fontWeight: Typography.black, color: Colors.textPrimary },
  lockedBody: { fontSize: Typography.base, color: Colors.textSecondary, textAlign: 'center', lineHeight: 24 },
  upgradeCta: {
    alignSelf: 'stretch',
    borderRadius: Radius.lg,
    overflow: 'hidden',
    marginTop: Spacing.md,
  },
  upgradeCtaInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.base,
  },
  upgradeCtaText: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textOnGold },

  emptyState: { alignItems: 'center', paddingVertical: Spacing.xxl, gap: Spacing.md },
  emptyTitle: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textSecondary },
  emptyBody: { fontSize: Typography.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 20 },
  emptyAction: { marginTop: Spacing.sm },
  emptyActionText: { fontSize: Typography.sm, color: Colors.gold, fontWeight: Typography.semibold },

  disclaimer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    marginTop: Spacing.base,
    padding: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  disclaimerText: { flex: 1, fontSize: Typography.xs, color: Colors.textMuted, lineHeight: 16 },

  // Web alert
  alertOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  alertBox: { backgroundColor: Colors.surface, padding: Spacing.xl, borderRadius: Radius.lg, minWidth: 280, maxWidth: 360, gap: Spacing.md },
  alertTitle: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textPrimary },
  alertMsg: { fontSize: Typography.base, color: Colors.textSecondary, lineHeight: 22 },
  alertOkBtn: { backgroundColor: Colors.gold, borderRadius: Radius.md, padding: Spacing.md, alignItems: 'center' },
  alertOkBtnText: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textOnGold },
});
