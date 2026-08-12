import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEvents } from '../hooks/useEvents';
import { EventCardFeatured } from '../components/feature/EventCardFeatured';
import { Colors, Typography, Spacing, Radius } from '../constants/theme';

export default function FeaturedEventsScreen() {
  const router = useRouter();
  const { getFeaturedEvents, events } = useEvents();
  const featured = useMemo(() => getFeaturedEvents(), [events]);

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
          >
            <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Featured Events</Text>
            <Text style={styles.sub}>{featured.length} event{featured.length !== 1 ? 's' : ''}</Text>
          </View>
          <View style={styles.badge}>
            <MaterialIcons name="star" size={13} color={Colors.textOnGold} />
            <Text style={styles.badgeText}>Featured</Text>
          </View>
        </View>
      </SafeAreaView>

      {featured.length === 0 ? (
        <View style={styles.emptyState}>
          <LinearGradient
            colors={[Colors.goldSurface, Colors.surface]}
            style={styles.emptyIconWrap}
          >
            <MaterialIcons name="star-border" size={40} color={Colors.gold} />
          </LinearGradient>
          <Text style={styles.emptyTitle}>No Featured Events</Text>
          <Text style={styles.emptySub}>
            Featured events are hand-picked by our team. Check back soon for highlighted events.
          </Text>
          <Pressable
            onPress={() => router.push('/(tabs)/browse' as any)}
            style={({ pressed }) => [styles.browseBtn, pressed && { opacity: 0.85 }]}
          >
            <LinearGradient
              colors={[Colors.gold, Colors.goldDim]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.browseBtnInner}
            >
              <MaterialIcons name="search" size={16} color={Colors.textOnGold} />
              <Text style={styles.browseBtnText}>Browse All Events</Text>
            </LinearGradient>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={featured}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.cardWrap}>
              <EventCardFeatured event={item} />
            </View>
          )}
          ListHeaderComponent={
            <View style={styles.listHeader}>
              <MaterialIcons name="info-outline" size={14} color={Colors.gold} />
              <Text style={styles.listHeaderText}>
                Featured events are curated by the Vybz Hub team.
              </Text>
            </View>
          }
          ListFooterComponent={<View style={{ height: Spacing.xxl * 2 }} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
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
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  title: {
    fontSize: Typography.lg,
    fontWeight: Typography.black,
    color: Colors.textPrimary,
  },
  sub: {
    fontSize: Typography.xs,
    color: Colors.textMuted,
    marginTop: 1,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.gold,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  badgeText: {
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    color: Colors.textOnGold,
  },

  list: {
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.md,
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.goldSurface,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: `${Colors.gold}33`,
  },
  listHeaderText: {
    flex: 1,
    fontSize: Typography.xs,
    color: Colors.gold,
    lineHeight: 17,
  },
  cardWrap: {
    marginBottom: Spacing.md,
  },

  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    gap: Spacing.lg,
  },
  emptyIconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: `${Colors.gold}33`,
  },
  emptyTitle: {
    fontSize: Typography.xl,
    fontWeight: Typography.black,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  emptySub: {
    fontSize: Typography.base,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
  },
  browseBtn: {
    alignSelf: 'stretch',
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  browseBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.base,
  },
  browseBtnText: {
    fontSize: Typography.base,
    fontWeight: Typography.bold,
    color: Colors.textOnGold,
  },
});
