// app/claim-ticket.tsx
// Claim route for ticket transfer invitations sent to non-registered users.
//
// Flow:
//   1. User receives an invitation email with URL:
//      vybzhub.com/claim-ticket?transfer=<transfer_id>
//   2. App opens this route (deep link or web)
//   3. If not logged in → redirect to auth with returnTo preserving transfer_id
//   4. If logged in → call claim_ticket_transfer RPC:
//      - Server verifies authenticated email === recipient_email_normalized
//      - Updates transfer: to_user_id = auth.uid(), status = 'pending'
//   5. Transfer appears in "Pending Transfers" → user accepts → token rotates

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../hooks/useAuth';
import { getSupabaseClient } from '../lib/supabase';
import { Colors, Typography, Spacing, Radius } from '../constants/theme';

export default function ClaimTicketScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, loading: authLoading } = useAuth();
  const { transfer } = useLocalSearchParams<{ transfer: string }>();

  const [claimState, setClaimState] = useState<'idle' | 'claiming' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [transferInfo, setTransferInfo] = useState<{
    event_title: string;
    ticket_type_name: string;
    sender_name: string;
    claim_expires_at: string | null;
  } | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(false);

  // Load transfer details (preview only — no auth needed for basic info)
  const loadTransferInfo = useCallback(async () => {
    if (!transfer) return;
    setLoadingInfo(true);
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('ticket_transfers')
        .select(`
          status,
          claim_expires_at,
          ticket_id,
          from_user_id
        `)
        .eq('id', transfer)
        .eq('status', 'invited')
        .maybeSingle();

      if (error || !data) {
        setTransferInfo(null);
        return;
      }

      // Load related info
      const [ticketRes, senderRes] = await Promise.all([
        supabase
          .from('tickets')
          .select('event_id, ticket_type_id')
          .eq('id', (data as any).ticket_id)
          .maybeSingle(),
        supabase
          .from('user_profiles')
          .select('name')
          .eq('id', (data as any).from_user_id)
          .maybeSingle(),
      ]);

      let eventTitle = 'an event';
      let ticketTypeName = 'Ticket';

      if (ticketRes.data) {
        const [evRes, ttRes] = await Promise.all([
          supabase.from('events').select('title').eq('id', (ticketRes.data as any).event_id).maybeSingle(),
          supabase.from('event_ticket_types').select('name').eq('id', (ticketRes.data as any).ticket_type_id).maybeSingle(),
        ]);
        eventTitle     = (evRes.data as any)?.title ?? 'an event';
        ticketTypeName = (ttRes.data as any)?.name  ?? 'Ticket';
      }

      setTransferInfo({
        event_title:       eventTitle,
        ticket_type_name:  ticketTypeName,
        sender_name:       (senderRes.data as any)?.name ?? 'Someone',
        claim_expires_at:  (data as any).claim_expires_at,
      });
    } catch {
      setTransferInfo(null);
    }
    setLoadingInfo(false);
  }, [transfer]);

  useEffect(() => { loadTransferInfo(); }, [loadTransferInfo]);

  // Claim the transfer once authenticated
  const handleClaim = useCallback(async () => {
    if (!user || !transfer) return;
    setClaimState('claiming');
    setErrorMsg(null);

    const supabase = getSupabaseClient();
    const { data, error } = await supabase.rpc('claim_ticket_transfer', {
      p_transfer_id: transfer,
      p_claimer_id: user.id,
    });

    if (error) {
      setClaimState('error');
      setErrorMsg(error.message ?? 'Failed to claim transfer. Please try again.');
      return;
    }

    const result = data as Record<string, unknown>;
    if (!result?.ok) {
      setClaimState('error');
      setErrorMsg((result?.error as string) ?? 'This transfer could not be claimed.');
      return;
    }

    setClaimState('success');
  }, [user, transfer]);

  // Auto-claim once auth is ready and we have a valid transfer
  useEffect(() => {
    if (!authLoading && user && claimState === 'idle' && transfer) {
      handleClaim();
    }
  }, [authLoading, user, claimState, transfer, handleClaim]);

  // Not logged in — redirect to auth with returnTo
  const handleSignIn = () => {
    router.push(`/auth?returnTo=${encodeURIComponent(`/claim-ticket?transfer=${transfer ?? ''}`)}` as any);
  };

  const isExpired = transferInfo?.claim_expires_at
    ? new Date(transferInfo.claim_expires_at) < new Date()
    : false;

  if (!transfer) {
    return (
      <View style={styles.container}>
        <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }} />
        <View style={styles.centered}>
          <MaterialIcons name="link-off" size={48} color={Colors.textMuted} />
          <Text style={styles.title}>Invalid Link</Text>
          <Text style={styles.sub}>This transfer link is missing or invalid.</Text>
          <Pressable onPress={() => router.replace('/(tabs)/' as any)} style={styles.btn}>
            <Text style={styles.btnText}>Go to Home</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/' as any)}
            style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
          >
            <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>Claim Ticket</Text>
        </View>
      </SafeAreaView>

      <View style={[styles.centered, { paddingBottom: Math.max(Spacing.xxl, insets.bottom + Spacing.xl) }]}>

        {/* Loading transfer info */}
        {loadingInfo && (
          <View style={styles.card}>
            <ActivityIndicator color={Colors.gold} />
            <Text style={styles.sub}>Loading transfer details...</Text>
          </View>
        )}

        {/* Transfer preview card */}
        {!loadingInfo && transferInfo && claimState === 'idle' && (
          <View style={styles.card}>
            <View style={styles.iconWrap}>
              <MaterialIcons name="confirmation-number" size={36} color={Colors.gold} />
            </View>
            <Text style={styles.title}>
              <Text style={{ color: Colors.gold }}>{transferInfo.sender_name}</Text>
              {' '}sent you a ticket!
            </Text>
            <View style={styles.eventCard}>
              <Text style={styles.eventTitle}>{transferInfo.event_title}</Text>
              <Text style={styles.eventMeta}>🎟 {transferInfo.ticket_type_name}</Text>
              {transferInfo.claim_expires_at && (
                <Text style={[styles.eventMeta, isExpired && { color: Colors.error }]}>
                  {isExpired ? '⚠️ This invitation has expired' : `⏰ Expires ${new Date(transferInfo.claim_expires_at).toLocaleDateString('en-JM', { month: 'short', day: 'numeric', year: 'numeric' })}`}
                </Text>
              )}
            </View>
            {!isExpired && <Text style={styles.sub}>No payment required. Sign in to claim your free ticket.</Text>}
          </View>
        )}

        {/* Not logged in — prompt sign in */}
        {!authLoading && !user && !loadingInfo && (
          <Pressable
            onPress={handleSignIn}
            style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.85 }]}
          >
            <LinearGradient
              colors={[Colors.gold, Colors.goldDim]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.primaryBtnInner}
            >
              <MaterialIcons name="login" size={18} color={Colors.textOnGold} />
              <Text style={styles.primaryBtnText}>Sign In to Claim Ticket</Text>
            </LinearGradient>
          </Pressable>
        )}

        {/* Auth loading */}
        {authLoading && (
          <View style={styles.stateBlock}>
            <ActivityIndicator color={Colors.gold} size="large" />
            <Text style={styles.sub}>Verifying your account...</Text>
          </View>
        )}

        {/* Claiming in progress */}
        {claimState === 'claiming' && (
          <View style={styles.stateBlock}>
            <ActivityIndicator color={Colors.gold} size="large" />
            <Text style={styles.sub}>Verifying your email and claiming ticket...</Text>
          </View>
        )}

        {/* Success */}
        {claimState === 'success' && (
          <View style={styles.card}>
            <View style={[styles.iconWrap, { backgroundColor: `${Colors.greenLight}15`, borderColor: `${Colors.greenLight}44` }]}>
              <MaterialIcons name="check-circle" size={40} color={Colors.greenLight} />
            </View>
            <Text style={[styles.title, { color: Colors.greenLight }]}>Ticket Claimed!</Text>
            <Text style={styles.sub}>
              The ticket has been added to your Pending Transfers. Go to My Tickets and accept it to add it to your wallet.
            </Text>
            <Pressable
              onPress={() => router.replace('/my-tickets' as any)}
              style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.85 }, { marginTop: Spacing.md }]}
            >
              <LinearGradient
                colors={[Colors.gold, Colors.goldDim]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.primaryBtnInner}
              >
                <MaterialIcons name="confirmation-number" size={18} color={Colors.textOnGold} />
                <Text style={styles.primaryBtnText}>View My Tickets</Text>
              </LinearGradient>
            </Pressable>
          </View>
        )}

        {/* Error */}
        {claimState === 'error' && (
          <View style={styles.card}>
            <View style={[styles.iconWrap, { backgroundColor: 'rgba(255,68,68,0.1)', borderColor: 'rgba(255,68,68,0.3)' }]}>
              <MaterialIcons name="error-outline" size={40} color={Colors.error} />
            </View>
            <Text style={[styles.title, { color: Colors.error }]}>Could Not Claim</Text>
            <Text style={styles.sub}>{errorMsg ?? 'This transfer could not be claimed. It may have expired or already been claimed.'}</Text>
            <View style={styles.actionRow}>
              <Pressable
                onPress={() => router.replace('/(tabs)/' as any)}
                style={({ pressed }) => [styles.secondaryBtn, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.secondaryBtnText}>Go to Home</Text>
              </Pressable>
              <Pressable
                onPress={() => { setClaimState('idle'); setErrorMsg(null); handleClaim(); }}
                style={({ pressed }) => [styles.primaryBtn, { flex: 1 }, pressed && { opacity: 0.85 }]}
              >
                <LinearGradient colors={[Colors.gold, Colors.goldDim]} style={styles.primaryBtnInner}>
                  <Text style={styles.primaryBtnText}>Retry</Text>
                </LinearGradient>
              </Pressable>
            </View>
          </View>
        )}

        {/* No transfer found / expired */}
        {!loadingInfo && !transferInfo && claimState === 'idle' && (
          <View style={styles.card}>
            <View style={[styles.iconWrap, { backgroundColor: Colors.surfaceElevated, borderColor: Colors.surfaceBorder }]}>
              <MaterialIcons name="link-off" size={40} color={Colors.textMuted} />
            </View>
            <Text style={styles.title}>Invitation Not Found</Text>
            <Text style={styles.sub}>
              This transfer invitation may have expired, already been claimed, or cancelled by the sender.
            </Text>
            <Pressable
              onPress={() => router.replace('/(tabs)/' as any)}
              style={({ pressed }) => [styles.secondaryBtn, { alignSelf: 'stretch', marginTop: Spacing.sm }, pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.secondaryBtnText}>Browse Events</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
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

  centered: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: Spacing.xl, gap: Spacing.lg,
  },
  card: {
    width: '100%', backgroundColor: Colors.surface, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
    padding: Spacing.xl, alignItems: 'center', gap: Spacing.base,
  },
  iconWrap: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: Colors.goldSurface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: `${Colors.gold}44`,
  },
  title: {
    fontSize: Typography.xl, fontWeight: Typography.black,
    color: Colors.textPrimary, textAlign: 'center',
  },
  sub: {
    fontSize: Typography.base, color: Colors.textMuted,
    textAlign: 'center', lineHeight: 22,
  },
  eventCard: {
    width: '100%', backgroundColor: Colors.surfaceElevated, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
    padding: Spacing.base, gap: Spacing.xs,
  },
  eventTitle: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textPrimary },
  eventMeta: { fontSize: Typography.sm, color: Colors.textMuted },

  stateBlock: { alignItems: 'center', gap: Spacing.base },

  primaryBtn: { width: '100%', borderRadius: Radius.lg, overflow: 'hidden' },
  primaryBtnInner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, paddingVertical: Spacing.base,
  },
  primaryBtnText: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textOnGold },

  secondaryBtn: {
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.xl,
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.surfaceBorder, alignItems: 'center',
  },
  secondaryBtnText: { fontSize: Typography.base, color: Colors.textSecondary, fontWeight: Typography.semibold },

  actionRow: { flexDirection: 'row', gap: Spacing.md, width: '100%', alignItems: 'center' },

  btn: {
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md,
    backgroundColor: Colors.goldSurface, borderRadius: Radius.full,
    borderWidth: 1, borderColor: `${Colors.gold}44`,
  },
  btnText: { color: Colors.gold, fontWeight: Typography.semibold, fontSize: Typography.sm },
});
