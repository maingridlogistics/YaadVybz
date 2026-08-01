import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Share,
  Platform,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEvents } from '../../hooks/useEvents';
import { useAuth } from '../../hooks/useAuth';
import { useLanguage } from '../../hooks/useLanguage';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import { formatDate, formatCount } from '../../constants/data';

// ─── Mock squad attendees ──────────────────────────────────────────────────────
const MOCK_ATTENDEES = [
  { id: 'a1', name: 'Marley B.',  emoji: '🎵', status: 'going' as const,      time: '2 days ago'  },
  { id: 'a2', name: 'Dev K.',     emoji: '🦁', status: 'going' as const,      time: '5 hrs ago'   },
  { id: 'a3', name: 'Tricia M.', emoji: '🌺', status: 'interested' as const,  time: 'Yesterday'   },
  { id: 'a4', name: 'Ziggy R.',   emoji: '🎸', status: 'going' as const,      time: '1 hr ago'    },
  { id: 'a5', name: 'Keisha P.', emoji: '⭐', status: 'maybe' as const,       time: '3 days ago'  },
  { id: 'a6', name: 'Omar T.',    emoji: '🔥', status: 'going' as const,      time: 'Just now'    },
];

type AttStatus = 'going' | 'interested' | 'maybe';

const STATUS_CFG: Record<AttStatus, { label: string; color: string; icon: string }> = {
  going:      { label: 'Going',      color: Colors.greenLight, icon: 'check-circle'  },
  interested: { label: 'Interested', color: Colors.gold,       icon: 'star'          },
  maybe:      { label: 'Maybe',      color: Colors.textMuted,  icon: 'help-outline'  },
};

// ─── Attendee row ──────────────────────────────────────────────────────────────
function AttendeeRow({ name, emoji, status, time }: {
  name: string;
  emoji: string;
  status: AttStatus;
  time: string;
}) {
  const cfg = STATUS_CFG[status];
  return (
    <View style={attStyles.row}>
      <View style={attStyles.avatar}>
        <Text style={attStyles.emoji}>{emoji}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={attStyles.name}>{name}</Text>
        <Text style={attStyles.time}>{time}</Text>
      </View>
      <View style={[attStyles.statusPill, { borderColor: `${cfg.color}55`, backgroundColor: `${cfg.color}15` }]}>
        <MaterialIcons name={cfg.icon as any} size={11} color={cfg.color} />
        <Text style={[attStyles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
      </View>
    </View>
  );
}

const attStyles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: Colors.surfaceBorder,
  },
  emoji: { fontSize: 22 },
  name: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textPrimary },
  time: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2 },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: Spacing.sm, paddingVertical: 4,
    borderRadius: Radius.full, borderWidth: 1, flexShrink: 0,
  },
  statusText: { fontSize: 11, fontWeight: Typography.semibold },
});

// ─── Invite card ──────────────────────────────────────────────────────────────
function InviteCard({ onInvite }: { onInvite: () => void }) {
  return (
    <Pressable
      onPress={onInvite}
      style={({ pressed }) => [invStyles.card, pressed && { opacity: 0.85 }]}
    >
      <LinearGradient
        colors={[Colors.goldSurface, Colors.surface]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={invStyles.iconWrap}>
        <MaterialIcons name="person-add" size={26} color={Colors.gold} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={invStyles.label}>Invite Your Crew</Text>
        <Text style={invStyles.sub}>Share the event link with friends</Text>
      </View>
      <MaterialIcons name="arrow-forward-ios" size={14} color={Colors.gold} />
    </Pressable>
  );
}

const invStyles = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    borderRadius: Radius.xl, padding: Spacing.base,
    borderWidth: 1, borderColor: `${Colors.gold}33`, overflow: 'hidden', position: 'relative',
  },
  iconWrap: {
    width: 50, height: 50, borderRadius: 25,
    backgroundColor: Colors.goldSurface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: `${Colors.gold}44`,
  },
  label: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.gold },
  sub: { fontSize: Typography.sm, color: Colors.textMuted, marginTop: 2 },
});

// ─── Stat chip ────────────────────────────────────────────────────────────────
function SquadStat({ icon, label, value, color }: {
  icon: string; label: string; value: string | number; color: string;
}) {
  return (
    <View style={statStyles.chip}>
      <View style={[statStyles.iconBg, { backgroundColor: `${color}18` }]}>
        <MaterialIcons name={icon as any} size={18} color={color} />
      </View>
      <Text style={statStyles.value}>{value}</Text>
      <Text style={statStyles.label}>{label}</Text>
    </View>
  );
}

const statStyles = StyleSheet.create({
  chip: {
    flex: 1, alignItems: 'center', gap: 4,
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.surfaceBorder, padding: Spacing.md,
  },
  iconBg: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  value: { fontSize: Typography.lg, fontWeight: Typography.black, color: Colors.textPrimary },
  label: { fontSize: 10, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.3, textAlign: 'center' },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function SquadScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { getEventById, userGoingIds } = useEvents();
  const { t } = useLanguage();

  const [mySquad, setMySquad] = useState<typeof MOCK_ATTENDEES>([]);
  const [inviteSent, setInviteSent] = useState(false);

  const event = getEventById(eventId ?? '');

  if (!event) {
    return (
      <View style={styles.notFound}>
        <SafeAreaView edges={['top']} />
        <MaterialIcons name="group-off" size={40} color={Colors.textMuted} />
        <Text style={styles.notFoundText}>Event not found</Text>
        <Pressable onPress={() => router.back()} style={styles.backLink}>
          <Text style={styles.backLinkText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const isGoing = userGoingIds.includes(event.id);
  const goingCount = MOCK_ATTENDEES.filter((a) => a.status === 'going').length;
  const interestedCount = MOCK_ATTENDEES.filter((a) => a.status === 'interested').length;

  const handleInvite = async () => {
    const shareText =
      `🇯🇲 ${t.squadTitle}: ${event.title}\n` +
      `📅 ${formatDate(event.date)} · ${event.startTime}\n` +
      `📍 ${event.venue}, ${event.parish}\n\n` +
      `${user ? user.name : 'Someone'} wants you to come through! Open Vybz Hub to RSVP.`;

    try {
      await Share.share({ message: shareText, title: `${t.squadTitle} — ${event.title}` });
      setInviteSent(true);
    } catch (_) {}
  };

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        <View style={styles.topBar}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
          >
            <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.topBarTitle}>{t.squadTitle}</Text>
            <Text style={styles.topBarSub}>{t.squadSub}</Text>
          </View>
          {inviteSent && (
            <View style={styles.sentBadge}>
              <MaterialIcons name="check" size={12} color={Colors.greenLight} />
              <Text style={styles.sentBadgeText}>Sent!</Text>
            </View>
          )}
        </View>
      </SafeAreaView>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

        {/* Event card */}
        <Pressable
          onPress={() => router.push(`/event/${event.id}` as any)}
          style={({ pressed }) => [styles.eventCard, pressed && { opacity: 0.9 }]}
        >
          <Image source={{ uri: event.coverImage }} style={styles.eventImg} contentFit="cover" transition={200} />
          <LinearGradient colors={['transparent', 'rgba(0,0,0,0.7)']} style={StyleSheet.absoluteFillObject} />
          <View style={styles.eventInfo}>
            <Text style={styles.eventTitle} numberOfLines={2}>{event.title}</Text>
            <View style={styles.eventMeta}>
              <MaterialIcons name="event" size={12} color={Colors.gold} />
              <Text style={styles.eventMetaText}>{formatDate(event.date)} · {event.startTime}</Text>
            </View>
            <View style={styles.eventMeta}>
              <MaterialIcons name="place" size={12} color={Colors.textSecondary} />
              <Text style={styles.eventMetaText}>{event.venue}, {event.parish}</Text>
            </View>
          </View>
          {!isGoing && (
            <View style={styles.notGoingBanner}>
              <MaterialIcons name="info-outline" size={12} color={Colors.gold} />
              <Text style={styles.notGoingText}>Mark yourself Going on the event page to join the squad</Text>
            </View>
          )}
        </Pressable>

        {/* Stats row */}
        <View style={styles.statsRow}>
          <SquadStat icon="check-circle" label="Going" value={goingCount} color={Colors.greenLight} />
          <SquadStat icon="star" label="Interested" value={interestedCount} color={Colors.gold} />
          <SquadStat icon="people" label="Total" value={formatCount(event.goingCount + event.interestedCount)} color="#9C27B0" />
        </View>

        {/* Invite card */}
        <InviteCard onInvite={handleInvite} />

        {/* Your crew */}
        {user && isGoing && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionBar} />
              <Text style={styles.sectionTitle}>Your Squad</Text>
            </View>
            <View style={styles.yourSquadCard}>
              <View style={styles.yourRow}>
                <View style={styles.youAvatar}>
                  <Text style={styles.youAvatarLetter}>{user.name[0].toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.youName}>{user.name} <Text style={styles.youTag}>(You)</Text></Text>
                  <Text style={styles.youStatus}>You are going 🎉</Text>
                </View>
                <View style={[attStyles.statusPill, { borderColor: `${Colors.greenLight}55`, backgroundColor: `${Colors.greenLight}15` }]}>
                  <MaterialIcons name="check-circle" size={11} color={Colors.greenLight} />
                  <Text style={[attStyles.statusText, { color: Colors.greenLight }]}>Going</Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Friends section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionBar} />
            <Text style={styles.sectionTitle}>{t.friendsGoing}</Text>
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{MOCK_ATTENDEES.length}</Text>
            </View>
          </View>
          <View style={styles.attendeeCard}>
            {MOCK_ATTENDEES.map((att, i) => (
              <React.Fragment key={att.id}>
                {i > 0 && <View style={styles.rowDivider} />}
                <AttendeeRow {...att} />
              </React.Fragment>
            ))}
          </View>
        </View>

        {/* Squad Chat teaser */}
        <View style={styles.chatTeaser}>
          <LinearGradient
            colors={['#1A0D4A', Colors.surface]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={styles.chatTeaserContent}>
            <View style={styles.chatTeaserIcon}>
              <MaterialIcons name="chat-bubble-outline" size={28} color="#9C27B0" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.chatTeaserTitle}>Squad Chat</Text>
              <Text style={styles.chatTeaserSub}>Real-time group chat with your crew is coming soon.</Text>
            </View>
            <View style={styles.comingSoonBadge}>
              <Text style={styles.comingSoonText}>Soon</Text>
            </View>
          </View>
        </View>

        {/* Invite CTA */}
        <Pressable
          onPress={handleInvite}
          style={({ pressed }) => [styles.inviteBtn, pressed && { opacity: 0.85 }]}
        >
          <LinearGradient colors={[Colors.gold, Colors.goldDim]} style={styles.inviteBtnInner}>
            <MaterialIcons name="share" size={18} color={Colors.textOnGold} />
            <Text style={styles.inviteBtnText}>{t.inviteSquad}</Text>
          </LinearGradient>
        </Pressable>

        <View style={{ height: insets.bottom + Spacing.xxl }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  notFound: { flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
  notFoundText: { fontSize: Typography.base, color: Colors.textMuted },
  backLink: { paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm, backgroundColor: Colors.surface, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.surfaceBorder },
  backLinkText: { fontSize: Typography.sm, color: Colors.gold, fontWeight: Typography.semibold },

  topBar: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.surfaceBorder },
  topBarTitle: { fontSize: Typography.lg, fontWeight: Typography.black, color: Colors.textPrimary },
  topBarSub: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 1 },
  sentBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.greenSurface, paddingHorizontal: Spacing.sm, paddingVertical: 4,
    borderRadius: Radius.full, borderWidth: 1, borderColor: `${Colors.greenLight}33`,
  },
  sentBadgeText: { fontSize: Typography.xs, color: Colors.greenLight, fontWeight: Typography.bold },

  content: { padding: Spacing.base, gap: Spacing.lg },

  eventCard: {
    height: 160, borderRadius: Radius.xl, overflow: 'hidden',
    borderWidth: 1, borderColor: Colors.surfaceBorder, position: 'relative',
  },
  eventImg: { ...StyleSheet.absoluteFillObject },
  eventInfo: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: Spacing.md, gap: 4 },
  eventTitle: { fontSize: Typography.md, fontWeight: Typography.black, color: '#fff', lineHeight: 24 },
  eventMeta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  eventMetaText: { fontSize: Typography.xs, color: 'rgba(255,255,255,0.8)' },
  notGoingBanner: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(255,215,0,0.15)', paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs,
    borderBottomWidth: 1, borderBottomColor: `${Colors.gold}33`,
  },
  notGoingText: { flex: 1, fontSize: 10, color: Colors.gold, lineHeight: 14 },

  statsRow: { flexDirection: 'row', gap: Spacing.sm },

  section: { gap: Spacing.md },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  sectionBar: { width: 3, height: 18, borderRadius: 2, backgroundColor: Colors.gold },
  sectionTitle: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textPrimary, flex: 1 },
  countBadge: {
    backgroundColor: Colors.goldSurface, paddingHorizontal: Spacing.sm, paddingVertical: 3,
    borderRadius: Radius.full, borderWidth: 1, borderColor: `${Colors.gold}33`,
  },
  countBadgeText: { fontSize: 11, fontWeight: Typography.bold, color: Colors.gold },

  yourSquadCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.surfaceBorder, padding: Spacing.md,
  },
  yourRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  youAvatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.goldSurface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: Colors.gold,
  },
  youAvatarLetter: { fontSize: 20, fontWeight: Typography.black, color: Colors.gold },
  youName: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textPrimary },
  youTag: { color: Colors.textMuted, fontWeight: Typography.regular },
  youStatus: { fontSize: Typography.xs, color: Colors.greenLight, marginTop: 2 },

  attendeeCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.surfaceBorder, paddingHorizontal: Spacing.md,
  },
  rowDivider: { height: 1, backgroundColor: Colors.surfaceBorder },

  chatTeaser: {
    borderRadius: Radius.xl, overflow: 'hidden',
    borderWidth: 1, borderColor: '#7B1FA233', position: 'relative',
  },
  chatTeaserContent: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.base,
  },
  chatTeaserIcon: {
    width: 50, height: 50, borderRadius: 25,
    backgroundColor: '#9C27B018', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#9C27B033',
  },
  chatTeaserTitle: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textPrimary },
  chatTeaserSub: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2, lineHeight: 17 },
  comingSoonBadge: {
    backgroundColor: '#9C27B022', paddingHorizontal: Spacing.sm, paddingVertical: 4,
    borderRadius: Radius.full, borderWidth: 1, borderColor: '#9C27B044',
  },
  comingSoonText: { fontSize: Typography.xs, color: '#CE93D8', fontWeight: Typography.bold },

  inviteBtn: { borderRadius: Radius.lg, overflow: 'hidden' },
  inviteBtnInner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, paddingVertical: Spacing.base,
  },
  inviteBtnText: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textOnGold },
});
