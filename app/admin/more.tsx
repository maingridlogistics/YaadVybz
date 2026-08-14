/**
 * Admin Portal — More / Settings Tab
 * Categories, ad placements, email/push settings, event approval toggle.
 * Admin-only.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  Modal,
  Switch,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { useCategories } from '../../hooks/useCategories';
import { sendTestEmail, testSmtpConnection, sendTestPush } from '../../services/emailService';
import {
  fetchAllPlacementsAdmin,
  fetchAdCountsByPlacement,
  togglePlacementEnabled,
  insertPlacement,
  AdPlacement,
} from '../../services/adsService';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';

type MoreSection = 'settings' | 'categories' | 'ads';

const ICON_OPTIONS = [
  'local-bar', 'celebration', 'speaker', 'beach-access', 'nightlife', 'mic',
  'flag', 'museum', 'people', 'emoji-events', 'work', 'lock',
  'star', 'music-note', 'sports', 'restaurant', 'camera-alt', 'festival',
];
const COLOR_OPTIONS = [
  '#FF6B35', '#E91E63', '#FF9800', '#00BCD4', '#9C27B0', '#5C6BC0',
  '#F44336', '#27AE60', '#00897B', '#1565C0', '#607D8B', '#FFD700',
];

export default function AdminMoreTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, signOut, requireEventApproval, setRequireEventApproval } = useAuth();
  const { parishes, eventTypes, addParish, removeParish, addEventType, editEventType, removeEventType, resetToDefaults } = useCategories();

  const [activeSection, setActiveSection] = useState<MoreSection>('settings');

  // Settings state
  const [testEmailState, setTestEmailState] = useState<'idle' | 'sending' | 'ok' | 'fail'>('idle');
  const [testEmailDetail, setTestEmailDetail] = useState('');
  const [testSmtpState, setTestSmtpState] = useState<'idle' | 'testing' | 'ok' | 'slow' | 'fail'>('idle');
  const [testPushState, setTestPushState] = useState<'idle' | 'sending' | 'ok' | 'fail'>('idle');

  // Categories state
  const [showAddParish, setShowAddParish] = useState(false);
  const [addParishInput, setAddParishInput] = useState('');
  const [typeModal, setTypeModal] = useState<{ visible: boolean; editId: string | null; label: string; icon: string; color: string }>({ visible: false, editId: null, label: '', icon: ICON_OPTIONS[0], color: COLOR_OPTIONS[0] });

  // Ads state
  const [adPlacements, setAdPlacements] = useState<AdPlacement[]>([]);
  const [adCounts, setAdCounts] = useState<Record<string, number>>({});
  const [adsLoading, setAdsLoading] = useState(false);
  const [showNewPlacementModal, setShowNewPlacementModal] = useState(false);
  const [newPlacementName, setNewPlacementName] = useState('');
  const [newPlacementSize, setNewPlacementSize] = useState<'rectangle' | 'square'>('rectangle');

  const loadAds = useCallback(async () => {
    setAdsLoading(true);
    try {
      const [placements, counts] = await Promise.all([fetchAllPlacementsAdmin(), fetchAdCountsByPlacement()]);
      setAdPlacements(placements);
      setAdCounts(counts);
    } catch {}
    setAdsLoading(false);
  }, []);

  useEffect(() => { if (activeSection === 'ads') loadAds(); }, [activeSection, loadAds]);

  const handleTogglePlacement = useCallback(async (placement: AdPlacement) => {
    const next = !placement.enabled;
    await togglePlacementEnabled(placement.id, next);
    setAdPlacements((prev) => prev.map((p) => p.id === placement.id ? { ...p, enabled: next } : p));
  }, []);

  const handleCreatePlacement = useCallback(async () => {
    if (!newPlacementName.trim()) return;
    const { data } = await insertPlacement(newPlacementName.trim(), newPlacementSize);
    if (data) {
      setAdPlacements((prev) => [...prev, data as AdPlacement]);
      setNewPlacementName('');
      setNewPlacementSize('rectangle');
      setShowNewPlacementModal(false);
    }
  }, [newPlacementName, newPlacementSize]);

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: () => {
          signOut().catch(() => {});
          router.replace('/onboarding' as any);
        },
      },
    ]);
  };

  const SECTIONS: { key: MoreSection; icon: string; label: string }[] = [
    { key: 'settings',   icon: 'settings',  label: 'Settings' },
    { key: 'categories', icon: 'category',  label: 'Categories' },
    { key: 'ads',        icon: 'campaign',  label: 'Ads' },
  ];

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        <View style={styles.header}>
          <View style={styles.headerIconWrap}>
            <MaterialIcons name="settings" size={18} color={Colors.gold} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>More & Settings</Text>
            <Text style={styles.headerSub}>Configuration, categories, and admin tools</Text>
          </View>
          <Pressable onPress={handleSignOut} hitSlop={8}>
            <MaterialIcons name="logout" size={20} color={Colors.textMuted} />
          </Pressable>
        </View>
        {/* Section tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sectionTabs}>
          {SECTIONS.map((s) => (
            <Pressable
              key={s.key}
              onPress={() => setActiveSection(s.key)}
              style={[styles.sectionTab, activeSection === s.key && styles.sectionTabActive]}
            >
              <MaterialIcons name={s.icon as any} size={13} color={activeSection === s.key ? Colors.textOnGold : Colors.textMuted} />
              <Text style={[styles.sectionTabText, activeSection === s.key && styles.sectionTabTextActive]}>{s.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </SafeAreaView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + Spacing.xxl * 2 }]}
      >
        {/* ── Settings ── */}
        {activeSection === 'settings' && (
          <>
            {/* Event moderation toggle */}
            <View style={styles.settingCard}>
              <View style={styles.settingCardTop}>
                <View style={styles.settingIconWrap}>
                  <MaterialIcons name="pending-actions" size={20} color={requireEventApproval ? Colors.gold : Colors.textMuted} />
                </View>
                <View style={styles.settingTextBlock}>
                  <Text style={styles.settingTitle}>Require Event Approval</Text>
                  <Text style={styles.settingSub}>When ON, new events are created as Pending and must be approved before going live.</Text>
                </View>
                <Switch
                  value={requireEventApproval}
                  onValueChange={(v) => setRequireEventApproval(v)}
                  trackColor={{ false: Colors.surfaceBorder, true: Colors.gold }}
                  thumbColor={requireEventApproval ? Colors.textOnGold : Colors.textMuted}
                />
              </View>
              <View style={[styles.settingStatus, requireEventApproval ? styles.statusOn : styles.statusOff]}>
                <MaterialIcons name={requireEventApproval ? 'pending-actions' : 'bolt'} size={12} color={requireEventApproval ? '#FF9800' : Colors.greenLight} />
                <Text style={[styles.settingStatusText, { color: requireEventApproval ? '#FF9800' : Colors.greenLight }]}>
                  {requireEventApproval ? 'Moderation ON — new events require approval' : 'Auto-publish ON — events go live immediately'}
                </Text>
              </View>
            </View>

            {/* Email test */}
            <View style={styles.settingCard}>
              <View style={styles.settingCardTop}>
                <View style={styles.settingIconWrap}>
                  <MaterialIcons name="email" size={20} color={Colors.gold} />
                </View>
                <View style={styles.settingTextBlock}>
                  <Text style={styles.settingTitle}>Test Email Delivery</Text>
                  <Text style={styles.settingSub}>Send a test email to your account to verify SMTP is working.</Text>
                </View>
              </View>
              {testEmailState !== 'idle' && (
                <View style={styles.testResultRow}>
                  <MaterialIcons
                    name={testEmailState === 'sending' ? 'hourglass-empty' : testEmailState === 'ok' ? 'check-circle' : 'error-outline'}
                    size={13}
                    color={testEmailState === 'ok' ? Colors.greenLight : testEmailState === 'fail' ? '#FF6B6B' : '#FF9800'}
                  />
                  <Text style={[styles.testResultText, { color: testEmailState === 'ok' ? Colors.greenLight : testEmailState === 'fail' ? '#FF6B6B' : '#FF9800' }]}>
                    {testEmailState === 'sending' ? 'Sending...' : testEmailDetail}
                  </Text>
                </View>
              )}
              <Pressable
                onPress={async () => {
                  setTestEmailState('sending'); setTestEmailDetail('');
                  const { ok, detail } = await sendTestEmail();
                  setTestEmailState(ok ? 'ok' : 'fail'); setTestEmailDetail(detail);
                }}
                disabled={testEmailState === 'sending'}
                style={({ pressed }) => [styles.testBtn, pressed && { opacity: 0.8 }, testEmailState === 'sending' && { opacity: 0.5 }]}
              >
                <MaterialIcons name="send" size={14} color={Colors.textOnGold} />
                <Text style={styles.testBtnText}>{testEmailState === 'sending' ? 'Sending...' : 'Send Test Email'}</Text>
              </Pressable>
            </View>

            {/* SMTP probe */}
            <View style={styles.settingCard}>
              <View style={styles.settingCardTop}>
                <View style={styles.settingIconWrap}>
                  <MaterialIcons name="wifi-tethering" size={20} color={Colors.gold} />
                </View>
                <View style={styles.settingTextBlock}>
                  <Text style={styles.settingTitle}>Test SMTP Handshake</Text>
                  <Text style={styles.settingSub}>Performs TCP → EHLO → STARTTLS → AUTH. Detects latency before Supabase Auth 10s timeout.</Text>
                </View>
              </View>
              <Pressable
                onPress={async () => {
                  setTestSmtpState('testing');
                  const result = await testSmtpConnection();
                  setTestSmtpState(!result.ok || result.totalMs >= 8000 ? 'fail' : result.totalMs >= 3000 ? 'slow' : 'ok');
                }}
                disabled={testSmtpState === 'testing'}
                style={({ pressed }) => [
                  styles.testBtn,
                  pressed && { opacity: 0.8 },
                  testSmtpState === 'testing' && { opacity: 0.5 },
                  testSmtpState === 'slow' && { backgroundColor: '#E65100' },
                  testSmtpState === 'fail' && { backgroundColor: '#C62828' },
                ]}
              >
                <MaterialIcons name={testSmtpState === 'ok' ? 'check' : testSmtpState === 'fail' ? 'error-outline' : 'wifi-tethering'} size={14} color={Colors.textOnGold} />
                <Text style={styles.testBtnText}>
                  {testSmtpState === 'testing' ? 'Probing…' : testSmtpState === 'ok' ? 'Healthy — Tap to Re-test' : testSmtpState === 'fail' ? 'Failed — Retry' : testSmtpState === 'slow' ? 'Slow — Retry' : 'Test SMTP Connection'}
                </Text>
              </Pressable>
            </View>

            {/* Push test */}
            <View style={styles.settingCard}>
              <View style={styles.settingCardTop}>
                <View style={styles.settingIconWrap}>
                  <MaterialIcons name="notifications-active" size={20} color={Colors.gold} />
                </View>
                <View style={styles.settingTextBlock}>
                  <Text style={styles.settingTitle}>Test Push Notification</Text>
                  <Text style={styles.settingSub}>Send a test push to this device to verify APNs/FCM is working.</Text>
                </View>
              </View>
              <Pressable
                onPress={async () => { setTestPushState('sending'); const result = await sendTestPush(); setTestPushState(result.ok ? 'ok' : 'fail'); }}
                disabled={testPushState === 'sending'}
                style={({ pressed }) => [styles.testBtn, pressed && { opacity: 0.8 }, testPushState === 'sending' && { opacity: 0.5 }]}
              >
                <MaterialIcons name={testPushState === 'ok' ? 'check' : 'send'} size={14} color={Colors.textOnGold} />
                <Text style={styles.testBtnText}>{testPushState === 'sending' ? 'Sending...' : testPushState === 'ok' ? 'Push Sent — Resend' : 'Send Test Push'}</Text>
              </Pressable>
            </View>

            {/* Push test lab */}
            <Pressable onPress={() => router.push('/admin/push-test' as any)} style={({ pressed }) => [styles.settingCard, pressed && { opacity: 0.88 }]}>
              <View style={styles.settingCardTop}>
                <View style={styles.settingIconWrap}>
                  <MaterialIcons name="science" size={20} color="#7C4DFF" />
                </View>
                <View style={styles.settingTextBlock}>
                  <Text style={styles.settingTitle}>Push Test Lab</Text>
                  <Text style={styles.settingSub}>Select notification type, supply event ID, fire test push to your device tokens.</Text>
                </View>
                <MaterialIcons name="arrow-forward-ios" size={14} color={Colors.textMuted} />
              </View>
            </Pressable>

            {/* Sign out */}
            <Pressable onPress={handleSignOut} style={({ pressed }) => [styles.signOutBtn, pressed && { opacity: 0.8 }]}>
              <MaterialIcons name="logout" size={18} color={Colors.error} />
              <Text style={styles.signOutText}>Sign Out of Admin Account</Text>
            </Pressable>
          </>
        )}

        {/* ── Categories ── */}
        {activeSection === 'categories' && (
          <>
            {/* Parishes */}
            <View style={styles.sectionLabel}>
              <Text style={styles.sectionLabelText}>Parishes ({parishes.length})</Text>
              <Pressable onPress={() => { setShowAddParish(true); setAddParishInput(''); }} style={styles.addChipBtn}>
                <MaterialIcons name="add" size={13} color={Colors.gold} />
                <Text style={styles.addChipBtnText}>Add</Text>
              </Pressable>
            </View>
            {showAddParish && (
              <View style={styles.addParishRow}>
                <TextInput
                  style={styles.addParishInput}
                  value={addParishInput}
                  onChangeText={setAddParishInput}
                  placeholder="Parish name..."
                  placeholderTextColor={Colors.textMuted}
                  autoFocus
                  accessibilityLabel="New parish name"
                  onSubmitEditing={() => {
                    if (addParishInput.trim()) addParish(addParishInput.trim());
                    setShowAddParish(false); setAddParishInput('');
                  }}
                />
                <Pressable onPress={() => { if (addParishInput.trim()) addParish(addParishInput.trim()); setShowAddParish(false); setAddParishInput(''); }} style={styles.saveChipBtn}>
                  <MaterialIcons name="check" size={16} color={Colors.textOnGold} />
                </Pressable>
                <Pressable onPress={() => { setShowAddParish(false); setAddParishInput(''); }} style={styles.cancelChipBtn}>
                  <MaterialIcons name="close" size={16} color={Colors.textMuted} />
                </Pressable>
              </View>
            )}
            <View style={styles.chipsWrap}>
              {parishes.map((parish) => (
                <View key={parish} style={styles.chip}>
                  <MaterialIcons name="place" size={10} color={Colors.gold} />
                  <Text style={styles.chipText}>{parish}</Text>
                  <Pressable
                    onPress={() => Alert.alert('Remove Parish', `Remove "${parish}"?`, [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Remove', style: 'destructive', onPress: () => removeParish(parish) },
                    ])}
                    hitSlop={6}
                  >
                    <MaterialIcons name="close" size={10} color={Colors.textMuted} />
                  </Pressable>
                </View>
              ))}
            </View>

            {/* Event Types */}
            <View style={[styles.sectionLabel, { marginTop: Spacing.lg }]}>
              <Text style={styles.sectionLabelText}>Event Types ({eventTypes.length})</Text>
              <Pressable onPress={() => setTypeModal({ visible: true, editId: null, label: '', icon: ICON_OPTIONS[0], color: COLOR_OPTIONS[0] })} style={styles.addChipBtn}>
                <MaterialIcons name="add" size={13} color={Colors.gold} />
                <Text style={styles.addChipBtnText}>Add</Text>
              </Pressable>
            </View>
            {eventTypes.map((type) => (
              <View key={type.id} style={styles.typeRow}>
                <View style={[styles.typeIcon, { backgroundColor: `${type.color}20` }]}>
                  <MaterialIcons name={type.icon as any} size={16} color={type.color} />
                </View>
                <Text style={styles.typeLabel} numberOfLines={1}>{type.label}</Text>
                <View style={[styles.typeColorDot, { backgroundColor: type.color }]} />
                <Pressable onPress={() => setTypeModal({ visible: true, editId: type.id, label: type.label, icon: type.icon, color: type.color })} style={styles.typeActionBtn} hitSlop={6}>
                  <MaterialIcons name="edit" size={14} color={Colors.gold} />
                </Pressable>
                <Pressable
                  onPress={() => Alert.alert('Delete Type', `Delete "${type.label}"?`, [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Delete', style: 'destructive', onPress: () => removeEventType(type.id) },
                  ])}
                  style={styles.typeActionBtn}
                  hitSlop={6}
                >
                  <MaterialIcons name="delete-outline" size={14} color={Colors.error} />
                </Pressable>
              </View>
            ))}
            <Pressable
              onPress={() => Alert.alert('Reset to Defaults', 'Restore all parishes and event types to defaults? Custom entries will be lost.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Reset', style: 'destructive', onPress: resetToDefaults },
              ])}
              style={styles.resetBtn}
            >
              <MaterialIcons name="restore" size={14} color={Colors.error} />
              <Text style={styles.resetBtnText}>Reset All to Defaults</Text>
            </Pressable>

            {/* Type form modal */}
            <Modal visible={typeModal.visible} transparent animationType="slide" onRequestClose={() => setTypeModal((p) => ({ ...p, visible: false }))}>
              <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                <Pressable style={styles.modalOverlay} onPress={() => setTypeModal((p) => ({ ...p, visible: false }))}>
                  <Pressable style={[styles.modalSheet, { paddingBottom: Math.max(Spacing.xxl, insets.bottom + Spacing.base) }]} onPress={(e) => e.stopPropagation()}>
                    <View style={styles.modalHandle} />
                    <Text style={styles.modalTitle}>{typeModal.editId ? 'Edit Event Type' : 'Add Event Type'}</Text>
                    <Text style={styles.modalFieldLabel}>Type Name *</Text>
                    <TextInput
                      style={styles.modalInput}
                      value={typeModal.label}
                      onChangeText={(v) => setTypeModal((p) => ({ ...p, label: v }))}
                      placeholder="e.g. Fashion Shows"
                      placeholderTextColor={Colors.textMuted}
                      autoFocus
                      accessibilityLabel="Event type name"
                    />
                    <Text style={styles.modalFieldLabel}>Icon</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.iconRow}>
                      {ICON_OPTIONS.map((ic) => (
                        <Pressable
                          key={ic}
                          onPress={() => setTypeModal((p) => ({ ...p, icon: ic }))}
                          style={[styles.iconOpt, typeModal.icon === ic && { borderColor: typeModal.color, backgroundColor: `${typeModal.color}20` }]}
                        >
                          <MaterialIcons name={ic as any} size={20} color={typeModal.icon === ic ? typeModal.color : Colors.textMuted} />
                        </Pressable>
                      ))}
                    </ScrollView>
                    <Text style={styles.modalFieldLabel}>Color</Text>
                    <View style={styles.colorGrid}>
                      {COLOR_OPTIONS.map((c) => (
                        <Pressable
                          key={c}
                          onPress={() => setTypeModal((p) => ({ ...p, color: c }))}
                          style={[styles.colorDot, { backgroundColor: c }, typeModal.color === c && styles.colorDotSelected]}
                        />
                      ))}
                    </View>
                    <View style={styles.modalBtnRow}>
                      <Pressable onPress={() => setTypeModal((p) => ({ ...p, visible: false }))} style={styles.modalCancelBtn}><Text style={styles.modalCancelText}>Cancel</Text></Pressable>
                      <Pressable
                        onPress={() => {
                          if (!typeModal.label.trim()) return;
                          if (typeModal.editId) editEventType(typeModal.editId, { label: typeModal.label.trim(), icon: typeModal.icon, color: typeModal.color });
                          else addEventType({ label: typeModal.label.trim(), icon: typeModal.icon, color: typeModal.color });
                          setTypeModal((p) => ({ ...p, visible: false }));
                        }}
                        disabled={!typeModal.label.trim()}
                        style={[styles.modalConfirmBtn, { backgroundColor: Colors.gold }, !typeModal.label.trim() && { opacity: 0.4 }]}
                      >
                        <Text style={[styles.modalConfirmText, { color: Colors.textOnGold }]}>{typeModal.editId ? 'Save' : 'Add'}</Text>
                      </Pressable>
                    </View>
                  </Pressable>
                </Pressable>
              </KeyboardAvoidingView>
            </Modal>
          </>
        )}

        {/* ── Ads ── */}
        {activeSection === 'ads' && (
          <>
            <View style={styles.sectionLabel}>
              <Text style={styles.sectionLabelText}>Ad Placements ({adPlacements.length})</Text>
              <Pressable onPress={() => setShowNewPlacementModal(true)} style={styles.addChipBtn}>
                <MaterialIcons name="add" size={13} color={Colors.gold} />
                <Text style={styles.addChipBtnText}>New</Text>
              </Pressable>
            </View>
            {adsLoading && <Text style={styles.loadingText}>Loading placements...</Text>}
            {adPlacements.map((placement) => {
              const count = adCounts[placement.id] ?? 0;
              return (
                <Pressable
                  key={placement.id}
                  onPress={() => router.push(`/admin/ads/${placement.id}` as any)}
                  style={({ pressed }) => [styles.adPlacementCard, pressed && { opacity: 0.88 }]}
                >
                  <View style={styles.adPlacementLeft}>
                    <View style={[styles.adSizeIcon, { backgroundColor: placement.size === 'rectangle' ? `${Colors.gold}18` : '#9C27B018' }]}>
                      <MaterialIcons name={placement.size === 'rectangle' ? 'crop-landscape' : 'crop-square'} size={16} color={placement.size === 'rectangle' ? Colors.gold : '#9C27B0'} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.adPlacementName}>{placement.name}</Text>
                      <Text style={styles.adPlacementMeta}>{placement.size} · {count} ad{count !== 1 ? 's' : ''}</Text>
                    </View>
                  </View>
                  <View style={styles.adPlacementRight}>
                    <Pressable
                      onPress={(e) => { e.stopPropagation(); handleTogglePlacement(placement); }}
                      style={[styles.adEnablePill, { backgroundColor: placement.enabled ? `${Colors.greenLight}15` : `${Colors.textMuted}12` }]}
                      hitSlop={8}
                    >
                      <View style={[styles.adEnableDot, { backgroundColor: placement.enabled ? Colors.greenLight : Colors.textMuted }]} />
                      <Text style={[styles.adEnableText, { color: placement.enabled ? Colors.greenLight : Colors.textMuted }]}>
                        {placement.enabled ? 'Live' : 'Off'}
                      </Text>
                    </Pressable>
                    <MaterialIcons name="arrow-forward-ios" size={13} color={Colors.textMuted} />
                  </View>
                </Pressable>
              );
            })}
            {adPlacements.length === 0 && !adsLoading && (
              <View style={styles.emptyState}>
                <MaterialIcons name="campaign" size={40} color={Colors.textMuted} />
                <Text style={styles.emptyTitle}>No ad placements</Text>
                <Text style={styles.emptySub}>Create a placement to serve ads in the app.</Text>
              </View>
            )}

            {/* New placement modal */}
            <Modal visible={showNewPlacementModal} transparent animationType="slide" onRequestClose={() => setShowNewPlacementModal(false)}>
              <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                <Pressable style={styles.modalOverlay} onPress={() => setShowNewPlacementModal(false)}>
                  <Pressable style={[styles.modalSheet, { paddingBottom: Math.max(Spacing.xxl, insets.bottom + Spacing.base) }]} onPress={(e) => e.stopPropagation()}>
                    <View style={styles.modalHandle} />
                    <Text style={styles.modalTitle}>New Ad Placement</Text>
                    <Text style={styles.modalFieldLabel}>Placement Name *</Text>
                    <TextInput
                      style={styles.modalInput}
                      value={newPlacementName}
                      onChangeText={setNewPlacementName}
                      placeholder="e.g. Home Feed"
                      placeholderTextColor={Colors.textMuted}
                      autoFocus
                      accessibilityLabel="Placement name"
                    />
                    <Text style={styles.modalFieldLabel}>Size</Text>
                    <View style={styles.sizeRow}>
                      {(['rectangle', 'square'] as const).map((sz) => (
                        <Pressable key={sz} onPress={() => setNewPlacementSize(sz)} style={[styles.sizeBtn, newPlacementSize === sz && styles.sizeBtnActive]}>
                          <MaterialIcons name={sz === 'rectangle' ? 'crop-landscape' : 'crop-square'} size={16} color={newPlacementSize === sz ? Colors.textOnGold : Colors.textMuted} />
                          <Text style={[styles.sizeBtnText, newPlacementSize === sz && { color: Colors.textOnGold }]}>{sz === 'rectangle' ? 'Rectangle' : 'Square'}</Text>
                        </Pressable>
                      ))}
                    </View>
                    <View style={styles.modalBtnRow}>
                      <Pressable onPress={() => setShowNewPlacementModal(false)} style={styles.modalCancelBtn}><Text style={styles.modalCancelText}>Cancel</Text></Pressable>
                      <Pressable onPress={handleCreatePlacement} disabled={!newPlacementName.trim()} style={[styles.modalConfirmBtn, { backgroundColor: Colors.gold }, !newPlacementName.trim() && { opacity: 0.4 }]}>
                        <Text style={[styles.modalConfirmText, { color: Colors.textOnGold }]}>Create</Text>
                      </Pressable>
                    </View>
                  </Pressable>
                </Pressable>
              </KeyboardAvoidingView>
            </Modal>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
  },
  headerIconWrap: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.goldSurface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: `${Colors.gold}44`, flexShrink: 0,
  },
  headerTitle: { fontSize: Typography.lg, fontWeight: Typography.black as any, color: Colors.textPrimary },
  headerSub: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 1 },
  sectionTabs: { flexDirection: 'row', paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm, gap: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder },
  sectionTab: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderRadius: Radius.full, backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.surfaceBorder,
  },
  sectionTabActive: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  sectionTabText: { fontSize: Typography.xs, color: Colors.textMuted, fontWeight: Typography.medium as any },
  sectionTabTextActive: { color: Colors.textOnGold, fontWeight: Typography.bold as any },
  body: { padding: Spacing.base, gap: Spacing.md },
  settingCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    borderWidth: 1.5, borderColor: Colors.surfaceBorder, overflow: 'hidden',
  },
  settingCardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, padding: Spacing.base },
  settingIconWrap: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.surfaceElevated, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  settingTextBlock: { flex: 1, gap: 4 },
  settingTitle: { fontSize: Typography.base, fontWeight: Typography.bold as any, color: Colors.textPrimary },
  settingSub: { fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 19 },
  settingStatus: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.surfaceBorder },
  statusOn: { backgroundColor: 'rgba(255,152,0,0.08)' },
  statusOff: { backgroundColor: `${Colors.greenLight}10` },
  settingStatusText: { fontSize: Typography.xs, fontWeight: Typography.semibold as any },
  testResultRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.surfaceBorder },
  testResultText: { flex: 1, fontSize: Typography.xs },
  testBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
    margin: Spacing.md, marginTop: 0, padding: Spacing.md,
    backgroundColor: Colors.gold, borderRadius: Radius.md,
  },
  testBtnText: { fontSize: Typography.sm, fontWeight: Typography.bold as any, color: Colors.textOnGold },
  signOutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
    paddingVertical: Spacing.md, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: 'rgba(255,68,68,0.25)', backgroundColor: 'rgba(255,68,68,0.06)',
  },
  signOutText: { fontSize: Typography.base, fontWeight: Typography.semibold as any, color: Colors.error },
  sectionLabel: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  sectionLabelText: { flex: 1, fontSize: Typography.sm, fontWeight: Typography.bold as any, color: Colors.textPrimary },
  addChipBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: Spacing.sm, paddingVertical: 5,
    backgroundColor: Colors.goldSurface, borderRadius: Radius.full, borderWidth: 1, borderColor: `${Colors.gold}44`,
  },
  addChipBtnText: { fontSize: Typography.xs, color: Colors.gold, fontWeight: Typography.bold as any },
  addParishRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1.5, borderColor: Colors.gold, padding: Spacing.sm,
  },
  addParishInput: { flex: 1, fontSize: Typography.base, color: Colors.textPrimary, height: 40 },
  saveChipBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.gold, alignItems: 'center', justifyContent: 'center' },
  cancelChipBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    backgroundColor: Colors.surface, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  chipText: { fontSize: Typography.xs, color: Colors.textSecondary, fontWeight: Typography.medium as any },
  typeRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.surfaceBorder, padding: Spacing.md,
  },
  typeIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  typeLabel: { flex: 1, fontSize: Typography.sm, fontWeight: Typography.semibold as any, color: Colors.textPrimary },
  typeColorDot: { width: 16, height: 16, borderRadius: 8, flexShrink: 0 },
  typeActionBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: Colors.surfaceElevated, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  resetBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
    marginTop: Spacing.md, padding: Spacing.md,
    backgroundColor: 'rgba(255,68,68,0.08)', borderRadius: Radius.lg, borderWidth: 1, borderColor: 'rgba(255,68,68,0.2)',
  },
  resetBtnText: { fontSize: Typography.sm, color: Colors.error, fontWeight: Typography.semibold as any },
  loadingText: { fontSize: Typography.sm, color: Colors.textMuted, textAlign: 'center', paddingVertical: Spacing.md },
  emptyState: { alignItems: 'center', paddingVertical: Spacing.xxl, gap: Spacing.md },
  emptyTitle: { fontSize: Typography.md, fontWeight: Typography.bold as any, color: Colors.textSecondary },
  emptySub: { fontSize: Typography.sm, color: Colors.textMuted, textAlign: 'center' },
  adPlacementCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.surfaceBorder, padding: Spacing.md,
  },
  adPlacementLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, flex: 1 },
  adSizeIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  adPlacementName: { fontSize: Typography.base, fontWeight: Typography.bold as any, color: Colors.textPrimary },
  adPlacementMeta: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 2 },
  adPlacementRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  adEnablePill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: Spacing.md, paddingVertical: 5, borderRadius: Radius.full },
  adEnableDot: { width: 6, height: 6, borderRadius: 3 },
  adEnableText: { fontSize: Typography.xs, fontWeight: Typography.semibold as any },
  sizeRow: { flexDirection: 'row', gap: Spacing.md },
  sizeBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
    paddingVertical: Spacing.md, backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.surfaceBorder,
  },
  sizeBtnActive: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  sizeBtnText: { fontSize: Typography.sm, fontWeight: Typography.semibold as any, color: Colors.textMuted },
  iconRow: { gap: Spacing.xs, paddingVertical: Spacing.xs, flexDirection: 'row' },
  iconOpt: { width: 42, height: 42, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: Colors.surfaceBorder, backgroundColor: Colors.surfaceElevated },
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  colorDot: { width: 30, height: 30, borderRadius: 15 },
  colorDotSelected: { borderWidth: 3, borderColor: '#fff' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: Spacing.base, borderTopWidth: 1, borderColor: Colors.surfaceBorder, gap: Spacing.md,
  },
  modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.surfaceBorder, alignSelf: 'center' },
  modalTitle: { fontSize: Typography.md, fontWeight: Typography.black as any, color: Colors.textPrimary, textAlign: 'center' },
  modalFieldLabel: { fontSize: Typography.xs, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  modalInput: {
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
    paddingHorizontal: Spacing.md, height: 52, color: Colors.textPrimary, fontSize: Typography.base,
  },
  modalBtnRow: { flexDirection: 'row', gap: Spacing.md },
  modalCancelBtn: { flex: 1, paddingVertical: Spacing.md, alignItems: 'center', backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.surfaceBorder },
  modalCancelText: { color: Colors.textSecondary, fontWeight: Typography.semibold as any },
  modalConfirmBtn: { flex: 1, paddingVertical: Spacing.md, alignItems: 'center', borderRadius: Radius.md },
  modalConfirmText: { fontWeight: Typography.bold as any },
});
