// app/ticketing/ticket/[ticketId].tsx
// Phase 4 — Individual ticket detail with real QR, transfer flow, and attendee rename.
// QR encodes the secure_token as a plain opaque string.
// Transfer rotates the token server-side via complete_ticket_transfer() RPC.
// Rename is done via change_ticket_attendee_name() RPC.
// TICKETING_ENABLED guard present.

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import { getSupabaseClient } from '../../../lib/supabase';
import { useAuth } from '../../../hooks/useAuth';
import { formatMinorAmount, formatDate } from '../../../services/customerTicketingService';
import { getCardUrl } from '../../../lib/storage';
import { Colors, Typography, Spacing, Radius } from '../../../constants/theme';
import { TICKETING_ENABLED } from '../../../constants/featureFlags';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TicketDetail {
  id: string;
  order_id: string;
  event_id: string;
  ticket_type_id: string;
  attendee_name: string;
  secure_token: string;
  status: string;
  checked_in_at: string | null;
  transfer_count: number;
  created_at: string;
  // joined
  event_title: string;
  event_date: string;
  event_start_time: string;
  event_venue: string;
  event_parish: string;
  event_cover_image: string;
  ticket_type_name: string;
  price_minor: number;
  currency: string;
  order_number: string;
}

// ─── Recipient lookup ─────────────────────────────────────────────────────────

interface RecipientResult {
  recipient_id: string;
  display_name: string;
  display_hint: string;
}

// ─── Transfer Modal ───────────────────────────────────────────────────────────

function TransferModal({
  visible,
  onClose,
  onTransferred,
  ticketId,
}: {
  visible: boolean;
  onClose: () => void;
  onTransferred: () => void;
  ticketId: string;
}) {
  const insets = useSafeAreaInsets();
  const [identifier, setIdentifier] = useState('');
  const [recipient, setRecipient] = useState<RecipientResult | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setIdentifier('');
    setRecipient(null);
    setError(null);
  };

  const handleLookup = async () => {
    if (!identifier.trim()) return;
    setError(null);
    setRecipient(null);
    setLookingUp(true);

    const supabase = getSupabaseClient();
    const { data, error: rpcErr } = await supabase.rpc('lookup_transfer_recipient', {
      p_identifier: identifier.trim(),
    });

    setLookingUp(false);

    if (rpcErr) {
      setError('Lookup failed. Please try again.');
      return;
    }

    const res = data as Record<string, unknown>;
    if (!res?.ok) {
      setError((res?.error as string) ?? 'Recipient not found.');
      return;
    }

    setRecipient({
      recipient_id: res.recipient_id as string,
      display_name: res.display_name as string,
      display_hint: res.display_hint as string,
    });
  };

  const handleTransfer = async () => {
    if (!recipient) return;
    setTransferring(true);
    setError(null);

    const supabase = getSupabaseClient();
    const { data, error: rpcErr } = await supabase.rpc('complete_ticket_transfer', {
      p_ticket_id: ticketId,
      p_recipient_id: recipient.recipient_id,
    });

    setTransferring(false);

    if (rpcErr) {
      setError('Transfer failed. Please try again.');
      return;
    }

    const res = data as Record<string, unknown>;
    if (!res?.ok) {
      setError((res?.error as string) ?? 'Transfer failed.');
      return;
    }

    onClose();
    resetForm();
    onTransferred();
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <Pressable style={transferStyles.overlay} onPress={handleClose}>
        <Pressable
          style={[transferStyles.sheet, { paddingBottom: Math.max(Spacing.xxl, insets.bottom + Spacing.base) }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={transferStyles.handle} />
          <Text style={transferStyles.title}>Transfer Ticket</Text>
          <Text style={transferStyles.sub}>
            Enter the recipient{"'s"} registered Vybz Hub email or phone number.
            After transfer, your QR code will be invalidated immediately.
          </Text>

          <View style={transferStyles.inputRow}>
            <TextInput
              style={transferStyles.input}
              value={identifier}
              onChangeText={(v) => { setIdentifier(v); setRecipient(null); setError(null); }}
              placeholder="Email or phone (e.g. +18761234567)"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="none"
              keyboardType="email-address"
              autoCorrect={false}
              returnKeyType="search"
              onSubmitEditing={handleLookup}
            />
            <Pressable
              onPress={handleLookup}
              disabled={lookingUp || !identifier.trim()}
              style={({ pressed }) => [
                transferStyles.lookupBtn,
                (!identifier.trim() || lookingUp) && transferStyles.lookupBtnDisabled,
                pressed && identifier.trim() && { opacity: 0.8 },
              ]}
            >
              {lookingUp
                ? <ActivityIndicator color={Colors.textOnGold} size="small" />
                : <MaterialIcons name="search" size={20} color={Colors.textOnGold} />}
            </Pressable>
          </View>

          {error && (
            <View style={transferStyles.errorRow}>
              <MaterialIcons name="error-outline" size={14} color={Colors.error} />
              <Text style={transferStyles.errorText}>{error}</Text>
            </View>
          )}

          {recipient && (
            <View style={transferStyles.recipientCard}>
              <View style={transferStyles.recipientAvatar}>
                <MaterialIcons name="person" size={20} color={Colors.gold} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={transferStyles.recipientName}>{recipient.display_name}</Text>
                <Text style={transferStyles.recipientHint}>{recipient.display_hint}</Text>
              </View>
              <MaterialIcons name="check-circle" size={20} color={Colors.greenLight} />
            </View>
          )}

          {recipient && (
            <View style={transferStyles.warningCard}>
              <MaterialIcons name="warning" size={16} color="#FF9800" />
              <Text style={transferStyles.warningText}>
                After transfer:{'\n'}
                • Your QR code becomes invalid immediately{'\n'}
                • The recipient receives a new QR code{'\n'}
                • Transfers cannot be reversed
              </Text>
            </View>
          )}

          {recipient && (
            <Pressable
              onPress={handleTransfer}
              disabled={transferring}
              style={({ pressed }) => [transferStyles.confirmBtn, pressed && { opacity: 0.85 }]}
            >
              <LinearGradient
                colors={transferring ? [Colors.surfaceElevated, Colors.surfaceElevated] : [Colors.gold, Colors.goldDim]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={transferStyles.confirmBtnInner}
              >
                {transferring
                  ? <ActivityIndicator color={Colors.gold} size="small" />
                  : <>
                    <MaterialIcons name="swap-horiz" size={18} color={Colors.textOnGold} />
                    <Text style={transferStyles.confirmBtnText}>Confirm Transfer</Text>
                  </>}
              </LinearGradient>
            </Pressable>
          )}

          <Pressable onPress={handleClose} style={transferStyles.cancelBtn}>
            <Text style={transferStyles.cancelBtnText}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const transferStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: Spacing.xl,
    borderTopWidth: 1, borderColor: Colors.surfaceBorder,
    gap: Spacing.base,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.surfaceBorder, alignSelf: 'center', marginBottom: Spacing.xs },
  title: { fontSize: Typography.xl, fontWeight: Typography.black, color: Colors.textPrimary },
  sub: { fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 20 },
  inputRow: { flexDirection: 'row', gap: Spacing.sm },
  input: {
    flex: 1, backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    fontSize: Typography.base, color: Colors.textPrimary,
  },
  lookupBtn: {
    width: 48, height: 48, borderRadius: Radius.md,
    backgroundColor: Colors.gold, alignItems: 'center', justifyContent: 'center',
  },
  lookupBtnDisabled: { backgroundColor: Colors.surfaceElevated },
  errorRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    backgroundColor: 'rgba(255,68,68,0.08)', borderRadius: Radius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: 'rgba(255,68,68,0.2)',
  },
  errorText: { flex: 1, fontSize: Typography.sm, color: Colors.error, lineHeight: 18 },
  recipientCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: `${Colors.greenLight}08`, borderRadius: Radius.md,
    padding: Spacing.base, borderWidth: 1, borderColor: `${Colors.greenLight}33`,
  },
  recipientAvatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.goldSurface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: `${Colors.gold}44`,
  },
  recipientName: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textPrimary },
  recipientHint: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2 },
  warningCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    backgroundColor: 'rgba(255,152,0,0.08)', borderRadius: Radius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: 'rgba(255,152,0,0.3)',
  },
  warningText: { flex: 1, fontSize: Typography.sm, color: '#FF9800', lineHeight: 20 },
  confirmBtn: { borderRadius: Radius.lg, overflow: 'hidden' },
  confirmBtnInner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, paddingVertical: Spacing.base,
  },
  confirmBtnText: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textOnGold },
  cancelBtn: {
    alignItems: 'center', paddingVertical: Spacing.md,
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  cancelBtnText: { fontSize: Typography.base, color: Colors.textSecondary, fontWeight: Typography.semibold },
});

// ─── Rename Modal ─────────────────────────────────────────────────────────────

function RenameModal({
  visible,
  onClose,
  onRenamed,
  ticketId,
  currentName,
}: {
  visible: boolean;
  onClose: () => void;
  onRenamed: (name: string) => void;
  ticketId: string;
  currentName: string;
}) {
  const insets = useSafeAreaInsets();
  const [nameValue, setNameValue] = useState(currentName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setNameValue(currentName); }, [currentName, visible]);

  const handleSave = async () => {
    const trimmed = nameValue.trim();
    if (!trimmed) { setError('Attendee name cannot be blank.'); return; }
    if (trimmed.length > 100) { setError('Name must be 100 characters or fewer.'); return; }

    setSaving(true);
    setError(null);

    const supabase = getSupabaseClient();
    const { data, error: rpcErr } = await supabase.rpc('change_ticket_attendee_name', {
      p_ticket_id: ticketId,
      p_new_name: trimmed,
    });

    setSaving(false);

    if (rpcErr) { setError('Could not save name. Please try again.'); return; }

    const res = data as Record<string, unknown>;
    if (!res?.ok) { setError((res?.error as string) ?? 'Could not save name.'); return; }

    onRenamed(trimmed);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={renameStyles.overlay} onPress={onClose}>
        <Pressable
          style={[renameStyles.sheet, { paddingBottom: Math.max(Spacing.xxl, insets.bottom + Spacing.base) }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={renameStyles.handle} />
          <Text style={renameStyles.title}>Edit Attendee Name</Text>
          <Text style={renameStyles.sub}>This updates the display name on your ticket. It does not transfer ownership.</Text>

          <TextInput
            style={[renameStyles.input, error ? renameStyles.inputError : null]}
            value={nameValue}
            onChangeText={(v) => { setNameValue(v); setError(null); }}
            placeholder="Attendee name"
            placeholderTextColor={Colors.textMuted}
            maxLength={100}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleSave}
          />
          <Text style={renameStyles.charCount}>{nameValue.length}/100</Text>

          {error && (
            <View style={renameStyles.errorRow}>
              <MaterialIcons name="error-outline" size={14} color={Colors.error} />
              <Text style={renameStyles.errorText}>{error}</Text>
            </View>
          )}

          <Pressable
            onPress={handleSave}
            disabled={saving}
            style={({ pressed }) => [renameStyles.saveBtn, pressed && { opacity: 0.85 }]}
          >
            <LinearGradient
              colors={[Colors.gold, Colors.goldDim]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={renameStyles.saveBtnInner}
            >
              {saving
                ? <ActivityIndicator color={Colors.textOnGold} size="small" />
                : <>
                  <MaterialIcons name="check" size={18} color={Colors.textOnGold} />
                  <Text style={renameStyles.saveBtnText}>Save Name</Text>
                </>}
            </LinearGradient>
          </Pressable>

          <Pressable onPress={onClose} style={renameStyles.cancelBtn}>
            <Text style={renameStyles.cancelBtnText}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const renameStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: Spacing.xl, gap: Spacing.md,
    borderTopWidth: 1, borderColor: Colors.surfaceBorder,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.surfaceBorder, alignSelf: 'center', marginBottom: Spacing.xs },
  title: { fontSize: Typography.xl, fontWeight: Typography.black, color: Colors.textPrimary },
  sub: { fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 20 },
  input: {
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md,
    borderWidth: 1.5, borderColor: Colors.surfaceBorder,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    fontSize: Typography.base, color: Colors.textPrimary,
  },
  inputError: { borderColor: Colors.error },
  charCount: { fontSize: Typography.xs, color: Colors.textMuted, alignSelf: 'flex-end', marginTop: -Spacing.sm },
  errorRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    backgroundColor: 'rgba(255,68,68,0.08)', borderRadius: Radius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: 'rgba(255,68,68,0.2)',
  },
  errorText: { flex: 1, fontSize: Typography.sm, color: Colors.error, lineHeight: 18 },
  saveBtn: { borderRadius: Radius.lg, overflow: 'hidden' },
  saveBtnInner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, paddingVertical: Spacing.base,
  },
  saveBtnText: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textOnGold },
  cancelBtn: {
    alignItems: 'center', paddingVertical: Spacing.md,
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  cancelBtnText: { fontSize: Typography.base, color: Colors.textSecondary, fontWeight: Typography.semibold },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function TicketDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { ticketId } = useLocalSearchParams<{ ticketId: string }>();

  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTransfer, setShowTransfer] = useState(false);
  const [showRename, setShowRename] = useState(false);

  const loadTicket = useCallback(async () => {
    if (!ticketId) return;
    setLoading(true);
    setError(null);

    const supabase = getSupabaseClient();

    const { data: tk, error: tkErr } = await supabase
      .from('tickets')
      .select('id, order_id, event_id, ticket_type_id, attendee_name, secure_token, status, checked_in_at, transfer_count, created_at')
      .eq('id', ticketId)
      .maybeSingle();

    if (tkErr || !tk) {
      setError(tkErr?.message ?? 'Ticket not found.');
      setLoading(false);
      return;
    }

    const [evRes, tyRes, orRes] = await Promise.all([
      supabase.from('events').select('title, date, start_time, venue, parish, cover_image').eq('id', tk.event_id).maybeSingle(),
      supabase.from('event_ticket_types').select('name, price_minor, currency').eq('id', tk.ticket_type_id).maybeSingle(),
      supabase.from('ticket_orders').select('order_number').eq('id', tk.order_id).maybeSingle(),
    ]);

    setTicket({
      ...tk,
      event_title: (evRes.data as any)?.title ?? '',
      event_date: (evRes.data as any)?.date ?? '',
      event_start_time: (evRes.data as any)?.start_time ?? '',
      event_venue: (evRes.data as any)?.venue ?? '',
      event_parish: (evRes.data as any)?.parish ?? '',
      event_cover_image: (evRes.data as any)?.cover_image ?? '',
      ticket_type_name: (tyRes.data as any)?.name ?? '',
      price_minor: (tyRes.data as any)?.price_minor ?? 0,
      currency: (tyRes.data as any)?.currency ?? 'USD',
      order_number: (orRes.data as any)?.order_number ?? '',
    } as TicketDetail);

    setLoading(false);
  }, [ticketId]);

  useEffect(() => { loadTicket(); }, [loadTicket]);

  if (!TICKETING_ENABLED) {
    return (
      <View style={styles.container}>
        <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
          <View style={styles.header}>
            <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}>
              <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
            </Pressable>
            <Text style={styles.headerTitle}>Ticket</Text>
          </View>
        </SafeAreaView>
        <View style={styles.centered}>
          <MaterialIcons name="construction" size={40} color={Colors.textMuted} />
          <Text style={styles.centeredTitle}>Coming Soon</Text>
        </View>
      </View>
    );
  }

  if (!user) {
    router.replace('/auth' as any);
    return null;
  }

  const isValid = ticket?.status === 'valid';
  const isCheckedIn = ticket?.checked_in_at != null;
  const isVoided = ticket?.status === 'voided' || ticket?.status === 'refunded' || ticket?.status === 'cancelled';
  const isTransferred = ticket?.status === 'transferred_out';
  const canTransfer = isValid && !isCheckedIn && !isVoided && !isTransferred;
  const canRename = isValid && !isCheckedIn && !isVoided && !isTransferred;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isEventPast = ticket?.event_date
    ? (() => { const [y, m, d] = ticket.event_date.split('-').map(Number); return new Date(y, m - 1, d) < today; })()
    : false;

  const handleTransferred = () => {
    // Reload to reflect new (transferred) state — token is now invalid
    loadTicket();
    Alert.alert(
      'Transfer Complete',
      'The ticket has been transferred. Your QR code is now invalid. The recipient has been notified.',
      [{ text: 'OK' }],
    );
  };

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
          <Text style={styles.headerTitle}>Ticket Detail</Text>
          <Pressable
            onPress={() => router.push(`/ticketing/order/${ticket?.order_id}` as any)}
            style={({ pressed }) => [styles.receiptBtn, pressed && { opacity: 0.7 }]}
          >
            <MaterialIcons name="receipt" size={18} color={Colors.gold} />
          </Pressable>
        </View>
      </SafeAreaView>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={Colors.gold} size="large" />
        </View>
      ) : error || !ticket ? (
        <View style={styles.centered}>
          <MaterialIcons name="error-outline" size={40} color={Colors.textMuted} />
          <Text style={styles.centeredTitle}>Ticket not found</Text>
          <Text style={styles.centeredSub}>{error}</Text>
          <Pressable onPress={loadTicket} style={styles.retryBtn}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: Math.max(Spacing.xxl * 2, insets.bottom + Spacing.xl) },
            ]}
          >
            {/* Event header */}
            <View style={styles.eventCard}>
              {ticket.event_cover_image ? (
                <Image
                  source={{ uri: getCardUrl(ticket.event_cover_image) }}
                  style={styles.eventThumb}
                  contentFit="cover"
                  transition={200}
                />
              ) : null}
              <View style={{ flex: 1, gap: Spacing.xs }}>
                <Text style={styles.eventTitle} numberOfLines={2}>{ticket.event_title}</Text>
                <View style={styles.metaRow}>
                  <MaterialIcons name="event" size={12} color={Colors.gold} />
                  <Text style={styles.metaText}>{formatDate(ticket.event_date)}</Text>
                </View>
                <View style={styles.metaRow}>
                  <MaterialIcons name="place" size={12} color={Colors.textMuted} />
                  <Text style={styles.metaText}>{ticket.event_venue}, {ticket.event_parish}</Text>
                </View>
              </View>
            </View>

            {/* Ticket info */}
            <View style={styles.infoCard}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Ticket Type</Text>
                <Text style={styles.infoValue}>{ticket.ticket_type_name}</Text>
              </View>
              <View style={styles.infoDivider} />
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Price</Text>
                <Text style={styles.infoValue}>{formatMinorAmount(ticket.price_minor, ticket.currency)}</Text>
              </View>
              <View style={styles.infoDivider} />
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Order #</Text>
                <Text style={styles.infoValue}>{ticket.order_number}</Text>
              </View>
              <View style={styles.infoDivider} />
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Attendee</Text>
                <View style={styles.attendeeRowWrap}>
                  <Text style={styles.infoValue}>{ticket.attendee_name || 'Not set'}</Text>
                  {canRename && !isEventPast && (
                    <Pressable
                      onPress={() => setShowRename(true)}
                      style={({ pressed }) => [styles.editChip, pressed && { opacity: 0.7 }]}
                    >
                      <MaterialIcons name="edit" size={11} color={Colors.gold} />
                      <Text style={styles.editChipText}>Edit</Text>
                    </Pressable>
                  )}
                </View>
              </View>
              <View style={styles.infoDivider} />
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Status</Text>
                <View style={[
                  styles.statusBadge,
                  {
                    backgroundColor: isVoided ? 'rgba(255,68,68,0.1)' : isTransferred ? 'rgba(255,152,0,0.1)' : isCheckedIn ? 'rgba(0,200,83,0.1)' : Colors.goldSurface,
                    borderColor: isVoided ? 'rgba(255,68,68,0.3)' : isTransferred ? 'rgba(255,152,0,0.3)' : isCheckedIn ? 'rgba(0,200,83,0.3)' : `${Colors.gold}44`,
                  },
                ]}>
                  <MaterialIcons
                    name={isVoided ? 'cancel' : isTransferred ? 'swap-horiz' : isCheckedIn ? 'check-circle' : 'confirmation-number'}
                    size={12}
                    color={isVoided ? Colors.error : isTransferred ? '#FF9800' : isCheckedIn ? Colors.greenLight : Colors.gold}
                  />
                  <Text style={[
                    styles.statusText,
                    { color: isVoided ? Colors.error : isTransferred ? '#FF9800' : isCheckedIn ? Colors.greenLight : Colors.gold },
                  ]}>
                    {isVoided ? ticket.status : isTransferred ? 'Transferred' : isCheckedIn ? 'Used' : 'Valid'}
                  </Text>
                </View>
              </View>
              {isCheckedIn && ticket.checked_in_at && (
                <>
                  <View style={styles.infoDivider} />
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Checked In</Text>
                    <Text style={styles.infoValue}>
                      {new Date(ticket.checked_in_at).toLocaleString('en-JM', {
                        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                      })}
                    </Text>
                  </View>
                </>
              )}
              {ticket.transfer_count > 0 && (
                <>
                  <View style={styles.infoDivider} />
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Transfers</Text>
                    <Text style={styles.infoValue}>{ticket.transfer_count}</Text>
                  </View>
                </>
              )}
            </View>

            {/* Status banners */}
            {isVoided && (
              <View style={styles.warnBanner}>
                <MaterialIcons name="cancel" size={16} color={Colors.error} />
                <Text style={styles.warnBannerText}>
                  This ticket has been {ticket.status}. It is no longer valid for entry.
                </Text>
              </View>
            )}
            {isTransferred && (
              <View style={[styles.warnBanner, { borderColor: 'rgba(255,152,0,0.3)', backgroundColor: 'rgba(255,152,0,0.08)' }]}>
                <MaterialIcons name="swap-horiz" size={16} color="#FF9800" />
                <Text style={[styles.warnBannerText, { color: '#FF9800' }]}>
                  This ticket has been transferred. The new owner holds the valid QR code.
                </Text>
              </View>
            )}
            {isEventPast && !isCheckedIn && !isVoided && !isTransferred && (
              <View style={[styles.warnBanner, { borderColor: Colors.surfaceBorder, backgroundColor: Colors.surfaceElevated }]}>
                <MaterialIcons name="history" size={16} color={Colors.textMuted} />
                <Text style={[styles.warnBannerText, { color: Colors.textMuted }]}>
                  This event has passed. The ticket can no longer be used for entry.
                </Text>
              </View>
            )}

            {/* QR Code — shown only for valid/owned tickets */}
            {!isVoided && !isTransferred && (
              <View style={styles.qrSection}>
                <Text style={styles.qrTitle}>QR Code</Text>
                {isCheckedIn ? (
                  <View style={styles.checkedInQR}>
                    <MaterialIcons name="check-circle" size={56} color={Colors.greenLight} />
                    <Text style={styles.checkedInText}>Ticket Used</Text>
                    <Text style={styles.checkedInSub}>This ticket was scanned at entry.</Text>
                  </View>
                ) : (
                  <View style={styles.qrWrapper}>
                    <QRCode
                      value={ticket.secure_token}
                      size={220}
                      color="#0A0A0A"
                      backgroundColor="#F8F8F0"
                    />
                    <Text style={styles.qrHint}>
                      Show this QR code at the event entrance.
                      {'\n'}Each code is valid for one scan only.
                    </Text>
                    <Text style={styles.qrTicketId}>
                      {ticket.id.slice(0, 8).toUpperCase()}
                    </Text>
                  </View>
                )}

                <View style={styles.qrSecurityNote}>
                  <MaterialIcons name="security" size={12} color={Colors.textMuted} />
                  <Text style={styles.qrSecurityText}>
                    Keep your QR code private. Do not screenshot and share it.
                  </Text>
                </View>
              </View>
            )}

            {/* Actions */}
            {(canTransfer || canRename) && !isEventPast && (
              <View style={styles.actionsSection}>
                <Text style={styles.sectionTitle}>Actions</Text>
                <View style={styles.actionsGrid}>
                  {canRename && (
                    <Pressable
                      onPress={() => setShowRename(true)}
                      style={({ pressed }) => [styles.actionCard, pressed && { opacity: 0.85 }]}
                    >
                      <View style={[styles.actionIcon, { backgroundColor: Colors.goldSurface, borderColor: `${Colors.gold}44` }]}>
                        <MaterialIcons name="edit" size={22} color={Colors.gold} />
                      </View>
                      <Text style={styles.actionLabel}>Edit Name</Text>
                      <Text style={styles.actionSub}>Update attendee name</Text>
                    </Pressable>
                  )}
                  {canTransfer && (
                    <Pressable
                      onPress={() => setShowTransfer(true)}
                      style={({ pressed }) => [styles.actionCard, pressed && { opacity: 0.85 }]}
                    >
                      <View style={[styles.actionIcon, { backgroundColor: 'rgba(33,150,243,0.1)', borderColor: 'rgba(33,150,243,0.3)' }]}>
                        <MaterialIcons name="swap-horiz" size={22} color="#42A5F5" />
                      </View>
                      <Text style={styles.actionLabel}>Transfer</Text>
                      <Text style={styles.actionSub}>Send to another user</Text>
                    </Pressable>
                  )}
                </View>
                <Text style={styles.transferNote}>
                  Transfer: existing Vybz Hub accounts only. Old QR is invalidated immediately.
                </Text>
              </View>
            )}
          </ScrollView>

          {/* Modals */}
          <TransferModal
            visible={showTransfer}
            onClose={() => setShowTransfer(false)}
            onTransferred={handleTransferred}
            ticketId={ticket.id}
          />
          <RenameModal
            visible={showRename}
            onClose={() => setShowRename(false)}
            onRenamed={(name) => setTicket((t) => t ? { ...t, attendee_name: name } : t)}
            ticketId={ticket.id}
            currentName={ticket.attendee_name}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  centered: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    gap: Spacing.base, paddingHorizontal: Spacing.xl,
  },
  centeredTitle: { fontSize: Typography.lg, fontWeight: Typography.black, color: Colors.textPrimary },
  centeredSub: { fontSize: Typography.base, color: Colors.textMuted, textAlign: 'center' },
  retryBtn: {
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md,
    backgroundColor: Colors.goldSurface, borderRadius: Radius.full,
    borderWidth: 1, borderColor: `${Colors.gold}44`,
  },
  retryBtnText: { color: Colors.gold, fontWeight: Typography.semibold, fontSize: Typography.sm },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { flex: 1, fontSize: Typography.lg, fontWeight: Typography.black, color: Colors.textPrimary },
  receiptBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.goldSurface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: `${Colors.gold}33`,
  },

  scrollContent: { padding: Spacing.base, gap: Spacing.lg },

  eventCard: {
    flexDirection: 'row', gap: Spacing.md, alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.surfaceBorder, padding: Spacing.base,
  },
  eventThumb: { width: 80, height: 80, borderRadius: Radius.md, flexShrink: 0 },
  eventTitle: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textPrimary },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText: { fontSize: Typography.xs, color: Colors.textMuted, flex: 1 },

  infoCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.surfaceBorder, overflow: 'hidden',
  },
  infoRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: Spacing.base, gap: Spacing.md,
  },
  infoDivider: { height: 1, backgroundColor: Colors.surfaceBorder },
  infoLabel: {
    fontSize: Typography.xs, color: Colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.5, flex: 1,
  },
  infoValue: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: Colors.textPrimary, textAlign: 'right', flex: 2 },
  attendeeRowWrap: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 2, justifyContent: 'flex-end' },
  editChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: Colors.goldSurface, paddingHorizontal: Spacing.sm, paddingVertical: 3,
    borderRadius: Radius.full, borderWidth: 1, borderColor: `${Colors.gold}33`,
  },
  editChipText: { fontSize: Typography.xs, color: Colors.gold, fontWeight: Typography.semibold },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: Spacing.sm, paddingVertical: 4,
    borderRadius: Radius.full, borderWidth: 1,
  },
  statusText: { fontSize: Typography.xs, fontWeight: Typography.bold },

  warnBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    backgroundColor: 'rgba(255,68,68,0.08)', borderRadius: Radius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: 'rgba(255,68,68,0.3)',
  },
  warnBannerText: { flex: 1, fontSize: Typography.sm, color: Colors.error, lineHeight: 18 },

  qrSection: {
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
    padding: Spacing.xl, gap: Spacing.md, alignItems: 'center',
  },
  qrTitle: {
    fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.8, alignSelf: 'flex-start',
  },
  qrWrapper: { alignItems: 'center', gap: Spacing.md },
  checkedInQR: { alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.xl },
  checkedInText: { fontSize: Typography.xl, fontWeight: Typography.black, color: Colors.greenLight },
  checkedInSub: { fontSize: Typography.sm, color: Colors.textMuted },
  qrHint: { fontSize: Typography.xs, color: Colors.textMuted, textAlign: 'center', lineHeight: 18 },
  qrTicketId: {
    fontSize: 11, color: Colors.textMuted, fontFamily: 'monospace',
    letterSpacing: 2, textTransform: 'uppercase',
  },
  qrSecurityNote: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 5,
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.sm,
    padding: Spacing.sm, borderWidth: 1, borderColor: Colors.surfaceBorder, alignSelf: 'stretch',
  },
  qrSecurityText: { flex: 1, fontSize: Typography.xs, color: Colors.textMuted, lineHeight: 16 },

  actionsSection: { gap: Spacing.md },
  sectionTitle: {
    fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  actionsGrid: { flexDirection: 'row', gap: Spacing.md },
  actionCard: {
    flex: 1, backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
    padding: Spacing.base, gap: Spacing.sm, alignItems: 'center',
  },
  actionIcon: {
    width: 48, height: 48, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },
  actionLabel: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textPrimary },
  actionSub: { fontSize: Typography.xs, color: Colors.textMuted, textAlign: 'center' },
  transferNote: {
    fontSize: Typography.xs, color: Colors.textMuted, lineHeight: 17, textAlign: 'center',
  },
});
