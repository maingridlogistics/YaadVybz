
import React, { useState } from 'react';
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
  ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { useEvents } from '../../hooks/useEvents';
import { useNotifications } from '../../hooks/useNotifications';
import { notifyRsvpUsersEventChange, notifyRsvpUsersEventCancelled } from '../../services/emailService';
import { uploadEventImages } from '../../lib/storage';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import { Event, EVENT_TYPES, RECURRING_OPTIONS, PhysicalTicketLocation } from '../../constants/data';
import { normalizeEventTitle } from '../../constants/textNormalization';
import { JAMAICA_PARISHES as PARISHES } from '../../constants/parishes';
import { useSafeAreaInsets , SafeAreaView } from 'react-native-safe-area-context';
import { PhoneInput } from '../../components/ui/PhoneInput';

const AGE_OPTIONS = ['All Ages', '18+', '21+'];
const PERFORMER_ROLES = ['DJ', 'Artist', 'MC', 'Host', 'Band', 'Live Act', 'Comedian', 'Sound System', 'Other'];

type LineupEntry = { name: string; role: string };

// ─── Date/Time Picker constants ───────────────────────────────────────────────
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

// ─── Picker Styles ────────────────────────────────────────────────────────────
const pickerStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: Spacing.base, paddingTop: Spacing.md,
    // paddingBottom applied dynamically via useSafeAreaInsets in each modal
    borderTopWidth: 1, borderTopColor: Colors.surfaceBorder,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.surfaceBorder, alignSelf: 'center', marginBottom: Spacing.base },
  title: { fontSize: Typography.lg, fontWeight: Typography.black, color: Colors.textPrimary, textAlign: 'center', marginBottom: Spacing.base },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.md },
  navBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.surfaceElevated, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.surfaceBorder },
  monthLabel: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textPrimary },
  dowRow: { flexDirection: 'row', marginBottom: Spacing.xs },
  dowText: { flex: 1, textAlign: 'center', fontSize: Typography.xs, color: Colors.textMuted, fontWeight: Typography.semibold },
  calGrid: { marginBottom: Spacing.base },
  weekRow: { flexDirection: 'row' },
  calCell: { flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 999 },
  calCellSelected: { backgroundColor: Colors.gold },
  calCellText: { fontSize: Typography.base, color: Colors.textSecondary, fontWeight: Typography.medium },
  calCellTextSelected: { color: Colors.textOnGold, fontWeight: Typography.black },
  timePreview: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, marginBottom: Spacing.base,
    backgroundColor: Colors.goldSurface, borderRadius: Radius.lg, paddingVertical: Spacing.md,
    borderWidth: 1, borderColor: `${Colors.gold}33`,
  },
  timePreviewText: { fontSize: 28, fontWeight: Typography.black, color: Colors.gold },
  timePickerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, marginBottom: Spacing.base },
  timeCol: { flex: 1, alignItems: 'center', gap: Spacing.xs },
  timeColLabel: { fontSize: Typography.xs, color: Colors.textMuted, fontWeight: Typography.semibold, textTransform: 'uppercase', letterSpacing: 0.5 },
  timeScroll: { width: '100%', maxHeight: 180, backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.surfaceBorder },
  timeItem: { paddingVertical: Spacing.md, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder },
  timeItemSelected: { backgroundColor: Colors.goldSurface },
  timeItemText: { fontSize: Typography.md, color: Colors.textSecondary, fontWeight: Typography.medium },
  timeItemTextSelected: { color: Colors.gold, fontWeight: Typography.black },
  timeColon: { fontSize: 28, fontWeight: Typography.black, color: Colors.textMuted, paddingTop: 28 },
  periodCol: { gap: Spacing.sm, width: '100%', backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.surfaceBorder, overflow: 'hidden', padding: Spacing.xs },
  periodBtn: { paddingVertical: Spacing.md, alignItems: 'center', borderRadius: Radius.md },
  periodBtnActive: { backgroundColor: Colors.gold },
  periodText: { fontSize: Typography.base, color: Colors.textSecondary, fontWeight: Typography.semibold },
  periodTextActive: { color: Colors.textOnGold, fontWeight: Typography.black },
  confirmBtn: { borderRadius: Radius.lg, overflow: 'hidden', marginTop: Spacing.xs },
  confirmBtnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingVertical: Spacing.base },
  confirmText: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textOnGold },
});

// ─── Date Picker Modal ────────────────────────────────────────────────────────
function DatePickerModal({
  visible, value, onConfirm, onClose,
}: { visible: boolean; value: string; onConfirm: (iso: string) => void; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const today = new Date();
  const parsed = value ? value.split('-').map(Number) : [today.getFullYear(), today.getMonth() + 1, 1];
  const [year, setYear]   = useState(parsed[0]);
  const [month, setMonth] = useState(parsed[1] - 1);
  const [day, setDay]     = useState(parsed[2]);

  const daysInMonth = getDaysInMonth(year, month);
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear((y) => y - 1); } else setMonth((m) => m - 1); setDay(1); };
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear((y) => y + 1); } else setMonth((m) => m + 1); setDay(1); };

  const handleConfirm = () => {
    onConfirm(`${year}-${String(month + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`);
    onClose();
  };

  const firstDOW = new Date(year, month, 1).getDay();
  const calCells: (number | null)[] = [...Array(firstDOW).fill(null), ...days];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={pickerStyles.overlay} onPress={onClose}>
        <Pressable style={[pickerStyles.sheet, { paddingBottom: Math.max(Spacing.xxl, insets.bottom + Spacing.base) }]} onPress={(e) => e.stopPropagation()}>
          <View style={pickerStyles.handle} />
          <Text style={pickerStyles.title}>Select Date</Text>
          <View style={pickerStyles.monthNav}>
            <Pressable onPress={prevMonth} style={pickerStyles.navBtn} hitSlop={12}>
              <MaterialIcons name="chevron-left" size={24} color={Colors.textPrimary} />
            </Pressable>
            <Text style={pickerStyles.monthLabel}>{MONTHS[month]} {year}</Text>
            <Pressable onPress={nextMonth} style={pickerStyles.navBtn} hitSlop={12}>
              <MaterialIcons name="chevron-right" size={24} color={Colors.textPrimary} />
            </Pressable>
          </View>
          <View style={pickerStyles.dowRow}>
            {['Su','Mo','Tu','We','Th','Fr','Sa'].map((d) => (
              <Text key={d} style={pickerStyles.dowText}>{d}</Text>
            ))}
          </View>
          {/* Calendar grid — one row per week to avoid floating-point % overflow */}
          <View style={pickerStyles.calGrid}>
            {Array.from({ length: Math.ceil(calCells.length / 7) }, (_, weekIdx) => (
              <View key={weekIdx} style={pickerStyles.weekRow}>
                {calCells.slice(weekIdx * 7, weekIdx * 7 + 7).map((cell, dayIdx) => (
                  <Pressable key={dayIdx} onPress={() => cell && setDay(cell)} disabled={!cell}
                    style={({ pressed }) => [pickerStyles.calCell, cell === day && pickerStyles.calCellSelected, !cell && { opacity: 0 }, pressed && cell ? { opacity: 0.75 } : undefined]}>
                    <Text style={[pickerStyles.calCellText, cell === day && pickerStyles.calCellTextSelected]}>{cell ?? ''}</Text>
                  </Pressable>
                ))}
              </View>
            ))}
          </View>
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
  visible, label, value, onConfirm, onClose,
}: { visible: boolean; label: string; value: string; onConfirm: (time: string) => void; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const parseTime = (v: string) => {
    const match = v.match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (match) return { h: match[1].padStart(2,'0'), m: match[2].padStart(2,'0') as any, p: match[3].toUpperCase() as 'AM'|'PM' };
    return { h: '08', m: '00', p: 'PM' as const };
  };
  const init = parseTime(value);
  const [hour, setHour]     = useState(init.h);
  const [minute, setMinute] = useState<string>(init.m);
  const [period, setPeriod] = useState<'AM'|'PM'>(init.p);

  const handleConfirm = () => { onConfirm(`${parseInt(hour, 10)}:${minute} ${period}`); onClose(); };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={pickerStyles.overlay} onPress={onClose}>
        <Pressable style={[pickerStyles.sheet, { paddingBottom: Math.max(Spacing.xxl, insets.bottom + Spacing.base) }]} onPress={(e) => e.stopPropagation()}>
          <View style={pickerStyles.handle} />
          <Text style={pickerStyles.title}>{label}</Text>
          <View style={pickerStyles.timePreview}>
            <MaterialIcons name="access-time" size={20} color={Colors.gold} />
            <Text style={pickerStyles.timePreviewText}>{parseInt(hour, 10)}:{minute} {period}</Text>
          </View>
          <View style={pickerStyles.timePickerRow}>
            <View style={pickerStyles.timeCol}>
              <Text style={pickerStyles.timeColLabel}>Hour</Text>
              <ScrollView style={pickerStyles.timeScroll} showsVerticalScrollIndicator={false}>
                {HOURS.map((h) => (
                  <Pressable key={h} onPress={() => setHour(h)} style={[pickerStyles.timeItem, hour === h && pickerStyles.timeItemSelected]}>
                    <Text style={[pickerStyles.timeItemText, hour === h && pickerStyles.timeItemTextSelected]}>{parseInt(h, 10)}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
            <Text style={pickerStyles.timeColon}>:</Text>
            <View style={pickerStyles.timeCol}>
              <Text style={pickerStyles.timeColLabel}>Min</Text>
              <ScrollView style={pickerStyles.timeScroll} showsVerticalScrollIndicator={false}>
                {MINS.map((mn) => (
                  <Pressable key={mn} onPress={() => setMinute(mn)} style={[pickerStyles.timeItem, minute === mn && pickerStyles.timeItemSelected]}>
                    <Text style={[pickerStyles.timeItemText, minute === mn && pickerStyles.timeItemTextSelected]}>{mn}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
            <View style={pickerStyles.timeCol}>
              <Text style={pickerStyles.timeColLabel}>Period</Text>
              <View style={pickerStyles.periodCol}>
                {PERIODS.map((p) => (
                  <Pressable key={p} onPress={() => setPeriod(p)} style={[pickerStyles.periodBtn, period === p && pickerStyles.periodBtnActive]}>
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

const COVER_IMAGES = [
  'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400&q=80',
  'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=400&q=80',
  'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=400&q=80',
  'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=400&q=80',
  'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=400&q=80',
  'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=400&q=80',
  'https://images.unsplash.com/photo-1540575467537-4952d2c7fa62?w=400&q=80',
  'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&q=80',
];

// ─── Outer shell — handles loading / auth guards ──────────────────────────────
// Separating loading/guard logic from the form component ensures that the
// inner form's useState initializers always execute with a fully-loaded event,
// eliminating the cold-load blank-field overwrite risk identified in the audit.
export default function EditEventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { getEventById, isLoading } = useEvents();

  const event = getEventById(id ?? '');

  // Cold-load scenario: EventsContext is still fetching from Supabase and the
  // requested event has not yet arrived. Show a loading indicator — do NOT
  // render the form (which would initialize all useState calls with '' / undefined).
  if (isLoading && !event) {
    return (
      <View style={styles.notFound}>
        <SafeAreaView edges={['top']} />
        <ActivityIndicator size="large" color={Colors.gold} />
        <Text style={[styles.notFoundText, { marginTop: Spacing.md }]}>Loading event…</Text>
      </View>
    );
  }

  // Loading finished but event still not found → genuinely missing or deleted.
  if (!event) {
    return (
      <View style={styles.notFound}>
        <SafeAreaView edges={['top']} />
        <MaterialIcons name="event-busy" size={48} color={Colors.textMuted} />
        <Text style={styles.notFoundText}>Event not found.</Text>
        <Pressable onPress={() => router.back()} style={styles.backLink}>
          <Text style={styles.backLinkText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  // Guard: only the promoter who posted the event (or an admin) can edit it.
  const isAdmin = user?.roles.includes('admin') ?? false;
  if (event.promoterId !== user?.id && !isAdmin) {
    return (
      <View style={styles.notFound}>
        <SafeAreaView edges={['top']} />
        <MaterialIcons name="lock" size={48} color={Colors.textMuted} />
        <Text style={styles.notFoundText}>You can only edit your own events.</Text>
        <Pressable onPress={() => router.back()} style={styles.backLink}>
          <Text style={styles.backLinkText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  // Event is confirmed loaded and user is the owner — render the editable form.
  // The form component receives a guaranteed non-null Event so its useState
  // initializers always run with real data.
  return <EditEventForm event={event} />;
}

// ─── Inner form — rendered only once the event is confirmed present ───────────
// All useState initializers here run with a real, fully-loaded Event object.
// There is no risk of blank initialization from a cold-load race condition.
function EditEventForm({ event }: { event: Event }) {
  const router = useRouter();
  const { user } = useAuth();
  const { editEvent, deleteEvent, userGoingIds, userInterestedIds } = useEvents();
  const { addNotification } = useNotifications();

  // ── Form state — all initializers are guaranteed non-empty ────────────────
  const [title, setTitle] = useState(event.title);
  const [description, setDescription] = useState(event.description);
  const [date, setDate] = useState(event.date);
  const [startTime, setStartTime] = useState(event.startTime);
  const [endTime, setEndTime] = useState(event.endTime);
  const [parish, setParish] = useState(event.parish);
  const [venue, setVenue] = useState(event.venue);
  const [address, setAddress] = useState(event.address);
  const [selectedTypes, setSelectedTypes] = useState<string[]>(event.eventTypes ?? []);
  const [recurring, setRecurring] = useState(event.recurring ?? false);
  const [recurringFrequency, setRecurringFrequency] = useState(event.recurringFrequency ?? 'Weekly');
  const [coverImage, setCoverImage] = useState(event.coverImage || COVER_IMAGES[0]);
  const [allImages, setAllImages] = useState<string[]>(() => {
    const existing = event.flyerImages?.length ? event.flyerImages : [event.coverImage || COVER_IMAGES[0]];
    return existing.length > 0 ? existing : [COVER_IMAGES[0]];
  });
  const isFreeInit = event.ticketPrice === 'Free' || event.ticketPrice === 'Free Entry';
  const [ticketPrice, setTicketPrice] = useState(isFreeInit ? '' : event.ticketPrice ?? '');
  const [isFree, setIsFree] = useState(isFreeInit);
  // Ticket method state — derived from existing event fields on load
  const [useVybzHub, setUseVybzHub] = useState(event.sellingTicketsInApp ?? false);
  const [useExternalTicket, setUseExternalTicket] = useState(!!event.ticketLink && !isFreeInit);
  const [usePhysicalLocations, setUsePhysicalLocations] = useState((event.physicalTicketLocations?.length ?? 0) > 0);
  const [ticketProviderName, setTicketProviderName] = useState(event.ticketProviderName ?? '');
  const [physicalLocations, setPhysicalLocations] = useState<PhysicalTicketLocation[]>(event.physicalTicketLocations ?? []);
  const [physParishPickerIdx, setPhysParishPickerIdx] = useState<number | null>(null);
  const [ageLimit, setAgeLimit] = useState(event.ageLimit ?? 'All Ages');
  const [dressCode, setDressCode] = useState(event.dressCode ?? '');
  // Parse existing lineup into structured entries.
  // lineupEntries field takes precedence over legacy lineup string array.
  const [lineupEntries, setLineupEntries] = useState<LineupEntry[]>(() => {
    if ((event as any).lineupEntries?.length) return (event as any).lineupEntries as LineupEntry[];
    const raw = event.lineup ?? [];
    if (!raw.length) return [];
    return raw.map((s) => {
      const match = s.match(/^([^:]+):\s*(.+)$/);
      return match ? { role: match[1].trim(), name: match[2].trim() } : { role: 'Artist', name: s };
    });
  });
  const [lineupRole, setLineupRole] = useState('DJ');
  const [lineupInput, setLineupInput] = useState('');
  const [eventPhotosLink, setEventPhotosLink] = useState(event.eventPhotosLink ?? '');
  const [ticketLink, setTicketLink] = useState(event.ticketLink ?? '');
  const [contactInfo, setContactInfo] = useState(event.contactInfo ?? '');
  const [showParishPicker, setShowParishPicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const toggleType = (typeId: string) =>
    setSelectedTypes((prev) =>
      prev.includes(typeId) ? prev.filter((t) => t !== typeId) : [...prev, typeId]
    );

  const addArtist = () => {
    const trimmed = lineupInput.trim();
    if (trimmed && !lineupEntries.some((e) => e.name === trimmed)) {
      setLineupEntries((prev) => [...prev, { name: trimmed, role: lineupRole }]);
      setLineupInput('');
    }
  };

  const handleSave = async () => {
    if (!title.trim() || !date.trim() || !parish || !venue.trim() || selectedTypes.length === 0) {
      Alert.alert('Missing Fields', 'Please fill in: Title, Date, Parish, Venue, and at least one Event Type.');
      return;
    }
    setSaving(true);
    setUploadError(null);
    try {
      const primaryType = selectedTypes[0];
      const primaryTypeInfo = EVENT_TYPES.find((t) => t.id === primaryType);

      // ── event_change producer ─────────────────────────────────────────────
      const dateChanged = event.date !== date.trim();
      const timeChanged = event.startTime !== (startTime.trim() || 'TBA');
      const venueChanged = event.venue !== venue.trim();
      if (dateChanged || timeChanged || venueChanged) {
        const isRSVPd = userGoingIds.includes(event.id) || userInterestedIds.includes(event.id);
        if (isRSVPd) {
          addNotification({
            type: 'event_change',
            title: 'Event Updated',
            body: `"${event.title}" has been updated.${
              dateChanged ? ` New date: ${date}` : ''
            }${venueChanged ? ` Venue: ${venue}` : ''}`,
            eventId: event.id,
          });
        } else {
          addNotification({
            type: 'event_change',
            title: 'Event Details Updated',
            body: `Changes to "${event.title}" saved. Attendees with RSVPs have been notified.`,
            eventId: event.id,
          });
        }
        notifyRsvpUsersEventChange(event.id, {
          eventTitle: event.title,
          eventId: event.id,
          parish: parish,
          date: date,
          startTime: startTime.trim() || 'TBA',
          venue: venue.trim(),
          changeDetails: [
            dateChanged ? `New date: ${date}` : '',
            timeChanged ? `New start time: ${startTime.trim() || 'TBA'}` : '',
            venueChanged ? `New venue: ${venue.trim()}` : '',
          ].filter(Boolean).join(' · '),
          promoterName: user?.name ?? 'Organiser',
        });
      }

      // Upload device-picked images (throws on failure; editEvent is NOT called
      // if upload fails, preventing a broken file:// URI being written to DB).
      const imagesToUpload = allImages.length > 0 ? allImages : [coverImage];
      let uploadedImages: string[] = [];
      try {
        uploadedImages = await uploadEventImages(imagesToUpload, `events/${event.id}`);
      } catch (uploadErr) {
        setUploadError(
          uploadErr instanceof Error
            ? uploadErr.message
            : 'Image upload failed. Please try again.'
        );
        return;
      }
      const coverIdx = imagesToUpload.indexOf(coverImage);
      const finalCoverImage = coverIdx >= 0 ? uploadedImages[coverIdx] : (uploadedImages[0] ?? coverImage);

      await editEvent(event.id, {
        title: normalizeEventTitle(title.trim()) || title.trim(),
        description: description.trim() || event.description,
        type: primaryType,
        typeLabel: primaryTypeInfo?.label ?? primaryType,
        eventTypes: selectedTypes,
        parish,
        date,
        startTime: startTime.trim() || 'TBA',
        endTime: endTime.trim(),
        venue: venue.trim(),
        address: address.trim(),
        coverImage: finalCoverImage,
        flyerImages: uploadedImages,
        ticketPrice: isFree ? 'Free' : ticketPrice.trim() || 'Free',
        ticketLink: (!isFree && useExternalTicket) ? ticketLink.trim() : '',
        ticketProviderName: (!isFree && useExternalTicket && ticketProviderName.trim()) ? ticketProviderName.trim() : undefined,
        physicalTicketLocations: (!isFree && usePhysicalLocations) ? physicalLocations.filter((l) => l.business_name.trim() && l.town.trim() && l.parish) : [],
        sellingTicketsInApp: !isFree && useVybzHub,
        contactInfo: contactInfo.trim() || undefined,
        eventPhotosLink: eventPhotosLink.trim() || undefined,
        dressCode: dressCode.trim() || undefined,
        ageLimit,
        lineup: lineupEntries.map((e) => `${e.role}: ${e.name}`),
        lineupEntries,
        recurring,
        recurringFrequency: recurring ? recurringFrequency : undefined,
        tags: [...selectedTypes, parish.toLowerCase().replace(/ /g, '-')],
      });
      setSaved(true);
      router.replace('/my-events?updated=1' as any);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    const eventTitle = event.title;
    const eventId = event.id;
    const isRSVPd = userGoingIds.includes(eventId) || userInterestedIds.includes(eventId);
    Alert.alert(
      'Delete Event',
      `Are you sure you want to delete "${eventTitle}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            if (isRSVPd) {
              addNotification({
                type: 'event_cancelled',
                title: 'Event Cancelled',
                body: `"${eventTitle}" has been cancelled by the organizer. Your RSVP has been removed.`,
              });
            } else {
              addNotification({
                type: 'event_cancelled',
                title: 'Event Removed',
                body: `"${eventTitle}" has been removed from your listings.`,
              });
            }
            notifyRsvpUsersEventCancelled(eventId, {
              eventTitle,
              eventId,
              parish: event.parish,
              date: event.date,
              startTime: event.startTime,
              venue: event.venue,
              promoterName: user?.name ?? 'Organiser',
              changeDetails: 'This event has been cancelled by the organiser.',
            });
            void deleteEvent(eventId);
            router.replace('/my-events' as any);
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.headerBack, pressed && { opacity: 0.7 }]}>
            <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Edit Event</Text>
            <Text style={styles.headerSub} numberOfLines={1}>{event.title}</Text>
          </View>
          <Pressable onPress={handleDelete} style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.7 }]}>
            <MaterialIcons name="delete-outline" size={20} color={Colors.error} />
          </Pressable>
        </View>
      </SafeAreaView>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">

          {/* ── Section: Basic Info ── */}
          <SectionHeader icon="edit" title="Basic Info" />

          <Field label="Event Name *">
            <TextInput style={styles.input} placeholder="Event name" placeholderTextColor={Colors.textMuted} value={title} onChangeText={setTitle} accessibilityLabel="Event name" />
          </Field>
          <Field label="Description">
            <TextInput style={[styles.input, styles.textarea]} placeholder="Tell people what to expect..." placeholderTextColor={Colors.textMuted} value={description} onChangeText={setDescription} multiline numberOfLines={3} textAlignVertical="top" accessibilityLabel="Description" />
          </Field>
          <Field label="Date *">
            <Pressable
              onPress={() => setShowDatePicker(true)}
              style={({ pressed }) => [styles.pickerBtn, pressed && { opacity: 0.8 }]}
              accessibilityLabel="Select event date"
            >
              <MaterialIcons name="event" size={16} color={Colors.textMuted} />
              <Text style={[styles.pickerText, date && { color: Colors.textPrimary }]}>
                {date ? formatDisplayDate(date) : 'Tap to select date...'}
              </Text>
              <MaterialIcons name="keyboard-arrow-down" size={20} color={Colors.textMuted} />
            </Pressable>
          </Field>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Field label="Start Time">
                <Pressable
                  onPress={() => setShowStartPicker(true)}
                  style={({ pressed }) => [styles.pickerBtn, pressed && { opacity: 0.8 }]}
                  accessibilityLabel="Select start time"
                >
                  <MaterialIcons name="access-time" size={16} color={Colors.textMuted} />
                  <Text style={[styles.pickerText, startTime && { color: Colors.textPrimary }]}>
                    {startTime || 'Start time'}
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
                  <Text style={[styles.pickerText, endTime && { color: Colors.textPrimary }]}>
                    {endTime || 'End time'}
                  </Text>
                </Pressable>
              </Field>
            </View>
          </View>

          {/* ── Section: Location ── */}
          <SectionHeader icon="place" title="Location" />

          <Field label="Parish *">
            <Pressable onPress={() => { Keyboard.dismiss(); setShowParishPicker(!showParishPicker); }} style={styles.pickerBtn}>
              <MaterialIcons name="place" size={16} color={Colors.textMuted} />
              <Text style={[styles.pickerText, parish && { color: Colors.textPrimary }]}>{parish || 'Select parish...'}</Text>
              <MaterialIcons name={showParishPicker ? 'keyboard-arrow-up' : 'keyboard-arrow-down'} size={20} color={Colors.textMuted} />
            </Pressable>
            {showParishPicker && (
              <ScrollView style={styles.dropdown} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                {PARISHES.map((p) => (
                  <Pressable key={p} onPress={() => { setParish(p); setShowParishPicker(false); }} style={({ pressed }) => [styles.dropdownOption, parish === p && styles.dropdownOptionActive, pressed && { backgroundColor: Colors.surfaceElevated }]}>
                    <Text style={[styles.dropdownText, parish === p && { color: Colors.gold }]}>{p}</Text>
                    {parish === p && <MaterialIcons name="check" size={16} color={Colors.gold} />}
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </Field>
          <Field label="Venue *">
            <TextInput style={styles.input} placeholder="Venue name" placeholderTextColor={Colors.textMuted} value={venue} onChangeText={setVenue} accessibilityLabel="Venue" />
          </Field>
          <Field label="Street Address" hint="Optional">
            <TextInput style={styles.input} placeholder="Street address" placeholderTextColor={Colors.textMuted} value={address} onChangeText={setAddress} accessibilityLabel="Address" />
          </Field>

          {/* ── Section: Category ── */}
          <SectionHeader icon="category" title="Event Type(s)" />

          <View style={styles.typeGrid}>
            {EVENT_TYPES.map((type) => {
              const isActive = selectedTypes.includes(type.id);
              return (
                <Pressable
                  key={type.id}
                  onPress={() => toggleType(type.id)}
                  style={({ pressed }) => [
                    styles.typeCard,
                    isActive && { borderColor: type.color, backgroundColor: `${type.color}15` },
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  <MaterialIcons name={type.icon as any} size={18} color={isActive ? type.color : Colors.textMuted} />
                  <Text style={[styles.typeCardText, isActive && { color: type.color }]} numberOfLines={2}>{type.label}</Text>
                  {isActive && (
                    <View style={[styles.typeCheck, { backgroundColor: type.color }]}>
                      <MaterialIcons name="check" size={9} color="#fff" />
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>

          {/* Recurring */}
          <View style={styles.recurringCard}>
            <View style={styles.recurringRow}>
              <MaterialIcons name="repeat" size={18} color={recurring ? Colors.gold : Colors.textMuted} />
              <View style={{ flex: 1 }}>
                <Text style={styles.recurringTitle}>Recurring Event</Text>
                <Text style={styles.recurringSub}>Repeats on a schedule</Text>
              </View>
              <Switch value={recurring} onValueChange={setRecurring} trackColor={{ false: Colors.surfaceBorder, true: Colors.gold }} thumbColor={recurring ? Colors.textOnGold : Colors.textMuted} />
            </View>
            {recurring && (
              <View style={styles.freqRow}>
                {RECURRING_OPTIONS.map((opt) => (
                  <Pressable key={opt} onPress={() => setRecurringFrequency(opt)} style={[styles.freqBtn, recurringFrequency === opt && styles.freqBtnActive]}>
                    <Text style={[styles.freqText, recurringFrequency === opt && styles.freqTextActive]}>{opt}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>

          {/* ── Section: Cover Image ── */}
          <SectionHeader icon="image" title="Cover Images" />
          <Text style={styles.sublabel}>Upload from your device or pick from the gallery below. First image = cover.</Text>

          {/* Upload from device button */}
          <Pressable
            onPress={async () => {
              if (allImages.length >= 5) {
                Alert.alert('Limit Reached', 'You can select up to 5 images.');
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
                selectionLimit: 5 - allImages.length,
                quality: 0.85,
                allowsEditing: false,
              });
              if (!result.canceled && result.assets.length > 0) {
                const newUris = result.assets.map((a) => a.uri).filter((u) => !allImages.includes(u));
                const updated = [...allImages, ...newUris].slice(0, 5);
                setAllImages(updated);
                setCoverImage(updated[0]);
              }
            }}
            disabled={allImages.length >= 5}
            style={({ pressed }) => [styles.uploadBtn, allImages.length >= 5 && { opacity: 0.4 }, pressed && { opacity: 0.8 }]}
          >
            <MaterialIcons name="photo-library" size={20} color={Colors.gold} />
            <View style={{ flex: 1 }}>
              <Text style={styles.uploadBtnTitle}>Upload from Device</Text>
              <Text style={styles.uploadBtnSub}>
                {allImages.length >= 5 ? 'Maximum 5 images reached' : `Tap to add up to ${5 - allImages.length} photo${5 - allImages.length !== 1 ? 's' : ''}`}
              </Text>
            </View>
            <MaterialIcons name="arrow-forward-ios" size={13} color={Colors.gold} />
          </Pressable>

          {/* Selected images row */}
          {allImages.length > 0 && (
            <View style={{ gap: Spacing.xs }}>
              <Text style={styles.sublabel}>Selected ({allImages.length}/5) — tap to set as cover, ✕ to remove</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.coverRow}>
                {allImages.map((uri, idx) => (
                  <View key={`${uri}-${idx}`} style={{ position: 'relative' }}>
                    <Pressable
                      onPress={() => setCoverImage(uri)}
                      style={[styles.coverThumb, coverImage === uri && styles.coverThumbActive]}
                    >
                      <Image source={{ uri }} style={styles.coverThumbImg} contentFit="cover" transition={200} />
                      {coverImage === uri && (
                        <View style={styles.coverCheck}>
                          <MaterialIcons name="check" size={12} color={Colors.textOnGold} />
                        </View>
                      )}
                      {idx === 0 && <View style={styles.coverPrimaryBadge}><Text style={styles.coverPrimaryBadgeText}>Cover</Text></View>}
                    </Pressable>
                    {allImages.length > 1 && (
                      <Pressable
                        onPress={() => {
                          const updated = allImages.filter((_, i) => i !== idx);
                          setAllImages(updated);
                          if (coverImage === uri) setCoverImage(updated[0]);
                        }}
                        style={styles.removeThumb}
                        hitSlop={4}
                      >
                        <MaterialIcons name="close" size={11} color="#fff" />
                      </Pressable>
                    )}
                  </View>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Divider */}
          <View style={styles.orDivider}>
            <View style={styles.orLine} />
            <Text style={styles.orText}>or pick from gallery</Text>
            <View style={styles.orLine} />
          </View>

          {/* Gallery picker */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.coverRow}>
            {COVER_IMAGES.map((uri, idx) => (
              <Pressable
                key={idx}
                onPress={() => {
                  if (!allImages.includes(uri) && allImages.length < 5) {
                    const updated = [...allImages, uri];
                    setAllImages(updated);
                  }
                  setCoverImage(uri);
                }}
                style={[styles.coverThumb, coverImage === uri && styles.coverThumbActive]}
              >
                <Image source={{ uri }} style={styles.coverThumbImg} contentFit="cover" transition={200} />
                {coverImage === uri && (
                  <View style={styles.coverCheck}>
                    <MaterialIcons name="check" size={12} color={Colors.textOnGold} />
                  </View>
                )}
              </Pressable>
            ))}
          </ScrollView>

          {/* ── Section: Pricing & Details ── */}
          <SectionHeader icon="local-activity" title="Pricing & Details" />

          {/* Entry Type */}
          <View style={styles.field}>
            <View style={styles.labelRow}><Text style={styles.label}>Entry Type</Text></View>
            <View style={styles.row}>
              <Pressable onPress={() => { setIsFree(true); setUseVybzHub(false); setUseExternalTicket(false); setUsePhysicalLocations(false); setPhysicalLocations([]); }} style={[editPricingStyles.entryBtn, isFree && editPricingStyles.entryBtnFree]}>
                <MaterialIcons name="free-breakfast" size={20} color={isFree ? Colors.greenLight : Colors.textMuted} />
                <Text style={[editPricingStyles.entryBtnLabel, isFree && { color: Colors.greenLight }]}>Free Entry</Text>
                {isFree && <View style={editPricingStyles.checkWrap}><MaterialIcons name="check-circle" size={14} color={Colors.greenLight} /></View>}
              </Pressable>
              <Pressable onPress={() => setIsFree(false)} style={[editPricingStyles.entryBtn, !isFree && editPricingStyles.entryBtnPaid]}>
                <MaterialIcons name="local-activity" size={20} color={!isFree ? Colors.gold : Colors.textMuted} />
                <Text style={[editPricingStyles.entryBtnLabel, !isFree && { color: Colors.gold }]}>Paid Event</Text>
                {!isFree && <View style={editPricingStyles.checkWrap}><MaterialIcons name="check-circle" size={14} color={Colors.gold} /></View>}
              </Pressable>
            </View>
          </View>

          {!isFree && (
            <>
              <Field label="Display Price">
                <View style={styles.iconInputRow}>
                  <MaterialIcons name="attach-money" size={16} color={Colors.textMuted} />
                  <TextInput style={styles.iconInputText} placeholder="e.g. JMD 3,500" placeholderTextColor={Colors.textMuted} value={ticketPrice} onChangeText={setTicketPrice} accessibilityLabel="Ticket price" />
                </View>
              </Field>

              {/* Ticket Methods */}
              <View style={styles.field}>
                <View style={styles.labelRow}><Text style={styles.label}>Ticket Methods</Text><Text style={styles.hint}>Select all that apply</Text></View>
                <View style={{ gap: Spacing.sm }}>
                  <Pressable onPress={() => setUseVybzHub(!useVybzHub)} style={[editPricingStyles.methodCard, useVybzHub && editPricingStyles.methodCardActive]}>
                    <MaterialIcons name="confirmation-number" size={18} color={useVybzHub ? Colors.gold : Colors.textMuted} />
                    <View style={{ flex: 1 }}><Text style={[editPricingStyles.methodLabel, useVybzHub && { color: Colors.gold }]}>Sell on Vybz Hub</Text><Text style={editPricingStyles.methodSub}>In-app ticketing</Text></View>
                    {useVybzHub && <MaterialIcons name="check-circle" size={18} color={Colors.gold} />}
                  </Pressable>
                  <Pressable onPress={() => { const n = !useExternalTicket; setUseExternalTicket(n); if (!n) { setTicketLink(''); setTicketProviderName(''); } }} style={[editPricingStyles.methodCard, useExternalTicket && editPricingStyles.methodCardActive]}>
                    <MaterialIcons name="open-in-new" size={18} color={useExternalTicket ? Colors.gold : Colors.textMuted} />
                    <View style={{ flex: 1 }}><Text style={[editPricingStyles.methodLabel, useExternalTicket && { color: Colors.gold }]}>External Ticket Website</Text><Text style={editPricingStyles.methodSub}>Eventbrite, Ticketmaster, etc.</Text></View>
                    {useExternalTicket && <MaterialIcons name="check-circle" size={18} color={Colors.gold} />}
                  </Pressable>
                  <Pressable onPress={() => { const n = !usePhysicalLocations; setUsePhysicalLocations(n); if (!n) { setPhysicalLocations([]); setPhysParishPickerIdx(null); } }} style={[editPricingStyles.methodCard, usePhysicalLocations && editPricingStyles.methodCardActive]}>
                    <MaterialIcons name="store" size={18} color={usePhysicalLocations ? Colors.gold : Colors.textMuted} />
                    <View style={{ flex: 1 }}><Text style={[editPricingStyles.methodLabel, usePhysicalLocations && { color: Colors.gold }]}>Physical Ticket Locations</Text><Text style={editPricingStyles.methodSub}>Bars, shops, venues</Text></View>
                    {usePhysicalLocations && <MaterialIcons name="check-circle" size={18} color={Colors.gold} />}
                  </Pressable>
                </View>
              </View>

              {useExternalTicket && (
                <>
                  <Field label="Ticket Provider Name" hint="Optional">
                    <TextInput style={styles.input} placeholder="e.g. Eventbrite" placeholderTextColor={Colors.textMuted} value={ticketProviderName} onChangeText={(v) => setTicketProviderName(v.slice(0, 120))} maxLength={120} />
                  </Field>
                  <Field label="Ticket URL">
                    <View style={styles.iconInputRow}>
                      <MaterialIcons name="link" size={16} color={Colors.textMuted} />
                      <TextInput style={styles.iconInputText} placeholder="https://..." placeholderTextColor={Colors.textMuted} value={ticketLink} onChangeText={setTicketLink} keyboardType="url" autoCapitalize="none" />
                    </View>
                  </Field>
                </>
              )}

              {usePhysicalLocations && (
                <View style={styles.field}>
                  <View style={styles.labelRow}><Text style={styles.label}>Ticket Locations</Text><Text style={styles.hint}>{physicalLocations.length}/5</Text></View>
                  {physicalLocations.map((loc, idx) => (
                    <View key={idx} style={editPricingStyles.locCard}>
                      <View style={editPricingStyles.locHeader}>
                        <Text style={editPricingStyles.locTitle}>Location {idx + 1}</Text>
                        <Pressable onPress={() => { setPhysicalLocations((prev) => prev.filter((_, i) => i !== idx)); if (physParishPickerIdx === idx) setPhysParishPickerIdx(null); }} hitSlop={8}>
                          <MaterialIcons name="close" size={18} color={Colors.textMuted} />
                        </Pressable>
                      </View>
                      <TextInput style={[styles.input, { marginBottom: Spacing.xs }]} placeholder="Business / Location Name *" placeholderTextColor={Colors.textMuted} value={loc.business_name} onChangeText={(v) => { const upd = [...physicalLocations]; upd[idx] = { ...upd[idx], business_name: v }; setPhysicalLocations(upd); }} />
                      <TextInput style={[styles.input, { marginBottom: Spacing.xs }]} placeholder="Town / Area *" placeholderTextColor={Colors.textMuted} value={loc.town} onChangeText={(v) => { const upd = [...physicalLocations]; upd[idx] = { ...upd[idx], town: v }; setPhysicalLocations(upd); }} />
                      <Pressable onPress={() => setPhysParishPickerIdx(physParishPickerIdx === idx ? null : idx)} style={[styles.pickerBtn, { marginBottom: Spacing.xs }]}>
                        <MaterialIcons name="place" size={14} color={Colors.textMuted} />
                        <Text style={[styles.pickerText, loc.parish ? { color: Colors.textPrimary } : undefined]}>{loc.parish || 'Select Parish *'}</Text>
                        <MaterialIcons name={physParishPickerIdx === idx ? 'keyboard-arrow-up' : 'keyboard-arrow-down'} size={18} color={Colors.textMuted} />
                      </Pressable>
                      {physParishPickerIdx === idx && (
                        <ScrollView style={[styles.dropdown, { maxHeight: 180 }]} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                          {PARISHES.map((p) => (
                            <Pressable key={p} onPress={() => { const upd = [...physicalLocations]; upd[idx] = { ...upd[idx], parish: p }; setPhysicalLocations(upd); setPhysParishPickerIdx(null); }} style={({ pressed }) => [styles.dropdownOption, loc.parish === p && styles.dropdownOptionActive, pressed && { backgroundColor: Colors.surfaceElevated }]}>
                              <Text style={[styles.dropdownText, loc.parish === p && { color: Colors.gold }]}>{p}</Text>
                              {loc.parish === p && <MaterialIcons name="check" size={14} color={Colors.gold} />}
                            </Pressable>
                          ))}
                        </ScrollView>
                      )}
                    </View>
                  ))}
                  {physicalLocations.length < 5 ? (
                    <Pressable onPress={() => setPhysicalLocations((prev) => [...prev, { business_name: '', town: '', parish: '' }])} style={editPricingStyles.addLocBtn}>
                      <MaterialIcons name="add" size={16} color={Colors.gold} />
                      <Text style={editPricingStyles.addLocBtnText}>Add Ticket Location</Text>
                    </Pressable>
                  ) : (
                    <Text style={{ fontSize: Typography.xs, color: Colors.textMuted, textAlign: 'center' }}>Maximum 5 ticket locations</Text>
                  )}
                </View>
              )}
            </>
          )}

          <Field label="Age Restriction">
            <View style={styles.ageRow}>
              {AGE_OPTIONS.map((opt) => (
                <Pressable key={opt} onPress={() => setAgeLimit(opt)} style={[styles.ageOpt, ageLimit === opt && styles.ageOptActive]}>
                  <Text style={[styles.ageOptText, ageLimit === opt && styles.ageOptTextActive]}>{opt}</Text>
                </Pressable>
              ))}
            </View>
          </Field>

          <Field label="Dress Code" hint="Optional">
            <TextInput style={styles.input} placeholder="e.g. All White, Smart Casual" placeholderTextColor={Colors.textMuted} value={dressCode} onChangeText={setDressCode} accessibilityLabel="Dress code" />
          </Field>

          <Field label="Lineup" hint="Add DJs, artists, MCs, hosts & more">
            {/* Role selector chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.xs, paddingBottom: Spacing.xs, flexDirection: 'row' }}>
              {PERFORMER_ROLES.map((role) => (
                <Pressable
                  key={role}
                  onPress={() => setLineupRole(role)}
                  style={[
                    editLineupStyles.roleChip,
                    lineupRole === role && editLineupStyles.roleChipActive,
                  ]}
                >
                  <Text style={[editLineupStyles.roleChipText, lineupRole === role && editLineupStyles.roleChipTextActive]}>
                    {role}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <View style={styles.lineupRow}>
              <View style={editLineupStyles.rolePrefixBadge}>
                <Text style={editLineupStyles.rolePrefixText}>{lineupRole}</Text>
              </View>
              <TextInput
                style={[styles.input, { flex: 1, borderWidth: 0 }]}
                placeholder="Name..."
                placeholderTextColor={Colors.textMuted}
                value={lineupInput}
                onChangeText={setLineupInput}
                onSubmitEditing={addArtist}
                accessibilityLabel="Performer name"
              />
              <Pressable onPress={addArtist} style={styles.addBtn}>
                <MaterialIcons name="add" size={20} color={Colors.textOnGold} />
              </Pressable>
            </View>
            {lineupEntries.length > 0 && (
              <View style={styles.artistTags}>
                {lineupEntries.map((entry, idx) => (
                  <View key={`${entry.role}-${entry.name}-${idx}`} style={styles.artistTag}>
                    <View style={editLineupStyles.roleBadge}>
                      <Text style={editLineupStyles.roleBadgeText}>{entry.role}</Text>
                    </View>
                    <Text style={styles.artistTagText}>{entry.name}</Text>
                    <Pressable
                      onPress={() => setLineupEntries((prev) => prev.filter((_, i) => i !== idx))}
                      hitSlop={8}
                    >
                      <MaterialIcons name="close" size={13} color={Colors.textMuted} />
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
          </Field>

          <Field label="Event Photos Link" hint="Add after your event">
            <View style={styles.iconInputRow}>
              <MaterialIcons name="photo-library" size={16} color={Colors.textMuted} />
              <TextInput
                style={styles.iconInputText}
                placeholder="https://photos.google.com/... (add post-event)"
                placeholderTextColor={Colors.textMuted}
                value={eventPhotosLink}
                onChangeText={setEventPhotosLink}
                keyboardType="url"
                autoCapitalize="none"
                accessibilityLabel="Event photos link"
              />
            </View>
          </Field>

          {/* ── Section: Contact ── */}
          <SectionHeader icon="link" title="Contact & Tickets" />

          <Field label="Ticket / Contact Link" hint="Optional">
            <View style={styles.iconInputRow}>
              <MaterialIcons name="open-in-browser" size={16} color={Colors.textMuted} />
              <TextInput style={styles.iconInputText} placeholder="https://... or phone number" placeholderTextColor={Colors.textMuted} value={ticketLink} onChangeText={setTicketLink} keyboardType="url" autoCapitalize="none" accessibilityLabel="Ticket link" />
            </View>
          </Field>

          <Field label="Contact Phone" hint="Optional — primary contact for attendees">
            <PhoneInput
              value={contactInfo.startsWith('+') ? contactInfo : ''}
              onChange={(e164) => setContactInfo(e164)}
              placeholder="876 000 0000"
            />
            {/* Also allow non-phone contact (WhatsApp, Instagram handle) */}
            {contactInfo && !contactInfo.startsWith('+') && (
              <TextInput
                style={[styles.input, { marginTop: 6 }]}
                placeholder="Or WhatsApp / @handle"
                placeholderTextColor={Colors.textMuted}
                value={contactInfo}
                onChangeText={setContactInfo}
                accessibilityLabel="Contact info"
              />
            )}
            {!contactInfo && (
              <Pressable
                onPress={() => setContactInfo('@')}
                style={{ marginTop: 4 }}
              >
                <Text style={{ fontSize: Typography.xs, color: Colors.textMuted }}>
                  Use @handle or WhatsApp link instead?{' '}
                  <Text style={{ color: Colors.gold }}>Tap here</Text>
                </Text>
              </Pressable>
            )}
          </Field>

          {/* ── Save & Delete ── */}
          {uploadError ? (
            <View style={styles.uploadErrorBanner}>
              <MaterialIcons name="error-outline" size={16} color={Colors.error} />
              <Text style={styles.uploadErrorText}>{uploadError}</Text>
            </View>
          ) : null}

          <View style={styles.actions}>
            <Pressable onPress={handleSave} disabled={saving} style={({ pressed }) => [styles.saveBtn, pressed && { opacity: 0.85 }]}>
              <LinearGradient colors={[Colors.gold, Colors.goldDim]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.saveBtnInner}>
                <MaterialIcons name={saved ? 'check' : 'save'} size={18} color={Colors.textOnGold} />
                <Text style={styles.saveBtnText}>
                  {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Changes'}
                </Text>
              </LinearGradient>
            </Pressable>

            <Pressable onPress={handleDelete} style={({ pressed }) => [styles.deleteEventBtn, pressed && { opacity: 0.7 }]}>
              <MaterialIcons name="delete-outline" size={18} color={Colors.error} />
              <Text style={styles.deleteBtnText}>Delete This Event</Text>
            </Pressable>
          </View>

          <View style={{ height: Spacing.xxl * 2 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      <DatePickerModal
        visible={showDatePicker}
        value={date}
        onConfirm={(iso) => setDate(iso)}
        onClose={() => setShowDatePicker(false)}
      />
      <TimePickerModal
        visible={showStartPicker}
        label="Select Start Time"
        value={startTime}
        onConfirm={(t) => setStartTime(t)}
        onClose={() => setShowStartPicker(false)}
      />
      <TimePickerModal
        visible={showEndPicker}
        label="Select End Time"
        value={endTime}
        onConfirm={(t) => setEndTime(t)}
        onClose={() => setShowEndPicker(false)}
      />
    </View>
  );
}

function SectionHeader({ icon, title }: { icon: string; title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionIconBg}>
        <MaterialIcons name={icon as any} size={16} color={Colors.gold} />
      </View>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  notFound: { flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center', gap: Spacing.base },
  notFoundText: { fontSize: Typography.md, color: Colors.textMuted },
  backLink: { paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm, backgroundColor: Colors.surface, borderRadius: Radius.md },
  backLinkText: { color: Colors.gold, fontWeight: Typography.semibold },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
  },
  headerBack: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: Typography.lg, fontWeight: Typography.black, color: Colors.textPrimary },
  headerSub: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 1 },
  deleteBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,68,68,0.1)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,68,68,0.2)' },

  form: { paddingHorizontal: Spacing.base, paddingTop: Spacing.base, gap: Spacing.md },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.sm },
  sectionIconBg: { width: 30, height: 30, borderRadius: 15, backgroundColor: Colors.goldSurface, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textPrimary },
  field: { gap: Spacing.xs },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  label: { fontSize: Typography.sm, color: Colors.textSecondary, fontWeight: Typography.semibold },
  hint: { fontSize: Typography.xs, color: Colors.textMuted },
  sublabel: { fontSize: Typography.xs, color: Colors.textMuted, marginBottom: Spacing.xs },

  input: {
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1.5, borderColor: Colors.surfaceBorder,
    paddingHorizontal: Spacing.md, height: 52,
    fontSize: Typography.base, color: Colors.textPrimary,
  },
  textarea: { height: 100, paddingTop: Spacing.md },
  row: { flexDirection: 'row', gap: Spacing.md },
  iconInputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1.5, borderColor: Colors.surfaceBorder,
    paddingHorizontal: Spacing.md, gap: Spacing.xs, height: 52,
  },
  iconInputText: { flex: 1, fontSize: Typography.base, color: Colors.textPrimary },

  pickerBtn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1.5, borderColor: Colors.surfaceBorder,
    paddingHorizontal: Spacing.md, height: 52, gap: Spacing.sm,
  },
  pickerText: { flex: 1, fontSize: Typography.base, color: Colors.textMuted },
  dropdown: { backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.surfaceBorder, maxHeight: 200, marginTop: 4 },
  dropdownOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder },
  dropdownOptionActive: { backgroundColor: Colors.goldSurface },
  dropdownText: { fontSize: Typography.base, color: Colors.textSecondary },

  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  typeCard: {
    width: '47%', backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.md,
    alignItems: 'center', gap: Spacing.xs, borderWidth: 1.5, borderColor: Colors.surfaceBorder,
    position: 'relative', minHeight: 75, justifyContent: 'center',
  },
  typeCardText: { fontSize: Typography.xs, color: Colors.textMuted, textAlign: 'center', lineHeight: 16 },
  typeCheck: { position: 'absolute', top: 5, right: 5, width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },

  recurringCard: { backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.surfaceBorder, overflow: 'hidden' },
  recurringRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md },
  recurringTitle: { fontSize: Typography.base, fontWeight: Typography.semibold, color: Colors.textPrimary },
  recurringSub: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 1 },
  freqRow: { flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingBottom: Spacing.md },
  freqBtn: { flex: 1, paddingVertical: Spacing.sm, alignItems: 'center', backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.surfaceBorder },
  freqBtnActive: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  freqText: { fontSize: Typography.sm, color: Colors.textSecondary, fontWeight: Typography.medium },
  freqTextActive: { color: Colors.textOnGold, fontWeight: Typography.bold },

  coverRow: { gap: Spacing.sm, paddingVertical: Spacing.xs },
  coverThumb: { width: 80, height: 80, borderRadius: Radius.md, overflow: 'hidden', position: 'relative' },
  coverThumbActive: { borderWidth: 2.5, borderColor: Colors.gold },
  coverThumbImg: { width: '100%', height: '100%' },
  coverCheck: { position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: 10, backgroundColor: Colors.gold, alignItems: 'center', justifyContent: 'center' },
  coverPrimaryBadge: { position: 'absolute', bottom: 4, left: 4, backgroundColor: Colors.gold, paddingHorizontal: 5, paddingVertical: 2, borderRadius: Radius.full },
  coverPrimaryBadgeText: { fontSize: 9, color: Colors.textOnGold, fontWeight: Typography.bold },
  removeThumb: { position: 'absolute', top: -5, right: -5, width: 18, height: 18, borderRadius: 9, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  uploadBtn: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.goldSurface, borderRadius: Radius.lg,
    borderWidth: 1.5, borderColor: `${Colors.gold}44`, padding: Spacing.md,
  },
  uploadBtnTitle: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.gold },
  uploadBtnSub: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 1 },
  orDivider: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginVertical: Spacing.xs },
  orLine: { flex: 1, height: 1, backgroundColor: Colors.surfaceBorder },
  orText: { fontSize: Typography.xs, color: Colors.textMuted, fontWeight: Typography.medium },

  ageRow: { flexDirection: 'row', gap: Spacing.sm },
  ageOpt: { flex: 1, alignItems: 'center', paddingVertical: Spacing.md, borderRadius: Radius.md, backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.surfaceBorder },
  ageOptActive: { backgroundColor: Colors.goldSurface, borderColor: Colors.gold },
  ageOptText: { fontSize: Typography.sm, color: Colors.textSecondary, fontWeight: Typography.medium },
  ageOptTextActive: { color: Colors.gold, fontWeight: Typography.bold },

  lineupRow: { flexDirection: 'row', backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.surfaceBorder, overflow: 'hidden' },
  addBtn: { width: 52, height: 52, backgroundColor: Colors.gold, alignItems: 'center', justifyContent: 'center' },
  artistTags: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginTop: Spacing.xs },
  artistTag: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.surfaceElevated, borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: 6, borderWidth: 1, borderColor: Colors.surfaceBorder },
  artistTagText: { fontSize: Typography.sm, color: Colors.textSecondary },

  actions: { gap: Spacing.md, marginTop: Spacing.sm },
  saveBtn: { borderRadius: Radius.lg, overflow: 'hidden' },
  saveBtnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingVertical: Spacing.base + 2 },
  saveBtnText: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textOnGold },
  deleteEventBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingVertical: Spacing.md, borderRadius: Radius.md, backgroundColor: 'rgba(255,68,68,0.08)', borderWidth: 1, borderColor: 'rgba(255,68,68,0.2)' },
  deleteBtnText: { fontSize: Typography.base, color: Colors.error, fontWeight: Typography.semibold },
  uploadErrorBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    backgroundColor: 'rgba(255,68,68,0.1)', borderRadius: Radius.lg, padding: Spacing.base,
    borderWidth: 1, borderColor: 'rgba(255,68,68,0.25)',
  },
  uploadErrorText: { flex: 1, fontSize: Typography.sm, color: Colors.error, lineHeight: 20 },
});

const editLineupStyles = StyleSheet.create({
  roleChip: {
    paddingHorizontal: Spacing.md, height: 30, borderRadius: Radius.full,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.surfaceBorder,
    alignItems: 'center', justifyContent: 'center',
  },
  roleChipActive: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  roleChipText: { fontSize: Typography.xs, color: Colors.textMuted, fontWeight: Typography.medium },
  roleChipTextActive: { color: Colors.textOnGold, fontWeight: Typography.bold },
  rolePrefixBadge: {
    paddingHorizontal: Spacing.sm, height: 52, alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.goldSurface, borderRightWidth: 1, borderRightColor: Colors.surfaceBorder,
    minWidth: 60,
  },
  rolePrefixText: { fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.gold },
  roleBadge: {
    backgroundColor: Colors.goldSurface, borderRadius: Radius.full,
    paddingHorizontal: 6, paddingVertical: 2,
    borderWidth: 1, borderColor: `${Colors.gold}44`,
  },
  roleBadgeText: { fontSize: 9, color: Colors.gold, fontWeight: Typography.bold },
});

const editPricingStyles = StyleSheet.create({
  entryBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: Spacing.md, borderRadius: Radius.lg, backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.surfaceBorder, position: 'relative' },
  entryBtnFree: { borderColor: Colors.greenLight, backgroundColor: `${Colors.greenLight}10` },
  entryBtnPaid: { borderColor: Colors.gold, backgroundColor: Colors.goldSurface },
  entryBtnLabel: { fontSize: Typography.xs, fontWeight: Typography.bold, color: Colors.textMuted },
  checkWrap: { position: 'absolute', top: 6, right: 6 },
  methodCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.surfaceBorder, padding: Spacing.md },
  methodCardActive: { borderColor: Colors.gold, backgroundColor: Colors.goldSurface },
  methodLabel: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textSecondary },
  methodSub: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 1 },
  locCard: { backgroundColor: Colors.surfaceElevated, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.surfaceBorder, padding: Spacing.md, gap: Spacing.xs, marginBottom: Spacing.sm },
  locHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.xs },
  locTitle: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.gold },
  addLocBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingVertical: Spacing.md, borderRadius: Radius.md, borderWidth: 1.5, borderColor: `${Colors.gold}55`, backgroundColor: Colors.goldSurface },
  addLocBtnText: { fontSize: Typography.sm, color: Colors.gold, fontWeight: Typography.semibold },
});
