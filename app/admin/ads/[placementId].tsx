import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../../hooks/useAuth';
import { Colors, Typography, Spacing, Radius } from '../../../constants/theme';
import {
  fetchPlacementWithAdsAdmin,
  togglePlacementEnabled,
  toggleAdActive,
  updateAdSortOrder,
  deleteAd,
  insertAd,
  updateAd,
  Ad,
  AdPlacement,
} from '../../../services/adsService';
import { uploadAdImage } from '../../../lib/storage';

export default function PlacementAdsScreen() {
  const { placementId } = useLocalSearchParams<{ placementId: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const [placement, setPlacement] = useState<AdPlacement | null>(null);
  const [ads, setAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(true);

  // Add / Edit modal state
  const [showModal, setShowModal] = useState(false);
  const [editingAd, setEditingAd] = useState<Ad | null>(null);
  const [formImageUri, setFormImageUri] = useState('');
  const [formTargetUrl, setFormTargetUrl] = useState('');
  const [formLabel, setFormLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  const isAdmin = user?.roles.includes('admin') ?? false;

  const load = useCallback(async () => {
    if (!placementId) return;
    setLoading(true);
    const { placement: p, ads: a } = await fetchPlacementWithAdsAdmin(placementId);
    setPlacement(p);
    setAds(a);
    setLoading(false);
  }, [placementId]);

  useEffect(() => {
    load();
  }, [load]);

  // ── Guard ───────────────────────────────────────────────────────────────────
  if (!isAdmin) {
    return (
      <View style={styles.gate}>
        <SafeAreaView edges={['top']} />
        <MaterialIcons name="lock" size={48} color={Colors.textMuted} />
        <Text style={styles.gateText}>Admin access required.</Text>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  // ── Actions ─────────────────────────────────────────────────────────────────
  const handleTogglePlacement = async () => {
    if (!placement) return;
    const next = !placement.enabled;
    await togglePlacementEnabled(placement.id, next);
    setPlacement((prev) => (prev ? { ...prev, enabled: next } : prev));
  };

  const handleToggleAd = async (ad: Ad) => {
    const next = !ad.active;
    await toggleAdActive(ad.id, next);
    setAds((prev) => prev.map((a) => (a.id === ad.id ? { ...a, active: next } : a)));
  };

  const handleMoveUp = async (index: number) => {
    if (index === 0) return;
    const next = [...ads];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    await Promise.all(next.map((a, i) => updateAdSortOrder(a.id, i)));
    setAds(next.map((a, i) => ({ ...a, sort_order: i })));
  };

  const handleMoveDown = async (index: number) => {
    if (index === ads.length - 1) return;
    const next = [...ads];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    await Promise.all(next.map((a, i) => updateAdSortOrder(a.id, i)));
    setAds(next.map((a, i) => ({ ...a, sort_order: i })));
  };

  const handleDelete = (ad: Ad) => {
    Alert.alert(
      'Delete Ad',
      `Delete "${ad.label || 'this ad'}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteAd(ad.id);
            setAds((prev) => prev.filter((a) => a.id !== ad.id));
          },
        },
      ]
    );
  };

  const openAdd = () => {
    setEditingAd(null);
    setFormImageUri('');
    setFormTargetUrl('');
    setFormLabel('');
    setShowModal(true);
  };

  const openEdit = (ad: Ad) => {
    setEditingAd(ad);
    setFormImageUri(ad.image_url);
    setFormTargetUrl(ad.target_url ?? '');
    setFormLabel(ad.label ?? '');
    setShowModal(true);
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please allow access to your photo library.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets[0]) {
      setFormImageUri(result.assets[0].uri);
    }
  };

  const handleSave = async () => {
    if (!formImageUri.trim() || !placement) return;
    setSaving(true);
    try {
      let imageUrl = formImageUri;
      if (
        formImageUri.startsWith('file://') ||
        formImageUri.startsWith('ph://') ||
        formImageUri.startsWith('content://')
      ) {
        setUploadingImage(true);
        imageUrl = await uploadAdImage(formImageUri);
        setUploadingImage(false);
      }

      if (editingAd) {
        const { data } = await updateAd(editingAd.id, {
          image_url: imageUrl,
          target_url: formTargetUrl.trim() || null,
          label: formLabel.trim() || null,
        });
        if (data) setAds((prev) => prev.map((a) => (a.id === editingAd.id ? (data as Ad) : a)));
      } else {
        const { data } = await insertAd(
          placement.id,
          imageUrl,
          formTargetUrl.trim() || null,
          formLabel.trim() || null,
          ads.length
        );
        if (data) setAds((prev) => [...prev, data as Ad]);
      }
      setShowModal(false);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save ad. Please try again.');
    } finally {
      setSaving(false);
      setUploadingImage(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.headerBack, pressed && { opacity: 0.7 }]}
          >
            <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>{placement?.name ?? 'Ad Placement'}</Text>
            <Text style={styles.headerSub}>
              {placement
                ? `${placement.size} · ${ads.length} ad${ads.length !== 1 ? 's' : ''}`
                : 'Loading...'}
            </Text>
          </View>
          {placement ? (
            <Pressable
              onPress={handleTogglePlacement}
              style={({ pressed }) => [
                styles.enablePill,
                {
                  backgroundColor: placement.enabled
                    ? `${Colors.greenLight}18`
                    : `${Colors.textMuted}15`,
                  borderColor: placement.enabled
                    ? `${Colors.greenLight}44`
                    : Colors.surfaceBorder,
                },
                pressed && { opacity: 0.75 },
              ]}
            >
              <View
                style={[
                  styles.enableDot,
                  { backgroundColor: placement.enabled ? Colors.greenLight : Colors.textMuted },
                ]}
              />
              <Text
                style={[
                  styles.enableText,
                  { color: placement.enabled ? Colors.greenLight : Colors.textMuted },
                ]}
              >
                {placement.enabled ? 'Live' : 'Off'}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </SafeAreaView>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={Colors.gold} size="large" />
        </View>
      ) : (
        <FlatList
          data={ads}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View style={styles.listHeader}>
              {/* Placement summary card */}
              <View style={styles.placementCard}>
                <View style={styles.placementCardRow}>
                  <View
                    style={[
                      styles.sizeBadge,
                      {
                        backgroundColor:
                          placement?.size === 'rectangle' ? `${Colors.gold}18` : '#9C27B018',
                      },
                    ]}
                  >
                    <MaterialIcons
                      name={placement?.size === 'rectangle' ? 'crop-landscape' : 'crop-square'}
                      size={15}
                      color={placement?.size === 'rectangle' ? Colors.gold : '#9C27B0'}
                    />
                    <Text
                      style={[
                        styles.sizeBadgeText,
                        {
                          color:
                            placement?.size === 'rectangle' ? Colors.gold : '#9C27B0',
                        },
                      ]}
                    >
                      {placement?.size === 'rectangle' ? 'Rectangle' : 'Square'}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.statusPill,
                      {
                        backgroundColor: placement?.enabled
                          ? `${Colors.greenLight}15`
                          : `${Colors.textMuted}12`,
                      },
                    ]}
                  >
                    <MaterialIcons
                      name={placement?.enabled ? 'visibility' : 'visibility-off'}
                      size={12}
                      color={placement?.enabled ? Colors.greenLight : Colors.textMuted}
                    />
                    <Text
                      style={[
                        styles.statusPillText,
                        {
                          color: placement?.enabled ? Colors.greenLight : Colors.textMuted,
                        },
                      ]}
                    >
                      {placement?.enabled ? 'Visible in app' : 'Hidden from app'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.placementNote}>
                  {placement?.enabled
                    ? 'This placement is live. Active ads below are served in the app.'
                    : 'This placement is off — no ads render regardless of individual ad status.'}
                </Text>
              </View>

              {/* Add ad button */}
              <Pressable
                onPress={openAdd}
                style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.85 }]}
              >
                <LinearGradient
                  colors={[Colors.gold, Colors.goldDim]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.addBtnInner}
                >
                  <MaterialIcons name="add-photo-alternate" size={18} color={Colors.textOnGold} />
                  <Text style={styles.addBtnText}>Add New Ad</Text>
                </LinearGradient>
              </Pressable>

              {ads.length > 0 && (
                <Text style={styles.listLabel}>
                  {ads.length} ad{ads.length !== 1 ? 's' : ''} · ↑↓ to reorder · active ads
                  rotate every 10 s in the app
                </Text>
              )}
            </View>
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <MaterialIcons name="add-photo-alternate" size={44} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>No Ads Yet</Text>
              <Text style={styles.emptySub}>
                Add your first ad to start serving it in this placement.
              </Text>
            </View>
          }
          renderItem={({ item: ad, index }) => (
            <View style={styles.adCard}>
              {/* Thumbnail — tap to edit */}
              <Pressable onPress={() => openEdit(ad)} style={styles.adThumb}>
                <Image
                  source={{ uri: ad.image_url }}
                  style={styles.adThumbImg}
                  contentFit="cover"
                  transition={200}
                />
                <View style={styles.adThumbOverlay}>
                  <MaterialIcons name="edit" size={16} color="#fff" />
                </View>
              </Pressable>

              {/* Info */}
              <View style={styles.adInfo}>
                <Text style={styles.adLabel} numberOfLines={1}>
                  {ad.label || 'Untitled Ad'}
                </Text>
                {ad.target_url ? (
                  <Text style={styles.adUrl} numberOfLines={1}>
                    {ad.target_url}
                  </Text>
                ) : (
                  <Text style={styles.adNoUrl}>No link — display only</Text>
                )}
                <View style={styles.adMetaRow}>
                  <View style={styles.orderBadge}>
                    <Text style={styles.orderText}>#{index + 1}</Text>
                  </View>
                  <View
                    style={[
                      styles.activePill,
                      {
                        backgroundColor: ad.active
                          ? `${Colors.greenLight}15`
                          : 'rgba(255,68,68,0.08)',
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.activeDot,
                        {
                          backgroundColor: ad.active
                            ? Colors.greenLight
                            : Colors.error,
                        },
                      ]}
                    />
                    <Text
                      style={[
                        styles.activeText,
                        { color: ad.active ? Colors.greenLight : Colors.error },
                      ]}
                    >
                      {ad.active ? 'Active' : 'Paused'}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Controls: 2×2 grid — ↑ ↓ / ▶ ✕ */}
              <View style={styles.controls}>
                <Pressable
                  onPress={() => handleMoveUp(index)}
                  disabled={index === 0}
                  style={[styles.ctrlBtn, index === 0 && styles.ctrlBtnOff]}
                  hitSlop={4}
                >
                  <MaterialIcons
                    name="keyboard-arrow-up"
                    size={18}
                    color={index === 0 ? Colors.textMuted : Colors.textSecondary}
                  />
                </Pressable>
                <Pressable
                  onPress={() => handleMoveDown(index)}
                  disabled={index === ads.length - 1}
                  style={[
                    styles.ctrlBtn,
                    index === ads.length - 1 && styles.ctrlBtnOff,
                  ]}
                  hitSlop={4}
                >
                  <MaterialIcons
                    name="keyboard-arrow-down"
                    size={18}
                    color={
                      index === ads.length - 1 ? Colors.textMuted : Colors.textSecondary
                    }
                  />
                </Pressable>
                <Pressable
                  onPress={() => handleToggleAd(ad)}
                  style={styles.ctrlBtn}
                  hitSlop={4}
                >
                  <MaterialIcons
                    name={ad.active ? 'pause' : 'play-arrow'}
                    size={18}
                    color={ad.active ? Colors.gold : Colors.greenLight}
                  />
                </Pressable>
                <Pressable
                  onPress={() => handleDelete(ad)}
                  style={styles.ctrlBtn}
                  hitSlop={4}
                >
                  <MaterialIcons name="delete-outline" size={18} color={Colors.error} />
                </Pressable>
              </View>
            </View>
          )}
        />
      )}

      {/* ── Add / Edit Modal ─────────────────────────────────────────────────── */}
      <Modal
        visible={showModal}
        transparent
        animationType="slide"
        onRequestClose={() => !saving && setShowModal(false)}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <Pressable
          style={modalStyles.overlay}
          onPress={() => !saving && setShowModal(false)}
        >
          <Pressable style={modalStyles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={modalStyles.handle} />
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={modalStyles.sheetContent}>
            <Text style={modalStyles.title}>{editingAd ? 'Edit Ad' : 'Add New Ad'}</Text>

            {/* Image */}
            <Text style={modalStyles.fieldLabel}>Image *</Text>
            {formImageUri ? (
              <View style={modalStyles.previewWrap}>
                <Image
                  source={{ uri: formImageUri }}
                  style={modalStyles.previewImg}
                  contentFit="cover"
                  transition={200}
                />
                <Pressable
                  onPress={pickImage}
                  style={({ pressed }) => [
                    modalStyles.changeBtn,
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  <MaterialIcons name="edit" size={13} color={Colors.textOnGold} />
                  <Text style={modalStyles.changeBtnText}>Change</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={pickImage}
                style={({ pressed }) => [
                  modalStyles.pickerBtn,
                  pressed && { opacity: 0.8 },
                ]}
              >
                <MaterialIcons name="add-photo-alternate" size={28} color={Colors.gold} />
                <Text style={modalStyles.pickerText}>Tap to select image from device</Text>
                <Text style={modalStyles.pickerSub}>Or paste a URL below</Text>
              </Pressable>
            )}

            {/* URL input (also used to paste remote URLs as image) */}
            {!formImageUri && (
              <TextInput
                style={modalStyles.input}
                placeholder="https://example.com/ad-image.jpg"
                placeholderTextColor={Colors.textMuted}
                value={formImageUri}
                onChangeText={setFormImageUri}
                keyboardType="url"
                autoCapitalize="none"
                accessibilityLabel="Image URL"
              />
            )}

            <Text style={modalStyles.fieldLabel}>Target URL (optional)</Text>
            <TextInput
              style={modalStyles.input}
              placeholder="https://example.com"
              placeholderTextColor={Colors.textMuted}
              value={formTargetUrl}
              onChangeText={setFormTargetUrl}
              keyboardType="url"
              autoCapitalize="none"
              accessibilityLabel="Target URL"
            />

            <Text style={modalStyles.fieldLabel}>Internal Label (optional)</Text>
            <TextInput
              style={modalStyles.input}
              placeholder="e.g. Appleton Estate Q3 Campaign"
              placeholderTextColor={Colors.textMuted}
              value={formLabel}
              onChangeText={setFormLabel}
              accessibilityLabel="Ad label"
            />

            <View style={modalStyles.btnRow}>
              <Pressable
                onPress={() => setShowModal(false)}
                disabled={saving}
                style={modalStyles.cancelBtn}
              >
                <Text style={modalStyles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleSave}
                disabled={saving || !formImageUri.trim()}
                style={({ pressed }) => [
                  modalStyles.saveBtn,
                  (saving || !formImageUri.trim()) && { opacity: 0.4 },
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Text style={modalStyles.saveText}>
                  {saving
                    ? uploadingImage
                      ? 'Uploading...'
                      : 'Saving...'
                    : editingAd
                    ? 'Save Changes'
                    : 'Add Ad'}
                </Text>
              </Pressable>
            </View>
            </ScrollView>
          </Pressable>
        </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  gate: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.base,
  },
  gateText: { fontSize: Typography.base, color: Colors.textMuted },
  backBtn: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  backBtnText: { color: Colors.gold, fontWeight: Typography.semibold },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  headerBack: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  headerTitle: {
    fontSize: Typography.lg,
    fontWeight: Typography.black,
    color: Colors.textPrimary,
  },
  headerSub: { fontSize: Typography.xs, color: Colors.textMuted, marginTop: 1 },
  enablePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.full,
    borderWidth: 1.5,
  },
  enableDot: { width: 7, height: 7, borderRadius: 3.5 },
  enableText: { fontSize: Typography.xs, fontWeight: Typography.bold },

  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  listContent: { padding: Spacing.base, gap: Spacing.sm, paddingBottom: Spacing.xxl * 2 },
  listHeader: { gap: Spacing.md, marginBottom: Spacing.xs },

  placementCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.base,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    gap: Spacing.sm,
  },
  placementCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flexWrap: 'wrap',
  },
  sizeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: Spacing.md,
    paddingVertical: 5,
    borderRadius: Radius.full,
  },
  sizeBadgeText: { fontSize: Typography.xs, fontWeight: Typography.semibold },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: Spacing.md,
    paddingVertical: 5,
    borderRadius: Radius.full,
  },
  statusPillText: { fontSize: Typography.xs, fontWeight: Typography.semibold },
  placementNote: { fontSize: Typography.sm, color: Colors.textMuted, lineHeight: 19 },

  addBtn: { borderRadius: Radius.lg, overflow: 'hidden' },
  addBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.base,
  },
  addBtnText: {
    fontSize: Typography.base,
    fontWeight: Typography.bold,
    color: Colors.textOnGold,
  },

  listLabel: {
    fontSize: Typography.xs,
    color: Colors.textMuted,
    fontStyle: 'italic',
    marginBottom: Spacing.xs,
  },

  emptyState: {
    alignItems: 'center',
    paddingVertical: Spacing.xxl,
    gap: Spacing.md,
  },
  emptyTitle: {
    fontSize: Typography.md,
    fontWeight: Typography.bold,
    color: Colors.textSecondary,
  },
  emptySub: {
    fontSize: Typography.sm,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },

  adCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    overflow: 'hidden',
    minHeight: 88,
  },
  adThumb: { width: 88, height: 88, position: 'relative', flexShrink: 0 },
  adThumbImg: { width: '100%', height: '100%' },
  adThumbOverlay: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  adInfo: {
    flex: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: 4,
  },
  adLabel: {
    fontSize: Typography.sm,
    fontWeight: Typography.bold,
    color: Colors.textPrimary,
  },
  adUrl: { fontSize: Typography.xs, color: Colors.gold },
  adNoUrl: { fontSize: Typography.xs, color: Colors.textMuted, fontStyle: 'italic' },
  adMetaRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginTop: 2 },
  orderBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  orderText: { fontSize: 10, color: Colors.textMuted, fontWeight: Typography.bold },
  activePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  activeDot: { width: 6, height: 6, borderRadius: 3 },
  activeText: { fontSize: 10, fontWeight: Typography.semibold },

  // 2×2 control grid
  controls: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    width: 88,
    flexShrink: 0,
  },
  ctrlBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  ctrlBtnOff: { opacity: 0.3 },
});

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: Spacing.base,
    paddingBottom: 0,
    maxHeight: '90%',
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
  },
  sheetContent: {
    gap: Spacing.md,
    paddingBottom: Spacing.xxl,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.surfaceBorder,
    alignSelf: 'center',
    marginBottom: Spacing.xs,
  },
  title: {
    fontSize: Typography.md,
    fontWeight: Typography.black,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  fieldLabel: {
    fontSize: Typography.xs,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: -Spacing.xs,
  },
  previewWrap: {
    height: 140,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    position: 'relative',
  },
  previewImg: { width: '100%', height: '100%' },
  changeBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.gold,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  changeBtnText: {
    fontSize: Typography.xs,
    color: Colors.textOnGold,
    fontWeight: Typography.bold,
  },
  pickerBtn: {
    height: 120,
    backgroundColor: Colors.goldSurface,
    borderRadius: Radius.lg,
    borderWidth: 2,
    borderColor: `${Colors.gold}44`,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  pickerText: {
    fontSize: Typography.sm,
    color: Colors.gold,
    fontWeight: Typography.semibold,
  },
  pickerSub: { fontSize: Typography.xs, color: Colors.textMuted },
  input: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.surfaceBorder,
    paddingHorizontal: Spacing.md,
    height: 50,
    color: Colors.textPrimary,
    fontSize: Typography.base,
  },
  btnRow: { flexDirection: 'row', gap: Spacing.md },
  cancelBtn: {
    flex: 1,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  cancelText: { color: Colors.textSecondary, fontWeight: Typography.semibold },
  saveBtn: {
    flex: 2,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    backgroundColor: Colors.gold,
    borderRadius: Radius.md,
  },
  saveText: { color: Colors.textOnGold, fontWeight: Typography.bold },
});
