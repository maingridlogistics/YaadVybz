// ─── Browse / Explore Tab ─────────────────────────────────────────────────────
// Thin wrapper: unified header + Events|Businesses discovery toggle.
// All event discovery logic lives in EventsExplore.
// All business discovery logic lives in BusinessExplore.

import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import { useNotifications } from '../../hooks/useNotifications';
import EventsExplore from '../../components/feature/EventsExplore';
import BusinessExplore from '../../components/feature/BusinessExplore';

type DiscoveryMode = 'events' | 'businesses';

// ─── Discovery Toggle ─────────────────────────────────────────────────────────
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
        const isActive = value === mode;
        return (
          <Pressable
            key={mode}
            onPress={() => onChange(mode)}
            style={[dt.btn, isActive && dt.btnActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
          >
            <MaterialIcons
              name={mode === 'events' ? 'event' : 'storefront'}
              size={15}
              color={isActive ? Colors.textOnGold : Colors.textSecondary}
            />
            <Text style={[dt.btnText, isActive && dt.btnTextActive]}>
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
  },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.sm,
  },
  btnActive: { backgroundColor: Colors.gold },
  btnText: { fontSize: Typography.sm, color: Colors.textMuted, fontWeight: Typography.medium },
  btnTextActive: { color: Colors.textOnGold, fontWeight: Typography.bold },
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

  const [discoveryMode, setDiscoveryMode] = useState<DiscoveryMode>(() =>
    params.discovery === 'businesses' ? 'businesses' : 'events'
  );

  return (
    <View style={s.container}>
      {/* ── Sticky header (shared by both modes) ── */}
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        <View style={s.header}>
          <View style={s.titleRow}>
            <Text style={s.title}>Explore</Text>
            <Pressable
              onPress={() => router.push('/notifications' as any)}
              style={({ pressed }) => [s.bellBtn, pressed && { opacity: 0.8 }]}
              accessibilityLabel="Notifications"
            >
              <MaterialIcons name="notifications" size={22} color={Colors.textPrimary} />
              {unreadCount > 0 && (
                <View style={s.bellBadge}>
                  <Text style={s.bellBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                </View>
              )}
            </Pressable>
          </View>

          {/* Events | Businesses toggle */}
          <DiscoveryToggle value={discoveryMode} onChange={setDiscoveryMode} />
        </View>
      </SafeAreaView>

      {/* ── Content ── */}
      {discoveryMode === 'events' ? (
        <EventsExplore
          initialParish={params.parish}
          initialType={params.type}
          initialDateFilter={params.dateFilter}
        />
      ) : (
        <BusinessExplore
          initialParish={params.parish}
          initialCategory={undefined}
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
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
  },
  bellBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
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
  bellBadgeText: {
    fontSize: 8,
    fontWeight: Typography.black,
    color: Colors.textOnGold,
  },
});
