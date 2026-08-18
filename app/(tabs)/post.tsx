import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Switch,
  Modal,
  Keyboard,
} from 'react-native';
import { useEventConflictCheck } from '../../hooks/useEventConflictCheck';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { useEvents } from '../../hooks/useEvents';
import { useNotifications } from '../../hooks/useNotifications';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import { RECURRING_OPTIONS, Event, formatDate, PhysicalTicketLocation } from '../../constants/data';
import { normalizeEventTitle } from '../../constants/textNormalization';
import { useCategories } from '../../hooks/useCategories';
import { notifyParishUsersNewEvent, notifyFollowersNewEvent } from '../../services/emailService';
// checkPostQuota (non-consuming UX pre-check) is available from subscriptionService
// if needed in future for inline quota display. The DB trigger is the authoritative enforcer.
import { uploadEventImages, formatBytes, ImageUploadProgress } from '../../lib/storage';
import { PlacementAd } from '../../components/ui/PlacementAd';
import { PhoneInput } from '../../components/ui/PhoneInput';
// ExpoImage alias used by ConflictNudge for thumbnails — same package as Image above
const ExpoImage = Image;

// ─── Constants ────────────────────────────────────────────────────────────────
const TOTAL_STEPS = 7;
const STEP_LABELS = ['Basic Info', 'Location', 'Category', 'Flyer', 'Pricing', 'Contact', 'Review'];

const FLYER_GALLERY = [
  { id: 'g1',  uri: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400&q=80', label: 'Concert' },
  { id: 'g2',  uri: 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=400&q=80', label: 'Show' },
  { id: 'g3',  uri: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=400&q=80', label: 'Club Night' },
  { id: 'g4',  uri: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=400&q=80', label: 'Beach' },
  { id: 'g5',  uri: 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=400&q=80', label: 'Beach Party' },
  { id: 'g6',  uri: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=400&q=80', label: 'Food & Culture' },
  { id: 'g7',  uri: 'https://images.unsplash.com/photo-1540575467537-4952d2c7fa62?w=400&q=80', label: 'Festival' },
  { id: 'g8',  uri: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&q=80', label: 'Music' },
  { id: 'g9',  uri: 'https://images.unsplash.com/photo-1429962714451-bb934ecdc4ec?w=400&q=80', label: 'Street Party' },
  { id: 'g10', uri: 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=400&q=80', label: 'DJ Set' },
  { id: 'g11', uri: 'https://images.unsplash.com/photo-1598387993441-a364f854c3e1?w=400&q=80', label: 'Cultural' },
  { id: 'g12', uri: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=400&q=80', label: 'Crowd' },
  { id: 'g13', uri: 'https://images.unsplash.com/photo-1571019613914-85f342c6a11e?w=400&q=80', label: 'Tropical' },
  { id: 'g14', uri: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=400&q=80', label: 'Food Event' },
  { id: 'g15', uri: 'https://images.unsplash.com/photo-1496337589254-7e19d01cec44?w=400&q=80', label: 'Dance Floor' },
];

const AGE_OPTIONS = ['All Ages', '18+', '21+'];
const PERFORMER_ROLES = ['DJ', 'Artist', 'MC', 'Host', 'Band', 'Live Act', 'Comedian', 'Sound System', 'Other'];

// ─── Date/Time picker constants ───────────────────────────────────────────────
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const HOURS  = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
const MINS   = ['00', '15', '30', '45'];
const PERIODS: ('AM' | 'PM')[] = ['AM', 'PM'];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function formatDisplayDate(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

// ─── Date Picker Modal ────────────────────────────────────────────────────────
function DatePickerModal({
  visible,
  value,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  value: string;
  onConfirm: (iso: string) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const today = new Date();
  const parsed = value ? value.split('-').map(Number) : [today.getFullYear(), today.getMonth() + 1, 1];
  const [year, setYear]   = useState(parsed[0]);
  const [month, setMonth] = useState(parsed[1] - 1); // 0-based
  const [day, setDay]     = useState(parsed[2]);

  const daysInMonth = getDaysInMonth(year, month);
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
    setDay(1);
  };
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
    setDay(1);
  };

  const handleConfirm = () => {
    const iso = `${year}-${String(month + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    onConfirm(iso);
    onClose();
  };

  // First day of week offset (0=Sun)
  const firstDOW = new Date(year, month, 1).getDay();
  const calCells: (number | null)[] = [
    ...Array(firstDOW).fill(null),
    ...days,
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={pickerStyles.overlay} onPress={onClose}>
        <Pressable style={[pickerStyles.sheet, { paddingBottom: Math.max(Spacing.xxl, insets.bottom + Spacing.base) }]} onPress={(e) => e.stopPropagation()}>
          <View style={pickerStyles.handle} />
          <Text style={pickerStyles.title}>Select Date</Text>

          {/* Month navigation */}
          <View style={pickerStyles.monthNav}>
            <Pressable onPress={prevMonth} style={pickerStyles.navBtn} hitSlop={12}>
              <MaterialIcons name="chevron-left" size={24} color={Colors.textPrimary} />
            </Pressable>
            <Text style={pickerStyles.monthLabel}>{MONTHS[month]} {year}</Text>
            <Pressable onPress={nextMonth} style={pickerStyles.navBtn} hitSlop={12}>
              <MaterialIcons name="chevron-right" size={24} color={Colors.textPrimary} />
            </Pressable>
          </View>

          {/* Day of week header */}
          <View style={pickerStyles.dowRow}>
            {['Su','Mo','Tu','We','Th','Fr','Sa'].map((d) => (
              <Text key={d} style={pickerStyles.dowText}>{d}</Text>
            ))}
          </View>

          {/* Calendar grid — one <View> row per week to avoid floating-point % overflow */}
          {(() => {
            const weeks: (number | null)[][] = [];
            for (let i = 0; i < calCells.length; i += 7) {
              const week = calCells.slice(i, i + 7);
              // Pad last week to 7 cells
              while (week.length < 7) week.push(null);
              weeks.push(week);
            }
            return weeks.map((week, wi) => (
              <View key={wi} style={pickerStyles.calRow}>
                {week.map((cell, ci) => (
                  <Pressable
                    key={ci}
                    onPress={() => { if (cell) setDay(cell); }}
                    disabled={!cell}
                    style={({ pressed }) => [
                      pickerStyles.calCell,
                      cell === day && pickerStyles.calCellSelected,
                      !cell && { opacity: 0 },
                      (pressed && !!cell) ? { opacity: 0.75 } : undefined,
                    ]}
                  >
                    <Text style={[pickerStyles.calCellText, cell === day && pickerStyles.calCellTextSelected]}>
                      {cell ?? ''}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ));
          })()}

          <Pressable onPress={handleConfirm} style={pickerStyles.confirmBtn}>
            <LinearGradient colors={[Colors.gold, Colors.goldDim]} start={{ x:0,y:0 }} end={{ x:1,y:0 }} style={pickerStyles.confirmBtnInner}>
              <MaterialIcons name="check" size={18} color={Colors.textOnGold} />
              <Text style={pickerStyles.confirmText}>Confirm Date</Text>
            </LinearGradient>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Time Picker Modal ─────────────────────────────────────────────────────────
function TimePickerModal({
  visible,
  label,
  value,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  label: string;
  value: string;
  onConfirm: (time: string) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  // Parse existing value like "8:00 PM" or default
  const parseTime = (v: string) => {
    const match = v.match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (match) return { h: match[1].padStart(2,'0'), m: match[2].padStart(2,'0') as any, p: match[3].toUpperCase() as 'AM'|'PM' };
    return { h: '08', m: '00', p: 'PM' as const };
  };
  const init = parseTime(value);
  const [hour, setHour]     = useState(init.h);
  const [minute, setMinute] = useState<string>(init.m);
  const [period, setPeriod] = useState<'AM'|'PM'>(init.p);

  const handleConfirm = () => {
    onConfirm(`${parseInt(hour, 10)}:${minute} ${period}`);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={pickerStyles.overlay} onPress={onClose}>
        <Pressable style={[pickerStyles.sheet, { paddingBottom: Math.max(Spacing.xxl, insets.bottom + Spacing.base) }]} onPress={(e) => e.stopPropagation()}>
          <View style={pickerStyles.handle} />
          <Text style={pickerStyles.title}>{label}</Text>

          {/* Preview */}
          <View style={pickerStyles.timePreview}>
            <MaterialIcons name="access-time" size={20} color={Colors.gold} />
            <Text style={pickerStyles.timePreviewText}>
              {parseInt(hour, 10)}:{minute} {period}
            </Text>
          </View>

          <View style={pickerStyles.timePickerRow}>
            {/* Hour */}
            <View style={pickerStyles.timeCol}>
              <Text style={pickerStyles.timeColLabel}>Hour</Text>
              <ScrollView style={pickerStyles.timeScroll} showsVerticalScrollIndicator={false}>
                {HOURS.map((h) => (
                  <Pressable key={h} onPress={() => setHour(h)}
                    style={[pickerStyles.timeItem, hour === h && pickerStyles.timeItemSelected]}>
                    <Text style={[pickerStyles.timeItemText, hour === h && pickerStyles.timeItemTextSelected]}>
                      {parseInt(h, 10)}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            <Text style={pickerStyles.timeColon}>:</Text>

            {/* Minute */}
            <View style={pickerStyles.timeCol}>
              <Text style={pickerStyles.timeColLabel}>Min</Text>
              <ScrollView style={pickerStyles.timeScroll} showsVerticalScrollIndicator={false}>
                {MINS.map((mn) => (
                  <Pressable key={mn} onPress={() => setMinute(mn)}
                    style={[pickerStyles.timeItem, minute === mn && pickerStyles.timeItemSelected]}>
                    <Text style={[pickerStyles.timeItemText, minute === mn && pickerStyles.timeItemTextSelected]}>
                      {mn}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            {/* AM/PM */}
            <View style={pickerStyles.timeCol}>
              <Text style={pickerStyles.timeColLabel}>Period</Text>
              <View style={pickerStyles.periodCol}>
                {PERIODS.map((p) => (
                  <Pressable key={p} onPress={() => setPeriod(p)}
                    style={[pickerStyles.periodBtn, period === p && pickerStyles.periodBtnActive]}>
                    <Text style={[pickerStyles.periodText, period === p && pickerStyles.periodTextActive]}>{p}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>

          <Pressable onPress={handleConfirm} style={pickerStyles.confirmBtn}>
            <LinearGradient colors={[Colors.gold, Colors.goldDim]} start={{ x:0,y:0 }} end={{ x:1,y:0 }} style={pickerStyles.confirmBtnInner}>
              <MaterialIcons name="check" size={18} color={Colors.textOnGold} />
              <Text style={pickerStyles.confirmText}>Confirm Time</Text>
            </LinearGradient>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Conflict Nudge ───────────────────────────────────────────────────────────
// Shows a non-blocking informational card when other live events exist on the
// same calendar date and in the same parish as the promoter's new event.
// The promoter is NEVER prevented from continuing — this is advisory only.
//
// Dismissed state is tracked per unique date+parish key so the nudge
// reappears automatically when the promoter changes either value.
function ConflictNudge({
  date,
  parish,
  onViewEvent,
}: {
  date: string;
  parish: string;
  onViewEvent: (eventId: string) => void;
}) {
  const conflictingEvents = useEventConflictCheck(date, parish);
  const [dismissedKeys, setDismissedKeys] = useState<Set<string>>(new Set());

  const key = `${date}_${parish}`;
  const isDismissed = dismissedKeys.has(key);
  const count = conflictingEvents.length;

  if (!date || !parish || count === 0 || isDismissed) return null;

  const dismiss = () =>
    setDismissedKeys((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });

  const preview = conflictingEvents.slice(0, 3);
  const overflow = count - preview.length;

  const headingText =
    count === 1
      ? `Another event is happening in ${parish} on this date.`
      : `${count} other events are happening in ${parish} on this date.`;

  return (
    <View style={nudgeStyles.card}>
      {/* Header */}
      <View style={nudgeStyles.headerRow}>
        <MaterialIcons name="info-outline" size={16} color="#FF9800" />
        <Text style={nudgeStyles.heading}>{headingText}</Text>
        <Pressable onPress={dismiss} hitSlop={8} style={nudgeStyles.closeBtn}>
          <MaterialIcons name="close" size={16} color={Colors.textMuted} />
        </Pressable>
      </View>

      <Text style={nudgeStyles.sub}>
        You can still continue with your event. We just wanted to let you know.
      </Text>

      {/* Conflicting event list */}
      <View style={nudgeStyles.eventList}>
        {preview.map((evt) => (
          <View key={evt.id} style={nudgeStyles.eventRow}>
            {evt.coverImage ? (
              <ExpoImage
                source={{ uri: evt.coverImage }}
                style={nudgeStyles.thumb}
                contentFit="cover"
                transition={150}
              />
            ) : (
              <View style={[nudgeStyles.thumb, nudgeStyles.thumbPlaceholder]}>
                <MaterialIcons name="event" size={16} color={Colors.textMuted} />
              </View>
            )}

            <View style={nudgeStyles.eventInfo}>
              <Text style={nudgeStyles.eventTitle} numberOfLines={1}>{evt.title}</Text>
              <View style={nudgeStyles.eventMeta}>
                <MaterialIcons name="access-time" size={10} color={Colors.textMuted} />
                <Text style={nudgeStyles.eventMetaText}>
                  {evt.startTime && evt.startTime !== 'TBA' ? evt.startTime : 'Time TBA'}
                </Text>
                {evt.venue ? (
                  <>
                    <Text style={nudgeStyles.dot}>{'·'}</Text>
                    <MaterialIcons name="place" size={10} color={Colors.textMuted} />
                    <Text style={nudgeStyles.eventMetaText} numberOfLines={1}>{evt.venue}</Text>
                  </>
                ) : null}
              </View>
            </View>

            <Pressable
              onPress={() => onViewEvent(evt.id)}
              style={({ pressed }) => [nudgeStyles.viewBtn, pressed && { opacity: 0.7 }]}
              hitSlop={4}
            >
              <Text style={nudgeStyles.viewBtnText}>View</Text>
              <MaterialIcons name="open-in-new" size={10} color={Colors.gold} />
            </Pressable>
          </View>
        ))}

        {overflow > 0 && (
          <View style={nudgeStyles.overflowRow}>
            <MaterialIcons name="more-horiz" size={14} color={Colors.textMuted} />
            <Text style={nudgeStyles.overflowText}>+{overflow} more event{overflow !== 1 ? 's' : ''}</Text>
          </View>
        )}
      </View>

      {/* Dismiss CTA */}
      <Pressable
        onPress={dismiss}
        style={({ pressed }) => [nudgeStyles.continueBtn, pressed && { opacity: 0.7 }]}
      >
        <Text style={nudgeStyles.continueBtnText}>Continue Anyway</Text>
        <MaterialIcons name="arrow-forward" size={14} color={Colors.gold} />
      </Pressable>
    </View>
  );
}

const nudgeStyles = StyleSheet.create({
  card: {
    backgroundColor: '#1A1000',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,152,0,0.35)',
    padding: Spacing.md,
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  heading: {
    flex: 1,
    fontSize: Typography.sm,
    fontWeight: Typography.bold as any,
    color: '#FFB74D',
    lineHeight: 18,
  },
  closeBtn: {
    flexShrink: 0,
    marginTop: 1,
  },
  sub: {
    fontSize: Typography.xs,
    color: Colors.textMuted,
    lineHeight: 17,
  },
  eventList: {
    gap: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,152,0,0.15)',
    paddingTop: Spacing.sm,
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  thumb: {
    width: 40,
    height: 40,
    borderRadius: Radius.sm,
    flexShrink: 0,
  },
  thumbPlaceholder: {
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  eventInfo: {
    flex: 1,
    gap: 2,
  },
  eventTitle: {
    fontSize: Typography.sm,
    fontWeight: Typography.semibold as any,
    color: Colors.textPrimary,
  },
  eventMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    flexWrap: 'wrap',
  },
  eventMetaText: {
    fontSize: 10,
    color: Colors.textMuted,
    maxWidth: 100,
  },
  dot: {
    fontSize: 10,
    color: Colors.textMuted,
  },
  viewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    backgroundColor: Colors.goldSurface,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: `${Colors.gold}44`,
    flexShrink: 0,
  },
  viewBtnText: {
    fontSize: 10,
    fontWeight: Typography.bold as any,
    color: Colors.gold,
  },
  overflowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingTop: Spacing.xs,
  },
  overflowText: {
    fontSize: Typography.xs,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
  continueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,152,0,0.15)',
    marginTop: Spacing.xs,
  },
  continueBtnText: {
    fontSize: Typography.sm,
    fontWeight: Typography.semibold as any,
    color: Colors.gold,
  },
});

const DRAFT_STORAGE_KEY = 'vybzhub_post_draft';

const INITIAL_FORM = {
  eventPhotosLink: '',
  title: '',
  description: '',
  date: '',
  startTime: '',
  endTime: '',
  parish: '',
  venue: '',
  address: '',
  eventTypes: [] as string[],
  recurring: false,
  recurringFrequency: 'Weekly',
  flyerImages: [FLYER_GALLERY[0].uri],
  customImageUrl: '',
  ticketPrice: '',
  isFree: false,
  ageLimit: 'All Ages',
  dressCode: '',
  lineupRoleInput: 'DJ',
  lineupNameInput: '',
  lineupEntries: [] as { name: string; role: string }[],
  ticketLink: '',
  contactInfo: '',
  useVybzHub: false,
  useExternalTicket: false,
  usePhysicalLocations: false,
  ticketProviderName: '',
  physicalLocations: [] as PhysicalTicketLocation[],
};

// ─── Step Progress Bar ─────────────────────────────────────────────────────────
function StepProgress({ currentStep }: { currentStep: number }) {
  return (
    <View style={progressStyles.container}>
      {STEP_LABELS.map((label, index) => (
        <React.Fragment key={index}>
          <View style={progressStyles.stepCol}>
            <View style={[
              progressStyles.circle,
              index < currentStep && progressStyles.circleCompleted,
              index === currentStep && progressStyles.circleCurrent,
            ]}>
              {index < currentStep ? (
                <MaterialIcons name="check" size={9} color={Colors.textOnGold} />
              ) : (
                <Text style={[progressStyles.num, index === currentStep && progressStyles.numCurrent]}>
                  {index + 1}
                </Text>
              )}
            </View>
            {index === currentStep && (
              <Text style={progressStyles.label} numberOfLines={1}>{label}</Text>
            )}
          </View>
          {index < TOTAL_STEPS - 1 && (
            <View style={[progressStyles.line, index < currentStep && progressStyles.lineActive]} />
          )}
        </React.Fragment>
      ))}
    </View>
  );
}

const progressStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  stepCol: { alignItems: 'center', gap: 2 },
  circle: {
    width: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.surfaceBorder,
  },
  circleCompleted: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  circleCurrent: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  num: { fontSize: 9, fontWeight: Typography.bold, color: Colors.textMuted },
  numCurrent: { color: Colors.textOnGold },
  label: { fontSize: 8, color: Colors.gold, fontWeight: Typography.semibold, letterSpacing: 0.2, maxWidth: 44 },
  line: { flex: 1, height: 1.5, backgroundColor: Colors.surfaceBorder, marginBottom: 10, minWidth: 4 },
  lineActive: { backgroundColor: Colors.gold },
});

// ─── Main Component ────────────────────────────────────────────────────────────
export default function PostScreen() {
  const { user, addPromoterRole, requireEventApproval } = useAuth();
  const { postEvent, allEvents } = useEvents();
  const { addNotification } = useNotifications();
  const { parishes, eventTypes } = useCategories();
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);

  const isPromoter = user?.roles.includes('promoter') ?? false;
  const [becomingPromoter, setBecomingPromoter] = useState(false);

  // ── Free-plan event limit check (3 events per calendar month) ──────────────
  const thisMonthPostedCount = useMemo(() => {
    if (!user || (user.subscriptionTier ?? 'free') !== 'free') return 0;
    const now = new Date();
    return allEvents.filter((e) => {
      if (e.promoterId !== user.id || e.status === 'rejected') return false;
      const posted = e.createdAt ? new Date(e.createdAt) : null;
      if (posted) return posted.getFullYear() === now.getFullYear() && posted.getMonth() === now.getMonth();
      // Fallback: use event date month
      const [y, m] = (e.date || '').split('-').map(Number);
      return y === now.getFullYear() && m === now.getMonth() + 1;
    }).length;
  }, [allEvents, user]);

  const isAtEventLimit = isPromoter && (user?.subscriptionTier ?? 'free') === 'free' && thisMonthPostedCount >= 3;
  const [currentStep, setCurrentStep] = useState(0);
  const [form, setForm] = useState({ ...INITIAL_FORM });
  const [showParishPicker, setShowParishPicker] = useState(false);
  const [showDatePicker, setShowDatePicker]     = useState(false);
  const [showStartPicker, setShowStartPicker]   = useState(false);
  const [showEndPicker, setShowEndPicker]       = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [createdEventId, setCreatedEventId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<ImageUploadProgress | null>(null);
  // Prevent duplicate submit when the button is tapped rapidly
  const isSubmittingRef = useRef(false);
  const [hasDraft, setHasDraft] = useState(false);
  const [physParishPickerIdx, setPhysParishPickerIdx] = useState<number | null>(null);

  // Load draft or duplicate data from AsyncStorage on mount
  useEffect(() => {
    AsyncStorage.getItem(DRAFT_STORAGE_KEY).then((raw) => {
      if (!raw) return;
      try {
        const saved = JSON.parse(raw);
        setForm((prev) => ({ ...prev, ...saved }));
        setHasDraft(true);
      } catch {}
    });
  }, []);

  // Auto-save draft on every form change (debounced 800ms)
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveDraft = useCallback((formState: typeof INITIAL_FORM) => {
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => {
      AsyncStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(formState)).catch(() => {});
    }, 800);
  // No deps — draftTimerRef is stable, AsyncStorage is module-level
  }, []);

  const clearDraft = useCallback(() => {
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    AsyncStorage.removeItem(DRAFT_STORAGE_KEY).catch(() => {});
    setHasDraft(false);
  }, []);

  const update = useCallback((field: string, value: any) =>
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      saveDraft(next);
      return next;
    }),
  [saveDraft]);

  const toggleType = (typeId: string) =>
    update('eventTypes', form.eventTypes.includes(typeId)
      ? form.eventTypes.filter((t: string) => t !== typeId)
      : [...form.eventTypes, typeId]);

  const toggleImage = (uri: string) => {
    if (form.flyerImages.includes(uri)) {
      if (form.flyerImages.length > 1) update('flyerImages', form.flyerImages.filter((i: string) => i !== uri));
    } else if (form.flyerImages.length < 5) {
      update('flyerImages', [...form.flyerImages, uri]);
    }
  };

  const addCustomImage = () => {
    const url = form.customImageUrl.trim();
    if (url && !form.flyerImages.includes(url) && form.flyerImages.length < 5) {
      update('flyerImages', [...form.flyerImages, url]);
      update('customImageUrl', '');
    }
  };

  const pickFromDevice = useCallback(async () => {
    if (form.flyerImages.length >= 5) {
      Alert.alert('Limit Reached', 'You can select up to 5 flyer images.');
      return;
    }
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please allow access to your photo library to upload flyers.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: 5 - form.flyerImages.length,
      quality: 0.85,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets.length > 0) {
      const newUris = result.assets
        .map((a) => a.uri)
        .filter((uri) => !form.flyerImages.includes(uri));
      update('flyerImages', [...form.flyerImages, ...newUris].slice(0, 5));
    }
  }, [form.flyerImages, update]);

  const addArtist = () => {
    const trimmed = form.lineupNameInput.trim();
    if (trimmed) {
      const entry = { name: trimmed, role: form.lineupRoleInput };
      const already = form.lineupEntries.some((e: { name: string; role: string }) => e.name === trimmed);
      if (!already) {
        update('lineupEntries', [...form.lineupEntries, entry]);
        update('lineupNameInput', '');
      }
    }
  };

  const isStepValid = () => {
    switch (currentStep) {
      case 0: return form.title.trim() !== '' && form.date.trim() !== '';
      case 1: return form.parish !== '' && form.venue.trim() !== '';
      case 2: return form.eventTypes.length > 0;
      case 4: {
        if (!form.isFree && !form.useVybzHub && !form.useExternalTicket && !form.usePhysicalLocations) return false;
        if (form.useExternalTicket && !form.ticketLink.trim().startsWith('https://')) return false;
        // Physical selected: require at least one complete location before Next is enabled
        if (form.usePhysicalLocations) {
          const validLocs = form.physicalLocations.filter(
            (l: PhysicalTicketLocation) => l.business_name.trim() && l.town.trim() && l.parish
          );
          if (validLocs.length === 0) return false;
        }
        return true;
      }
      default: return true;
    }
  };

  // Navigate to event detail page — used by ConflictNudge "View" button
  const handleViewConflictEvent = useCallback((eventId: string) => {
    router.push(`/event/${eventId}` as any);
  }, [router]);

  const goNext = () => {
    if (currentStep < TOTAL_STEPS - 1) {
      setCurrentStep((s) => s + 1);
      setTimeout(() => scrollRef.current?.scrollTo({ y: 0, animated: false }), 50);
    }
  };

  const goBack = () => {
    if (currentStep > 0) {
      setCurrentStep((s) => s - 1);
      setTimeout(() => scrollRef.current?.scrollTo({ y: 0, animated: false }), 50);
    }
  };

  const jumpToStep = (step: number) => {
    setCurrentStep(step);
    setTimeout(() => scrollRef.current?.scrollTo({ y: 0, animated: false }), 50);
  };

  const handleSubmit = async () => {
    // Guard: block if already in-flight (double-tap protection)
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setSubmitting(true);
    setUploadError(null);
    setUploadProgress(null);
    try {
      const normalizedTitle = normalizeEventTitle(form.title.trim());
      if (!normalizedTitle) { Alert.alert('Invalid Title', 'Event name cannot be blank or contain only emojis.'); return; }
      if (!form.isFree && form.useExternalTicket) {
        const url = form.ticketLink.trim();
        if (!url.startsWith('https://') || url.length < 12) {
          Alert.alert('Invalid Ticket URL', 'External ticket URL must start with https://');
          return;
        }
      }
      const primaryType = form.eventTypes[0];
      const primaryTypeInfo = eventTypes.find((t) => t.id === primaryType);
      const price = form.isFree ? 'Free' : form.ticketPrice.trim() || 'Free';
      const eventData: Omit<Event, 'id' | 'goingCount' | 'interestedCount' | 'featured' | 'status'> = {
        title: normalizedTitle,
        description: form.description.trim() || 'A great event happening in Jamaica!',
        type: primaryType,
        typeLabel: primaryTypeInfo?.label ?? primaryType,
        eventTypes: form.eventTypes,
        parish: form.parish,
        date: form.date,
        startTime: form.startTime.trim() || 'TBA',
        endTime: form.endTime.trim(),
        venue: form.venue.trim(),
        address: form.address.trim(),
        coverImage: form.flyerImages[0],
        flyerImages: form.flyerImages,
        ticketPrice: price,
        ticketLink: (!form.isFree && form.useExternalTicket) ? form.ticketLink.trim() : '',
        ticketProviderName: (!form.isFree && form.useExternalTicket && form.ticketProviderName.trim()) ? form.ticketProviderName.trim() : undefined,
        physicalTicketLocations: (!form.isFree && form.usePhysicalLocations) ? form.physicalLocations.filter((l: PhysicalTicketLocation) => l.business_name.trim() && l.town.trim() && l.parish) : [],
        sellingTicketsInApp: !form.isFree && form.useVybzHub,
        contactInfo: form.contactInfo.trim() || undefined,
        eventPhotosLink: form.eventPhotosLink.trim() || undefined,
        dressCode: form.dressCode.trim() || undefined,
        ageLimit: form.ageLimit,
        lineupEntries: form.lineupEntries,
        lineup: form.lineupEntries.map((e: { name: string; role: string }) => `${e.role}: ${e.name}`),
        recurring: form.recurring,
        recurringFrequency: form.recurring ? form.recurringFrequency : undefined,
        promoterId: user?.id ?? 'unknown',
        promoterName: user?.name ?? 'Unknown Promoter',
        promoterTier: user?.subscriptionTier ?? 'free',
        tags: [...form.eventTypes, form.parish.toLowerCase().replace(/ /g, '-')],
      };
      const initialStatus = requireEventApproval ? 'pending' : 'live';

      // Upload device-picked images — throws if any local file fails to upload.
      // If this throws, uploadError is set and we return early; postEvent is NOT called,
      // so a broken file:// URI is never written to the database.
      let uploadedImages: string[] = [];
      try {
        uploadedImages = await uploadEventImages(
          form.flyerImages,
          `events/${Date.now()}`,
          (progress) => setUploadProgress(progress),
        );
      } catch (uploadErr) {
        setUploadError(
          uploadErr instanceof Error
            ? uploadErr.message
            : 'Image upload failed. Please try again.'
        );
        return;
      } finally {
        setUploadProgress(null);
      }
      const finalCoverImage = uploadedImages[0] ?? eventData.coverImage;

      // ── Atomic event creation — DB trigger enforce_event_publish_entitlement ────
      // The AFTER INSERT trigger consumes post allowance atomically.
      // If allowance is exceeded or billing period unavailable, the trigger raises
      // an exception and PostgreSQL rolls back the INSERT entirely.
      // The error from the trigger bubbles up through postEvent's throw.
      let newEventId: string;
      try {
        newEventId = await postEvent(
          { ...eventData, coverImage: finalCoverImage, flyerImages: uploadedImages },
          initialStatus as any
        );
      } catch (postErr: any) {
        const msg: string = postErr?.message ?? 'Failed to publish event.';
        // Surface subscription entitlement errors distinctly for upgrade CTA
        if (
          msg.includes('Post limit reached') ||
          msg.includes('posts used') ||
          msg.includes('billing cycle')
        ) {
          Alert.alert(
            'Post Limit Reached',
            msg + '\n\nUpgrade to Elite for 6 posts per cycle.',
            [
              { text: 'Upgrade', onPress: () => router.push('/monetization/upgrade' as any) },
              { text: 'OK', style: 'cancel' },
            ],
          );
        } else if (
          msg.includes('Subscription entitlement could not be verified') ||
          msg.includes('billing period has expired')
        ) {
          Alert.alert(
            'Subscription Sync Required',
            msg,
            [{ text: 'OK' }],
          );
        } else {
          Alert.alert('Publish Failed', msg);
        }
        return;
      }

      addNotification(
        requireEventApproval
          ? {
              type: 'event_approved',
              title: 'Event Submitted for Review',
              body: `"${form.title}" is pending admin approval and will go live once reviewed.`,
            }
          : {
              type: 'event_approved',
              title: 'Event Published!',
              body: `"${form.title}" is now live on Vybz Hub and visible to all users.`,
            }
      );

      // ── new_event_parish broadcast ──────────────────────────────────────────
      // Notify ALL users whose home or preferred parish matches (non-blocking).
      // The Edge Function excludes the posting promoter server-side and respects
      // each recipient's individual push_notif_new_parish / email_notif_new_parish
      // preference. Only fired for live events — pending events are not yet public.
      if (initialStatus === 'live') {
        notifyParishUsersNewEvent(form.parish, {
          eventTitle: form.title.trim(),
          eventId: newEventId,
          parish: form.parish,
          date: form.date,
          startTime: form.startTime.trim() || 'TBA',
          venue: form.venue.trim(),
          ticketPrice: form.isFree ? 'Free' : form.ticketPrice.trim() || 'Free',
          promoterName: user?.name ?? 'Unknown Promoter',
        });
      }

      // ── new_event_promoter fan-out ────────────────────────────────────────
      // Notify every user who follows this promoter that a new live event was posted.
      // The Edge Function does the follower lookup + preference filtering server-side
      // (client-side RLS on user_profiles prevents querying other users' rows).
      // Only fired for live events — pending events are not yet public.
      if (initialStatus === 'live' && user?.id) {
        notifyFollowersNewEvent(user.id, {
          eventTitle: form.title.trim(),
          eventId: newEventId,
          parish: form.parish,
          date: form.date,
          startTime: form.startTime.trim() || 'TBA',
          venue: form.venue.trim(),
          ticketPrice: form.isFree ? 'Free' : form.ticketPrice.trim() || 'Free',
          promoterName: user?.name ?? 'Unknown Promoter',
        });
      }

      if (!form.isFree && form.useVybzHub && newEventId) {
        clearDraft(); setForm({ ...INITIAL_FORM }); setCurrentStep(0);
        Alert.alert('Event Published', `"${normalizedTitle}" is live. Set up your Vybz Hub ticket tiers now.`, [
          { text: 'Set Up Tickets', onPress: () => router.replace(`/ticketing/setup/${newEventId}` as any) },
          { text: 'Later', onPress: () => router.replace('/my-events?published=1' as any) },
        ]);
        return;
      }
      // Clear draft and reset form state before navigating
      clearDraft();
      setForm({ ...INITIAL_FORM });
      setCurrentStep(0);
      // Replace (not push) so the back button cannot return to the half-filled form
      router.replace('/my-events?published=1' as any);
    } finally {
      setSubmitting(false);
      isSubmittingRef.current = false;
    }
  };

  const resetForm = useCallback(() => {
    clearDraft();
    setForm({ ...INITIAL_FORM });
    setCurrentStep(0);
    setSuccess(false);
    setCreatedEventId(null);
  }, [clearDraft]);

  // Reset success state when the user navigates back to this tab after a successful post,
  // so they see the fresh form instead of the stale success screen.
  useFocusEffect(
    useCallback(() => {
      if (success) resetForm();
    }, [success, resetForm])
  );

  // ─── Gate: admin users cannot post events ────────────────────────────────
  if (user?.roles.includes('admin')) {
    return (
      <View style={styles.gateContainer}>
        <SafeAreaView edges={['top']} />
        <View style={styles.gate}>
          <View style={[styles.gateIcon, { backgroundColor: Colors.goldSurface, borderWidth: 2, borderColor: `${Colors.gold}44` }]}>
            <MaterialIcons name="admin-panel-settings" size={36} color={Colors.gold} />
          </View>
          <Text style={styles.gateTitle}>Admin Account</Text>
          <Text style={styles.gateSub}>
            Admin accounts cannot post events. Event management is handled through the Admin Panel.
          </Text>
          <Pressable onPress={() => router.replace('/(tabs)/profile' as any)} style={({ pressed }) => [styles.gateBtn, pressed && { opacity: 0.85 }]}>
            <LinearGradient colors={[Colors.gold, Colors.goldDim]} style={styles.gateBtnInner}>
              <MaterialIcons name="admin-panel-settings" size={18} color={Colors.textOnGold} />
              <Text style={styles.gateBtnText}>Go to Admin Section</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    );
  }

  // ─── Gate: not logged in ────────────────────────────────────────────────────
  if (!user) {
    return (
      <View style={styles.gateContainer}>
        <SafeAreaView edges={['top']} />
        <View style={styles.gate}>
          <View style={styles.gateIcon}><MaterialIcons name="lock" size={36} color={Colors.gold} /></View>
          <Text style={styles.gateTitle}>Sign In Required</Text>
          <Text style={styles.gateSub}>You need an account to post events on Vybz Hub.</Text>
          <Pressable onPress={() => router.push('/auth' as any)} style={({ pressed }) => [styles.gateBtn, pressed && { opacity: 0.85 }]}>
            <LinearGradient colors={[Colors.gold, Colors.goldDim]} style={styles.gateBtnInner}>
              <Text style={styles.gateBtnText}>Sign In</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    );
  }

  // ─── Gate: not a promoter ────────────────────────────────────────────────────
  if (isAtEventLimit) {
    return (
      <View style={styles.gateContainer}>
        <SafeAreaView edges={['top']} />
        <View style={styles.gate}>
          <View style={[styles.gateIcon, { backgroundColor: 'rgba(255,152,0,0.15)', borderWidth: 2, borderColor: 'rgba(255,152,0,0.3)' }]}>
            <MaterialIcons name="event-busy" size={36} color="#FF9800" />
          </View>
          <Text style={styles.gateTitle}>Monthly Limit Reached</Text>
          <Text style={styles.gateSub}>
            Free promoters can post up to 3 events per month. Upgrade to Promoter Pro for unlimited listings.
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', alignSelf: 'stretch', backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.base, borderWidth: 1, borderColor: Colors.surfaceBorder }}>
            <Text style={{ fontSize: Typography.sm, color: Colors.textMuted }}>Events posted this month</Text>
            <Text style={{ fontSize: Typography.md, fontWeight: Typography.black, color: '#FF9800' }}>3 / 3</Text>
          </View>
          <Pressable onPress={() => router.push('/monetization/upgrade' as any)} style={({ pressed }) => [styles.gateBtn, pressed && { opacity: 0.85 }]}>
            <LinearGradient colors={[Colors.gold, Colors.goldDim]} style={styles.gateBtnInner}>
              <MaterialIcons name="rocket-launch" size={18} color={Colors.textOnGold} />
              <Text style={styles.gateBtnText}>Upgrade to Pro</Text>
            </LinearGradient>
          </Pressable>
          <Pressable onPress={() => router.push('/my-events' as any)} style={styles.secondaryLink}>
            <Text style={styles.secondaryLinkText}>View my events</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (!isPromoter) {
    return (
      <View style={styles.gateContainer}>
        <SafeAreaView edges={['top']} />
        <ScrollView contentContainerStyle={styles.gateScroll}>
          <View style={styles.promoterGate}>
            <View style={[styles.gateIcon, { backgroundColor: Colors.goldSurface, borderWidth: 2, borderColor: `${Colors.gold}44` }]}>
              <MaterialIcons name="campaign" size={36} color={Colors.gold} />
            </View>
            <Text style={styles.gateTitle}>Become a Promoter</Text>
            <Text style={styles.gateSub}>
              List your events and reach thousands of party-goers across Jamaica. Free to activate.
            </Text>
            <View style={styles.perks}>
              {[
                ['Post unlimited events', 'Post unlimited events'],
                ['Reach your target parish', 'Reach your target parish'],
                ['Tag multiple event types', 'Tag multiple event types'],
                ['Manage RSVPs and interest', 'Manage RSVPs and interest'],
                ['Edit & delete your listings', 'Edit & delete your listings'],
              ].map(([perk]) => (
                <View key={perk} style={styles.perk}>
                  <MaterialIcons name="check-circle" size={16} color={Colors.greenLight} />
                  <Text style={styles.perkText}>{perk}</Text>
                </View>
              ))}
            </View>
            <Pressable
              onPress={async () => { setBecomingPromoter(true); await addPromoterRole(); setBecomingPromoter(false); }}
              disabled={becomingPromoter}
              style={({ pressed }) => [styles.gateBtn, pressed && { opacity: 0.85 }]}
            >
              <LinearGradient colors={[Colors.gold, Colors.goldDim]} style={styles.gateBtnInner}>
                <MaterialIcons name="campaign" size={18} color={Colors.textOnGold} />
                <Text style={styles.gateBtnText}>
                  {becomingPromoter ? 'Activating...' : 'Activate Promoter Account'}
                </Text>
              </LinearGradient>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    );
  }

  // ─── Success ─────────────────────────────────────────────────────────────────
  if (success) {
    return (
      <View style={styles.gateContainer}>
        <SafeAreaView edges={['top']} />
        <View style={styles.gate}>
          <View style={[styles.gateIcon, { backgroundColor: requireEventApproval ? Colors.goldSurface : Colors.greenSurface }]}>
            <MaterialIcons
              name={requireEventApproval ? 'pending-actions' : 'check-circle'}
              size={40}
              color={requireEventApproval ? Colors.gold : Colors.greenLight}
            />
          </View>
          <Text style={styles.gateTitle}>
            {requireEventApproval ? 'Submitted for Review' : 'Event Published!'}
          </Text>
          <Text style={styles.gateSub}>
            {requireEventApproval
              ? 'Your event is pending admin approval. It will appear in Browse once reviewed and approved.'
              : 'Your event is now live. Party-goers across Jamaica can discover it.'}
          </Text>
          <PlacementAd placementName="Post-Event Confirmation" style={styles.successAd} />
          {/* Primary CTA — view the event they just created */}
          {createdEventId && (
            <Pressable
              onPress={() => router.push(`/event/${createdEventId}` as any)}
              style={({ pressed }) => [styles.gateBtn, pressed && { opacity: 0.85 }]}
            >
              <LinearGradient colors={[Colors.gold, Colors.goldDim]} style={styles.gateBtnInner}>
                <MaterialIcons name="visibility" size={18} color={Colors.textOnGold} />
                <Text style={styles.gateBtnText}>View My Event</Text>
              </LinearGradient>
            </Pressable>
          )}
          <Pressable onPress={() => router.push('/my-events' as any)} style={styles.secondaryLink}>
            <Text style={styles.secondaryLinkText}>Manage My Events</Text>
          </Pressable>
          <Pressable onPress={resetForm} style={styles.secondaryLink}>
            <Text style={styles.secondaryLinkText}>Post Another Event</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ─── Main form ────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
              <Text style={styles.headerTitle}>{STEP_LABELS[currentStep]}</Text>
              {hasDraft && currentStep === 0 && (
                <Pressable
                  onPress={() => {
                    Alert.alert(
                      'Clear Draft',
                      'Discard your saved draft and start fresh?',
                      [
                        { text: 'Keep Draft', style: 'cancel' },
                        { text: 'Clear', style: 'destructive', onPress: resetForm },
                      ]
                    );
                  }}
                  style={styles.draftBadge}
                >
                  <MaterialIcons name="edit-note" size={11} color={Colors.gold} />
                  <Text style={styles.draftBadgeText}>Draft saved</Text>
                  <MaterialIcons name="close" size={10} color={Colors.textMuted} />
                </Pressable>
              )}
            </View>
            <Text style={styles.headerSub}>Step {currentStep + 1} of {TOTAL_STEPS}</Text>
          </View>
          <Pressable onPress={() => router.push('/my-events' as any)} style={styles.myEventsLink}>
            <MaterialIcons name="list-alt" size={16} color={Colors.gold} />
            <Text style={styles.myEventsLinkText}>My Events</Text>
          </Pressable>
        </View>
        <StepProgress currentStep={currentStep} />
      </SafeAreaView>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.formContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── STEP 0: Basic Info ── */}
          {currentStep === 0 && (
            <View style={styles.stepWrap}>
              <View style={styles.stepIntro}>
                <View style={styles.stepIconBg}><MaterialIcons name="edit" size={22} color={Colors.gold} /></View>
                <Text style={styles.stepDesc}>Tell us the basics about your event.</Text>
              </View>

              <Field label="Event Name *">
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Summa Splash 2026"
                  placeholderTextColor={Colors.textMuted}
                  value={form.title}
                  onChangeText={(v) => update('title', v)}
                  accessibilityLabel="Event name"
                />
              </Field>

              <Field label="Description">
                <TextInput
                  style={[styles.input, styles.textarea]}
                  placeholder="What should attendees expect? Describe the vibe, what's included, and why they should come..."
                  placeholderTextColor={Colors.textMuted}
                  value={form.description}
                  onChangeText={(v) => update('description', v)}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                  accessibilityLabel="Description"
                />
              </Field>

              {/* Date Picker */}
              <DatePickerModal
                visible={showDatePicker}
                value={form.date}
                onConfirm={(iso) => update('date', iso)}
                onClose={() => setShowDatePicker(false)}
              />
              {/* Start Time Picker */}
              <TimePickerModal
                visible={showStartPicker}
                label="Select Start Time"
                value={form.startTime}
                onConfirm={(t) => update('startTime', t)}
                onClose={() => setShowStartPicker(false)}
              />
              {/* End Time Picker */}
              <TimePickerModal
                visible={showEndPicker}
                label="Select End Time"
                value={form.endTime}
                onConfirm={(t) => update('endTime', t)}
                onClose={() => setShowEndPicker(false)}
              />

              <Field label="Date *">
                <Pressable
                  onPress={() => setShowDatePicker(true)}
                  style={({ pressed }) => [styles.pickerBtn, pressed && { opacity: 0.8 }]}
                  accessibilityLabel="Select event date"
                >
                  <MaterialIcons name="event" size={16} color={Colors.textMuted} />
                  <Text style={[styles.pickerBtnText, form.date && { color: Colors.textPrimary }]}>
                    {form.date ? formatDisplayDate(form.date) : 'Tap to select date...'}
                  </Text>
                  <MaterialIcons name="keyboard-arrow-down" size={20} color={Colors.textMuted} />
                </Pressable>
              </Field>

              {/* Conflict nudge on Step 0: shown only when parish is pre-filled from a loaded draft */}
              {form.date && form.parish ? (
                <ConflictNudge
                  date={form.date}
                  parish={form.parish}
                  onViewEvent={handleViewConflictEvent}
                />
              ) : null}

              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Field label="Start Time">
                    <Pressable
                      onPress={() => setShowStartPicker(true)}
                      style={({ pressed }) => [styles.pickerBtn, pressed && { opacity: 0.8 }]}
                      accessibilityLabel="Select start time"
                    >
                      <MaterialIcons name="access-time" size={16} color={Colors.textMuted} />
                      <Text style={[styles.pickerBtnText, form.startTime && { color: Colors.textPrimary }]}>
                        {form.startTime || 'Start time'}
                      </Text>
                    </Pressable>
                  </Field>
                </View>
                <View style={{ flex: 1 }}>
                  <Field label="End Time">
                    <Pressable
                      onPress={() => setShowEndPicker(true)}
                      style={({ pressed }) => [styles.pickerBtn, pressed && { opacity: 0.8 }]}
                      accessibilityLabel="Select end time"
                    >
                      <MaterialIcons name="access-time" size={16} color={Colors.textMuted} />
                      <Text style={[styles.pickerBtnText, form.endTime && { color: Colors.textPrimary }]}>
                        {form.endTime || 'End time'}
                      </Text>
                    </Pressable>
                  </Field>
                </View>
              </View>
            </View>
          )}

          {/* ── STEP 1: Location ── */}
          {currentStep === 1 && (
            <View style={styles.stepWrap}>
              <View style={styles.stepIntro}>
                <View style={styles.stepIconBg}><MaterialIcons name="place" size={22} color={Colors.gold} /></View>
                <Text style={styles.stepDesc}>Where in Jamaica is your event happening?</Text>
              </View>

              <Field label="Parish *">
                <Pressable onPress={() => { Keyboard.dismiss(); setShowParishPicker(!showParishPicker); }} style={styles.pickerBtn}>
                  <MaterialIcons name="place" size={16} color={Colors.textMuted} />
                  <Text style={[styles.pickerBtnText, form.parish && { color: Colors.textPrimary }]}>
                    {form.parish || 'Select parish...'}
                  </Text>
                  <MaterialIcons name={showParishPicker ? 'keyboard-arrow-up' : 'keyboard-arrow-down'} size={20} color={Colors.textMuted} />
                </Pressable>
                {showParishPicker && (
                  <ScrollView style={styles.dropdown} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                    {parishes.map((p) => (
                      <Pressable
                        key={p}
                        onPress={() => { update('parish', p); setShowParishPicker(false); }}
                        style={({ pressed }) => [
                          styles.dropdownOption,
                          form.parish === p && styles.dropdownOptionActive,
                          pressed && { backgroundColor: Colors.surfaceElevated },
                        ]}
                      >
                        <Text style={[styles.dropdownOptionText, form.parish === p && { color: Colors.gold }]}>{p}</Text>
                        {form.parish === p && <MaterialIcons name="check" size={16} color={Colors.gold} />}
                      </Pressable>
                    ))}
                  </ScrollView>
                )}
              </Field>

              <Field label="Venue / Location Name *">
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Bloody Bay Beach, Montego Bay"
                  placeholderTextColor={Colors.textMuted}
                  value={form.venue}
                  onChangeText={(v) => update('venue', v)}
                  accessibilityLabel="Venue"
                />
              </Field>

              <Field label="Street Address" hint="Optional — helps attendees find the exact spot">
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 22 Arthur Wint Dr, Kingston"
                  placeholderTextColor={Colors.textMuted}
                  value={form.address}
                  onChangeText={(v) => update('address', v)}
                  accessibilityLabel="Address"
                />
              </Field>

              {/* Conflict nudge on Step 1: shown once parish is chosen and date is already set */}
              {form.date && form.parish ? (
                <ConflictNudge
                  date={form.date}
                  parish={form.parish}
                  onViewEvent={handleViewConflictEvent}
                />
              ) : null}
            </View>
          )}

          {/* ── STEP 2: Category ── */}
          {currentStep === 2 && (
            <View style={styles.stepWrap}>
              <View style={styles.stepIntro}>
                <View style={styles.stepIconBg}><MaterialIcons name="category" size={22} color={Colors.gold} /></View>
                <Text style={styles.stepDesc}>What type of event is this? Select all that apply.</Text>
              </View>

              <Field label="Event Type(s) *" hint="First selected = primary type">
                <View style={styles.typeGrid}>
                  {eventTypes.map((type) => {
                    const isActive = form.eventTypes.includes(type.id);
                    return (
                      <Pressable
                        key={type.id}
                        onPress={() => toggleType(type.id)}
                        style={({ pressed }) => [
                          styles.typeCard,
                          isActive && { borderColor: type.color, backgroundColor: `${type.color}18` },
                          pressed && { opacity: 0.8 },
                        ]}
                      >
                        <MaterialIcons name={type.icon as any} size={20} color={isActive ? type.color : Colors.textMuted} />
                        <Text style={[styles.typeCardLabel, isActive && { color: type.color, fontWeight: Typography.semibold }]} numberOfLines={2}>
                          {type.label}
                        </Text>
                        {isActive && (
                          <View style={[styles.typeCardCheck, { backgroundColor: type.color }]}>
                            <MaterialIcons name="check" size={10} color="#fff" />
                          </View>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
                {form.eventTypes.length > 0 && (
                  <View style={styles.typeSummary}>
                    <MaterialIcons name="info-outline" size={13} color={Colors.gold} />
                    <Text style={styles.typeSummaryText}>
                      Primary: <Text style={{ color: Colors.textPrimary }}>
                        {eventTypes.find((t) => t.id === form.eventTypes[0])?.label}
                      </Text>
                      {form.eventTypes.length > 1 ? ` + ${form.eventTypes.length - 1} more` : ''}
                    </Text>
                  </View>
                )}
              </Field>

              {/* Recurring toggle */}
              <View style={styles.recurringCard}>
                <View style={styles.recurringHeader}>
                  <View style={styles.recurringIcon}>
                    <MaterialIcons name="repeat" size={20} color={form.recurring ? Colors.gold : Colors.textMuted} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.recurringTitle}>Recurring Event</Text>
                    <Text style={styles.recurringSub}>Does this event repeat regularly?</Text>
                  </View>
                  <Switch
                    value={form.recurring}
                    onValueChange={(v) => update('recurring', v)}
                    trackColor={{ false: Colors.surfaceBorder, true: Colors.gold }}
                    thumbColor={form.recurring ? Colors.textOnGold : Colors.textMuted}
                  />
                </View>
                {form.recurring && (
                  <View style={styles.freqRow}>
                    {RECURRING_OPTIONS.map((opt) => (
                      <Pressable
                        key={opt}
                        onPress={() => update('recurringFrequency', opt)}
                        style={[styles.freqBtn, form.recurringFrequency === opt && styles.freqBtnActive]}
                      >
                        <Text style={[styles.freqText, form.recurringFrequency === opt && styles.freqTextActive]}>{opt}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            </View>
          )}

          {/* ── STEP 3: Flyer Images ── */}
          {currentStep === 3 && (
            <View style={styles.stepWrap}>
              <View style={styles.stepIntro}>
                <View style={styles.stepIconBg}><MaterialIcons name="image" size={22} color={Colors.gold} /></View>
                <Text style={styles.stepDesc}>
                  Add up to 5 flyer images. Tap to select from our gallery or paste a direct URL.
                </Text>
              </View>

              {/* Selected images preview */}
              {form.flyerImages.length > 0 && (
                <View style={styles.selectedSection}>
                  <Text style={styles.fieldLabel}>Selected ({form.flyerImages.length}/5)</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.selectedRow}>
                    {form.flyerImages.map((uri: string, idx: number) => (
                      <View key={uri} style={styles.selectedThumb}>
                        <Image source={{ uri }} style={styles.selectedThumbImg} contentFit="cover" transition={200} />
                        {idx === 0 && (
                          <View style={styles.primaryBadge}><Text style={styles.primaryBadgeText}>Cover</Text></View>
                        )}
                        {form.flyerImages.length > 1 && (
                          <Pressable onPress={() => update('flyerImages', form.flyerImages.filter((_: string, i: number) => i !== idx))} style={styles.removeThumb}>
                            <MaterialIcons name="close" size={12} color="#fff" />
                          </Pressable>
                        )}
                      </View>
                    ))}
                  </ScrollView>
                </View>
              )}

              {/* Upload from device */}
              <Pressable
                onPress={pickFromDevice}
                disabled={form.flyerImages.length >= 5}
                style={({ pressed }) => [styles.uploadDeviceBtn, form.flyerImages.length >= 5 && { opacity: 0.4 }, pressed && { opacity: 0.8 }]}
              >
                <LinearGradient
                  colors={[Colors.goldSurface, Colors.surface]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.uploadDeviceBtnInner}
                >
                  <View style={styles.uploadDeviceIcon}>
                    <MaterialIcons name="photo-library" size={22} color={Colors.gold} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.uploadDeviceTitle}>Upload from Device</Text>
                    <Text style={styles.uploadDeviceSub}>
                      {form.flyerImages.length >= 5
                        ? 'Maximum 5 images reached'
                        : `Select up to ${5 - form.flyerImages.length} photo${5 - form.flyerImages.length !== 1 ? 's' : ''} from your gallery`}
                    </Text>
                  </View>
                  <MaterialIcons name="arrow-forward-ios" size={14} color={Colors.gold} />
                </LinearGradient>
              </Pressable>

              <View style={styles.orDivider}>
                <View style={styles.orLine} />
                <Text style={styles.orText}>or pick from gallery</Text>
                <View style={styles.orLine} />
              </View>

              {/* Gallery grid */}
              <Text style={styles.fieldLabel}>Pick from Gallery</Text>
              <View style={styles.galleryGrid}>
                {FLYER_GALLERY.map((img) => {
                  const isSelected = form.flyerImages.includes(img.uri);
                  const atLimit = form.flyerImages.length >= 5 && !isSelected;
                  return (
                    <Pressable
                      key={img.id}
                      onPress={() => !atLimit && toggleImage(img.uri)}
                      style={[styles.galleryThumb, isSelected && styles.galleryThumbSelected, atLimit && { opacity: 0.4 }]}
                    >
                      <Image source={{ uri: img.uri }} style={styles.galleryThumbImg} contentFit="cover" transition={200} />
                      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.7)']} style={styles.galleryThumbGrad} />
                      <Text style={styles.galleryThumbLabel}>{img.label}</Text>
                      {isSelected && (
                        <View style={styles.galleryCheck}>
                          <MaterialIcons name="check" size={14} color={Colors.textOnGold} />
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </View>

              {/* Custom URL */}
              <Field label="Or add a custom image URL">
                <View style={styles.customUrlRow}>
                  <TextInput
                    style={[styles.input, { flex: 1, borderWidth: 0 }]}
                    placeholder="https://example.com/my-flyer.jpg"
                    placeholderTextColor={Colors.textMuted}
                    value={form.customImageUrl}
                    onChangeText={(v) => update('customImageUrl', v)}
                    keyboardType="url"
                    autoCapitalize="none"
                    returnKeyType="done"
                    onSubmitEditing={addCustomImage}
                    accessibilityLabel="Custom image URL"
                  />
                  <Pressable onPress={addCustomImage} style={styles.addUrlBtn}>
                    <MaterialIcons name="add" size={20} color={Colors.textOnGold} />
                  </Pressable>
                </View>
              </Field>
            </View>
          )}

          {/* ── STEP 4: Pricing & Details ── */}
          {currentStep === 4 && (
            <View style={styles.stepWrap}>
              <View style={styles.stepIntro}>
                <View style={styles.stepIconBg}><MaterialIcons name="local-activity" size={22} color={Colors.gold} /></View>
                <Text style={styles.stepDesc}>Choose entry type, ticket methods, age restrictions, and event details.</Text>
              </View>

              {/* Entry Type Selector */}
              <View style={styles.field}>
                <View style={styles.fieldLabelRow}><Text style={styles.fieldLabel}>Entry Type *</Text></View>
                <View style={styles.row}>
                  <Pressable
                    onPress={() => { update('isFree', true); update('useVybzHub', false); update('useExternalTicket', false); update('usePhysicalLocations', false); update('physicalLocations', []); }}
                    style={({ pressed }) => [entryTypeStyles.btn, form.isFree && entryTypeStyles.btnFree, pressed && { opacity: 0.8 }]}
                  >
                    <MaterialIcons name="free-breakfast" size={22} color={form.isFree ? Colors.greenLight : Colors.textMuted} />
                    <Text style={[entryTypeStyles.btnLabel, form.isFree && { color: Colors.greenLight }]}>Free Entry</Text>
                    <Text style={entryTypeStyles.btnSub}>No ticket required</Text>
                    {form.isFree && <View style={entryTypeStyles.checkWrap}><MaterialIcons name="check-circle" size={16} color={Colors.greenLight} /></View>}
                  </Pressable>
                  <Pressable
                    onPress={() => update('isFree', false)}
                    style={({ pressed }) => [entryTypeStyles.btn, !form.isFree && entryTypeStyles.btnPaid, pressed && { opacity: 0.8 }]}
                  >
                    <MaterialIcons name="local-activity" size={22} color={!form.isFree ? Colors.gold : Colors.textMuted} />
                    <Text style={[entryTypeStyles.btnLabel, !form.isFree && { color: Colors.gold }]}>Paid Event</Text>
                    <Text style={entryTypeStyles.btnSub}>Requires tickets</Text>
                    {!form.isFree && <View style={entryTypeStyles.checkWrap}><MaterialIcons name="check-circle" size={16} color={Colors.gold} /></View>}
                  </Pressable>
                </View>
              </View>

              {!form.isFree && (
                <>
                  <Field label="Display Price" hint="Shown on event card">
                    <View style={styles.iconInput}>
                      <MaterialIcons name="attach-money" size={16} color={Colors.textMuted} />
                      <TextInput style={styles.iconInputText} placeholder="e.g. JMD 3,500" placeholderTextColor={Colors.textMuted} value={form.ticketPrice} onChangeText={(v) => update('ticketPrice', v)} accessibilityLabel="Ticket price" />
                    </View>
                  </Field>

                  {/* Ticket Methods */}
                  <View style={styles.field}>
                    <View style={styles.fieldLabelRow}>
                      <Text style={styles.fieldLabel}>How will tickets be sold? *</Text>
                      <Text style={styles.fieldHint}>Select all that apply</Text>
                    </View>
                    <View style={{ gap: Spacing.sm }}>
                      <Pressable onPress={() => update('useVybzHub', !form.useVybzHub)} style={({ pressed }) => [ticketMethodStyles.card, form.useVybzHub && ticketMethodStyles.cardActive, pressed && { opacity: 0.8 }]}>
                        <View style={[ticketMethodStyles.iconWrap, form.useVybzHub && { backgroundColor: `${Colors.gold}22` }]}><MaterialIcons name="confirmation-number" size={18} color={form.useVybzHub ? Colors.gold : Colors.textMuted} /></View>
                        <View style={{ flex: 1 }}><Text style={[ticketMethodStyles.label, form.useVybzHub && { color: Colors.gold }]}>Sell on Vybz Hub</Text><Text style={ticketMethodStyles.sub}>In-app ticketing — set up tiers after posting</Text></View>
                        {form.useVybzHub && <MaterialIcons name="check-circle" size={18} color={Colors.gold} />}
                      </Pressable>
                      <Pressable onPress={() => { const n = !form.useExternalTicket; update('useExternalTicket', n); if (!n) { update('ticketLink', ''); update('ticketProviderName', ''); } }} style={({ pressed }) => [ticketMethodStyles.card, form.useExternalTicket && ticketMethodStyles.cardActive, pressed && { opacity: 0.8 }]}>
                        <View style={[ticketMethodStyles.iconWrap, form.useExternalTicket && { backgroundColor: `${Colors.gold}22` }]}><MaterialIcons name="open-in-new" size={18} color={form.useExternalTicket ? Colors.gold : Colors.textMuted} /></View>
                        <View style={{ flex: 1 }}><Text style={[ticketMethodStyles.label, form.useExternalTicket && { color: Colors.gold }]}>External Ticket Website</Text><Text style={ticketMethodStyles.sub}>Eventbrite, Ticketmaster, or any ticket site</Text></View>
                        {form.useExternalTicket && <MaterialIcons name="check-circle" size={18} color={Colors.gold} />}
                      </Pressable>
                      <Pressable onPress={() => { const n = !form.usePhysicalLocations; update('usePhysicalLocations', n); if (!n) { update('physicalLocations', []); setPhysParishPickerIdx(null); } }} style={({ pressed }) => [ticketMethodStyles.card, form.usePhysicalLocations && ticketMethodStyles.cardActive, pressed && { opacity: 0.8 }]}>
                        <View style={[ticketMethodStyles.iconWrap, form.usePhysicalLocations && { backgroundColor: `${Colors.gold}22` }]}><MaterialIcons name="store" size={18} color={form.usePhysicalLocations ? Colors.gold : Colors.textMuted} /></View>
                        <View style={{ flex: 1 }}><Text style={[ticketMethodStyles.label, form.usePhysicalLocations && { color: Colors.gold }]}>Physical Ticket Locations</Text><Text style={ticketMethodStyles.sub}>Bars, shops, or other physical venues</Text></View>
                        {form.usePhysicalLocations && <MaterialIcons name="check-circle" size={18} color={Colors.gold} />}
                      </Pressable>
                    </View>
                  </View>

                  {form.useExternalTicket && (
                    <>
                      <Field label="Ticket Provider Name" hint="Optional — e.g. Eventbrite">
                        <TextInput style={styles.input} placeholder="e.g. Eventbrite, Ticketmaster" placeholderTextColor={Colors.textMuted} value={form.ticketProviderName} onChangeText={(v) => update('ticketProviderName', v.slice(0, 120))} maxLength={120} accessibilityLabel="Ticket provider" />
                      </Field>
                      <Field label="Ticket URL *" hint="Must start with https://">
                        <View style={styles.iconInput}>
                          <MaterialIcons name="link" size={16} color={Colors.textMuted} />
                          <TextInput style={styles.iconInputText} placeholder="https://..." placeholderTextColor={Colors.textMuted} value={form.ticketLink} onChangeText={(v) => update('ticketLink', v)} keyboardType="url" autoCapitalize="none" accessibilityLabel="External ticket URL" />
                        </View>
                      </Field>
                    </>
                  )}

                  {form.usePhysicalLocations && (
                    <View style={styles.field}>
                      <View style={styles.fieldLabelRow}>
                        <Text style={styles.fieldLabel}>Ticket Locations</Text>
                        <Text style={styles.fieldHint}>{form.physicalLocations.length}/5</Text>
                      </View>
                      {form.physicalLocations.map((loc: PhysicalTicketLocation, idx: number) => (
                        <View key={idx} style={physLocStyles.card}>
                          <View style={physLocStyles.cardHeader}>
                            <Text style={physLocStyles.cardTitle}>Location {idx + 1}</Text>
                            <Pressable onPress={() => { update('physicalLocations', form.physicalLocations.filter((_: any, i: number) => i !== idx)); if (physParishPickerIdx === idx) setPhysParishPickerIdx(null); }} hitSlop={8}>
                              <MaterialIcons name="close" size={18} color={Colors.textMuted} />
                            </Pressable>
                          </View>
                          <TextInput style={[styles.input, { marginBottom: Spacing.xs }]} placeholder="Business / Location Name *" placeholderTextColor={Colors.textMuted} value={loc.business_name} onChangeText={(v) => { const upd = [...form.physicalLocations]; upd[idx] = { ...upd[idx], business_name: v }; update('physicalLocations', upd); }} />
                          <TextInput style={[styles.input, { marginBottom: Spacing.xs }]} placeholder="Town / Area *" placeholderTextColor={Colors.textMuted} value={loc.town} onChangeText={(v) => { const upd = [...form.physicalLocations]; upd[idx] = { ...upd[idx], town: v }; update('physicalLocations', upd); }} />
                          <Pressable onPress={() => setPhysParishPickerIdx(physParishPickerIdx === idx ? null : idx)} style={[styles.pickerBtn, { marginBottom: Spacing.xs }]}>
                            <MaterialIcons name="place" size={14} color={Colors.textMuted} />
                            <Text style={[styles.pickerBtnText, loc.parish ? { color: Colors.textPrimary } : undefined]}>{loc.parish || 'Select Parish *'}</Text>
                            <MaterialIcons name={physParishPickerIdx === idx ? 'keyboard-arrow-up' : 'keyboard-arrow-down'} size={18} color={Colors.textMuted} />
                          </Pressable>
                          {physParishPickerIdx === idx && (
                            <ScrollView style={[styles.dropdown, { maxHeight: 180 }]} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                              {parishes.map((p) => (
                                <Pressable key={p} onPress={() => { const upd = [...form.physicalLocations]; upd[idx] = { ...upd[idx], parish: p }; update('physicalLocations', upd); setPhysParishPickerIdx(null); }} style={({ pressed }) => [styles.dropdownOption, loc.parish === p && styles.dropdownOptionActive, pressed && { backgroundColor: Colors.surfaceElevated }]}>
                                  <Text style={[styles.dropdownOptionText, loc.parish === p && { color: Colors.gold }]}>{p}</Text>
                                  {loc.parish === p && <MaterialIcons name="check" size={14} color={Colors.gold} />}
                                </Pressable>
                              ))}
                            </ScrollView>
                          )}
                        </View>
                      ))}
                      {form.physicalLocations.length < 5 ? (
                        <Pressable onPress={() => update('physicalLocations', [...form.physicalLocations, { business_name: '', town: '', parish: '' }])} style={physLocStyles.addBtn}>
                          <MaterialIcons name="add" size={16} color={Colors.gold} />
                          <Text style={physLocStyles.addBtnText}>Add Ticket Location</Text>
                        </Pressable>
                      ) : (
                        <View style={physLocStyles.maxRow}><MaterialIcons name="info-outline" size={14} color={Colors.textMuted} /><Text style={physLocStyles.maxText}>Maximum 5 ticket locations</Text></View>
                      )}
                    </View>
                  )}
                </>
              )}

              <Field label="Age Restriction">
                <View style={styles.ageRow}>
                  {AGE_OPTIONS.map((opt) => (
                    <Pressable
                      key={opt}
                      onPress={() => update('ageLimit', opt)}
                      style={[styles.ageOpt, form.ageLimit === opt && styles.ageOptActive]}
                    >
                      <Text style={[styles.ageOptText, form.ageLimit === opt && styles.ageOptTextActive]}>{opt}</Text>
                    </Pressable>
                  ))}
                </View>
              </Field>

              <Field label="Dress Code" hint="Optional">
                <TextInput
                  style={styles.input}
                  placeholder="e.g. All White, Beach Wear, Smart Casual"
                  placeholderTextColor={Colors.textMuted}
                  value={form.dressCode}
                  onChangeText={(v) => update('dressCode', v)}
                  accessibilityLabel="Dress code"
                />
              </Field>

              <Field label="Lineup" hint="Add DJs, artists, MCs, hosts & more">
                {/* Role selector */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.xs, paddingBottom: Spacing.xs, flexDirection: 'row' }}>
                  {PERFORMER_ROLES.map((role) => (
                    <Pressable
                      key={role}
                      onPress={() => update('lineupRoleInput', role)}
                      style={[styles.roleChip, form.lineupRoleInput === role && styles.roleChipActive]}
                    >
                      <Text style={[styles.roleChipText, form.lineupRoleInput === role && styles.roleChipTextActive]}>{role}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
                <View style={styles.lineupInput}>
                  <View style={styles.rolePrefixBadge}>
                    <Text style={styles.rolePrefixText}>{form.lineupRoleInput}</Text>
                  </View>
                  <TextInput
                    style={[styles.input, { flex: 1, borderWidth: 0, height: 50 }]}
                    placeholder="Name..."
                    placeholderTextColor={Colors.textMuted}
                    value={form.lineupNameInput}
                    onChangeText={(v) => update('lineupNameInput', v)}
                    onSubmitEditing={addArtist}
                    accessibilityLabel="Performer name"
                  />
                  <Pressable onPress={addArtist} style={styles.addArtistBtn}>
                    <MaterialIcons name="add" size={20} color={Colors.textOnGold} />
                  </Pressable>
                </View>
                {form.lineupEntries.length > 0 && (
                  <View style={styles.artistTags}>
                    {form.lineupEntries.map((entry: { name: string; role: string }, idx: number) => (
                      <View key={`${entry.role}-${entry.name}-${idx}`} style={styles.artistTag}>
                        <View style={styles.artistRoleBadge}>
                          <Text style={styles.artistRoleBadgeText}>{entry.role}</Text>
                        </View>
                        <Text style={styles.artistTagText}>{entry.name}</Text>
                        <Pressable onPress={() => update('lineupEntries', form.lineupEntries.filter((_: any, i: number) => i !== idx))} hitSlop={8}>
                          <MaterialIcons name="close" size={14} color={Colors.textMuted} />
                        </Pressable>
                      </View>
                    ))}
                  </View>
                )}
              </Field>
            </View>
          )}

          {/* ── STEP 5: Contact ── */}
          {currentStep === 5 && (
            <View style={styles.stepWrap}>
              <View style={styles.stepIntro}>
                <View style={styles.stepIconBg}><MaterialIcons name="link" size={22} color={Colors.gold} /></View>
                <Text style={styles.stepDesc}>How can attendees buy tickets or get in touch?</Text>
              </View>

              <Field label="Ticket / Purchase Link" hint="Optional — where can people buy tickets?">
                <View style={styles.iconInput}>
                  <MaterialIcons name="open-in-browser" size={16} color={Colors.textMuted} />
                  <TextInput
                    style={styles.iconInputText}
                    placeholder="https://... or ticket platform link"
                    placeholderTextColor={Colors.textMuted}
                    value={form.ticketLink}
                    onChangeText={(v) => update('ticketLink', v)}
                    keyboardType="url"
                    autoCapitalize="none"
                    accessibilityLabel="Ticket link"
                  />
                </View>
              </Field>

              <Field label="Contact Phone" hint="Optional — primary contact for attendees">
                <PhoneInput
                  value={form.contactInfo.startsWith('+') ? form.contactInfo : ''}
                  onChange={(e164) => update('contactInfo', e164)}
                  placeholder="876 000 0000"
                />
                {form.contactInfo && !form.contactInfo.startsWith('+') ? (
                  <TextInput
                    style={[styles.input, { marginTop: 6 }]}
                    placeholder="Or WhatsApp link / @handle"
                    placeholderTextColor={Colors.textMuted}
                    value={form.contactInfo}
                    onChangeText={(v) => update('contactInfo', v)}
                    accessibilityLabel="Contact info handle"
                  />
                ) : null}
                {!form.contactInfo ? (
                  <Pressable onPress={() => update('contactInfo', '@')} hitSlop={8}>
                    <Text style={{ fontSize: Typography.xs, color: Colors.textMuted, marginTop: 4 }}>
                      Use @handle or WhatsApp link instead?{' '}
                      <Text style={{ color: Colors.gold }}>Tap here</Text>
                    </Text>
                  </Pressable>
                ) : null}
              </Field>

              <Field label="Event Photos Link" hint="Add after your event">
                <View style={styles.iconInput}>
                  <MaterialIcons name="photo-library" size={16} color={Colors.textMuted} />
                  <TextInput
                    style={styles.iconInputText}
                    placeholder="https://photos.google.com/... (add after event)"
                    placeholderTextColor={Colors.textMuted}
                    value={form.eventPhotosLink}
                    onChangeText={(v) => update('eventPhotosLink', v)}
                    keyboardType="url"
                    autoCapitalize="none"
                    accessibilityLabel="Event photos link"
                  />
                </View>
              </Field>

              <View style={styles.tipCard}>
                <MaterialIcons name="lightbulb-outline" size={18} color={Colors.gold} />
                <Text style={styles.tipText}>
                  Adding a ticket link increases event visibility and helps attendees act quickly. Even a WhatsApp number works great!
                </Text>
              </View>
            </View>
          )}

          {/* ── STEP 6: Review & Publish ── */}
          {currentStep === 6 && (
            <View style={styles.stepWrap}>
              <View style={styles.stepIntro}>
                <View style={styles.stepIconBg}><MaterialIcons name="preview" size={22} color={Colors.gold} /></View>
                <Text style={styles.stepDesc}>Review your event before publishing to Vybz Hub.</Text>
              </View>

              {/* Cover image preview */}
              {form.flyerImages[0] && (
                <View style={styles.reviewHero}>
                  <Image source={{ uri: form.flyerImages[0] }} style={styles.reviewHeroImg} contentFit="cover" transition={300} />
                  <LinearGradient colors={['transparent', 'rgba(0,0,0,0.8)']} style={StyleSheet.absoluteFillObject} />
                  <View style={styles.reviewHeroContent}>
                    <Text style={styles.reviewHeroTitle}>{form.title || 'Untitled Event'}</Text>
                    <View style={styles.reviewHeroMeta}>
                      <MaterialIcons name="place" size={13} color={Colors.gold} />
                      <Text style={styles.reviewHeroMetaText}>{form.parish || 'Parish TBA'}</Text>
                    </View>
                  </View>
                  <Pressable onPress={() => jumpToStep(3)} style={styles.reviewEditOverlay}>
                    <MaterialIcons name="edit" size={14} color={Colors.gold} />
                  </Pressable>
                  {form.flyerImages.length > 1 && (
                    <View style={styles.reviewImageCount}>
                      <MaterialIcons name="collections" size={12} color="#fff" />
                      <Text style={styles.reviewImageCountText}>{form.flyerImages.length} photos</Text>
                    </View>
                  )}
                </View>
              )}

              {/* Review sections */}
              <ReviewSection
                icon="event"
                title="Basic Info"
                onEdit={() => jumpToStep(0)}
                rows={[
                  { label: 'Date', value: form.date ? formatDate(form.date) : '—' },
                  { label: 'Time', value: form.startTime ? `${form.startTime}${form.endTime ? ` → ${form.endTime}` : ''}` : 'TBA' },
                  { label: 'Description', value: form.description || '—', truncate: true },
                ]}
              />

              <ReviewSection
                icon="place"
                title="Location"
                onEdit={() => jumpToStep(1)}
                rows={[
                  { label: 'Parish', value: form.parish || '—' },
                  { label: 'Venue', value: form.venue || '—' },
                  { label: 'Address', value: form.address || '—' },
                ]}
              />

              <ReviewSection
                icon="category"
                title="Category"
                onEdit={() => jumpToStep(2)}
              >
                <View style={styles.reviewTypesRow}>
                  {form.eventTypes.length > 0 ? form.eventTypes.map((typeId: string, idx: number) => {
                    const typeInfo = eventTypes.find((t) => t.id === typeId);
                    if (!typeInfo) return null;
                    return (
                      <View key={typeId} style={[styles.reviewTypeChip, { borderColor: `${typeInfo.color}55`, backgroundColor: `${typeInfo.color}15` }]}>
                        <MaterialIcons name={typeInfo.icon as any} size={12} color={typeInfo.color} />
                        <Text style={[styles.reviewTypeText, { color: typeInfo.color }]}>
                          {typeInfo.label}{idx === 0 ? ' (Primary)' : ''}
                        </Text>
                      </View>
                    );
                  }) : <Text style={styles.reviewEmpty}>No types selected</Text>}
                </View>
                {form.recurring && (
                  <View style={styles.reviewRecurring}>
                    <MaterialIcons name="repeat" size={14} color={Colors.gold} />
                    <Text style={styles.reviewRecurringText}>Repeats {form.recurringFrequency}</Text>
                  </View>
                )}
              </ReviewSection>

              <ReviewSection
                icon="local-activity"
                title="Pricing & Details"
                onEdit={() => jumpToStep(4)}
                rows={[
                  { label: 'Entry', value: form.isFree ? 'Free Entry' : 'Paid Event' },
                  ...(!form.isFree ? [
                    { label: 'Price', value: form.ticketPrice || 'TBD' },
                    { label: 'Methods', value: [form.useVybzHub && 'Vybz Hub', form.useExternalTicket && 'External', form.usePhysicalLocations && 'Physical'].filter(Boolean).join(', ') || 'None selected' },
                    ...(form.useExternalTicket ? [{ label: 'Provider', value: form.ticketProviderName || '—' }, { label: 'URL', value: form.ticketLink || '—', truncate: true as const }] : []),
                    ...(form.usePhysicalLocations ? [{ label: 'Locations', value: `${form.physicalLocations.length} location${form.physicalLocations.length !== 1 ? 's' : ''}` }] : []),
                  ] : []),
                  { label: 'Age Restriction', value: form.ageLimit },
                  { label: 'Dress Code', value: form.dressCode || '—' },
                  { label: 'Lineup', value: form.lineupEntries.length > 0 ? form.lineupEntries.map((e: { name: string; role: string }) => `${e.role}: ${e.name}`).join(', ') : '—', truncate: true },
                ]}
              />

              <ReviewSection
                icon="link"
                title="Contact"
                onEdit={() => jumpToStep(5)}
                rows={[
                  { label: 'Ticket Link', value: form.ticketLink || '—' },
                  { label: 'Contact', value: form.contactInfo || '—' },
                  { label: 'Event Photos', value: form.eventPhotosLink || '—' },
                ]}
              />

              {/* Upload progress indicator */}
              {uploadProgress && (
                <View style={styles.uploadProgressBanner}>
                  <View style={styles.uploadProgressRow}>
                    <MaterialIcons name="cloud-upload" size={16} color={Colors.gold} />
                    <Text style={styles.uploadProgressTitle}>
                      {uploadProgress.status === 'compressing'
                        ? `Compressing image ${uploadProgress.index + 1} of ${uploadProgress.total}…`
                        : uploadProgress.status === 'uploading'
                        ? `Uploading image ${uploadProgress.index + 1} of ${uploadProgress.total}…`
                        : `Image ${uploadProgress.index + 1} done`}
                    </Text>
                  </View>
                  {uploadProgress.compressedBytes > 0 && uploadProgress.originalBytes > 0 && (
                    <Text style={styles.uploadProgressStats}>
                      {formatBytes(uploadProgress.originalBytes)} → {formatBytes(uploadProgress.compressedBytes)}
                      {'  '}({uploadProgress.originalDimensions.width}×{uploadProgress.originalDimensions.height}
                      {' → '}{uploadProgress.compressedDimensions.width}×{uploadProgress.compressedDimensions.height} px)
                    </Text>
                  )}
                  {/* Progress bar */}
                  <View style={styles.uploadProgressBarBg}>
                    <View
                      style={[
                        styles.uploadProgressBarFill,
                        {
                          width: `${Math.round(
                            ((uploadProgress.index + (uploadProgress.status === 'done' ? 1 : 0.5)) /
                              Math.max(uploadProgress.total, 1)) *
                              100
                          )}%` as any,
                        },
                      ]}
                    />
                  </View>
                </View>
              )}
              {uploadError ? (
                <View style={styles.uploadErrorBanner}>
                  <MaterialIcons name="error-outline" size={16} color={Colors.error} />
                  <Text style={styles.uploadErrorText}>{uploadError}</Text>
                  <Pressable
                    onPress={() => setUploadError(null)}
                    hitSlop={8}
                    style={{ marginLeft: 4 }}
                  >
                    <MaterialIcons name="close" size={16} color={Colors.error} />
                  </Pressable>
                </View>
              ) : null}

              <View style={styles.publishNote}>
                <MaterialIcons name="info-outline" size={15} color={Colors.textMuted} />
                <Text style={styles.publishNoteText}>
                  Once published, your event will appear in Browse and Search results for all Vybz Hub users.
                </Text>
              </View>
            </View>
          )}

          {/* ── Navigation Buttons ── */}
          <View style={styles.navRow}>
            {currentStep > 0 ? (
              <Pressable onPress={goBack} style={({ pressed }) => [styles.backNavBtn, pressed && { opacity: 0.7 }]}>
                <MaterialIcons name="arrow-back" size={18} color={Colors.textSecondary} />
                <Text style={styles.backNavText}>Back</Text>
              </Pressable>
            ) : <View style={{ flex: 1 }} />}

            {currentStep < TOTAL_STEPS - 1 ? (
              <Pressable
                onPress={goNext}
                disabled={!isStepValid()}
                style={({ pressed }) => [styles.nextNavBtn, !isStepValid() && { opacity: 0.4 }, pressed && { opacity: 0.85 }]}
              >
                <LinearGradient colors={[Colors.gold, Colors.goldDim]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.nextNavBtnInner}>
                  <Text style={styles.nextNavText}>{currentStep === 5 ? 'Review →' : 'Next →'}</Text>
                </LinearGradient>
              </Pressable>
            ) : (
              <Pressable
                onPress={handleSubmit}
                disabled={submitting}
                style={({ pressed }) => [styles.publishBtn, pressed && { opacity: 0.85 }]}
              >
                <LinearGradient colors={[Colors.gold, Colors.goldDim]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.publishBtnInner}>
                  <MaterialIcons name="publish" size={18} color={Colors.textOnGold} />
                  <Text style={styles.publishBtnText}>{submitting ? 'Publishing...' : 'Publish Event'}</Text>
                </LinearGradient>
              </Pressable>
            )}
          </View>

          <View style={{ height: Spacing.xxl * 2 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── Helper Components ─────────────────────────────────────────────────────────
function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.field}>
      <View style={styles.fieldLabelRow}>
        <Text style={styles.fieldLabel}>{label}</Text>
        {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function ReviewSection({
  icon,
  title,
  onEdit,
  rows,
  children,
}: {
  icon: string;
  title: string;
  onEdit: () => void;
  rows?: { label: string; value: string; truncate?: boolean }[];
  children?: React.ReactNode;
}) {
  return (
    <View style={styles.reviewSection}>
      <View style={styles.reviewSectionHeader}>
        <MaterialIcons name={icon as any} size={16} color={Colors.gold} />
        <Text style={styles.reviewSectionTitle}>{title}</Text>
        <Pressable onPress={onEdit} style={styles.reviewEditBtn}>
          <MaterialIcons name="edit" size={14} color={Colors.gold} />
          <Text style={styles.reviewEditText}>Edit</Text>
        </Pressable>
      </View>
      {rows && rows.map(({ label, value, truncate }) => (
        <View key={label} style={styles.reviewRow}>
          <Text style={styles.reviewRowLabel}>{label}</Text>
          <Text style={[styles.reviewRowValue, truncate && { flex: 1 }]} numberOfLines={truncate ? 2 : undefined}>
            {value}
          </Text>
        </View>
      ))}
      {children}
    </View>
  );
}

// ─── Picker styles ────────────────────────────────────────────────────────────
const pickerStyles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: Spacing.base, paddingTop: Spacing.md,
    // paddingBottom is applied dynamically via insets in each modal component
    borderTopWidth: 1, borderTopColor: Colors.surfaceBorder,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: Colors.surfaceBorder, alignSelf: 'center', marginBottom: Spacing.base,
  },
  title: {
    fontSize: Typography.lg, fontWeight: Typography.black,
    color: Colors.textPrimary, textAlign: 'center', marginBottom: Spacing.base,
  },

  // Calendar
  monthNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  navBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.surfaceElevated, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  monthLabel: {
    fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textPrimary,
  },
  dowRow: {
    flexDirection: 'row', marginBottom: Spacing.xs,
  },
  dowText: {
    flex: 1, textAlign: 'center', fontSize: Typography.xs,
    color: Colors.textMuted, fontWeight: Typography.semibold,
  },
  // Each week is its own row — avoids floating-point % overflow on the 7th column
  calRow: {
    flexDirection: 'row', marginBottom: 2,
  },
  calCell: {
    flex: 1, aspectRatio: 1,
    alignItems: 'center', justifyContent: 'center', borderRadius: 999,
  },
  calCellSelected: {
    backgroundColor: Colors.gold,
  },
  calCellText: {
    fontSize: Typography.base, color: Colors.textSecondary, fontWeight: Typography.medium,
  },
  calCellTextSelected: {
    color: Colors.textOnGold, fontWeight: Typography.black,
  },

  // Time picker
  timePreview: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, marginBottom: Spacing.base,
    backgroundColor: Colors.goldSurface, borderRadius: Radius.lg, paddingVertical: Spacing.md,
    borderWidth: 1, borderColor: `${Colors.gold}33`,
  },
  timePreviewText: {
    fontSize: 28, fontWeight: Typography.black, color: Colors.gold,
  },
  timePickerRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    marginBottom: Spacing.base,
  },
  timeCol: { flex: 1, alignItems: 'center', gap: Spacing.xs },
  timeColLabel: {
    fontSize: Typography.xs, color: Colors.textMuted,
    fontWeight: Typography.semibold, textTransform: 'uppercase', letterSpacing: 0.5,
  },
  timeScroll: {
    width: '100%', maxHeight: 180,
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  timeItem: {
    paddingVertical: Spacing.md, alignItems: 'center',
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
  },
  timeItemSelected: { backgroundColor: Colors.goldSurface },
  timeItemText: { fontSize: Typography.md, color: Colors.textSecondary, fontWeight: Typography.medium },
  timeItemTextSelected: { color: Colors.gold, fontWeight: Typography.black },
  timeColon: {
    fontSize: 28, fontWeight: Typography.black, color: Colors.textMuted,
    paddingTop: 28,
  },
  periodCol: {
    gap: Spacing.sm, width: '100%',
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.surfaceBorder, overflow: 'hidden',
    padding: Spacing.xs,
  },
  periodBtn: {
    paddingVertical: Spacing.md, alignItems: 'center',
    borderRadius: Radius.md,
  },
  periodBtnActive: { backgroundColor: Colors.gold },
  periodText: { fontSize: Typography.base, color: Colors.textSecondary, fontWeight: Typography.semibold },
  periodTextActive: { color: Colors.textOnGold, fontWeight: Typography.black },

  // Confirm
  confirmBtn: { borderRadius: Radius.lg, overflow: 'hidden', marginTop: Spacing.xs },
  confirmBtnInner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, paddingVertical: Spacing.base,
  },
  confirmText: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textOnGold },
});

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  gateContainer: { flex: 1, backgroundColor: Colors.background },
  gate: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl, gap: Spacing.lg },
  gateScroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: Spacing.base },
  gateIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: Colors.goldSurface, alignItems: 'center', justifyContent: 'center' },
  gateTitle: { fontSize: 24, fontWeight: Typography.black, color: Colors.textPrimary, textAlign: 'center' },
  gateSub: { fontSize: Typography.base, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  gateBtn: { width: '100%', borderRadius: Radius.lg, overflow: 'hidden' },
  gateBtnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingVertical: Spacing.base },
  gateBtnText: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textOnGold },
  secondaryLink: { paddingVertical: Spacing.sm },
  secondaryLinkText: { fontSize: Typography.sm, color: Colors.textMuted, textDecorationLine: 'underline' },
  successAd: { alignSelf: 'stretch', marginTop: -Spacing.sm },
  promoterGate: { gap: Spacing.base, paddingVertical: Spacing.xxl, alignItems: 'center' },
  perks: { gap: Spacing.sm, alignSelf: 'stretch' },
  perk: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  perkText: { fontSize: Typography.base, color: Colors.textSecondary },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
  },
  headerTitle: { fontSize: Typography.lg, fontWeight: Typography.black, color: Colors.textPrimary },
  headerSub: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 1 },
  myEventsLink: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.goldSurface, paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: Radius.full, borderWidth: 1, borderColor: `${Colors.gold}33` },
  myEventsLinkText: { fontSize: Typography.xs, color: Colors.gold, fontWeight: Typography.semibold },
  draftBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: Colors.goldSurface, paddingHorizontal: Spacing.sm, paddingVertical: 3,
    borderRadius: Radius.full, borderWidth: 1, borderColor: `${Colors.gold}33`,
  },
  draftBadgeText: { fontSize: 10, color: Colors.gold, fontWeight: Typography.semibold },

  formContent: { paddingHorizontal: Spacing.base, paddingTop: Spacing.lg, gap: Spacing.base },
  stepWrap: { gap: Spacing.base },
  stepIntro: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.xs },
  stepIconBg: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.goldSurface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: `${Colors.gold}33` },
  stepDesc: { flex: 1, fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 20 },

  field: { gap: Spacing.xs },
  fieldLabelRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  fieldLabel: { fontSize: Typography.sm, color: Colors.textSecondary, fontWeight: Typography.semibold },
  fieldHint: { fontSize: Typography.xs, color: Colors.textMuted },

  input: {
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1.5, borderColor: Colors.surfaceBorder,
    paddingHorizontal: Spacing.md, height: 52,
    fontSize: Typography.base, color: Colors.textPrimary,
  },
  textarea: { height: 110, paddingTop: Spacing.md },
  row: { flexDirection: 'row', gap: Spacing.md },
  iconInput: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1.5, borderColor: Colors.surfaceBorder,
    paddingHorizontal: Spacing.md, gap: Spacing.xs, height: 52,
  },
  iconInputText: { flex: 1, fontSize: Typography.base, color: Colors.textPrimary },

  // Parish picker
  pickerBtn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1.5, borderColor: Colors.surfaceBorder,
    paddingHorizontal: Spacing.md, height: 52, gap: Spacing.sm,
  },
  pickerBtnText: { flex: 1, fontSize: Typography.base, color: Colors.textMuted },
  dropdown: {
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.surfaceBorder, maxHeight: 200, marginTop: 4,
  },
  dropdownOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
  },
  dropdownOptionActive: { backgroundColor: Colors.goldSurface },
  dropdownOptionText: { fontSize: Typography.base, color: Colors.textSecondary },

  // Type grid
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  typeCard: {
    width: '47%', backgroundColor: Colors.surface,
    borderRadius: Radius.lg, padding: Spacing.md,
    alignItems: 'center', gap: Spacing.xs,
    borderWidth: 1.5, borderColor: Colors.surfaceBorder,
    position: 'relative', minHeight: 80, justifyContent: 'center',
  },
  typeCardLabel: { fontSize: Typography.xs, color: Colors.textMuted, textAlign: 'center', lineHeight: 16 },
  typeCardCheck: {
    position: 'absolute', top: 6, right: 6,
    width: 18, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
  },
  typeSummary: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.xs,
    backgroundColor: Colors.goldSurface, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs,
    borderRadius: Radius.full, borderWidth: 1, borderColor: `${Colors.gold}33`, alignSelf: 'flex-start',
  },
  typeSummaryText: { fontSize: Typography.xs, color: Colors.gold },

  // Recurring
  recurringCard: { backgroundColor: Colors.surface, borderRadius: Radius.lg, overflow: 'hidden', borderWidth: 1.5, borderColor: Colors.surfaceBorder },
  recurringHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md },
  recurringIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  recurringTitle: { fontSize: Typography.base, fontWeight: Typography.semibold, color: Colors.textPrimary },
  recurringSub: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 1 },
  freqRow: { flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingBottom: Spacing.md },
  freqBtn: {
    flex: 1, paddingVertical: Spacing.sm, alignItems: 'center',
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md,
    borderWidth: 1.5, borderColor: Colors.surfaceBorder,
  },
  freqBtnActive: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  freqText: { fontSize: Typography.sm, color: Colors.textSecondary, fontWeight: Typography.medium },
  freqTextActive: { color: Colors.textOnGold, fontWeight: Typography.bold },

  // Upload from device
  uploadDeviceBtn: { borderRadius: Radius.lg, overflow: 'hidden', borderWidth: 1.5, borderColor: `${Colors.gold}44` },
  uploadDeviceBtnInner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md },
  uploadDeviceIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.goldSurface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: `${Colors.gold}33` },
  uploadDeviceTitle: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.gold },
  uploadDeviceSub: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2 },
  orDivider: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginVertical: Spacing.xs },
  orLine: { flex: 1, height: 1, backgroundColor: Colors.surfaceBorder },
  orText: { fontSize: Typography.xs, color: Colors.textMuted, fontWeight: Typography.medium },

  // Flyer gallery
  selectedSection: { gap: Spacing.xs },
  selectedRow: { gap: Spacing.sm, paddingVertical: Spacing.xs },
  selectedThumb: { width: 90, height: 90, borderRadius: Radius.md, overflow: 'hidden', position: 'relative' },
  selectedThumbImg: { width: '100%', height: '100%' },
  primaryBadge: { position: 'absolute', bottom: 4, left: 4, backgroundColor: Colors.gold, paddingHorizontal: 5, paddingVertical: 2, borderRadius: Radius.full },
  primaryBadgeText: { fontSize: 9, color: Colors.textOnGold, fontWeight: Typography.bold },
  removeThumb: {
    position: 'absolute', top: 4, right: 4,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center',
  },
  galleryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  galleryThumb: { width: '30%', aspectRatio: 1, borderRadius: Radius.md, overflow: 'hidden', position: 'relative' },
  galleryThumbSelected: { borderWidth: 2.5, borderColor: Colors.gold },
  galleryThumbImg: { width: '100%', height: '100%' },
  galleryThumbGrad: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '60%' },
  galleryThumbLabel: { position: 'absolute', bottom: 4, left: 4, fontSize: 9, color: '#fff', fontWeight: Typography.semibold },
  galleryCheck: {
    position: 'absolute', top: 5, right: 5,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: Colors.gold, alignItems: 'center', justifyContent: 'center',
  },
  customUrlRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1.5, borderColor: Colors.surfaceBorder, overflow: 'hidden',
  },
  addUrlBtn: { width: 52, height: 52, backgroundColor: Colors.gold, alignItems: 'center', justifyContent: 'center' },

  // Age
  ageRow: { flexDirection: 'row', gap: Spacing.sm },
  ageOpt: {
    flex: 1, alignItems: 'center', paddingVertical: Spacing.md,
    borderRadius: Radius.md, backgroundColor: Colors.surface,
    borderWidth: 1.5, borderColor: Colors.surfaceBorder,
  },
  ageOptActive: { backgroundColor: Colors.goldSurface, borderColor: Colors.gold },
  ageOptText: { fontSize: Typography.sm, color: Colors.textSecondary, fontWeight: Typography.medium },
  ageOptTextActive: { color: Colors.gold, fontWeight: Typography.bold },

  // Role chips
  roleChip: {
    paddingHorizontal: Spacing.md, height: 34, borderRadius: Radius.full,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.surfaceBorder,
    alignItems: 'center', justifyContent: 'center',
  },
  roleChipActive: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  roleChipText: { fontSize: Typography.xs, color: Colors.textMuted, fontWeight: Typography.medium },
  roleChipTextActive: { color: Colors.textOnGold, fontWeight: Typography.bold },
  rolePrefixBadge: {
    paddingHorizontal: Spacing.sm, height: 50, alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.goldSurface, borderRightWidth: 1, borderRightColor: Colors.surfaceBorder,
    minWidth: 56,
  },
  rolePrefixText: { fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.gold },
  artistRoleBadge: {
    backgroundColor: Colors.goldSurface, borderRadius: Radius.full,
    paddingHorizontal: 6, paddingVertical: 2,
    borderWidth: 1, borderColor: `${Colors.gold}44`,
  },
  artistRoleBadgeText: { fontSize: 9, color: Colors.gold, fontWeight: Typography.bold },

  // Lineup
  lineupInput: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1.5, borderColor: Colors.surfaceBorder, overflow: 'hidden',
  },
  addArtistBtn: { width: 52, height: 52, backgroundColor: Colors.gold, alignItems: 'center', justifyContent: 'center' },
  artistTags: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginTop: Spacing.xs },
  artistTag: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.full,
    paddingHorizontal: Spacing.md, paddingVertical: 6,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  artistTagText: { fontSize: Typography.sm, color: Colors.textSecondary },

  // Tip card
  tipCard: {
    flexDirection: 'row', gap: Spacing.md,
    backgroundColor: Colors.goldSurface, borderRadius: Radius.lg, padding: Spacing.base,
    borderWidth: 1, borderColor: `${Colors.gold}33`,
  },
  tipText: { flex: 1, fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 20 },

  // Review
  reviewHero: { height: 180, borderRadius: Radius.xl, overflow: 'hidden', position: 'relative', marginBottom: Spacing.xs },
  reviewHeroImg: { width: '100%', height: '100%' },
  reviewHeroContent: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: Spacing.md, gap: 4 },
  reviewHeroTitle: { fontSize: Typography.lg, fontWeight: Typography.black, color: '#fff' },
  reviewHeroMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  reviewHeroMetaText: { fontSize: Typography.sm, color: Colors.gold, fontWeight: Typography.semibold },
  reviewEditOverlay: { position: 'absolute', top: Spacing.sm, right: Spacing.sm, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  reviewImageCount: { position: 'absolute', bottom: Spacing.sm, right: Spacing.sm, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: Radius.full },
  reviewImageCountText: { fontSize: Typography.xs, color: '#fff' },
  reviewSection: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.surfaceBorder, overflow: 'hidden',
  },
  reviewSectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
    backgroundColor: Colors.surfaceElevated,
  },
  reviewSectionTitle: { flex: 1, fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textPrimary },
  reviewEditBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  reviewEditText: { fontSize: Typography.xs, color: Colors.gold, fontWeight: Typography.semibold },
  reviewRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder, gap: Spacing.md,
  },
  reviewRowLabel: { fontSize: Typography.xs, color: Colors.textMuted, width: 90, paddingTop: 1 },
  reviewRowValue: { fontSize: Typography.sm, color: Colors.textSecondary, flex: 1 },
  reviewTypesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, padding: Spacing.base, paddingBottom: Spacing.sm },
  reviewTypeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: Spacing.sm, paddingVertical: 4,
    borderRadius: Radius.full, borderWidth: 1,
  },
  reviewTypeText: { fontSize: Typography.xs, fontWeight: Typography.semibold },
  reviewRecurring: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.xs,
    paddingHorizontal: Spacing.base, paddingBottom: Spacing.md,
  },
  reviewRecurringText: { fontSize: Typography.sm, color: Colors.gold },
  reviewEmpty: { fontSize: Typography.sm, color: Colors.textMuted, padding: Spacing.md },
  publishNote: {
    flexDirection: 'row', gap: Spacing.sm,
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.lg, padding: Spacing.base,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  publishNoteText: { flex: 1, fontSize: Typography.sm, color: Colors.textMuted, lineHeight: 20 },
  uploadErrorBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    backgroundColor: 'rgba(255,68,68,0.1)', borderRadius: Radius.lg, padding: Spacing.base,
    borderWidth: 1, borderColor: 'rgba(255,68,68,0.25)',
  },
  uploadErrorText: { flex: 1, fontSize: Typography.sm, color: Colors.error, lineHeight: 20 },
  uploadProgressBanner: {
    backgroundColor: Colors.goldSurface, borderRadius: Radius.lg, padding: Spacing.md,
    borderWidth: 1, borderColor: `${Colors.gold}33`, gap: Spacing.xs,
  },
  uploadProgressRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  uploadProgressTitle: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.gold, flex: 1 },
  uploadProgressStats: { fontSize: Typography.xs, color: Colors.textMuted, lineHeight: 16 },
  uploadProgressBarBg: {
    height: 4, backgroundColor: Colors.surfaceBorder, borderRadius: 2, overflow: 'hidden', marginTop: 2,
  },
  uploadProgressBarFill: {
    height: '100%', backgroundColor: Colors.gold, borderRadius: 2,
  },

  // Navigation buttons
  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: Spacing.base, gap: Spacing.md },
  backNavBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, paddingVertical: Spacing.md, paddingHorizontal: Spacing.md, flex: 1 },
  backNavText: { fontSize: Typography.base, color: Colors.textSecondary, fontWeight: Typography.medium },
  nextNavBtn: { flex: 2, borderRadius: Radius.lg, overflow: 'hidden' },
  nextNavBtnInner: { paddingVertical: Spacing.md + 2, alignItems: 'center' },
  nextNavText: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textOnGold },
  publishBtn: { flex: 2, borderRadius: Radius.lg, overflow: 'hidden' },
  publishBtnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingVertical: Spacing.md + 2 },
  publishBtnText: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textOnGold },
});

const entryTypeStyles = StyleSheet.create({
  btn: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.xs, paddingVertical: Spacing.base, borderRadius: Radius.lg, backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.surfaceBorder, position: 'relative' },
  btnFree: { borderColor: Colors.greenLight, backgroundColor: `${Colors.greenLight}10` },
  btnPaid: { borderColor: Colors.gold, backgroundColor: Colors.goldSurface },
  btnLabel: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textMuted },
  btnSub: { fontSize: Typography.xs, color: Colors.textMuted, textAlign: 'center' },
  checkWrap: { position: 'absolute', top: 8, right: 8 },
});

const ticketMethodStyles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.surfaceBorder, padding: Spacing.md },
  cardActive: { borderColor: Colors.gold, backgroundColor: Colors.goldSurface },
  iconWrap: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textSecondary },
  sub: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 1 },
});

const physLocStyles = StyleSheet.create({
  card: { backgroundColor: Colors.surfaceElevated, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.surfaceBorder, padding: Spacing.md, gap: Spacing.xs, marginBottom: Spacing.sm },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.xs },
  cardTitle: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.gold },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingVertical: Spacing.md, borderRadius: Radius.md, borderWidth: 1.5, borderColor: `${Colors.gold}55`, backgroundColor: Colors.goldSurface },
  addBtnText: { fontSize: Typography.sm, color: Colors.gold, fontWeight: Typography.semibold },
  maxRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, justifyContent: 'center', paddingVertical: Spacing.sm },
  maxText: { fontSize: Typography.xs, color: Colors.textMuted },
});
