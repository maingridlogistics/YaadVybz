// app/ticketing/scanner/[eventId].tsx
// Phase 4 — Staff QR ticket scanner.
// Only accessible to authorized event staff (scanner/manager roles).
// Camera permission is requested only when this screen is opened.
// All validation done server-side via checkin_ticket() RPC.
// TICKETING_ENABLED guard present — camera never requested in normal app flow.

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Linking,
  Platform,
  Vibration,
  ScrollView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import type { BarcodeType } from 'expo-camera';
import { getSupabaseClient } from '../../../lib/supabase';
import { Colors, Typography, Spacing, Radius } from '../../../constants/theme';
import { TICKETING_ENABLED } from '../../../constants/featureFlags';
import { useAuth } from '../../../hooks/useAuth';

// ─── Types ────────────────────────────────────────────────────────────────────

type ScanResult =
  | 'valid'
  | 'already_used'
  | 'invalid'
  | 'wrong_event'
  | 'voided'
  | 'cancelled'
  | 'refunded'
  | 'unauthorized'
  | 'error';

interface ScanResponse {
  // Normalized from raw RPC JSON — never store raw Supabase object in state.
  // checkin_ticket RPC returns uppercase result codes; we map them to lowercase
  // ScanResult values during normalization before any React state update.
  result: ScanResult;
  ok: boolean;
  message: string;              // RPC message or error field (exception branch has only error)
  attendee_name: string | null;
  checked_in_at: string | null; // ISO timestamp or null
  ticket_type_name: string | null; // Fetched separately from event_ticket_types by ticket_type_id
}

interface HistoryEntry {
  id: number;
  result: ScanResult;
  attendee_name: string | null;
  ticket_type_name: string | null;
  message: string;
  time: string; // HH:MM formatted
}

// ─── Result config ────────────────────────────────────────────────────────────

const RESULT_CONFIG: Record<ScanResult, {
  icon: string;
  label: string;
  sublabel: string;
  color: string;
  bg: string;
}> = {
  valid: {
    icon: 'check-circle',
    label: 'VALID',
    sublabel: 'Ticket accepted. Welcome!',
    color: Colors.greenLight,
    bg: 'rgba(0,200,83,0.15)',
  },
  already_used: {
    icon: 'warning',
    label: 'ALREADY USED',
    sublabel: 'This ticket was already scanned.',
    color: '#FF9800',
    bg: 'rgba(255,152,0,0.15)',
  },
  invalid: {
    icon: 'cancel',
    label: 'INVALID',
    sublabel: 'QR code not recognized.',
    color: Colors.error,
    bg: 'rgba(255,68,68,0.15)',
  },
  wrong_event: {
    icon: 'location-off',
    label: 'WRONG EVENT',
    sublabel: 'Ticket is for a different event.',
    color: '#FF9800',
    bg: 'rgba(255,152,0,0.15)',
  },
  voided: {
    icon: 'block',
    label: 'VOIDED',
    sublabel: 'This ticket has been voided.',
    color: Colors.error,
    bg: 'rgba(255,68,68,0.15)',
  },
  cancelled: {
    icon: 'block',
    label: 'CANCELLED',
    sublabel: 'This ticket has been cancelled.',
    color: Colors.error,
    bg: 'rgba(255,68,68,0.15)',
  },
  refunded: {
    icon: 'money-off',
    label: 'REFUNDED',
    sublabel: 'This ticket was refunded.',
    color: Colors.error,
    bg: 'rgba(255,68,68,0.15)',
  },
  unauthorized: {
    icon: 'lock',
    label: 'UNAUTHORIZED',
    sublabel: 'You are not authorized to scan for this event.',
    color: Colors.error,
    bg: 'rgba(255,68,68,0.15)',
  },
  error: {
    icon: 'error-outline',
    label: 'ERROR',
    sublabel: 'Could not validate ticket. Check connection.',
    color: Colors.textMuted,
    bg: Colors.surfaceElevated,
  },
};

// ─── Scan History Panel ───────────────────────────────────────────────────────

const HISTORY_RESULT_COLOR: Record<ScanResult, string> = {
  valid: Colors.greenLight,
  already_used: '#FF9800',
  invalid: Colors.error,
  wrong_event: '#FF9800',
  voided: Colors.error,
  cancelled: Colors.error,
  refunded: Colors.error,
  unauthorized: Colors.error,
  error: Colors.textMuted,
};

function ScanHistoryPanel({
  history,
  expanded,
  onToggle,
}: {
  history: HistoryEntry[];
  expanded: boolean;
  onToggle: () => void;
}) {
  if (history.length === 0) return null;

  return (
    <View style={historyStyles.wrapper}>
      <Pressable
        onPress={onToggle}
        style={({ pressed }) => [historyStyles.header, pressed && { opacity: 0.8 }]}
      >
        <MaterialIcons name="history" size={16} color={Colors.textMuted} />
        <Text style={historyStyles.headerText}>
          Recent Scans ({history.length})
        </Text>
        <MaterialIcons
          name={expanded ? 'expand-more' : 'chevron-right'}
          size={18}
          color={Colors.textMuted}
        />
      </Pressable>

      {expanded && (
        <ScrollView
          style={historyStyles.list}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {history.map((entry) => {
            const color = HISTORY_RESULT_COLOR[entry.result] ?? Colors.textMuted;
            return (
              <View key={entry.id} style={historyStyles.row}>
                <View style={[historyStyles.dot, { backgroundColor: color }]} />
                <View style={historyStyles.rowContent}>
                  <Text style={[historyStyles.rowResult, { color }]}>
                    {entry.result.replace(/_/g, ' ').toUpperCase()}
                  </Text>
                  {entry.attendee_name ? (
                    <Text style={historyStyles.rowName} numberOfLines={1}>
                      {entry.attendee_name}
                    </Text>
                  ) : null}
                  {entry.ticket_type_name ? (
                    <Text style={historyStyles.rowTier} numberOfLines={1}>
                      {entry.ticket_type_name}
                    </Text>
                  ) : null}
                </View>
                <Text style={historyStyles.rowTime}>{entry.time}</Text>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const historyStyles = StyleSheet.create({
  wrapper: {
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
  },
  headerText: {
    flex: 1,
    fontSize: Typography.xs,
    color: Colors.textMuted,
    fontWeight: Typography.medium,
    letterSpacing: 0.5,
  },
  list: {
    maxHeight: 180,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.07)',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  rowContent: {
    flex: 1,
    gap: 2,
  },
  rowResult: {
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    letterSpacing: 0.5,
  },
  rowName: {
    fontSize: Typography.xs,
    color: Colors.textSecondary,
  },
  rowTier: {
    fontSize: Typography.xs,
    color: Colors.gold,
  },
  rowTime: {
    fontSize: Typography.xs,
    color: Colors.textMuted,
    flexShrink: 0,
  },
});

// ─── Result overlay ───────────────────────────────────────────────────────────

function ResultOverlay({
  response,
  onDismiss,
  diagnosticMode,
}: {
  response: ScanResponse;
  onDismiss: () => void;
  diagnosticMode: boolean;
}) {
  // Defensive guard: RESULT_CONFIG is keyed by ScanResult. result is always
  // a normalized ScanResult value from RPC_RESULT_MAP (unknown codes → 'error').
  const config = RESULT_CONFIG[response.result] ?? RESULT_CONFIG['error'];

  return (
    <Pressable
      style={[overlayStyles.backdrop, { backgroundColor: config.bg }]}
      onPress={onDismiss}
    >
      <View style={[overlayStyles.card, { borderColor: `${config.color}55` }]}>
        {/* Diagnostic mode badge */}
        {diagnosticMode ? (
          <View style={overlayStyles.diagnosticBadge}>
            <Text style={overlayStyles.diagnosticText}>DIAGNOSTIC MODE — NO RPC SENT</Text>
          </View>
        ) : null}

        <MaterialIcons name={config.icon as any} size={64} color={config.color} />
        <Text style={[overlayStyles.label, { color: config.color }]}>{config.label}</Text>
        <Text style={overlayStyles.sublabel}>{config.sublabel}</Text>

        {/* Server message — shown when it adds useful info beyond sublabel */}
        {response.message ? (
          <View style={overlayStyles.messageRow}>
            <MaterialIcons name="info-outline" size={14} color={Colors.textMuted} />
            <Text style={overlayStyles.messageText} numberOfLines={3}>
              {response.message}
            </Text>
          </View>
        ) : null}

        {/* Ticket type tier */}
        {response.ticket_type_name ? (
          <View style={overlayStyles.tierRow}>
            <MaterialIcons name="confirmation-number" size={14} color={Colors.gold} />
            <Text style={overlayStyles.tierText}>{response.ticket_type_name}</Text>
          </View>
        ) : null}

        {/* Attendee name — shown on valid scan */}
        {(response.result === 'valid' || response.result === 'already_used') && response.attendee_name ? (
          <View style={overlayStyles.attendeeRow}>
            <MaterialIcons name="person" size={16} color={Colors.textMuted} />
            <Text style={overlayStyles.attendeeText}>{response.attendee_name}</Text>
          </View>
        ) : null}

        {/* Already-used timestamp */}
        {response.result === 'already_used' && response.checked_in_at ? (
          <View style={overlayStyles.attendeeRow}>
            <MaterialIcons name="access-time" size={14} color={Colors.textMuted} />
            <Text style={overlayStyles.attendeeText}>
              {(() => {
                try {
                  return `Scanned ${new Date(response.checked_in_at).toLocaleTimeString('en-JM', { hour: '2-digit', minute: '2-digit' })}`;
                } catch {
                  return 'Already scanned';
                }
              })()}
            </Text>
          </View>
        ) : null}

        <View style={overlayStyles.tapRow}>
          <MaterialIcons name="touch-app" size={14} color={Colors.textMuted} />
          <Text style={overlayStyles.tapText}>Tap anywhere to scan next</Text>
        </View>
      </View>
    </Pressable>
  );
}

const overlayStyles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    borderWidth: 2,
    padding: Spacing.xxl,
    alignItems: 'center',
    gap: Spacing.md,
    marginHorizontal: Spacing.xl,
    width: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 20,
  },
  diagnosticBadge: {
    backgroundColor: 'rgba(255,152,0,0.2)',
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: '#FF9800',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
  },
  diagnosticText: {
    fontSize: 9,
    fontWeight: Typography.bold,
    color: '#FF9800',
    letterSpacing: 1,
    textAlign: 'center',
  },
  label: {
    fontSize: 28,
    fontWeight: Typography.black,
    letterSpacing: 2,
    textAlign: 'center',
  },
  sublabel: {
    fontSize: Typography.base,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    alignSelf: 'stretch',
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md,
    padding: Spacing.sm,
  },
  messageText: {
    flex: 1,
    fontSize: Typography.sm,
    color: Colors.textMuted,
    lineHeight: 18,
  },
  tierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  tierText: {
    fontSize: Typography.sm,
    color: Colors.gold,
    fontWeight: Typography.semibold,
  },
  attendeeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  attendeeText: {
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
    color: Colors.textPrimary,
  },
  tapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  tapText: { fontSize: Typography.xs, color: Colors.textMuted },
});

// ─── Main Scanner Screen ──────────────────────────────────────────────────────

const MAX_HISTORY = 10;
let historyCounter = 0;

export default function ScannerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { eventId, title: rawTitle } = useLocalSearchParams<{ eventId: string; title?: string }>();
  const eventTitle = rawTitle ? decodeURIComponent(rawTitle) : 'Event Scanner';

  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResponse | null>(null);
  const [scanCount, setScanCount] = useState(0);
  const [torchOn, setTorchOn] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [scanHistory, setScanHistory] = useState<HistoryEntry[]>([]);

  // ── Diagnostic mode — triple-tap the scan counter to activate/deactivate ──
  // When active, the RPC is skipped and a local result is returned immediately.
  // Useful for isolating whether a crash occurs at the camera→JS bridge or
  // in the RPC processing / result rendering layer.
  const [diagnosticMode, setDiagnosticMode] = useState(false);
  const diagTapCount = useRef(0);
  const diagTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCounterTap = () => {
    diagTapCount.current += 1;
    if (diagTapTimer.current) clearTimeout(diagTapTimer.current);
    if (diagTapCount.current >= 3) {
      diagTapCount.current = 0;
      setDiagnosticMode((v) => {
        console.log('[scanner] diagnostic mode', !v ? 'ENABLED' : 'DISABLED');
        return !v;
      });
    } else {
      diagTapTimer.current = setTimeout(() => {
        diagTapCount.current = 0;
      }, 600);
    }
  };

  // Deferred mount: wait one frame after permission resolves before creating
  // the native CameraView. This breaks the iOS New Architecture race between
  // useCameraPermissions() TurboModule invocation and AVCaptureSession setup
  // that causes ObjCTurboModule::performVoidMethodInvocation to throw.
  const [cameraReady, setCameraReady] = useState(false);

  // ── Synchronous processing lock ────────────────────────────────────────────
  // MUST be a ref, NOT state. Expo Camera fires onBarcodeScanned continuously
  // while a QR is visible. React setState is async — by the time the re-render
  // reflects scanning=true, dozens of callbacks have already passed a
  // state-based guard. processingRef.current is written synchronously before
  // any async work begins, making it a true single-entry lock.
  const processingRef = useRef(false);

  // Cooldown: secondary time-based guard (ref-safe, not used as primary lock)
  const lastScanTime = useRef<number>(0);
  const COOLDOWN_MS = 2000;

  // Defer CameraView creation by one frame so the permission TurboModule call
  // completes before AVCaptureSession initialises (iOS New Arch race fix).
  useEffect(() => {
    if (permission?.granted) {
      const id = requestAnimationFrame(() => setCameraReady(true));
      return () => cancelAnimationFrame(id);
    }
  }, [permission?.granted]);

  // Cleanup diagnostic tap timer on unmount
  useEffect(() => {
    return () => {
      if (diagTapTimer.current) clearTimeout(diagTapTimer.current);
    };
  }, []);

  // ── Helper: append entry to session history ────────────────────────────────
  const appendHistory = useCallback((entry: Omit<HistoryEntry, 'id'>) => {
    historyCounter += 1;
    const full: HistoryEntry = { id: historyCounter, ...entry };
    setScanHistory((prev) => [full, ...prev].slice(0, MAX_HISTORY));
  }, []);

  // ── QR scan handler — defined unconditionally (Rules of Hooks) ────────────
  // NOTE: `scanning` is intentionally NOT in the dependency array.
  // Using `scanning` (React state) as a guard caused the original iOS SIGABRT —
  // stale closure means the guard never fires for concurrent callbacks.
  // processingRef replaces it as a synchronous single-entry lock.
  const handleBarCodeScanned = useCallback(async ({ data }: { data: string }) => {
    // ── Synchronous lock — must be FIRST, before any await ──────────────────
    if (processingRef.current) {
      console.log('[scanner] duplicate callback blocked by processingRef lock');
      return;
    }

    if (!TICKETING_ENABLED || !user) return;

    const now = Date.now();
    if (now - lastScanTime.current < COOLDOWN_MS) {
      console.log('[scanner] duplicate callback blocked by cooldown');
      return;
    }

    processingRef.current = true;
    lastScanTime.current = now;

    console.log('[scanner-debug] 01 callback entered');
    console.log('[scanner-debug] 02 data type', typeof data);
    console.log('[scanner-debug] 03 lock acquired');

    setScanning(true);
    setScanResult(null);

    // ── Parse raw QR data ──────────────────────────────────────────────────
    if (!data || typeof data !== 'string' || data.trim() === '') {
      if (Platform.OS === 'android') {
        Vibration.vibrate([0, 100, 100, 100]);
      } else {
        Vibration.vibrate(100);
      }
      const res: ScanResponse = {
        result: 'invalid',
        ok: false,
        message: 'Empty or unreadable QR code.',
        attendee_name: null,
        checked_in_at: null,
        ticket_type_name: null,
      };
      setScanResult(res);
      setScanning(false);
      appendHistory({ result: 'invalid', attendee_name: null, ticket_type_name: null, message: res.message, time: formatTime() });
      return;
    }

    let token = data.trim();
    try {
      const deepLinkMatch = token.match(/vybzhub:\/\/ticket\/([a-f0-9]{64})/i);
      if (deepLinkMatch?.[1]) token = deepLinkMatch[1];
    } catch {
      // regex match failure — treat as plain token
    }

    console.log('[scanner-debug] 04 token parsed');

    if (!/^[a-f0-9]{64}$/i.test(token)) {
      if (Platform.OS === 'android') {
        Vibration.vibrate([0, 100, 100, 100]);
      } else {
        Vibration.vibrate(100);
      }
      const res: ScanResponse = {
        result: 'invalid',
        ok: false,
        message: 'QR code format not recognized.',
        attendee_name: null,
        checked_in_at: null,
        ticket_type_name: null,
      };
      setScanResult(res);
      setScanning(false);
      appendHistory({ result: 'invalid', attendee_name: null, ticket_type_name: null, message: res.message, time: formatTime() });
      return;
    }

    // ── Diagnostic mode: skip RPC, show local result immediately ─────────
    if (diagnosticMode) {
      console.log('[scanner-debug] diagnostic mode — bypassing RPC');
      Vibration.vibrate(100);
      const res: ScanResponse = {
        result: 'invalid',
        ok: false,
        message: 'QR detected. Diagnostic mode active — RPC not called.',
        attendee_name: null,
        checked_in_at: null,
        ticket_type_name: null,
      };
      setScanResult(res);
      setScanning(false);
      appendHistory({ result: 'invalid', attendee_name: null, ticket_type_name: null, message: res.message, time: formatTime() });
      return;
    }

    // ── Supabase RPC ──────────────────────────────────────────────────────
    console.log('[scanner-debug] 05 before RPC');
    try {
      const supabase = getSupabaseClient();
      const { data: rpcResult, error: rpcErr } = await supabase.rpc('checkin_ticket', {
        p_secure_token: token,
        p_event_id: eventId ?? '',
        p_scanned_by: user.id,
        p_device_id: null,
      });

      console.log('[scanner-debug] 06 RPC returned — isArray:', Array.isArray(rpcResult), 'type:', typeof rpcResult, 'null:', rpcResult === null);

      if (rpcErr) {
        console.warn('[scanner] RPC error:', rpcErr.message);
        const res: ScanResponse = {
          result: 'error',
          ok: false,
          message: rpcErr.message,
          attendee_name: null,
          checked_in_at: null,
          ticket_type_name: null,
        };
        setScanResult(res);
        Vibration.vibrate(100);
        setScanning(false);
        appendHistory({ result: 'error', attendee_name: null, ticket_type_name: null, message: res.message, time: formatTime() });
        return;
      }

      // ── Normalize raw RPC response ────────────────────────────────────────
      const rawRow: unknown = Array.isArray(rpcResult)
        ? ((rpcResult as unknown[])[0] ?? null)
        : rpcResult;

      console.log('[scanner-debug] 07 row type:', typeof rawRow, 'null:', rawRow === null);

      if (rawRow === null || typeof rawRow !== 'object') {
        console.warn('[scanner] RPC returned unexpected shape — rawRow:', typeof rawRow);
        const res: ScanResponse = {
          result: 'error',
          ok: false,
          message: 'Unexpected response from server.',
          attendee_name: null,
          checked_in_at: null,
          ticket_type_name: null,
        };
        setScanResult(res);
        Vibration.vibrate(100);
        setScanning(false);
        appendHistory({ result: 'error', attendee_name: null, ticket_type_name: null, message: res.message, time: formatTime() });
        return;
      }

      const res = rawRow as Record<string, unknown>;

      // Map UPPERCASE RPC result codes → lowercase ScanResult keys.
      const RPC_RESULT_MAP: Record<string, ScanResult> = {
        VALID:        'valid',
        INVALID:      'invalid',
        WRONG_EVENT:  'wrong_event',
        VOID:         'voided',
        ALREADY_USED: 'already_used',
      };
      const rawResultCode = typeof res.result === 'string' ? res.result : '';
      const resultCode: ScanResult = RPC_RESULT_MAP[rawResultCode] ?? 'error';

      const messageStr: string =
        typeof res.message === 'string' ? res.message
        : typeof res.error === 'string' ? res.error
        : 'Scanner check-in complete.';

      const ticketTypeId = typeof res.ticket_type_id === 'string' ? res.ticket_type_id : null;

      const scanRes: ScanResponse = {
        result: resultCode,
        ok: res.ok === true,
        message: messageStr,
        attendee_name: typeof res.attendee_name === 'string' ? res.attendee_name : null,
        checked_in_at: typeof res.checked_in_at === 'string' ? res.checked_in_at : null,
        ticket_type_name: null, // populated below after lookup
      };

      console.log('[scanner-debug] 07 response normalized — result:', resultCode, 'ok:', scanRes.ok, 'ticket_type_id present:', !!ticketTypeId);

      // ── Fetch ticket type name ──────────────────────────────────────────
      // checkin_ticket returns ticket_type_id, not name. We do a quick
      // non-blocking lookup so the overlay can display the tier label.
      // This fetch happens in parallel with haptic + state update for speed;
      // we update state a second time if the lookup succeeds.
      if (ticketTypeId) {
        supabase
          .from('event_ticket_types')
          .select('name')
          .eq('id', ticketTypeId)
          .single()
          .then(({ data: tierData }) => {
            if (tierData && typeof tierData.name === 'string') {
              console.log('[scanner] ticket type name fetched:', tierData.name);
              setScanResult((prev) =>
                prev ? { ...prev, ticket_type_name: tierData.name } : prev,
              );
              setScanHistory((prev) =>
                prev.map((h, i) => (i === 0 ? { ...h, ticket_type_name: tierData.name } : h)),
              );
            }
          })
          .catch(() => {
            // Tier name is cosmetic — fail silently
          });
      }

      // ── Haptic feedback ────────────────────────────────────────────────
      console.log('[scanner-debug] haptic start');
      if (scanRes.result === 'valid') {
        Vibration.vibrate(200);
      } else {
        if (Platform.OS === 'android') {
          Vibration.vibrate([0, 100, 50, 100]);
        } else {
          Vibration.vibrate(100);
        }
      }

      // ── Result state update ────────────────────────────────────────────
      console.log('[scanner-debug] 08 before result state');
      setScanResult(scanRes);
      if (scanRes.result === 'valid') {
        setScanCount((c) => c + 1);
      }
      console.log('[scanner-debug] 09 result state complete');

      appendHistory({
        result: scanRes.result,
        attendee_name: scanRes.attendee_name,
        ticket_type_name: null, // updated by tier fetch above if successful
        message: scanRes.message,
        time: formatTime(),
      });
    } catch (err) {
      console.warn('[scanner] unexpected error in scan callback:', err);
      const res: ScanResponse = {
        result: 'error',
        ok: false,
        message: 'Network error. Check your connection.',
        attendee_name: null,
        checked_in_at: null,
        ticket_type_name: null,
      };
      setScanResult(res);
      Vibration.vibrate(100);
      appendHistory({ result: 'error', attendee_name: null, ticket_type_name: null, message: res.message, time: formatTime() });
    }

    setScanning(false);
    console.log('[scanner] complete — awaiting user dismiss');
  }, [eventId, user, diagnosticMode, appendHistory]);

  // ── Gate: TICKETING_ENABLED + feature flag ────────────────────────────────
  if (!TICKETING_ENABLED) {
    return (
      <View style={styles.container}>
        <SafeAreaView edges={['top']} />
        <View style={styles.centered}>
          <MaterialIcons name="construction" size={40} color={Colors.textMuted} />
          <Text style={styles.centeredTitle}>Coming Soon</Text>
          <Pressable onPress={() => router.back()} style={styles.backLink}>
            <Text style={styles.backLinkText}>Go Back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (!user) {
    router.replace('/auth' as any);
    return null;
  }

  if (!permission) {
    return (
      <View style={styles.container}>
        <SafeAreaView edges={['top']} />
        <View style={styles.centered}>
          <ActivityIndicator color={Colors.gold} size="large" />
          <Text style={styles.centeredSub}>Checking camera permission...</Text>
        </View>
      </View>
    );
  }

  if (!permission.granted) {
    const canAsk = permission.canAskAgain;
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
            <Text style={styles.headerTitle}>Ticket Scanner</Text>
          </View>
        </SafeAreaView>
        <View style={styles.centered}>
          <View style={styles.permissionIcon}>
            <MaterialIcons name="camera-alt" size={40} color={Colors.gold} />
          </View>
          <Text style={styles.centeredTitle}>Camera Access Required</Text>
          <Text style={styles.centeredSub}>
            Vybz Hub needs camera access to scan ticket QR codes for event entry.
          </Text>
          {canAsk ? (
            <Pressable
              onPress={requestPermission}
              style={({ pressed }) => [styles.permissionBtn, pressed && { opacity: 0.85 }]}
            >
              <MaterialIcons name="camera-alt" size={18} color={Colors.textOnGold} />
              <Text style={styles.permissionBtnText}>Allow Camera Access</Text>
            </Pressable>
          ) : (
            <>
              <Text style={styles.permanentDeniedText}>
                Camera permission was permanently denied. Open Settings to enable it.
              </Text>
              <Pressable
                onPress={() => Linking.openSettings()}
                style={({ pressed }) => [styles.permissionBtn, pressed && { opacity: 0.85 }]}
              >
                <MaterialIcons name="settings" size={18} color={Colors.textOnGold} />
                <Text style={styles.permissionBtnText}>Open Settings</Text>
              </Pressable>
            </>
          )}
          <Pressable onPress={() => router.back()} style={styles.backLink}>
            <Text style={styles.backLinkText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const handleDismiss = () => {
    setScanResult(null);
    setScanning(false);
    processingRef.current = false;
    lastScanTime.current = Date.now();
  };

  return (
    <View style={styles.container}>
      {/* Camera — only mounted after one rAF frame to avoid iOS New Arch race */}
      {cameraReady && (
        <CameraView
          style={StyleSheet.absoluteFillObject}
          facing="back"
          enableTorch={torchOn}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] as BarcodeType[] }}
          onBarcodeScanned={handleBarCodeScanned}
        />
      )}

      {/* Result overlay */}
      {scanResult ? (
        <ResultOverlay
          response={scanResult}
          onDismiss={handleDismiss}
          diagnosticMode={diagnosticMode}
        />
      ) : null}

      {/* Scanning indicator */}
      {scanning && !scanResult ? (
        <View style={styles.scanningIndicator}>
          <ActivityIndicator color={Colors.gold} size="small" />
          <Text style={styles.scanningText}>Validating...</Text>
        </View>
      ) : null}

      {/* Top bar */}
      <SafeAreaView edges={['top']} style={styles.topBar}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.topBarBtn, pressed && { opacity: 0.7 }]}
        >
          <MaterialIcons name="arrow-back" size={22} color="#FFF" />
        </Pressable>

        <View style={styles.topBarCenter}>
          <Text style={styles.topBarTitle} numberOfLines={1}>{eventTitle}</Text>
          {/* Triple-tap to toggle diagnostic mode */}
          <Pressable onPress={handleCounterTap} hitSlop={8}>
            <View style={styles.scanCountRow}>
              <MaterialIcons name="check-circle" size={12} color={diagnosticMode ? '#FF9800' : Colors.greenLight} />
              <Text style={[styles.scanCountText, diagnosticMode && { color: '#FF9800' }]}>
                {diagnosticMode ? 'DIAGNOSTIC' : `${scanCount} checked in this session`}
              </Text>
            </View>
          </Pressable>
        </View>

        <Pressable
          onPress={() => setTorchOn((v) => !v)}
          style={({ pressed }) => [styles.topBarBtn, torchOn && styles.topBarBtnActive, pressed && { opacity: 0.7 }]}
        >
          <MaterialIcons name={torchOn ? 'flashlight-on' : 'flashlight-off'} size={22} color="#FFF" />
        </Pressable>
      </SafeAreaView>

      {/* Viewfinder frame */}
      <View style={styles.viewfinderWrap} pointerEvents="none">
        <View style={styles.viewfinder}>
          <View style={[styles.corner, styles.cornerTL]} />
          <View style={[styles.corner, styles.cornerTR]} />
          <View style={[styles.corner, styles.cornerBL]} />
          <View style={[styles.corner, styles.cornerBR]} />
        </View>
        <Text style={styles.viewfinderHint}>
          {diagnosticMode ? 'DIAGNOSTIC — RPC BYPASSED' : 'Point camera at ticket QR code'}
        </Text>
      </View>

      {/* Bottom info bar + history */}
      <View style={[styles.bottomBar, { paddingBottom: Math.max(Spacing.xl, insets.bottom + Spacing.md) }]}>
        {/* Scan history */}
        <ScanHistoryPanel
          history={scanHistory}
          expanded={historyExpanded}
          onToggle={() => setHistoryExpanded((v) => !v)}
        />
        <View style={styles.bottomBarRow}>
          <View style={styles.bottomBarLive}>
            <View style={[styles.liveDot, diagnosticMode && { backgroundColor: '#FF9800' }]} />
            <Text style={[styles.liveText, diagnosticMode && { color: '#FF9800' }]}>
              {diagnosticMode ? 'DIAGNOSTIC MODE' : 'LIVE SCANNING'}
            </Text>
          </View>
          <Text style={styles.offlineHint}>Requires network connection</Text>
        </View>
      </View>
    </View>
  );
}

// ── Utility ───────────────────────────────────────────────────────────────────

function formatTime(): string {
  try {
    return new Date().toLocaleTimeString('en-JM', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '--:--';
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  centered: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    gap: Spacing.base, paddingHorizontal: Spacing.xl,
    backgroundColor: Colors.background,
  },
  centeredTitle: { fontSize: Typography.lg, fontWeight: Typography.black, color: Colors.textPrimary, textAlign: 'center' },
  centeredSub: { fontSize: Typography.base, color: Colors.textMuted, textAlign: 'center', lineHeight: 22 },
  backLink: { paddingVertical: Spacing.sm },
  backLinkText: { color: Colors.gold, fontSize: Typography.base, textDecorationLine: 'underline' },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
    backgroundColor: Colors.background,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: Typography.lg, fontWeight: Typography.black, color: Colors.textPrimary },

  permissionIcon: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: Colors.goldSurface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: `${Colors.gold}44`,
  },
  permissionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.gold, borderRadius: Radius.lg,
    paddingVertical: Spacing.base, paddingHorizontal: Spacing.xl,
  },
  permissionBtnText: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textOnGold },
  permanentDeniedText: {
    fontSize: Typography.sm, color: Colors.error, textAlign: 'center',
    lineHeight: 20, maxWidth: 280,
  },

  // Top camera bar
  topBar: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  topBarBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  topBarBtnActive: { backgroundColor: 'rgba(255,215,0,0.3)', borderColor: Colors.gold },
  topBarCenter: { flex: 1, alignItems: 'center', gap: 3 },
  topBarTitle: { fontSize: Typography.sm, fontWeight: Typography.bold, color: '#FFF', textAlign: 'center' },
  scanCountRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  scanCountText: { fontSize: Typography.xs, color: Colors.greenLight, fontWeight: Typography.medium },

  // Scanning indicator
  scanningIndicator: {
    position: 'absolute', top: '50%', left: '50%',
    transform: [{ translateX: -60 }, { translateY: -20 }],
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.75)', borderRadius: Radius.lg,
    paddingVertical: Spacing.sm, paddingHorizontal: Spacing.base,
    zIndex: 5,
  },
  scanningText: { fontSize: Typography.sm, color: Colors.gold, fontWeight: Typography.medium },

  // Viewfinder
  viewfinderWrap: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.xl,
  },
  viewfinder: {
    width: 260, height: 260,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 36, height: 36,
    borderColor: Colors.gold,
    borderWidth: 4,
  },
  cornerTL: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0 },
  cornerTR: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0 },
  cornerBL: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0 },
  cornerBR: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0 },
  viewfinderHint: {
    fontSize: Typography.sm, color: 'rgba(255,255,255,0.8)',
    textAlign: 'center', fontWeight: Typography.medium,
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
  },

  // Bottom bar
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingTop: Spacing.md,
    paddingHorizontal: Spacing.base,
  },
  bottomBarRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: Spacing.sm,
  },
  bottomBarLive: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  liveDot: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.greenLight,
  },
  liveText: { fontSize: Typography.xs, color: Colors.greenLight, fontWeight: Typography.bold, letterSpacing: 1 },
  offlineHint: { fontSize: Typography.xs, color: 'rgba(255,255,255,0.5)' },
});
