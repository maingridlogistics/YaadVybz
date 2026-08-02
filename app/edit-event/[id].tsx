
import React, { useState, useCallback } from 'react';
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
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { useEvents } from '../../hooks/useEvents';
import { useNotifications } from '../../hooks/useNotifications';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import { EVENT_TYPES, PARISHES, RECURRING_OPTIONS } from '../../constants/data';

const AGE_OPTIONS = ['All Ages', '18+', '21+'];
const PERFORMER_ROLES = ['DJ', 'Artist', 'MC', 'Host', 'Band', 'Live Act', 'Comedian', 'Speaker', 'Other'];

type LineupEntry = { name: string; role: string };

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

export default function EditEventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { getEventById, editEvent, deleteEvent, userGoingIds, userInterestedIds } = useEvents();
  const { addNotification } = useNotifications();

  const event = getEventById(id ?? '');

  const [title, setTitle] = useState(event?.title ?? '');
  const [description, setDescription] = useState(event?.description ?? '');
  const [date, setDate] = useState(event?.date ?? '');
  const [startTime, setStartTime] = useState(event?.startTime ?? '');
  const [endTime, setEndTime] = useState(event?.endTime ?? '');
  const [parish, setParish] = useState(event?.parish ?? '');
  const [venue, setVenue] = useState(event?.venue ?? '');
  const [address, setAddress] = useState(event?.address ?? '');
  const [selectedTypes, setSelectedTypes] = useState<string[]>(event?.eventTypes ?? []);
  const [recurring, setRecurring] = useState(event?.recurring ?? false);
  const [recurringFrequency, setRecurringFrequency] = useState(event?.recurringFrequency ?? 'Weekly');
  const [coverImage, setCoverImage] = useState(event?.coverImage ?? COVER_IMAGES[0]);
  const [allImages, setAllImages] = useState<string[]>(() => {
    const existing = event?.flyerImages ?? [event?.coverImage ?? COVER_IMAGES[0]];
    return existing.length > 0 ? existing : [COVER_IMAGES[0]];
  });
  const [ticketPrice, setTicketPrice] = useState(
    event?.ticketPrice === 'Free' || event?.ticketPrice === 'Free Entry' ? '' : event?.ticketPrice ?? ''
  );
  const [isFree, setIsFree] = useState(event?.ticketPrice === 'Free' || event?.ticketPrice === 'Free Entry');
  const [ageLimit, setAgeLimit] = useState(event?.ageLimit ?? 'All Ages');
  const [dressCode, setDressCode] = useState(event?.dressCode ?? '');
  // Parse existing lineup strings ("Role: Name" or plain name) into structured entries
  const [lineupEntries, setLineupEntries] = useState<LineupEntry[]>(() => {
    const raw = event?.lineup ?? [];
    if (!raw.length) return [];
    // Check if lineupEntries field exists on event
    if ((event as any).lineupEntries?.length) return (event as any).lineupEntries as LineupEntry[];
    return raw.map((s) => {
      const match = s.match(/^([^:]+):\s*(.+)$/);
      return match ? { role: match[1].trim(), name: match[2].trim() } : { role: 'Artist', name: s };
    });
  });
  const [lineupRole, setLineupRole] = useState('DJ');
  const [lineupInput, setLineupInput] = useState('');
  const [eventPhotosLink, setEventPhotosLink] = useState(event?.eventPhotosLink ?? '');
  const [ticketLink, setTicketLink] = useState(event?.ticketLink ?? '');
  const [showParishPicker, setShowParishPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

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

  // Guard: only promoter who posted the event can edit
  if (event.promoterId !== user?.id) {
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
    try {
      const primaryType = selectedTypes[0];
      const primaryTypeInfo = EVENT_TYPES.find((t) => t.id === primaryType);

      // ── event_change producer ─────────────────────────────────────────────
      // Detect meaningful changes to date, time, or venue before saving
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
          // Promoter-side confirmation that attendees were notified
          addNotification({
            type: 'event_change',
            title: 'Event Details Updated',
            body: `Changes to "${event.title}" saved. Attendees with RSVPs have been notified.`,
            eventId: event.id,
          });
        }
      }

      editEvent(event.id, {
        title: title.trim(),
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
        coverImage,
        flyerImages: allImages.length > 0 ? allImages : [coverImage],
        ticketPrice: isFree ? 'Free' : ticketPrice.trim() || 'Free',
        ticketLink: ticketLink.trim(),
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
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    // Capture title before the Alert confirms, so it's available in the callback
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
            // ── event_cancelled producer ────────────────────────────────────
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
            deleteEvent(eventId);
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
          <Field label="Date *" hint="YYYY-MM-DD">
            <View style={styles.iconInputRow}>
              <MaterialIcons name="event" size={16} color={Colors.textMuted} />
              <TextInput style={styles.iconInputText} placeholder="2026-08-15" placeholderTextColor={Colors.textMuted} value={date} onChangeText={setDate} accessibilityLabel="Event date" />
            </View>
          </Field>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Field label="Start Time">
                <View style={styles.iconInputRow}>
                  <MaterialIcons name="access-time" size={16} color={Colors.textMuted} />
                  <TextInput style={styles.iconInputText} placeholder="8:00 PM" placeholderTextColor={Colors.textMuted} value={startTime} onChangeText={setStartTime} accessibilityLabel="Start time" />
                </View>
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="End Time">
                <View style={styles.iconInputRow}>
                  <MaterialIcons name="access-time" size={16} color={Colors.textMuted} />
                  <TextInput style={styles.iconInputText} placeholder="2:00 AM" placeholderTextColor={Colors.textMuted} value={endTime} onChangeText={setEndTime} accessibilityLabel="End time" />
                </View>
              </Field>
            </View>
          </View>

          {/* ── Section: Location ── */}
          <SectionHeader icon="place" title="Location" />

          <Field label="Parish *">
            <Pressable onPress={() => setShowParishPicker(!showParishPicker)} style={styles.pickerBtn}>
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

          <View style={styles.recurringCard}>
            <View style={styles.recurringRow}>
              <MaterialIcons name="free-breakfast" size={18} color={isFree ? Colors.greenLight : Colors.textMuted} />
              <View style={{ flex: 1 }}>
                <Text style={styles.recurringTitle}>Free Entry</Text>
                <Text style={styles.recurringSub}>No ticket required</Text>
              </View>
              <Switch value={isFree} onValueChange={setIsFree} trackColor={{ false: Colors.surfaceBorder, true: Colors.greenLight }} thumbColor={isFree ? '#fff' : Colors.textMuted} />
            </View>
          </View>

          {!isFree && (
            <Field label="Ticket Price">
              <View style={styles.iconInputRow}>
                <MaterialIcons name="attach-money" size={16} color={Colors.textMuted} />
                <TextInput style={styles.iconInputText} placeholder="e.g. JMD 3,500" placeholderTextColor={Colors.textMuted} value={ticketPrice} onChangeText={setTicketPrice} accessibilityLabel="Ticket price" />
              </View>
            </Field>
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

          {/* ── Save & Delete ── */}
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

