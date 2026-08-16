// ─── Browse / Explore Tab ─────────────────────────────────────────────────────
// Unified shell shared by both Events and Businesses discovery modes.
// Header + toggle + search bar are rendered here and passed down as props
// so both modes use pixel-identical UI for those shared elements.

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import { useNotifications } from '../../hooks/useNotifications';
import EventsExplore from '../../components/feature/EventsExplore';
import BusinessExplore from '../../components/feature/BusinessExplore';

type DiscoveryMode = 'events' | 'businesses';

// ─── Segmented Toggle ─────────────────────────────────────────────────────────
// Fixed proportions — never resizes when switching mode.
function DiscoveryToggle({
  value,
  onChange,
}: {
  value: DiscoveryMode;
  onChange: (v: DiscoveryMode) => void;
}) {
  return (
    <View style={dt.wrap}>
      {(['events', 'businesses'] as const).map((mode) => {
        const active = value === mode;
        return (
          <Pressable
            key={mode}
            onPress={() => onChange(mode)}
            style={[dt.btn, active && dt.btnActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            hitSlop={4}
          >
            <MaterialIcons
              name={mode === 'events' ? 'event' : 'storefront'}
              size={14}
              color={active ? Colors.textOnGold : Colors.textSecondary}
            />
            <Text style={[dt.label, active && dt.labelActive]}>
              {mode === 'events' ? 'Events' : 'Businesses'}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const dt = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: 3,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    // Fixed height so switching mode never resizes the control
    height: 40,
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
  label: {
    fontSize: Typography.sm,
    color: Colors.textSecondary,
    fontWeight: Typography.medium,
  },
  labelActive: { color: Colors.textOnGold, fontWeight: Typography.bold },
});

// ─── Search Bar ───────────────────────────────────────────────────────────────
// Identical component for both modes — only placeholder changes.
function ExploreSearchBar({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (text: string) => void;
  placeholder: string;
}) {
  return (
    <View style={sb.bar}>
      <MaterialIcons name="search" size={19} color={Colors.textMuted} />
      <TextInput
        style={sb.input}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={Colors.textMuted}
        returnKeyType="search"
        autoCorrect={false}
        autoCapitalize="none"
        clearButtonMode="while-editing"
        accessibilityLabel={placeholder}
      />
      {value.length > 0 && Platform.OS !== 'ios' && (
        <Pressable onPress={() => onChange('')} hitSlop={8}>
          <MaterialIcons name="close" size={17} color={Colors.textMuted} />
        </Pressable>
      )}
    </View>
  );
}

const sb = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 46,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
    borderWidth: 1.5,
    borderColor: Colors.surfaceBorder,
    marginHorizontal: Spacing.base,
  },
  input: {
    flex: 1,
    fontSize: Typography.base,
    color: Colors.textPrimary,
    // suppress default padding on Android
    paddingVertical: 0,
    includeFontPadding: false,
  },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function BrowseScreen() {
  const params = useLocalSearchParams<{
    parish?: string;
    type?: string;
    dateFilter?: string;
    discovery?: string;
  }>();
  const router = useRouter();
  const { unreadCount } = useNotifications();

  const [mode, setMode] = useState<DiscoveryMode>(() =>
    params.discovery === 'businesses' ? 'businesses' : 'events'
  );

  // Separate search state per mode so switching tabs doesn't bleed queries
  const [eventSearch, setEventSearch] = useState('');
  const [bizSearch, setBizSearch] = useState('');

  const handleModeChange = useCallback((next: DiscoveryMode) => {
    setMode(next);
  }, []);

  const searchValue = mode === 'events' ? eventSearch : bizSearch;
  const searchSetter = mode === 'events' ? setEventSearch : setBizSearch;
  const searchPlaceholder =
    mode === 'events'
      ? 'Search events, venues, promoters...'
      : 'Search businesses...';

  return (
    <View style={s.container}>
      {/* ── Sticky header: title + notification bell ── */}
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        <View style={s.header}>
          {/* Row 1: title + bell */}
          <View style={s.titleRow}>
            <Text style={s.title}>Explore</Text>
            <Pressable
              onPress={() => router.push('/notifications' as any)}
              style={({ pressed }) => [s.bellBtn, pressed && { opacity: 0.75 }]}
              accessibilityLabel="Notifications"
              hitSlop={6}
            >
              <MaterialIcons name="notifications-none" size={22} color={Colors.textPrimary} />
              {unreadCount > 0 && (
                <View style={s.bellBadge}>
                  <Text style={s.bellBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                </View>
              )}
            </Pressable>
          </View>

          {/* Row 2: Events | Businesses toggle */}
          <DiscoveryToggle value={mode} onChange={handleModeChange} />
        </View>

        {/* Row 3: shared search bar — same dimensions for both modes */}
        <View style={s.searchWrap}>
          <ExploreSearchBar
            value={searchValue}
            onChange={searchSetter}
            placeholder={searchPlaceholder}
          />
        </View>
      </SafeAreaView>

      {/* ── Content ── */}
      <View style={s.content}>
        {mode === 'events' ? (
          <EventsExplore
            searchQuery={eventSearch}
            onSearchChange={setEventSearch}
            initialParish={params.parish}
            initialType={params.type}
            initialDateFilter={params.dateFilter}
          />
        ) : (
          <BusinessExplore
            searchQuery={bizSearch}
            onSearchChange={setBizSearch}
            initialParish={params.parish}
            initialCategory={undefined}
          />
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  header: {
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
    gap: Spacing.sm,
  },

  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: Typography.xl,
    fontWeight: Typography.black,
    color: Colors.textPrimary,
    letterSpacing: 0.2,
  },

  bellBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    position: 'relative',
  },
  bellBadge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    backgroundColor: Colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: Colors.background,
  },
  bellBadgeText: { fontSize: 8, fontWeight: Typography.black, color: Colors.textOnGold },

  searchWrap: {
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },

  content: { flex: 1 },
});
