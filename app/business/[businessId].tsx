// ─── Business Profile Page ────────────────────────────────────────────────────
// Placeholder: Full implementation authorized in next stage.
// Currently routes to a "coming soon" view so BusinessCard navigation doesn't crash.

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';

export default function BusinessProfileScreen() {
  const { businessId } = useLocalSearchParams<{ businessId: string }>();
  const router = useRouter();

  return (
    <View style={s.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        <View style={s.header}>
          <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={8}>
            <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
          </Pressable>
          <Text style={s.title}>Business Profile</Text>
          <View style={{ width: 40 }} />
        </View>
      </SafeAreaView>

      <View style={s.content}>
        <View style={s.iconWrap}>
          <MaterialIcons name="storefront" size={48} color={Colors.gold} />
        </View>
        <Text style={s.heading}>Full Profile Coming Soon</Text>
        <Text style={s.sub}>
          Business profiles are part of the next development stage.{'\n'}
          This page will display complete business information, photos, hours, services, and reviews.
        </Text>
        {businessId ? (
          <View style={s.idCard}>
            <MaterialIcons name="info-outline" size={13} color={Colors.textMuted} />
            <Text style={s.idText} numberOfLines={1}>ID: {businessId}</Text>
          </View>
        ) : null}
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [s.backBtnFull, pressed && { opacity: 0.8 }]}
        >
          <MaterialIcons name="arrow-back" size={16} color={Colors.textOnGold} />
          <Text style={s.backBtnText}>Go Back</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  title: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textPrimary },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    gap: Spacing.base,
  },
  iconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Colors.goldSurface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: `${Colors.gold}44`,
    marginBottom: Spacing.sm,
  },
  heading: {
    fontSize: Typography.lg,
    fontWeight: Typography.black,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  sub: {
    fontSize: Typography.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  idCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    maxWidth: '100%',
  },
  idText: { fontSize: 11, color: Colors.textMuted, flex: 1 },
  backBtnFull: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.gold,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
    marginTop: Spacing.sm,
  },
  backBtnText: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textOnGold },
});
