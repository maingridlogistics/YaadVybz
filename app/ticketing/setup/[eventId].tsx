
// app/ticketing/setup/[eventId].tsx
// Phase 2 — Promoter: Enable/configure ticketing for a specific event.
// Gated by TICKETING_ENABLED flag. Allows currency selection, sales status,
// and optional sales window. Currency is locked after first paid order.

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Switch,
  Modal,
  Animated,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../../hooks/useAuth';
import { useTicketSettings } from '../../../hooks/useTicketing';
import { Colors, Typography, Spacing, Radius } from '../../../constants/theme';
import {
  SALES_STATUS_CONFIG,
  type TicketCurrency,
  type TicketSalesStatus,
  hasAcceptedTicketingTerms,
  acceptTicketingTerms,
  TICKETING_TERMS_CONTENT,
  TICKETING_TERMS_VERSION,
} from '../../../services/ticketingService';
import { TICKETING_ENABLED } from '../../../constants/featureFlags';
import { LEGAL_URLS } from '../../../constants/legalUrls';

const CURRENCIES: { value: TicketCurrency; label: string; flag: string; note: string }[] = [
  { value: 'USD', label: 'US Dollar', flag: '🇺🇸', note: 'USD' },
  { value: 'JMD', label: 'Jamaican Dollar', flag: '🇯🇲', note: 'JMD' },
];

const SALES_STATUSES: TicketSalesStatus[] = ['draft', 'on_sale', 'paused', 'ended'];

export default function TicketSetupScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const { user } = useAuth();
  const { settings, loading, saving, error, load, save } = useTicketSettings(eventId ?? '');

  // Local form state — mirrors settings
  const [enabled, setEnabled] = useState(false);
  const [currency, setCurrency] = useState<TicketCurrency>('USD');
  const [salesStatus, setSalesStatus] = useState<TicketSalesStatus>('draft');
  const [showCurrencyModal, setShowCurrencyModal] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Terms acceptance state
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsLoading, setTermsLoading] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [acceptingTerms, setAcceptingTerms] = useState(false);

  // Toast
  const [toastMsg, setToastMsg] = useState('');
  const toastOpacity = useRef(new Animated.Value(0)).current;

  const triggerToast = (msg: string, isError = false) => {
    setToastMsg(msg);
    Animated.sequence([
      Animated.timing(toastOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.delay(2600),
      Animated.timing(toastOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();
  };

  useEffect(() => {
    if (eventId) load();
  }, [eventId, load]);

  // Load terms acceptance status
  useEffect(() => {
    const uid = user?.id;
    if (!uid) return;
    setTermsLoading(true);
    hasAcceptedTicketingTerms(uid).then(({ accepted }) => {
      setTermsAccepted(accepted);
      setTermsLoading(false);
    });
  }, [user?.id]);

  // Sync local state when settings load
  useEffect(() => {
    if (settings) {
      setEnabled(settings.enabled);
      setCurrency(settings.currency);
      setSalesStatus(settings.sales_status);
      setDirty(false);
    }
  }, [settings]);

  if (!TICKETING_ENABLED) {
    return (
      <View style={styles.container}>
        <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }} />
        <View style={styles.flaggedState}>
          <MaterialIcons name="construction" size={40} color={Colors.textMuted} />
          <Text style={styles.flaggedTitle}>Coming Soon</Text>
          <Text style={styles.flaggedSub}>In-app ticketing is under development.</Text>
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

  const handleSave = async () => {
    // Require terms acceptance before enabling ticketing
    if (enabled && !termsAccepted) {
      setShowTermsModal(true);
      return;
    }
    const ok = await save({ enabled, currency, sales_status: salesStatus });
    if (ok) {
      setDirty(false);
      triggerToast('Ticket settings saved');
    } else {
      triggerToast(error ?? 'Failed to save', true);
    }
  };

  const handleAcceptTerms = async () => {
    if (!user) return;
    setAcceptingTerms(true);
    const { error: err } = await acceptTicketingTerms(user.id);
    if (!err) {
      setTermsAccepted(true);
      setShowTermsModal(false);
      // Proceed with save after acceptance
      const ok = await save({ enabled, currency, sales_status: salesStatus });
      if (ok) {
        setDirty(false);
        triggerToast('Terms accepted — ticket settings saved');
      }
    }
    setAcceptingTerms(false);
  };

  const handleToggleEnabled = (val: boolean) => {
    setEnabled(val);
    setDirty(true);
  };

  const handleCurrencySelect = (val: TicketCurrency) => {
    setCurrency(val);
    setShowCurrencyModal(false);
    setDirty(true);
  };

  const handleStatusSelect = (val: TicketSalesStatus) => {
    setSalesStatus(val);
    setShowStatusModal(false);
    setDirty(true);
  };

  const currentCurrency = CURRENCIES.find((c) => c.value === currency);
  const currentStatus = SALES_STATUS_CONFIG[salesStatus];
  const isCurrencyLocked = settings?.currency_locked ?? false;

  return (
    <View style={styles.container}>
      {/* Toast */}
      <Animated.View
        style={[styles.toast, { opacity: toastOpacity, top: insets.top + Spacing.md }]}
        pointerEvents="none"
      >
        <MaterialIcons name="check-circle" size={16} color={Colors.textOnGold} />
        <Text style={styles.toastText}>{toastMsg}</Text>
      </Animated.View>

      {/* Header */}
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
          >
            <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Ticket Settings</Text>
            <Text style={styles.headerSub}>Configure ticketing for this event</Text>
          </View>
          {/* Tiers shortcut */}
          <Pressable
            onPress={() => router.push(`/ticketing/tiers/${eventId}` as any)}
            style={({ pressed }) => [styles.tiersBtn, pressed && { opacity: 0.8 }]}
          >
            <MaterialIcons name="confirmation-number" size={16} color={Colors.gold} />
            <Text style={styles.tiersBtnText}>Tiers</Text>
          </Pressable>
        </View>
      </SafeAreaView>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={Colors.gold} size="large" />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(Spacing.xxl * 2, insets.bottom + Spacing.xxl) },
          ]}
        >
          {/* Enable section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Enable Ticketing</Text>
            <View style={styles.card}>
              <View style={styles.toggleRow}>
                <View style={{ flex: 1, gap: Spacing.xs }}>
                  <Text style={styles.toggleLabel}>In-App Ticket Sales</Text>
                  <Text style={styles.toggleSub}>
                    Allow customers to purchase tickets directly through Vybz Hub
                  </Text>
                </View>
                <Switch
                  value={enabled}
                  onValueChange={handleToggleEnabled}
                  trackColor={{ false: Colors.surfaceBorder, true: Colors.gold }}
                  thumbColor={enabled ? Colors.textOnGold : Colors.textMuted}
                />
              </View>
              {enabled && salesStatus === 'draft' && (
                <View style={styles.infoRow}>
                  <MaterialIcons name="info-outline" size={14} color={Colors.gold} />
                  <Text style={styles.infoText}>
                    {`Ticketing is enabled but sales are in Draft. Set status to "On Sale" and add ticket tiers to begin selling.`}
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Currency section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Currency</Text>
            <View style={styles.card}>
              <Pressable
                onPress={() => !isCurrencyLocked && setShowCurrencyModal(true)}
                style={({ pressed }) => [
                  styles.selectRow,
                  pressed && !isCurrencyLocked && { opacity: 0.75 },
                  isCurrencyLocked && styles.selectRowLocked,
                ]}
              >
                <View style={styles.selectLeft}>
                  <Text style={styles.currencyFlag}>{currentCurrency?.flag}</Text>
                  <View>
                    <Text style={styles.selectValue}>{currentCurrency?.label}</Text>
                    <Text style={styles.selectNote}>{currentCurrency?.note}</Text>
                  </View>
                </View>
                {isCurrencyLocked ? (
                  <View style={styles.lockedBadge}>
                    <MaterialIcons name="lock" size={12} color={Colors.textMuted} />
                    <Text style={styles.lockedText}>Locked</Text>
                  </View>
                ) : (
                  <MaterialIcons name="chevron-right" size={20} color={Colors.textMuted} />
                )}
              </Pressable>
              {isCurrencyLocked && (
                <View style={styles.infoRow}>
                  <MaterialIcons name="lock" size={14} color={Colors.textMuted} />
                  <Text style={styles.infoText}>
                    Currency is locked after the first paid ticket order.
                  </Text>
                </View>
              )}
              {!isCurrencyLocked && (
                <View style={styles.infoRow}>
                  <MaterialIcons name="info-outline" size={14} color={Colors.textMuted} />
                  <Text style={styles.infoText}>
                    Currency cannot be changed after the first paid order. All ticket tiers must use the same currency.
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Sales Status section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Sales Status</Text>
            <View style={styles.card}>
              <Pressable
                onPress={() => setShowStatusModal(true)}
                style={({ pressed }) => [styles.selectRow, pressed && { opacity: 0.75 }]}
              >
                <View style={styles.selectLeft}>
                  <View style={[styles.statusDot, { backgroundColor: currentStatus.color }]} />
                  <View>
                    <Text style={[styles.selectValue, { color: currentStatus.color }]}>
                      {currentStatus.label}
                    </Text>
                    <Text style={styles.selectNote}>{currentStatus.description}</Text>
                  </View>
                </View>
                <MaterialIcons name="chevron-right" size={20} color={Colors.textMuted} />
              </Pressable>
            </View>
          </View>

          {/* Staff Management shortcut */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Event Staff</Text>
            <Pressable
              onPress={() => router.push(`/ticketing/staff/${eventId}` as any)}
              style={({ pressed }) => [styles.card, styles.tiersCard, pressed && { opacity: 0.8 }]}
            >
              <View style={styles.tiersCardLeft}>
                <View style={[styles.tiersIconWrap, { backgroundColor: 'rgba(0,188,212,0.12)' }]}>
                  <MaterialIcons name="people" size={24} color="#00BCD4" />
                </View>
                <View>
                  <Text style={styles.tiersCardTitle}>Manage Staff</Text>
                  <Text style={styles.tiersCardSub}>Add scanners, door sales staff, and managers</Text>
                </View>
              </View>
              <MaterialIcons name="chevron-right" size={22} color={Colors.textMuted} />
            </Pressable>
          </View>

          {/* Payout account notice */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Payout Account</Text>
            <View style={styles.card}>
              <View style={styles.selectRow}>
                <View style={styles.selectLeft}>
                  <MaterialIcons name="account-balance" size={22} color={Colors.textMuted} />
                  <View>
                    <Text style={styles.selectValue}>External Setup Required</Text>
                    <Text style={styles.selectNote}>
                      {currency === 'JMD'
                        ? 'JMD payout via bank transfer — configuration required in Vybz Hub dashboard.'
                        : 'USD payout via wire transfer or ACH — configuration required in Vybz Hub dashboard.'}
                    </Text>
                  </View>
                </View>
              </View>
              <View style={styles.infoRow}>
                <MaterialIcons name="info-outline" size={14} color={Colors.textMuted} />
                <Text style={styles.infoText}>
                  Ticket currency must match your configured payout account currency. Contact support to set up your payout account before enabling ticket sales.
                </Text>
              </View>
            </View>
          </View>

          {/* Major event edit protection notice */}
          <View style={styles.section}>
            <View style={styles.card}>
              <View style={[styles.infoRow, { paddingTop: Spacing.base, paddingBottom: 0 }]}>
                <MaterialIcons name="warning-amber" size={14} color="#FF9800" />
                <Text style={[styles.infoText, { color: '#FF9800' }]}>
                  Once paid ticket orders exist, material changes to event date, venue, or location will require admin review and may trigger customer notifications.
                </Text>
              </View>
              <View style={styles.infoRow}>
                <MaterialIcons name="info-outline" size={14} color={Colors.textMuted} />
                <Text style={styles.infoText}>
                  Events with paid ticket sales cannot be deleted. Use the cancellation request flow if you need to cancel the event.
                </Text>
              </View>
            </View>
          </View>

          {/* Terms acceptance status */}
          {!termsLoading && (
            <View style={styles.section}>
              <Pressable
                onPress={() => !termsAccepted && setShowTermsModal(true)}
                style={({ pressed }) => [
                  styles.card,
                  { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.base },
                  pressed && !termsAccepted && { opacity: 0.8 },
                ]}
              >
                <MaterialIcons
                  name={termsAccepted ? 'check-circle' : 'gavel'}
                  size={22}
                  color={termsAccepted ? Colors.greenLight : Colors.textMuted}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.tiersCardTitle}>
                    {termsAccepted ? 'Terms Accepted' : 'Review Ticketing Terms'}
                  </Text>
                  <Text style={styles.tiersCardSub}>
                    {termsAccepted
                      ? `Version ${TICKETING_TERMS_VERSION} — accepted`
                      : 'Required before enabling paid ticket sales'}
                  </Text>
                </View>
                {!termsAccepted && (
                  <MaterialIcons name="chevron-right" size={22} color={Colors.textMuted} />
                )}
              </Pressable>
            </View>
          )}

          {/* Tiers shortcut card */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Ticket Tiers</Text>
            <Pressable
              onPress={() => router.push(`/ticketing/tiers/${eventId}` as any)}
              style={({ pressed }) => [styles.card, styles.tiersCard, pressed && { opacity: 0.8 }]}
            >
              <View style={styles.tiersCardLeft}>
                <View style={styles.tiersIconWrap}>
                  <MaterialIcons name="confirmation-number" size={24} color={Colors.gold} />
                </View>
                <View>
                  <Text style={styles.tiersCardTitle}>Manage Ticket Tiers</Text>
                  <Text style={styles.tiersCardSub}>
                    Add up to 5 ticket types (Early Bird, VIP, General, etc.)
                  </Text>
                </View>
              </View>
              <MaterialIcons name="chevron-right" size={22} color={Colors.textMuted} />
            </Pressable>
          </View>

          {/* Dashboard shortcut */}
          <View style={styles.section}>
            <Pressable
              onPress={() => router.push(`/ticketing/dashboard/${eventId}` as any)}
              style={({ pressed }) => [styles.card, styles.tiersCard, pressed && { opacity: 0.8 }]}
            >
              <View style={styles.tiersCardLeft}>
                <View style={[styles.tiersIconWrap, { backgroundColor: 'rgba(33,150,243,0.12)' }]}>
                  <MaterialIcons name="bar-chart" size={24} color={Colors.info} />
                </View>
                <View>
                  <Text style={styles.tiersCardTitle}>Sales Dashboard</Text>
                  <Text style={styles.tiersCardSub}>View ticket sales and attendee list</Text>
                </View>
              </View>
              <MaterialIcons name="chevron-right" size={22} color={Colors.textMuted} />
            </Pressable>
          </View>

          {/* Finance & Payouts */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Finance & Payouts</Text>
            <Pressable
              onPress={() => router.push(`/ticketing/finance/${eventId}` as any)}
              style={({ pressed }) => [styles.card, styles.tiersCard, pressed && { opacity: 0.8 }]}
            >
              <View style={styles.tiersCardLeft}>
                <View style={[styles.tiersIconWrap, { backgroundColor: 'rgba(76,175,80,0.12)' }]}>
                  <MaterialIcons name="account-balance-wallet" size={24} color={Colors.greenLight} />
                </View>
                <View>
                  <Text style={styles.tiersCardTitle}>Finance & Payout</Text>
                  <Text style={styles.tiersCardSub}>Revenue, payout balance, and payout request</Text>
                </View>
              </View>
              <MaterialIcons name="chevron-right" size={22} color={Colors.textMuted} />
            </Pressable>
          </View>

          {/* Event Cancellation */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Event Cancellation</Text>
            <Pressable
              onPress={() => router.push(`/ticketing/cancel/${eventId}` as any)}
              style={({ pressed }) => [styles.card, styles.tiersCard, { borderColor: 'rgba(244,67,54,0.3)' }, pressed && { opacity: 0.8 }]}
            >
              <View style={styles.tiersCardLeft}>
                <View style={[styles.tiersIconWrap, { backgroundColor: 'rgba(244,67,54,0.08)', borderColor: 'rgba(244,67,54,0.2)' }]}>
                  <MaterialIcons name="cancel" size={24} color={Colors.error} />
                </View>
                <View>
                  <Text style={[styles.tiersCardTitle, { color: Colors.error }]}>Request Cancellation</Text>
                  <Text style={styles.tiersCardSub}>Events with ticket sales require admin approval to cancel</Text>
                </View>
              </View>
              <MaterialIcons name="chevron-right" size={22} color={Colors.error} />
            </Pressable>
          </View>

          {/* Save button */}
          {dirty && (
            <View style={styles.saveWrap}>
              <Pressable
                onPress={handleSave}
                disabled={saving}
                style={({ pressed }) => [styles.saveBtn, pressed && { opacity: 0.88 }]}
              >
                <LinearGradient
                  colors={[Colors.gold, Colors.goldDim]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.saveBtnInner}
                >
                  {saving ? (
                    <ActivityIndicator color={Colors.textOnGold} size="small" />
                  ) : (
                    <>
                      <MaterialIcons name="save" size={18} color={Colors.textOnGold} />
                      <Text style={styles.saveBtnText}>Save Settings</Text>
                    </>
                  )}
                </LinearGradient>
              </Pressable>
            </View>
          )}

          {/* Error display */}
          {error ? (
            <View style={styles.errorRow}>
              <MaterialIcons name="error-outline" size={14} color={Colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}
        </ScrollView>
      )}

      {/* Ticketing Terms Modal */}
      <Modal
        visible={showTermsModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowTermsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setShowTermsModal(false)} />
          <View style={[styles.modalSheet, { paddingBottom: Math.max(Spacing.xxl, insets.bottom + Spacing.base) }]}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Ticketing Platform Terms</Text>
            <Text style={[styles.modalSub, { color: '#FF9800', fontWeight: Typography.semibold }]}>
              PLACEHOLDER — not attorney-approved legal advice. Replace with reviewed legal copy before launch.
            </Text>
            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 320 }}>
              {TICKETING_TERMS_CONTENT.map((section, i) => (
                <View key={i} style={{ marginBottom: Spacing.md }}>
                  <Text style={termsStyles.termHeading}>{section.heading}</Text>
                  <Text style={termsStyles.termBody}>{section.body}</Text>
                </View>
              ))}
            </ScrollView>
            <Pressable
              onPress={handleAcceptTerms}
              disabled={acceptingTerms}
              style={({ pressed }) => [styles.saveBtn, { borderRadius: Radius.md, overflow: 'hidden' }, pressed && { opacity: 0.88 }]}
            >
              <LinearGradient
                colors={[Colors.gold, Colors.goldDim]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.saveBtnInner}
              >
                {acceptingTerms
                  ? <ActivityIndicator color={Colors.textOnGold} size="small" />
                  : <>
                    <MaterialIcons name="check" size={18} color={Colors.textOnGold} />
                    <Text style={styles.saveBtnText}>I Agree &amp; Accept</Text>
                  </>}
              </LinearGradient>
            </Pressable>
            {/* Links to full promoter legal documents */}
            <View style={promoterTermsLinks.row}>
              <Pressable onPress={() => Linking.openURL(LEGAL_URLS.promoterTicketingTerms)} hitSlop={8}>
                <Text style={promoterTermsLinks.link}>Full Promoter Ticketing Terms</Text>
              </Pressable>
            </View>
            <View style={promoterTermsLinks.row}>
              <Pressable onPress={() => Linking.openURL(LEGAL_URLS.promoterPolicy)} hitSlop={8}>
                <Text style={promoterTermsLinks.link}>Promoter Policy</Text>
              </Pressable>
              <Text style={promoterTermsLinks.sep}>·</Text>
              <Pressable onPress={() => Linking.openURL(LEGAL_URLS.refundPolicy)} hitSlop={8}>
                <Text style={promoterTermsLinks.link}>Refund Policy</Text>
              </Pressable>
              <Text style={promoterTermsLinks.sep}>·</Text>
              <Pressable onPress={() => Linking.openURL(LEGAL_URLS.acceptableUse)} hitSlop={8}>
                <Text style={promoterTermsLinks.link}>Acceptable Use</Text>
              </Pressable>
            </View>

            <Pressable
              onPress={() => setShowTermsModal(false)}
              style={({ pressed }) => [{ alignSelf: 'center', paddingVertical: Spacing.sm }, pressed && { opacity: 0.7 }]}
            >
              <Text style={{ color: Colors.textMuted, fontSize: Typography.base, textDecorationLine: 'underline' }}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Currency picker modal */}
      <Modal
        visible={showCurrencyModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCurrencyModal(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setShowCurrencyModal(false)} />
          <View style={[styles.modalSheet, { paddingBottom: Math.max(Spacing.xxl, insets.bottom + Spacing.base) }]}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Select Currency</Text>
            <Text style={styles.modalSub}>
              All ticket tiers for this event will use the selected currency.
            </Text>
            {CURRENCIES.map((c) => (
              <Pressable
                key={c.value}
                onPress={() => handleCurrencySelect(c.value)}
                style={({ pressed }) => [
                  styles.modalOption,
                  currency === c.value && styles.modalOptionSelected,
                  pressed && { opacity: 0.75 },
                ]}
              >
                <Text style={styles.currencyFlagLg}>{c.flag}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalOptionLabel}>{c.label}</Text>
                  <Text style={styles.modalOptionNote}>{c.note}</Text>
                </View>
                {currency === c.value && (
                  <MaterialIcons name="check-circle" size={20} color={Colors.gold} />
                )}
              </Pressable>
            ))}
          </View>
        </View>
      </Modal>

      {/* Sales status picker modal */}
      <Modal
        visible={showStatusModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowStatusModal(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setShowStatusModal(false)} />
          <View style={[styles.modalSheet, { paddingBottom: Math.max(Spacing.xxl, insets.bottom + Spacing.base) }]}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Sales Status</Text>
            {SALES_STATUSES.map((s) => {
              const cfg = SALES_STATUS_CONFIG[s];
              return (
                <Pressable
                  key={s}
                  onPress={() => handleStatusSelect(s)}
                  style={({ pressed }) => [
                    styles.modalOption,
                    salesStatus === s && styles.modalOptionSelected,
                    pressed && { opacity: 0.75 },
                  ]}
                >
                  <View style={[styles.statusDotLg, { backgroundColor: cfg.color }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.modalOptionLabel, { color: cfg.color }]}>{cfg.label}</Text>
                    <Text style={styles.modalOptionNote}>{cfg.description}</Text>
                  </View>
                  {salesStatus === s && (
                    <MaterialIcons name="check-circle" size={20} color={Colors.gold} />
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const termsStyles = StyleSheet.create({
  termHeading: {
    fontSize: Typography.sm, fontWeight: Typography.bold,
    color: Colors.textPrimary, marginBottom: Spacing.xs,
  },
  termBody: {
    fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 20,
  },
});

const promoterTermsLinks = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 4 },
  link: { fontSize: 11, color: Colors.gold, textDecorationLine: 'underline' },
  sep: { fontSize: 11, color: Colors.textMuted },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  flaggedState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.base, padding: Spacing.xl },
  flaggedTitle: { fontSize: Typography.lg, fontWeight: Typography.black, color: Colors.textPrimary },
  flaggedSub: { fontSize: Typography.base, color: Colors.textSecondary, textAlign: 'center' },
  backLink: { paddingVertical: Spacing.sm },
  backLinkText: { color: Colors.gold, fontSize: Typography.base, textDecorationLine: 'underline' },

  toast: {
    position: 'absolute', left: Spacing.base, right: Spacing.base, zIndex: 999,
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.gold, borderRadius: Radius.lg,
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.base,
    shadowColor: Colors.gold, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 10, elevation: 10,
  },
  toastText: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textOnGold, flex: 1 },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: Typography.lg, fontWeight: Typography.black, color: Colors.textPrimary },
  headerSub: { fontSize: Typography.xs, color: Colors.textMuted },
  tiersBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    backgroundColor: Colors.goldSurface, borderRadius: Radius.full,
    borderWidth: 1, borderColor: `${Colors.gold}33`,
  },
  tiersBtnText: { fontSize: Typography.xs, color: Colors.gold, fontWeight: Typography.bold },

  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { padding: Spacing.base, gap: Spacing.xl },

  section: { gap: Spacing.sm },
  sectionTitle: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8 },

  card: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.surfaceBorder, overflow: 'hidden',
  },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.base,
    padding: Spacing.base,
  },
  toggleLabel: { fontSize: Typography.base, fontWeight: Typography.semibold, color: Colors.textPrimary },
  toggleSub: { fontSize: Typography.xs, color: Colors.textMuted, lineHeight: 18, marginTop: 2 },

  selectRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: Spacing.base,
  },
  selectRowLocked: { opacity: 0.7 },
  selectLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, flex: 1 },
  currencyFlag: { fontSize: 28 },
  selectValue: { fontSize: Typography.base, fontWeight: Typography.semibold, color: Colors.textPrimary },
  selectNote: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2 },
  lockedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm, paddingVertical: 3,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  lockedText: { fontSize: Typography.xs, color: Colors.textMuted, fontWeight: Typography.semibold },
  statusDot: { width: 10, height: 10, borderRadius: 5 },

  infoRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    paddingHorizontal: Spacing.base, paddingBottom: Spacing.md,
    borderTopWidth: 1, borderTopColor: Colors.surfaceBorder, paddingTop: Spacing.md,
  },
  infoText: { flex: 1, fontSize: Typography.xs, color: Colors.textMuted, lineHeight: 17 },

  tiersCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.base },
  tiersCardLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, flex: 1 },
  tiersIconWrap: {
    width: 48, height: 48, borderRadius: Radius.md,
    backgroundColor: Colors.goldSurface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: `${Colors.gold}33`,
  },
  tiersCardTitle: { fontSize: Typography.base, fontWeight: Typography.semibold, color: Colors.textPrimary },
  tiersCardSub: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2, lineHeight: 16 },

  saveWrap: { marginTop: Spacing.sm },
  saveBtn: { borderRadius: Radius.lg, overflow: 'hidden' },
  saveBtnInner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, paddingVertical: Spacing.base,
  },
  saveBtnText: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textOnGold },

  errorRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    backgroundColor: 'rgba(255,68,68,0.08)', borderRadius: Radius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: 'rgba(255,68,68,0.2)',
  },
  errorText: { flex: 1, fontSize: Typography.sm, color: Colors.error, lineHeight: 18 },

  // Modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: Spacing.xl, gap: Spacing.md, borderTopWidth: 1, borderColor: Colors.surfaceBorder,
  },
  modalHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: Colors.surfaceBorder, alignSelf: 'center', marginBottom: Spacing.xs,
  },
  modalTitle: { fontSize: Typography.md, fontWeight: Typography.black, color: Colors.textPrimary },
  modalSub: { fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 20 },
  modalOption: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.base,
    borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.surfaceBorder,
    backgroundColor: Colors.surfaceElevated,
  },
  modalOptionSelected: {
    borderColor: Colors.gold, backgroundColor: Colors.goldSurface,
  },
  modalOptionLabel: { fontSize: Typography.base, fontWeight: Typography.semibold, color: Colors.textPrimary },
  modalOptionNote: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2 },
  currencyFlagLg: { fontSize: 32 },
  statusDotLg: { width: 12, height: 12, borderRadius: 6 },
});
