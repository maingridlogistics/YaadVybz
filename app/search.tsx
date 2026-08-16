
// ─── Unified Search ───────────────────────────────────────────────────────────
// Single search experience for both Events and Businesses.
//
// Route: /search?q=barber&scope=businesses
//
// Structure:
//   Header ← Search
//   Input [query]  [✕]
//   [  All  |  Events  |  Businesses  ]
//   Results (sections in All, list in Events / Businesses)
//   Empty/initial state with Recent Searches + discovery CTAs
//
// Key behaviours:
//   • Debounced search (300ms) — no request fired on every keystroke
//   • Minimum 2 characters before querying
//   • Stale request cancellation via incrementing token
//   • Recent searches stored in AsyncStorage (max 10, plain strings)
//   • Parish normalization ("St Andrew" → "Saint Andrew")
//   • Business results use privacy-safe search_businesses RPC
//   • Event results filtered client-side from EventsContext (already cached)
//   • "See all Events/Businesses" in All mode switches scope and preserves query
//   • Keyboard-safe layout via KeyboardAvoidingView
//   • detectedParish stored in both ref (for async callbacks) and state (for render)

import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  memo,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Typography, Spacing, Radius } from '../constants/theme';
import { useEvents } from '../hooks/useEvents';
import { useAuth } from '../hooks/useAuth';
import {
  searchBusinesses,
  BusinessSearchResult,
} from '../services/businessService';
import {
  Event,
  TYPE_COLORS,
  isEventPassed,
  formatDate,
} from '../constants/data';
import {
  JAMAICA_PARISHES,
  PARISH_LEGACY_MAP,
} from '../constants/parishes';
import { compareBrowse } from '../constants/rankingUtils';

// ─── Constants ────────────────────────────────────────────────────────────────
const RECENT_KEY = '@vybzhub/search_recent_v1';
const MAX_RECENT = 10;
const DEBOUNCE_MS = 300;
const MIN_QUERY = 2;
// Max results per section in All mode; full pagination in single-scope mode
const ALL_MODE_LIMIT = 4;
const PAGE_SIZE = 20;

type SearchScope = 'all' | 'events' | 'businesses';

// ─── Parish / Town detection ──────────────────────────────────────────────────
// Maps lowercase town names to canonical parish names.
const TOWN_PARISH: Record<string, string> = {
  'mandeville':     'Manchester',
  'christiana':     'Manchester',
  'may pen':        'Clarendon',
  'portmore':       'Saint Catherine',
  'spanish town':   'Saint Catherine',
  'montego bay':    'Saint James',
  'ocho rios':      'Saint Ann',
  'negril':         'Westmoreland',
  'savanna-la-mar': 'Westmoreland',
  'falmouth':       'Trelawny',
  'black river':    'Saint Elizabeth',
  'santa cruz':     'Saint Elizabeth',
  'port antonio':   'Portland',
  'morant bay':     'Saint Thomas',
  'port maria':     'Saint Mary',
  "brown's town":   'Saint Ann',
  'linstead':       'Saint Catherine',
  'half way tree':  'Saint Andrew',
  'new kingston':   'Saint Andrew',
  'kingston':       'Kingston',
};

/**
 * Detects a parish/town token in the query string.
 * Returns { parish, cleanQuery } where parish is canonical or null,
 * and cleanQuery is the query with the location token removed.
 */
function extractLocationToken(raw: string): {
  parish: string | null;
  cleanQuery: string;
} {
  const lower = raw.toLowerCase();

  // Check canonical parish names first (longest-first to avoid "Kingston" matching inside "Saint Catherine")
  const sortedParishes = [...JAMAICA_PARISHES].sort((a, b) => b.length - a.length);
  for (const p of sortedParishes) {
    if (lower.includes(p.toLowerCase())) {
      return {
        parish: p,
        cleanQuery: raw.replace(new RegExp(p, 'i'), '').trim(),
      };
    }
  }

  // Check legacy parish variants
  for (const [variant, canonical] of Object.entries(PARISH_LEGACY_MAP)) {
    if (lower.includes(variant.toLowerCase())) {
      return {
        parish: canonical,
        cleanQuery: raw.replace(new RegExp(variant, 'i'), '').trim(),
      };
    }
  }

  // Check town names (sorted longest-first to avoid partial matches)
  const sortedTowns = Object.keys(TOWN_PARISH).sort((a, b) => b.length - a.length);
  for (const town of sortedTowns) {
    if (lower.includes(town)) {
      return {
        parish: TOWN_PARISH[town],
        cleanQuery: raw.replace(new RegExp(town, 'i'), '').trim(),
      };
    }
  }

  return { parish: null, cleanQuery: raw };
}

// ─── Recent searches storage ──────────────────────────────────────────────────
async function loadRecent(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

async function saveRecent(term: string, prev: string[]): Promise<string[]> {
  const deduped = [term, ...prev.filter((t) => t !== term)].slice(0, MAX_RECENT);
  try {
    await AsyncStorage.setItem(RECENT_KEY, JSON.stringify(deduped));
  } catch {}
  return deduped;
}

async function clearAllRecent(): Promise<void> {
  try {
    await AsyncStorage.removeItem(RECENT_KEY);
  } catch {}
}

// ─── Segmented control ────────────────────────────────────────────────────────
const SCOPES: { id: SearchScope; label: string; icon: string }[] = [
  { id: 'all',        label: 'All',        icon: 'apps'       },
  { id: 'events',     label: 'Events',     icon: 'event'      },
  { id: 'businesses', label: 'Businesses', icon: 'storefront' },
];

function ScopeControl({
  value,
  onChange,
}: {
  value: SearchScope;
  onChange: (s: SearchScope) => void;
}) {
  return (
    <View style={sc.wrap}>
      {SCOPES.map((s) => {
        const active = value === s.id;
        return (
          <Pressable
            key={s.id}
            onPress={() => onChange(s.id)}
            style={[sc.btn, active && sc.btnActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <MaterialIcons
              name={s.icon as any}
              size={13}
              color={active ? Colors.textOnGold : Colors.textSecondary}
            />
            <Text style={[sc.label, active && sc.labelActive]}>{s.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const sc = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: 3,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    height: 40,
    marginHorizontal: Spacing.base,
    marginBottom: Spacing.sm,
  },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderRadius: Radius.sm - 1,
  },
  btnActive: { backgroundColor: Colors.gold },
  label: { fontSize: Typography.xs, color: Colors.textSecondary, fontWeight: Typography.medium },
  labelActive: { color: Colors.textOnGold, fontWeight: Typography.bold },
});

// ─── Event result card ────────────────────────────────────────────────────────
const EventResult = memo(function EventResult({
  event,
  onPress,
}: {
  event: Event;
  onPress: () => void;
}) {
  const typeColor = TYPE_COLORS[event.type] ?? Colors.gold;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [er.card, pressed && { opacity: 0.85 }]}
      accessibilityLabel={`${event.title}, ${event.parish}`}
    >
      <View style={er.imgWrap}>
        <Image
          source={{ uri: event.coverImage }}
          style={er.img}
          contentFit="cover"
          transition={200}
        />
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.55)']}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={[er.typePill, { backgroundColor: typeColor }]}>
          <Text style={er.typePillText} numberOfLines={1}>{event.typeLabel}</Text>
        </View>
      </View>
      <View style={er.body}>
        <Text style={er.title} numberOfLines={1}>{event.title}</Text>
        <View style={er.metaRow}>
          <MaterialIcons name="calendar-today" size={11} color={Colors.textMuted} />
          <Text style={er.meta}>{formatDate(event.date)}</Text>
          <Text style={er.dot}>·</Text>
          <MaterialIcons name="place" size={11} color={Colors.textMuted} />
          <Text style={er.meta} numberOfLines={1}>{event.parish}</Text>
        </View>
        <View style={er.metaRow}>
          <MaterialIcons name="location-on" size={11} color={Colors.textMuted} />
          <Text style={er.meta} numberOfLines={1}>{event.venue}</Text>
        </View>
        {event.ticketPrice && event.ticketPrice !== 'Free' ? (
          <Text style={er.price}>{event.ticketPrice}</Text>
        ) : event.ticketPrice === 'Free' ? (
          <Text style={er.free}>Free</Text>
        ) : null}
      </View>
      <MaterialIcons name="chevron-right" size={18} color={Colors.textMuted} style={{ flexShrink: 0 }} />
    </Pressable>
  );
});

const er = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.surfaceBorder,
    marginBottom: Spacing.sm, overflow: 'hidden', minHeight: 76, paddingRight: Spacing.sm,
  },
  imgWrap: { width: 76, height: 76, flexShrink: 0, position: 'relative' },
  img: { width: 76, height: 76 },
  typePill: {
    position: 'absolute', bottom: Spacing.xs, left: Spacing.xs,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.full,
  },
  typePillText: { fontSize: 9, color: '#fff', fontWeight: Typography.bold },
  body: { flex: 1, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, gap: 3 },
  title: { fontSize: 13, fontWeight: Typography.bold, color: Colors.textPrimary },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  meta: { fontSize: 11, color: Colors.textMuted },
  dot: { fontSize: 10, color: Colors.textMuted },
  price: { fontSize: 11, color: Colors.gold, fontWeight: Typography.bold },
  free: { fontSize: 11, color: Colors.success, fontWeight: Typography.bold },
});

// ─── Business result card ─────────────────────────────────────────────────────
const BizResult = memo(function BizResult({
  biz,
  onPress,
  contextParish,
}: {
  biz: BusinessSearchResult;
  onPress: () => void;
  contextParish?: string | null;
}) {
  const locationStr = biz.serves_parish
    ? `Serves ${contextParish ?? biz.primary_parish}`
    : biz.town
    ? `${biz.town}, ${biz.primary_parish}`
    : biz.primary_parish;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [bzr.card, pressed && { opacity: 0.85 }]}
      accessibilityLabel={`${biz.name}, ${biz.category_label}`}
    >
      <View style={bzr.thumbWrap}>
        {biz.cover_url ?? biz.logo_url ? (
          <Image
            source={{ uri: (biz.cover_url ?? biz.logo_url)! }}
            style={bzr.thumb}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <View style={[bzr.thumb, bzr.thumbPlaceholder]}>
            <MaterialIcons name={biz.category_icon as any} size={22} color={biz.category_color} />
          </View>
        )}
        <View style={[bzr.catDot, { backgroundColor: biz.category_color }]} />
      </View>
      <View style={bzr.body}>
        <View style={bzr.nameRow}>
          <Text style={bzr.name} numberOfLines={1}>{biz.name}</Text>
          {biz.verified ? <MaterialIcons name="verified" size={13} color={Colors.gold} /> : null}
        </View>
        <View style={bzr.metaRow}>
          <MaterialIcons name="storefront" size={10} color={biz.category_color} />
          <Text style={[bzr.cat, { color: biz.category_color }]} numberOfLines={1}>
            {biz.category_label}
          </Text>
          <Text style={bzr.dot}>·</Text>
          <MaterialIcons
            name={biz.serves_parish ? 'near-me' : 'place'}
            size={10}
            color={biz.serves_parish ? Colors.info : Colors.textMuted}
          />
          <Text
            style={[bzr.location, biz.serves_parish && { color: Colors.info }]}
            numberOfLines={1}
          >
            {locationStr}
          </Text>
        </View>
        {biz.avg_rating != null && biz.avg_rating > 0 ? (
          <View style={bzr.ratingRow}>
            <MaterialIcons name="star" size={10} color={Colors.gold} />
            <Text style={bzr.rating}>{biz.avg_rating.toFixed(1)}</Text>
            {biz.review_count > 0 ? (
              <Text style={bzr.reviews}>({biz.review_count})</Text>
            ) : null}
          </View>
        ) : null}
      </View>
      <MaterialIcons name="chevron-right" size={18} color={Colors.textMuted} style={{ flexShrink: 0 }} />
    </Pressable>
  );
});

const bzr = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.surfaceBorder,
    marginBottom: Spacing.sm, overflow: 'hidden', minHeight: 76, paddingRight: Spacing.sm,
  },
  thumbWrap: { width: 76, height: 76, flexShrink: 0, position: 'relative' },
  thumb: { width: 76, height: 76 },
  thumbPlaceholder: { backgroundColor: Colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  catDot: {
    position: 'absolute', bottom: Spacing.xs, right: Spacing.xs,
    width: 12, height: 12, borderRadius: 6,
  },
  body: { flex: 1, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, gap: 4 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  name: { fontSize: 13, fontWeight: Typography.bold, color: Colors.textPrimary, flex: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cat: { fontSize: 11, fontWeight: Typography.semibold },
  dot: { fontSize: 10, color: Colors.textMuted },
  location: { fontSize: 11, color: Colors.textMuted, flex: 1 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  rating: { fontSize: 11, color: Colors.gold, fontWeight: Typography.bold },
  reviews: { fontSize: 10, color: Colors.textMuted },
});

// ─── Section header ────────────────────────────────────────────────────────────
function ResultSection({
  title,
  icon,
  iconColor,
  count,
  onSeeAll,
}: {
  title: string;
  icon: string;
  iconColor: string;
  // Accepts number (exact) or string (e.g. "20+" when more pages exist)
  count?: number | string;
  onSeeAll?: () => void;
}) {
  return (
    <View style={rsh.row}>
      <View style={rsh.left}>
        <View style={[rsh.bar, { backgroundColor: iconColor }]} />
        <MaterialIcons name={icon as any} size={15} color={iconColor} />
        <Text style={rsh.title}>{title}</Text>
        {count != null ? (
          <View style={[rsh.badge, { backgroundColor: `${iconColor}22` }]}>
            <Text style={[rsh.badgeText, { color: iconColor }]}>{count}</Text>
          </View>
        ) : null}
      </View>
      {onSeeAll ? (
        <Pressable onPress={onSeeAll} hitSlop={8}>
          <Text style={rsh.seeAll}>See all</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const rsh = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: Spacing.md, marginTop: Spacing.sm,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  bar: { width: 3, height: 16, borderRadius: 2 },
  title: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textPrimary },
  badge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: Radius.full },
  badgeText: { fontSize: 10, fontWeight: Typography.bold },
  seeAll: { fontSize: Typography.xs, color: Colors.gold, fontWeight: Typography.medium },
});

// ─── Quick Discovery CTA (shown in empty/initial state) ───────────────────────
function DiscoveryCTA({
  icon,
  label,
  sub,
  color,
  onPress,
}: {
  icon: string;
  label: string;
  sub: string;
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [cta.card, pressed && { opacity: 0.85 }]}
    >
      <View style={[cta.icon, { backgroundColor: `${color}22` }]}>
        <MaterialIcons name={icon as any} size={20} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={cta.label}>{label}</Text>
        <Text style={cta.sub}>{sub}</Text>
      </View>
      <MaterialIcons name="arrow-forward" size={16} color={Colors.textMuted} />
    </Pressable>
  );
}

const cta = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
    padding: Spacing.md, marginBottom: Spacing.sm,
  },
  icon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  label: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textPrimary },
  sub: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2 },
});

// ─── Skeleton loader ───────────────────────────────────────────────────────────
function SearchSkeleton() {
  return (
    <View style={{ gap: Spacing.sm, paddingTop: Spacing.sm }}>
      {[1, 2, 3].map((i) => (
        <View key={i} style={sk.row}>
          <View style={sk.thumb} />
          <View style={{ flex: 1, gap: 6 }}>
            <View style={[sk.line, { width: '70%' as any }]} />
            <View style={[sk.line, { width: '45%' as any }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

const sk = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    height: 76, padding: Spacing.md, borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  thumb: { width: 44, height: 44, borderRadius: Radius.md, backgroundColor: Colors.surfaceElevated, flexShrink: 0 },
  line: { height: 10, borderRadius: 5, backgroundColor: Colors.surfaceElevated },
});

// ─────────────────────────────────────────────────────────────────────────────
// Main Screen
// ─────────────────────────────────────────────────────────────────────────────
export default function SearchScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ q?: string; scope?: string }>();
  const { user } = useAuth();
  const { events } = useEvents();

  // ── State ───────────────────────────────────────────────────────────────────
  const [query, setQuery] = useState(params.q ?? '');
  const [scope, setScope] = useState<SearchScope>(
    (params.scope as SearchScope) ?? 'all'
  );

  const [eventResults, setEventResults] = useState<Event[]>([]);
  const [bizResults, setBizResults] = useState<BusinessSearchResult[]>([]);
  const [bizOffset, setBizOffset] = useState(0);
  const [hasMoreBiz, setHasMoreBiz] = useState(false);

  const [loadingEvents, setLoadingEvents] = useState(false);
  const [loadingBiz, setLoadingBiz] = useState(false);
  const [loadingMoreBiz, setLoadingMoreBiz] = useState(false);
  const [eventError, setEventError] = useState(false);
  const [bizError, setBizError] = useState(false);

  const [recent, setRecent] = useState<string[]>([]);

  // detectedParish: stored in BOTH ref (for async callbacks that close over it)
  // and state (so the render always reflects the latest detected location).
  const [detectedParish, setDetectedParish] = useState<string | null>(null);

  // Debounce timer ref
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Request token — increments on each new search; stale callbacks compare against it
  const tokenRef = useRef(0);
  // Parish ref so async callbacks can read the latest value without re-closing
  const detectedParishRef = useRef<string | null>(null);

  const inputRef = useRef<TextInput>(null);

  // ── Load recent on mount ────────────────────────────────────────────────────
  useEffect(() => {
    loadRecent().then(setRecent);
    // Auto-focus if no initial query
    if (!params.q) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [params.q]); // Added params.q to dependency array

  // ── Event search (client-side — already cached in EventsContext) ───────────
  const runEventSearch = useCallback(
    (q: string, parish: string | null, cleanQ: string): Event[] => {
      const qLow = q.toLowerCase();
      const cleanLow = cleanQ.toLowerCase();

      return events
        .filter((e) => {
          if (isEventPassed(e.date)) return false;

          // Parish filter when a parish was detected
          if (parish && e.parish !== parish) return false;

          // If only a parish was typed with no keyword, show all parish events
          if (!cleanQ && parish) return true;

          // Text matching across multiple fields
          const haystack = [
            e.title,
            e.venue,
            e.promoterName,
            e.typeLabel,
            e.parish,
            e.address,
            ...(e.tags ?? []),
            ...(e.eventTypes ?? []),
          ]
            .join(' ')
            .toLowerCase();

          // Also try full raw query in case no parish was stripped
          const haystackFull = [
            e.title,
            e.venue,
            e.promoterName,
            e.typeLabel,
            e.parish,
            e.address,
            ...(e.tags ?? []),
          ]
            .join(' ')
            .toLowerCase();

          return cleanQ
            ? haystack.includes(cleanLow) || haystackFull.includes(qLow)
            : haystackFull.includes(qLow);
        })
        .sort(compareBrowse);
    },
    [events]
  );

  // ── Business search (server-side via privacy-safe search_businesses RPC) ───
  const runBizSearch = useCallback(
    async (
      q: string,
      parish: string | null,
      cleanQ: string,
      offset: number,
      limit: number,
      token: number
    ) => {
      const { results, error } = await searchBusinesses({
        parish: parish ?? null,
        query: cleanQ || (parish ? null : q) || null,
        limit,
        offset,
      });
      return { results, error, token };
    },
    []
  );

  // ── Core search executor ───────────────────────────────────────────────────
  const executeSearch = useCallback(
    (q: string) => {
      if (q.trim().length < MIN_QUERY) {
        setEventResults([]);
        setBizResults([]);
        setLoadingEvents(false);
        setLoadingBiz(false);
        setEventError(false);
        setBizError(false);
        setDetectedParish(null);
        detectedParishRef.current = null;
        return;
      }

      const { parish, cleanQuery } = extractLocationToken(q);
      detectedParishRef.current = parish;
      setDetectedParish(parish);

      const currentToken = ++tokenRef.current;

      // ── Events: synchronous client-side filter ─────────────────────────────
      setLoadingEvents(true);
      setEventError(false);
      try {
        const evts = runEventSearch(q, parish, cleanQuery);
        if (tokenRef.current === currentToken) {
          setEventResults(evts);
          setLoadingEvents(false);
        }
      } catch {
        if (tokenRef.current === currentToken) {
          setEventError(true);
          setLoadingEvents(false);
        }
      }

      // ── Businesses: async server query ─────────────────────────────────────
      setLoadingBiz(true);
      setBizError(false);
      setBizOffset(0);
      runBizSearch(q, parish, cleanQuery, 0, PAGE_SIZE, currentToken).then(
        ({ results, error, token: t }) => {
          if (t !== tokenRef.current) return; // stale — discard
          setLoadingBiz(false);
          if (error) {
            setBizError(true);
            return;
          }
          setBizResults(results);
          setHasMoreBiz(results.length === PAGE_SIZE);
          setBizOffset(PAGE_SIZE);
        }
      );
    },
    [runEventSearch, runBizSearch]
  );

  // ── Debounced search on query change ──────────────────────────────────────
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.trim().length < MIN_QUERY) {
      setEventResults([]);
      setBizResults([]);
      setLoadingEvents(false);
      setLoadingBiz(false);
      setDetectedParish(null);
      detectedParishRef.current = null;
      return;
    }

    debounceRef.current = setTimeout(() => {
      const trimmed = query.trim();
      executeSearch(trimmed);
      // Save to recent on debounce completion (not just explicit submit)
      saveRecent(trimmed, recent).then(setRecent);
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // The eslint-disable-next-line comment was removed and dependencies were explicitly listed.
  }, [query, executeSearch, recent]);

  // ── Load more businesses ───────────────────────────────────────────────────
  const handleLoadMoreBiz = useCallback(async () => {
    if (loadingMoreBiz || !hasMoreBiz || query.trim().length < MIN_QUERY) return;
    setLoadingMoreBiz(true);
    const { parish, cleanQuery } = extractLocationToken(query.trim());
    const { results } = await runBizSearch(
      query.trim(), parish, cleanQuery, bizOffset, PAGE_SIZE, tokenRef.current
    );
    setBizResults((prev) => [...prev, ...results]);
    setHasMoreBiz(results.length === PAGE_SIZE);
    setBizOffset((prev) => prev + PAGE_SIZE);
    setLoadingMoreBiz(false);
  }, [loadingMoreBiz, hasMoreBiz, query, bizOffset, runBizSearch]);

  // ── Explicit submit (keyboard "Search" key) ────────────────────────────────
  const handleSubmit = useCallback(() => {
    const t = query.trim();
    if (t.length < MIN_QUERY) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    saveRecent(t, recent).then(setRecent);
    executeSearch(t);
  }, [query, recent, executeSearch]);

  // ── Tap a recent search ────────────────────────────────────────────────────
  const handleRecentTap = useCallback(
    (term: string) => {
      setQuery(term);
      saveRecent(term, recent).then(setRecent);
      executeSearch(term);
    },
    [recent, executeSearch]
  );

  // ── Clear button ───────────────────────────────────────────────────────────
  const handleClear = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    tokenRef.current++; // cancel any in-flight business request
    setQuery('');
    setEventResults([]);
    setBizResults([]);
    setLoadingEvents(false);
    setLoadingBiz(false);
    setDetectedParish(null);
    detectedParishRef.current = null;
    inputRef.current?.focus();
  }, []);

  // ── Derived render values ──────────────────────────────────────────────────
  const hasQuery = query.trim().length >= MIN_QUERY;
  const isLoading = loadingEvents || loadingBiz;
  const noEventsResult = !loadingEvents && !eventError && eventResults.length === 0;
  const noBizResult    = !loadingBiz   && !bizError   && bizResults.length   === 0;

  // Slice to limit in All mode
  const shownEvents = scope === 'all' ? eventResults.slice(0, ALL_MODE_LIMIT) : eventResults;
  const shownBiz    = scope === 'all' ? bizResults.slice(0, ALL_MODE_LIMIT)   : bizResults;

  // Business count badge: show "20+" when more pages exist
  const bizCountLabel: number | string = hasMoreBiz
    ? `${bizResults.length}+`
    : bizResults.length;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={s.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        {/* Header */}
        <View style={s.header}>
          <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={8}>
            <MaterialIcons name="arrow-back" size={20} color={Colors.textPrimary} />
          </Pressable>
          <View style={s.inputWrap}>
            <MaterialIcons name="search" size={18} color={Colors.textMuted} />
            <TextInput
              ref={inputRef}
              style={s.input}
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={handleSubmit}
              placeholder="Search events & businesses..."
              placeholderTextColor={Colors.textMuted}
              returnKeyType="search"
              autoCorrect={false}
              autoCapitalize="none"
              accessibilityLabel="Search events and businesses"
            />
            {query.length > 0 ? (
              <Pressable onPress={handleClear} hitSlop={8} accessibilityLabel="Clear search">
                <MaterialIcons name="close" size={17} color={Colors.textMuted} />
              </Pressable>
            ) : null}
          </View>
        </View>

        {/* Scope control */}
        <ScopeControl value={scope} onChange={setScope} />
      </SafeAreaView>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* ── No query / initial state ── */}
        {!hasQuery ? (
          <ScrollView
            style={{ flex: 1 }}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={s.initialContent}
            keyboardShouldPersistTaps="handled"
          >
            {/* Recent Searches */}
            {recent.length > 0 ? (
              <View style={s.recentSection}>
                <View style={s.recentHeader}>
                  <Text style={s.sectionTitle}>Recent Searches</Text>
                  <Pressable
                    onPress={async () => {
                      await clearAllRecent();
                      setRecent([]);
                    }}
                    hitSlop={8}
                  >
                    <Text style={s.clearAll}>Clear All</Text>
                  </Pressable>
                </View>
                <View style={s.recentList}>
                  {recent.map((term) => (
                    <Pressable
                      key={term}
                      onPress={() => handleRecentTap(term)}
                      style={({ pressed }) => [s.recentPill, pressed && { opacity: 0.75 }]}
                    >
                      <MaterialIcons name="history" size={14} color={Colors.textMuted} />
                      <Text style={s.recentPillText} numberOfLines={1}>{term}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}

            {/* Discovery shortcuts */}
            <Text style={s.sectionTitle}>Discover</Text>
            <DiscoveryCTA
              icon="event"
              label="Browse Events"
              sub="Parties, concerts, all-inclusive & more"
              color={Colors.gold}
              onPress={() => router.push('/(tabs)/browse' as any)}
            />
            <DiscoveryCTA
              icon="storefront"
              label="Browse Businesses"
              sub="Barbers, restaurants, beauty & more"
              color="#4CAF50"
              onPress={() =>
                router.push({
                  pathname: '/(tabs)/browse',
                  params: { discovery: 'businesses' },
                } as any)
              }
            />
            {user?.homeParish ? (
              <DiscoveryCTA
                icon="place"
                label={`Explore ${user.homeParish}`}
                sub="Events and businesses near you"
                color={Colors.info}
                onPress={() =>
                  router.push({
                    pathname: '/explore/event-parish',
                    params: { parish: user.homeParish },
                  } as any)
                }
              />
            ) : null}
            <View style={{ height: 40 }} />
          </ScrollView>
        ) : (
          /* ── Results ── */
          // FlatList with empty data + ListHeaderComponent gives us
          // keyboardShouldPersistTaps + onEndReached for business pagination
          // while keeping everything in one scrollable surface.
          <FlatList
            data={[]}
            renderItem={null}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            onEndReached={scope === 'businesses' ? handleLoadMoreBiz : undefined}
            onEndReachedThreshold={0.3}
            ListHeaderComponent={
              <View style={s.resultsContent}>

                {/* Parish detection banner */}
                {detectedParish ? (
                  <View style={s.parishBanner}>
                    <MaterialIcons name="place" size={14} color={Colors.info} />
                    <Text style={s.parishBannerText}>
                      Showing results for{' '}
                      <Text style={{ fontWeight: Typography.bold }}>{detectedParish}</Text>
                    </Text>
                  </View>
                ) : null}

                {/* Global loading skeleton while both sections are still loading */}
                {isLoading && eventResults.length === 0 && bizResults.length === 0 ? (
                  <>
                    <SearchSkeleton />
                    <SearchSkeleton />
                  </>
                ) : null}

                {/* ── EVENTS section ── */}
                {(scope === 'all' || scope === 'events') ? (
                  <View>
                    {loadingEvents && eventResults.length === 0 ? (
                      <SearchSkeleton />
                    ) : eventError ? (
                      <View style={s.errRow}>
                        <MaterialIcons name="error-outline" size={14} color={Colors.error} />
                        <Text style={s.errText}>Could not load event results.</Text>
                        <Pressable onPress={() => executeSearch(query.trim())} hitSlop={6}>
                          <Text style={s.errRetry}>Retry</Text>
                        </Pressable>
                      </View>
                    ) : shownEvents.length > 0 ? (
                      <>
                        <ResultSection
                          title="Events"
                          icon="event"
                          iconColor={Colors.gold}
                          count={eventResults.length}
                          onSeeAll={
                            scope === 'all' && eventResults.length > ALL_MODE_LIMIT
                              ? () => setScope('events')
                              : undefined
                          }
                        />
                        {shownEvents.map((evt) => (
                          <EventResult
                            key={evt.id}
                            event={evt}
                            onPress={() => router.push(`/event/${evt.id}` as any)}
                          />
                        ))}
                        {scope === 'all' && eventResults.length > ALL_MODE_LIMIT ? (
                          <Pressable
                            onPress={() => setScope('events')}
                            style={s.seeAllBtn}
                          >
                            <Text style={s.seeAllBtnText}>
                              See all {eventResults.length} events →
                            </Text>
                          </Pressable>
                        ) : null}
                      </>
                    ) : !loadingEvents && !eventError && scope === 'events' ? (
                      <View style={s.noResults}>
                        <MaterialIcons name="event-busy" size={36} color={Colors.textMuted} />
                        <Text style={s.noResultsTitle}>No events found</Text>
                        <Text style={s.noResultsSub}>
                          Try a different term, parish, or browse Explore.
                        </Text>
                        <Pressable
                          onPress={() => router.push('/(tabs)/browse' as any)}
                          style={s.noResultsCta}
                        >
                          <Text style={s.noResultsCtaText}>Browse Events</Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                ) : null}

                {/* ── BUSINESSES section ── */}
                {(scope === 'all' || scope === 'businesses') ? (
                  <View style={scope === 'all' ? { marginTop: Spacing.md } : undefined}>
                    {loadingBiz && bizResults.length === 0 ? (
                      <SearchSkeleton />
                    ) : bizError ? (
                      <View style={s.errRow}>
                        <MaterialIcons name="error-outline" size={14} color={Colors.error} />
                        <Text style={s.errText}>Could not load business results.</Text>
                        <Pressable onPress={() => executeSearch(query.trim())} hitSlop={6}>
                          <Text style={s.errRetry}>Retry</Text>
                        </Pressable>
                      </View>
                    ) : shownBiz.length > 0 ? (
                      <>
                        <ResultSection
                          title="Businesses"
                          icon="storefront"
                          iconColor="#4CAF50"
                          count={bizCountLabel}
                          onSeeAll={
                            scope === 'all' && bizResults.length > ALL_MODE_LIMIT
                              ? () => setScope('businesses')
                              : undefined
                          }
                        />
                        {shownBiz.map((biz) => (
                          <BizResult
                            key={biz.id}
                            biz={biz}
                            contextParish={detectedParish}
                            onPress={() => router.push(`/business/${biz.id}` as any)}
                          />
                        ))}
                        {scope === 'all' && bizResults.length > ALL_MODE_LIMIT ? (
                          <Pressable
                            onPress={() => setScope('businesses')}
                            style={s.seeAllBtn}
                          >
                            <Text style={s.seeAllBtnText}>See all businesses →</Text>
                          </Pressable>
                        ) : null}
                        {scope === 'businesses' && hasMoreBiz ? (
                          <Pressable
                            onPress={handleLoadMoreBiz}
                            style={s.loadMoreBtn}
                            disabled={loadingMoreBiz}
                          >
                            {loadingMoreBiz ? (
                              <ActivityIndicator size="small" color={Colors.gold} />
                            ) : (
                              <Text style={s.loadMoreText}>Load more businesses</Text>
                            )}
                          </Pressable>
                        ) : null}
                      </>
                    ) : !loadingBiz && !bizError && scope === 'businesses' ? (
                      <View style={s.noResults}>
                        <MaterialIcons name="store-mall-directory" size={36} color={Colors.textMuted} />
                        <Text style={s.noResultsTitle}>No businesses found</Text>
                        <Text style={s.noResultsSub}>
                          Try a different name, category, or parish.
                        </Text>
                        <Pressable
                          onPress={() =>
                            router.push({
                              pathname: '/(tabs)/browse',
                              params: { discovery: 'businesses' },
                            } as any)
                          }
                          style={s.noResultsCta}
                        >
                          <Text style={s.noResultsCtaText}>Browse Businesses</Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                ) : null}

                {/* ── All mode: truly no results from either source ── */}
                {scope === 'all' && hasQuery && !isLoading && noEventsResult && noBizResult ? (
                  <View style={s.noResults}>
                    <MaterialIcons name="search-off" size={44} color={Colors.textMuted} />
                    <Text style={s.noResultsTitle}>
                      No results for &ldquo;{query.trim()}&rdquo;
                    </Text>
                    <Text style={s.noResultsSub}>
                      Try: different spelling · another parish · browse Explore
                    </Text>
                    <View style={s.noResultsRow}>
                      <Pressable
                        onPress={() => router.push('/(tabs)/browse' as any)}
                        style={[s.noResultsCta, { flex: 1 }]}
                      >
                        <Text style={s.noResultsCtaText}>Events</Text>
                      </Pressable>
                      <Pressable
                        onPress={() =>
                          router.push({
                            pathname: '/(tabs)/browse',
                            params: { discovery: 'businesses' },
                          } as any)
                        }
                        style={[s.noResultsCta, { flex: 1 }]}
                      >
                        <Text style={s.noResultsCtaText}>Businesses</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : null}

                <View style={{ height: 80 }} />
              </View>
            }
            ListFooterComponent={null}
          />
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm,
    gap: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
    marginBottom: Spacing.sm,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.surface,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.surfaceBorder, flexShrink: 0,
  },
  inputWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    height: 42, backgroundColor: Colors.surface,
    borderRadius: Radius.lg, paddingHorizontal: Spacing.md, gap: Spacing.sm,
    borderWidth: 1.5, borderColor: Colors.surfaceBorder,
  },
  input: {
    flex: 1, fontSize: Typography.base, color: Colors.textPrimary,
    paddingVertical: 0, includeFontPadding: false,
  },

  // Initial/empty state
  initialContent: { paddingHorizontal: Spacing.base, paddingTop: Spacing.md },

  recentSection: { marginBottom: Spacing.xl },
  recentHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontSize: Typography.xs, fontWeight: Typography.bold,
    color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1,
    marginBottom: Spacing.md,
  },
  clearAll: { fontSize: Typography.xs, color: Colors.gold, fontWeight: Typography.medium },
  recentList: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  recentPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.surface, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.surfaceBorder, minHeight: 36,
  },
  recentPillText: { fontSize: Typography.sm, color: Colors.textSecondary },

  // Results
  resultsContent: { paddingHorizontal: Spacing.base, paddingTop: Spacing.sm },

  parishBanner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: `${Colors.info}18`, borderRadius: Radius.md,
    padding: Spacing.sm, marginBottom: Spacing.md,
    borderWidth: 1, borderColor: `${Colors.info}30`,
  },
  parishBannerText: { fontSize: Typography.xs, color: Colors.info },

  seeAllBtn: {
    alignItems: 'center', paddingVertical: Spacing.md,
    borderRadius: Radius.lg, borderWidth: 1, borderColor: `${Colors.gold}44`,
    backgroundColor: Colors.goldSurface, marginBottom: Spacing.sm,
  },
  seeAllBtnText: { fontSize: Typography.xs, color: Colors.gold, fontWeight: Typography.semibold },

  loadMoreBtn: {
    alignItems: 'center', paddingVertical: Spacing.md,
    borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.surfaceBorder,
    backgroundColor: Colors.surface, marginTop: Spacing.sm,
  },
  loadMoreText: { fontSize: Typography.xs, color: Colors.textSecondary },

  errRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    padding: Spacing.md, backgroundColor: 'rgba(255,68,68,0.08)',
    borderRadius: Radius.md, marginBottom: Spacing.sm,
  },
  errText: { flex: 1, fontSize: Typography.xs, color: Colors.error },
  errRetry: { fontSize: Typography.xs, color: Colors.gold, fontWeight: Typography.bold },

  noResults: {
    alignItems: 'center', paddingTop: 48, paddingBottom: 32,
    gap: Spacing.md, paddingHorizontal: Spacing.xl,
  },
  noResultsTitle: {
    fontSize: Typography.md, fontWeight: Typography.bold,
    color: Colors.textSecondary, textAlign: 'center',
  },
  noResultsSub: {
    fontSize: Typography.sm, color: Colors.textMuted,
    textAlign: 'center', lineHeight: 20,
  },
  noResultsRow: { flexDirection: 'row', gap: Spacing.md, width: '100%' },
  noResultsCta: {
    backgroundColor: Colors.goldSurface, borderRadius: Radius.lg,
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.xl,
    borderWidth: 1, borderColor: `${Colors.gold}44`, alignItems: 'center',
  },
  noResultsCtaText: { fontSize: Typography.xs, color: Colors.gold, fontWeight: Typography.bold },
});
