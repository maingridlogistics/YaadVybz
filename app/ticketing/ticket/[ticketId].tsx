// app/ticketing/ticket/[ticketId].tsx
// Phase 4 — Individual ticket detail with real QR, transfer flow, and attendee rename.
// QR encodes the secure_token as a plain opaque string.
// Transfer: email-based invite flow via initiate-ticket-transfer-invite Edge Function.
//   - Works for existing Vybz Hub users (in-app notification)
//   - Works for non-users (invitation email sent, claim after signup)
//   - QR remains valid until recipient ACCEPTS the transfer
// Token rotation happens server-side via complete_ticket_transfer() RPC on acceptance.
// Rename is done via change_ticket_attendee_name() RPC.

import React, { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Brightness from 'expo-brightness';
import * as Haptics from 'expo-haptics';
import * as KeepAwake from 'expo-keep-awake';
// SDK 54: expo-file-system dropped cacheDirectory/EncodingType from its
// exported API. Use the new OOP File/Paths API from 'expo-file-system/next'.
import { File, Paths } from 'expo-file-system/next';
import * as Sharing from 'expo-sharing';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Modal,
  TextInput,
  ActivityIndicator,
  Platform,
  Linking,
  Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeQRCode } from '../../../components/ui/SafeQRCode';
import { getSupabaseClient } from '../../../lib/supabase';
import { useAuth } from '../../../hooks/useAuth';
import { formatMinorAmount, formatDate } from '../../../services/customerTicketingService';
import { getCardUrl } from '../../../lib/storage';
import { Colors, Typography, Spacing, Radius } from '../../../constants/theme';
import { TICKETING_ENABLED } from '../../../constants/featureFlags';
import { LEGAL_URLS } from '../../../constants/legalUrls';

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

type TransferStep = 'input' | 'sending' | 'complete';

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
  const [step, setStep] = useState<TransferStep>('input');
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultIsInvite, setResultIsInvite] = useState(false);

  const resetForm = () => {
    setStep('input');
    setEmail('');
    setSending(false);
    setError(null);
    setResultIsInvite(false);
  };

  const handleSend = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }
    setSending(true);
    setError(null);
    setStep('sending');

    try {
      const supabase = getSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError('Please sign in to transfer a ticket.');
        setStep('input');
        setSending(false);
        return;
      }

      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
      const res = await fetch(`${supabaseUrl}/functions/v1/initiate-ticket-transfer-invite`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ticket_id: ticketId, recipient_email: trimmed }),
      });

      const data = await res.json();
      setSending(false);

      if (!data?.ok) {
        setError((data?.error as string) ?? 'Transfer failed. Please try again.');
        setStep('input');
        return;
      }

      setResultIsInvite(!!(data as Record<string, unknown>).is_invited);
      setStep('complete');
    } catch {
      setSending(false);
      setError('Network error. Please try again.');
      setStep('input');
    }
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <Pressable style={transferStyles.overlay} onPress={step === 'complete' ? undefined : handleClose}>
        <Pressable
          style={[transferStyles.sheet, { paddingBottom: Math.max(Spacing.xxl, insets.bottom + Spacing.base) }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={transferStyles.handle} />

          {(step === 'input' || step === 'sending') && (
            <>
              <Text style={transferStyles.title}>Transfer Ticket</Text>
              <Text style={transferStyles.sub}>
                Enter the recipient email address. They will receive a transfer request — they must accept it before the ticket transfers.
              </Text>
              <View style={transferStyles.inputRow}>
                <TextInput
                  style={transferStyles.input}
                  value={email}
                  onChangeText={(v) => { setEmail(v); setError(null); }}
                  placeholder="recipient@email.com"
                  placeholderTextColor={Colors.textMuted}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoCorrect={false}
                  returnKeyType="send"
                  onSubmitEditing={handleSend}
                  editable={!sending}
                />
                <Pressable
                  onPress={handleSend}
                  disabled={sending || !email.trim()}
                  style={({ pressed }) => [
                    transferStyles.lookupBtn,
                    (!email.trim() || sending) && transferStyles.lookupBtnDisabled,
                    pressed && email.trim() && { opacity: 0.8 },
                  ]}
                >
                  {sending
                    ? <ActivityIndicator color={Colors.textOnGold} size="small" />
                    : <MaterialIcons name="send" size={20} color={Colors.textOnGold} />}
                </Pressable>
              </View>
              <View style={transferStyles.infoCard}>
                <MaterialIcons name="info" size={14} color="#42A5F5" />
                <Text style={[transferStyles.warningText, { color: '#90CAF9' }]}>
                  Your QR code remains valid until the recipient accepts. Token rotates only on acceptance.
                </Text>
              </View>
              {error ? (
                <View style={transferStyles.errorRow}>
                  <MaterialIcons name="error-outline" size={14} color={Colors.error} />
                  <Text style={transferStyles.errorText}>{error}</Text>
                </View>
              ) : null}
              <Pressable onPress={handleClose} style={transferStyles.cancelBtn}>
                <Text style={transferStyles.cancelBtnText}>Cancel</Text>
              </Pressable>
            </>
          )}

          {step === 'complete' && (
            <View style={transferStyles.successBlock}>
              <View style={transferStyles.successIcon}>
                <MaterialIcons name="check-circle" size={52} color={Colors.greenLight} />
              </View>
              <Text style={transferStyles.successTitle}>Transfer Request Sent</Text>
              <Text style={transferStyles.successSub}>
                {resultIsInvite
                  ? `An invitation email has been sent. Once the recipient creates a Vybz Hub account and accepts, the ticket will transfer.`
                  : `The recipient has been notified. Once they accept, the ticket and QR code will transfer to them.`
                }{'\n\n'}Your QR remains valid until they accept.
              </Text>
              <Pressable
                onPress={() => { handleClose(); onTransferred(); }}
                style={({ pressed }) => [transferStyles.confirmBtn, pressed && { opacity: 0.85 }, { marginTop: Spacing.sm }]}
              >
                <LinearGradient
                  colors={[Colors.gold, Colors.goldDim]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={transferStyles.confirmBtnInner}
                >
                  <MaterialIcons name="confirmation-number" size={18} color={Colors.textOnGold} />
                  <Text style={transferStyles.confirmBtnText}>Done</Text>
                </LinearGradient>
              </Pressable>
            </View>
          )}
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
  infoCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    backgroundColor: 'rgba(33,150,243,0.08)', borderRadius: Radius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: 'rgba(33,150,243,0.25)',
  },
  errorRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    backgroundColor: 'rgba(255,68,68,0.08)', borderRadius: Radius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: 'rgba(255,68,68,0.2)',
  },
  errorText: { flex: 1, fontSize: Typography.sm, color: Colors.error, lineHeight: 18 },
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
  successBlock: { alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.xl },
  successIcon: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: `${Colors.greenLight}12`, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: `${Colors.greenLight}33`,
  },
  successTitle: { fontSize: Typography.xl, fontWeight: Typography.black, color: Colors.greenLight },
  successSub: { fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 22, textAlign: 'center' },
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

// ─── Cache Age Helper ────────────────────────────────────────────────────────

function formatCacheAge(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

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
  const [isOfflineCache, setIsOfflineCache] = useState(false);
  const [cacheTimestamp, setCacheTimestamp] = useState<number | null>(null);
  const [showFullscreen, setShowFullscreen] = useState(false);
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [transferHistory, setTransferHistory] = useState<{
    id: string; status: string; to_email: string | null;
    initiated_at: string; completed_at: string | null;
  }[]>([]);

  const CACHE_KEY = ticketId ? `@vybzhub/ticket_cache_${ticketId}` : null;

  const loadTicket = useCallback(async () => {
    if (!ticketId) return;
    setLoading(true);
    setError(null);
    setIsOfflineCache(false);

    const supabase = getSupabaseClient();

    const { data: tk, error: tkErr } = await supabase
      .from('tickets')
      .select('id, order_id, event_id, ticket_type_id, attendee_name, secure_token, status, checked_in_at, transfer_count, created_at')
      .eq('id', ticketId)
      .maybeSingle();

    if (tkErr || !tk) {
      if (CACHE_KEY) {
        try {
          const raw = await AsyncStorage.getItem(CACHE_KEY);
          if (raw) {
            const cached = JSON.parse(raw) as TicketDetail & { cached_at: number };
            setTicket(cached);
            setIsOfflineCache(true);
            setCacheTimestamp(cached.cached_at ?? null);
            setTransferHistory([]);
            setLoading(false);
            return;
          }
        } catch {
          // cache read failed — fall through to error
        }
      }
      setError(tkErr?.message ?? 'Ticket not found.');
      setLoading(false);
      return;
    }

    const [evRes, tyRes, orRes] = await Promise.all([
      supabase.from('events').select('title, date, start_time, venue, parish, cover_image').eq('id', tk.event_id).maybeSingle(),
      supabase.from('event_ticket_types').select('name, price_minor, currency').eq('id', tk.ticket_type_id).maybeSingle(),
      supabase.from('ticket_orders').select('order_number').eq('id', tk.order_id).maybeSingle(),
    ]);

    const fullTicket: TicketDetail = {
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
    };

    setTicket(fullTicket);

    if (CACHE_KEY) {
      AsyncStorage.setItem(
        CACHE_KEY,
        JSON.stringify({ ...fullTicket, cached_at: Date.now() }),
      ).catch(() => {});
    }

    const { data: txHistory } = await supabase
      .from('ticket_transfers')
      .select('id, status, to_email, initiated_at, completed_at')
      .eq('ticket_id', ticketId)
      .order('initiated_at', { ascending: false })
      .limit(10);
    setTransferHistory((txHistory ?? []) as typeof transferHistory);

    setLoading(false);
  }, [ticketId, CACHE_KEY]);

  useEffect(() => { loadTicket(); }, [loadTicket]);

  // ── Maximum brightness + keep-awake while QR is on screen ─────────────────
  const ticketStatus = ticket?.status ?? null;
  const ticketCheckedInAt = ticket?.checked_in_at ?? null;
  useEffect(() => {
    if (!ticketStatus) return;
    const qrVisible =
      ticketStatus !== 'voided' &&
      ticketStatus !== 'refunded' &&
      ticketStatus !== 'cancelled' &&
      ticketStatus !== 'transferred_out' &&
      ticketCheckedInAt == null;
    if (!qrVisible) return;

    let originalBrightness: number | undefined;
    (async () => {
      try {
        originalBrightness = await Brightness.getBrightnessAsync();
        await Brightness.setBrightnessAsync(1.0);
      } catch {
        // expo-brightness may not be available on all platforms — fail silently
      }
      try {
        await KeepAwake.activateKeepAwakeAsync('ticket-qr');
      } catch {
        // expo-keep-awake may not be available on all platforms — fail silently
      }
    })();

    return () => {
      if (originalBrightness !== undefined) {
        Brightness.setBrightnessAsync(originalBrightness).catch(() => {});
      }
      KeepAwake.deactivateKeepAwake('ticket-qr');
    };
  }, [ticketStatus, ticketCheckedInAt]);

  // ── Apple Wallet callback — MUST be above all early returns (Rules of Hooks) ──
  // The canAddToWallet guard is inside the callback body, not around the hook call.
  const handleAddToWallet = useCallback(async () => {
    if (!ticket) return;
    setWalletLoading(true);
    setWalletError(null);
    try {
      const supabase = getSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setWalletError('Please sign in to add this ticket to Apple Wallet.');
        setWalletLoading(false);
        return;
      }
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
      const resp = await fetch(`${supabaseUrl}/functions/v1/generate-wallet-pass`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ticket_id: ticket.id }),
      });
      if (!resp.ok) {
        const errJson = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
        setWalletError((errJson as any).error ?? 'Failed to generate pass. Please try again.');
        setWalletLoading(false);
        return;
      }
      const passData = await resp.arrayBuffer();
      const bytes = new Uint8Array(passData);
      const fileName = `vybzhub-${ticket.id.slice(0, 8)}.pkpass`;
      // Write binary directly — no base64 conversion needed with the new File API
      const file = new File(Paths.cache, fileName);
      file.write(bytes);
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        setWalletError('Sharing is not available on this device.');
        setWalletLoading(false);
        return;
      }
      await Sharing.shareAsync(file.uri, {
        mimeType: 'application/vnd.apple.pkpass',
        dialogTitle: 'Add to Apple Wallet',
        UTI: 'com.apple.pkpass',
      });
    } catch (err) {
      console.error('[wallet] Error:', err);
      setWalletError('Something went wrong. Please try again.');
    } finally {
      setWalletLoading(false);
    }
  }, [ticket]);

  // ── Early returns after all hooks ─────────────────────────────────────────

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

  // ── Derived display flags ─────────────────────────────────────────────────
  const isValid = ticket?.status === 'valid';
  const isCheckedIn = ticket?.checked_in_at != null;
  const isVoided = ticket?.status === 'voided' || ticket?.status === 'refunded' || ticket?.status === 'cancelled';
  const isTransferred = ticket?.status === 'transferred_out';
  const canTransfer = isValid && !isCheckedIn && !isVoided && !isTransferred;
  const canRename = isValid && !isCheckedIn && !isVoided && !isTransferred;
  const canAddToWallet = Platform.OS === 'ios' && !isVoided && !isTransferred;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isEventPast = ticket?.event_date
    ? (() => { const [y, m, d] = ticket.event_date.split('-').map(Number); return new Date(y, m - 1, d) < today; })()
    : false;

  const handleTransferred = () => { loadTicket(); };

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

            {/* QR Code */}
            {!isVoided && !isTransferred && (
              <View style={styles.qrSection}>
                <View style={styles.qrTitleRow}>
                  <Text style={styles.qrTitle}>QR Code</Text>
                  {isOfflineCache && (
                    <View style={styles.offlineBadge}>
                      <MaterialIcons name="cloud-off" size={11} color="#FF9800" />
                      <Text style={styles.offlineBadgeText}>
                        {cacheTimestamp
                          ? `Offline · Cached ${formatCacheAge(cacheTimestamp)}`
                          : 'Offline – QR only'}
                      </Text>
                    </View>
                  )}
                </View>
                {isCheckedIn ? (
                  <View style={styles.checkedInQR}>
                    <View style={styles.checkedInBadge}>
                      <MaterialIcons name="verified" size={52} color={Colors.greenLight} />
                    </View>
                    <Text style={styles.checkedInLabel}>CHECKED IN</Text>
                    <Text style={styles.checkedInText}>Ticket Used — Entry Recorded</Text>
                    {ticket.checked_in_at ? (
                      <Text style={styles.checkedInTimestamp}>
                        {(() => {
                          try {
                            return new Date(ticket.checked_in_at).toLocaleString('en-JM', {
                              weekday: 'short', month: 'short', day: 'numeric',
                              hour: 'numeric', minute: '2-digit',
                            });
                          } catch {
                            return 'Checked in';
                          }
                        })()}
                      </Text>
                    ) : null}
                    <Text style={styles.checkedInSub}>
                      This ticket has been scanned at the event entrance.{' '}It is kept here as a permanent record of your admission.
                    </Text>
                  </View>
                ) : (
                  <View style={styles.qrWrapper}>
                    <Pressable
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                        setShowFullscreen(true);
                      }}
                      style={styles.qrExpandable}
                      hitSlop={4}
                    >
                      <SafeQRCode
                        value={ticket.secure_token}
                        size={220}
                        color="#0A0A0A"
                        backgroundColor="#F8F8F0"
                      />
                      <View style={styles.qrExpandHint}>
                        <MaterialIcons name="fullscreen" size={13} color={Colors.textMuted} />
                        <Text style={styles.qrExpandHintText}>Tap to expand</Text>
                      </View>
                    </Pressable>
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

                <Pressable
                  onPress={() => Linking.openURL(LEGAL_URLS.transferPolicy)}
                  style={({ pressed }) => [styles.transferPolicyLink, pressed && { opacity: 0.7 }]}
                  hitSlop={8}
                >
                  <MaterialIcons name="open-in-new" size={11} color={Colors.textMuted} />
                  <Text style={styles.transferPolicyLinkText}>Ticket Transfer Policy</Text>
                </Pressable>
              </View>
            )}

            {/* Apple Wallet */}
            {canAddToWallet && (
              <View style={styles.walletSection}>
                <Pressable
                  onPress={handleAddToWallet}
                  disabled={walletLoading}
                  style={({ pressed }) => [
                    styles.walletBtn,
                    pressed && !walletLoading && { opacity: 0.85 },
                    walletLoading && { opacity: 0.6 },
                  ]}
                >
                  {walletLoading ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <>
                      <MaterialIcons name="account-balance-wallet" size={20} color="#FFFFFF" />
                      <Text style={styles.walletBtnText}>Add to Apple Wallet</Text>
                    </>
                  )}
                </Pressable>
                {walletError ? (
                  <View style={styles.walletError}>
                    <MaterialIcons name="error-outline" size={13} color={Colors.error} />
                    <Text style={styles.walletErrorText}>{walletError}</Text>
                  </View>
                ) : null}
                {isCheckedIn ? (
                  <Text style={styles.walletNote}>
                    Pass will reflect checked-in state. Kept as a permanent admission record.
                  </Text>
                ) : null}
              </View>
            )}

            {/* Transfer History */}
            {transferHistory.length > 0 && (
              <View style={styles.actionsSection}>
                <Text style={styles.sectionTitle}>Transfer History</Text>
                <View style={styles.infoCard}>
                  {transferHistory.map((tx, i) => {
                    const statusColor =
                      tx.status === 'completed' ? Colors.greenLight
                      : tx.status === 'pending' || tx.status === 'invited' ? '#FF9800'
                      : Colors.textMuted;
                    const statusIcon =
                      tx.status === 'completed' ? 'check-circle'
                      : tx.status === 'pending' || tx.status === 'invited' ? 'hourglass-empty'
                      : 'cancel';
                    return (
                      <View key={tx.id}>
                        {i > 0 ? <View style={styles.infoDivider} /> : null}
                        <View style={styles.txHistoryRow}>
                          <MaterialIcons name={statusIcon as any} size={16} color={statusColor} />
                          <View style={{ flex: 1, gap: 2 }}>
                            <Text style={styles.txHistoryStatus}>
                              {tx.status === 'invited' ? 'Invite Sent' : tx.status.charAt(0).toUpperCase() + tx.status.slice(1)}
                            </Text>
                            {tx.to_email ? (
                              <Text style={styles.txHistoryMeta} numberOfLines={1}>
                                To: {tx.to_email}
                              </Text>
                            ) : null}
                            <Text style={styles.txHistoryDate}>
                              {new Date(tx.initiated_at).toLocaleDateString('en-JM', {
                                month: 'short', day: 'numeric', year: 'numeric',
                              })}
                              {tx.completed_at ? ` · Completed ${new Date(tx.completed_at).toLocaleTimeString('en-JM', { hour: '2-digit', minute: '2-digit' })}` : ''}
                            </Text>
                          </View>
                          <Text style={styles.txHistoryId}>
                            {tx.id.slice(0, 6).toUpperCase()}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
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
                      <Text style={styles.actionLabel}>Transfer Ticket</Text>
                      <Text style={styles.actionSub}>Send to any email</Text>
                    </Pressable>
                  )}
                </View>
                <Text style={styles.transferNote}>
                  Transfers: enter any email address. Non-users receive an invitation. QR rotates on acceptance.
                </Text>
              </View>
            )}
          </ScrollView>

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

          <Modal
            visible={showFullscreen}
            transparent={false}
            animationType="fade"
            onRequestClose={() => setShowFullscreen(false)}
            statusBarTranslucent
          >
            <SafeAreaView style={fsStyles.container} edges={['top', 'bottom']}>
              <View style={fsStyles.topBar}>
                <Pressable
                  onPress={() => setShowFullscreen(false)}
                  style={({ pressed }) => [fsStyles.closeBtn, pressed && { opacity: 0.7 }]}
                  hitSlop={12}
                >
                  <MaterialIcons name="close" size={24} color="#333" />
                </Pressable>
                <Text style={fsStyles.topBarTitle} numberOfLines={1}>
                  {ticket.event_title}
                </Text>
                <View style={{ width: 40 }} />
              </View>
              <View style={fsStyles.qrArea}>
                <SafeQRCode
                  value={ticket.secure_token}
                  size={Math.min(Dimensions.get('window').width - 64, 300)}
                  color="#0A0A0A"
                  backgroundColor="#F5F5EE"
                  quietZone={16}
                />
                <Text style={fsStyles.tierText}>{ticket.ticket_type_name}</Text>
                <Text style={fsStyles.attendeeText}>
                  {ticket.attendee_name || ticket.id.slice(0, 8).toUpperCase()}
                </Text>
                {isOfflineCache && cacheTimestamp ? (
                  <View style={fsStyles.offlineBadge}>
                    <MaterialIcons name="cloud-off" size={12} color="#FF9800" />
                    <Text style={fsStyles.offlineBadgeText}>
                      Offline · Cached {formatCacheAge(cacheTimestamp)}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text style={fsStyles.hint}>Present this screen at the event entrance</Text>
            </SafeAreaView>
          </Modal>
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
  qrTitleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    alignSelf: 'stretch',
  },
  qrTitle: {
    fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  offlineBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,152,0,0.1)', borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm, paddingVertical: 3,
    borderWidth: 1, borderColor: 'rgba(255,152,0,0.35)',
  },
  offlineBadgeText: { fontSize: 10, color: '#FF9800', fontWeight: Typography.semibold },
  qrWrapper: { alignItems: 'center', gap: Spacing.md },
  checkedInQR: { alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.lg },
  checkedInBadge: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: 'rgba(0,200,83,0.1)', alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: 'rgba(0,200,83,0.35)',
  },
  checkedInLabel: {
    fontSize: 22, fontWeight: Typography.black, color: Colors.greenLight,
    letterSpacing: 3, textAlign: 'center',
  },
  checkedInText: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.greenLight, textAlign: 'center' },
  checkedInTimestamp: {
    fontSize: Typography.sm, color: Colors.textSecondary, textAlign: 'center',
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  checkedInSub: { fontSize: Typography.xs, color: Colors.textMuted, textAlign: 'center', lineHeight: 18, maxWidth: 280 },
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
  transferPolicyLink: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    alignSelf: 'center', paddingVertical: 2,
  },
  transferPolicyLinkText: { fontSize: 11, color: Colors.textMuted, textDecorationLine: 'underline' },
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
  transferNote: { fontSize: Typography.xs, color: Colors.textMuted, lineHeight: 17, textAlign: 'center' },
  walletSection: { gap: Spacing.sm },
  walletBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, backgroundColor: '#000000',
    borderRadius: Radius.lg, paddingVertical: Spacing.base,
    borderWidth: 1, borderColor: '#333',
  },
  walletBtnText: { fontSize: Typography.md, fontWeight: Typography.bold, color: '#FFFFFF' },
  walletError: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 5,
    backgroundColor: 'rgba(255,68,68,0.08)', borderRadius: Radius.sm,
    padding: Spacing.sm, borderWidth: 1, borderColor: 'rgba(255,68,68,0.25)',
  },
  walletErrorText: { flex: 1, fontSize: Typography.xs, color: Colors.error, lineHeight: 16 },
  walletNote: { fontSize: Typography.xs, color: Colors.textMuted, textAlign: 'center', lineHeight: 17 },
  txHistoryRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    padding: Spacing.base,
  },
  txHistoryStatus: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textPrimary },
  txHistoryMeta: { fontSize: Typography.xs, color: Colors.textMuted },
  txHistoryDate: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 1 },
  txHistoryId: {
    fontSize: 10, color: Colors.textMuted, fontFamily: 'monospace',
    letterSpacing: 0.8, paddingTop: 2,
  },
  qrExpandable: { alignItems: 'center' },
  qrExpandHint: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: Spacing.xs },
  qrExpandHintText: { fontSize: Typography.xs, color: Colors.textMuted },
});

const fsStyles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: '#F5F5EE',
    alignItems: 'center', justifyContent: 'space-between',
  },
  topBar: {
    flexDirection: 'row', alignItems: 'center', width: '100%',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md, gap: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.08)',
  },
  closeBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.06)', alignItems: 'center', justifyContent: 'center',
  },
  topBarTitle: {
    flex: 1, fontSize: Typography.sm, fontWeight: Typography.semibold,
    color: '#333', textAlign: 'center',
  },
  qrArea: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    gap: Spacing.lg, paddingHorizontal: Spacing.xl,
  },
  tierText: { fontSize: Typography.base, fontWeight: Typography.bold, color: '#222', textAlign: 'center' },
  attendeeText: { fontSize: Typography.sm, color: '#555', textAlign: 'center' },
  offlineBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,152,0,0.12)', borderRadius: Radius.full,
    paddingHorizontal: Spacing.md, paddingVertical: 5,
    borderWidth: 1, borderColor: 'rgba(255,152,0,0.4)',
  },
  offlineBadgeText: { fontSize: Typography.xs, color: '#E65100', fontWeight: Typography.semibold },
  hint: { fontSize: Typography.xs, color: '#888', paddingBottom: Spacing.xl, textAlign: 'center' },
});
