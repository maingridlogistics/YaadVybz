import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, TextInput, ScrollView, Pressable, StyleSheet, Alert,
  ActivityIndicator, KeyboardAvoidingView, Platform, Switch,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Colors, Typography, Spacing, Radius } from '../constants/theme';
import { useAuth } from '../hooks/useAuth';
import { useBusinesses } from '../hooks/useBusinesses';
import { BusinessCategory, BusinessData, BusinessLocation, BusinessService, DEFAULT_WEEK_HOURS, WeeklyHours, DAY_NAMES, DAY_LABELS, DayName, PRICE_RANGES } from '../types/business';
import { createBusiness, createLocation, createService, uploadBusinessImage, fetchCategories } from '../services/businessService';
import { PARISHES } from '../constants/data';

// ─── Step indicator ───────────────────────────────────────────────────────────
function StepBar({ total, current }: { total: number; current: number }) {
  return (
    <View style={sbStyles.row}>
      {Array.from({ length: total }).map((_, i) => (
        <View key={i} style={[sbStyles.step, i < current ? sbStyles.done : i === current ? sbStyles.active : sbStyles.idle]} />
      ))}
    </View>
  );
}
const sbStyles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 4 },
  step: { flex: 1, height: 3, borderRadius: 2 },
  done: { backgroundColor: Colors.gold },
  active: { backgroundColor: Colors.goldDim },
  idle: { backgroundColor: Colors.surfaceBorder },
});

// ─── Image picker helper ──────────────────────────────────────────────────────
async function pickImage(): Promise<string | null> {
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
  if (res.canceled || !res.assets?.[0]) return null;
  return res.assets[0].uri;
}

const TOTAL_STEPS = 7;

// ─── Default form state ───────────────────────────────────────────────────────
const DEFAULT_LOCATION: Omit<BusinessLocation, 'id' | 'businessId' | 'ownerId' | 'createdAt' | 'updatedAt'> = {
  branchName: '',
  parish: '',
  address: '',
  city: '',
  latitude: null,
  longitude: null,
  phone: '',
  whatsapp: '',
  email: '',
  openingHours: DEFAULT_WEEK_HOURS,
  notes: '',
  isPrimary: true,
  active: true,
};

export default function CreateBusinessScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { myBusiness, refreshMyBusiness, setMyBusiness } = useBusinesses();

  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);

  // Step 1 — Basics
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [logoUri, setLogoUri] = useState('');
  const [coverUri, setCoverUri] = useState('');
  const [priceRange, setPriceRange] = useState('');

  // Categories (loaded on mount)
  const [categories, setCategories] = useState<BusinessCategory[]>([]);
  const catLoaded = useRef(false);
  if (!catLoaded.current) {
    catLoaded.current = true;
    fetchCategories().then(({ data }) => setCategories(data));
  }

  // Step 2 — Services
  const [services, setServices] = useState<Array<{ name: string; description: string; startingPrice: string }>>([]);
  const [svcName, setSvcName] = useState('');
  const [svcDesc, setSvcDesc] = useState('');
  const [svcPrice, setSvcPrice] = useState('');

  // Step 3 — Location
  const [location, setLocation] = useState(DEFAULT_LOCATION);

  // Step 4 — Hours (attached to location)
  const [hours, setHours] = useState<WeeklyHours>(DEFAULT_WEEK_HOURS);

  // Step 5 — Contact
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [instagram, setInstagram] = useState('');
  const [facebook, setFacebook] = useState('');
  const [tiktok, setTiktok] = useState('');

  // Step 6 — Gallery
  const [galleryUris, setGalleryUris] = useState<string[]>([]);

  const canAdvance = useCallback(() => {
    if (step === 0) return name.trim().length >= 2;
    if (step === 2) return location.parish.trim().length > 0 && location.address.trim().length > 0;
    return true;
  }, [step, name, location]);

  const addService = () => {
    if (!svcName.trim()) return;
    setServices((prev) => [...prev, { name: svcName.trim(), description: svcDesc.trim(), startingPrice: svcPrice.trim() }]);
    setSvcName(''); setSvcDesc(''); setSvcPrice('');
  };

  const addGallery = async () => {
    const uri = await pickImage();
    if (uri) setGalleryUris((prev) => [...prev, uri]);
  };

  const removeGallery = (idx: number) => setGalleryUris((prev) => prev.filter((_, i) => i !== idx));

  const submit = async () => {
    if (!user) { Alert.alert('Sign in required'); return; }
    if (myBusiness) {
      Alert.alert('Business Exists', 'You already have a business listing. You can manage it from your Business Dashboard.');
      return;
    }
    if (submitting) return; // prevent double-tap
    setSubmitting(true);
    try {
      // Upload images
      setUploadingImages(true);
      let logoUrl = '';
      let coverUrl = '';
      let galleryUrls: string[] = [];

      if (logoUri) logoUrl = await uploadBusinessImage(logoUri, user.id, 'logo');
      if (coverUri) coverUrl = await uploadBusinessImage(coverUri, user.id, 'cover');
      for (const uri of galleryUris) {
        const url = await uploadBusinessImage(uri, user.id, 'gallery');
        galleryUrls.push(url);
      }
      setUploadingImages(false);

      const bizData: BusinessData = {
        name: name.trim(),
        categoryId,
        secondaryCategoryIds: [],
        description: description.trim(),
        logoUrl,
        coverUrl,
        galleryUrls,
        featuredImageUrl: coverUrl || galleryUrls[0] || '',
        phone: phone.trim(),
        whatsapp: whatsapp.trim(),
        email: email.trim(),
        website: website.trim(),
        instagram: instagram.trim(),
        facebook: facebook.trim(),
        tiktok: tiktok.trim(),
        otherSocialLinks: {},
        priceRange,
      };

      const { data: biz, error: bizErr } = await createBusiness(user.id, bizData);
      if (bizErr || !biz) throw new Error(bizErr ?? 'Failed to create business');

      // Create primary location
      await createLocation(biz.id, user.id, {
        ...location,
        openingHours: hours,
      });

      // Create services
      for (let i = 0; i < services.length; i++) {
        await createService(biz.id, user.id, {
          name: services[i].name,
          description: services[i].description,
          startingPrice: services[i].startingPrice || undefined,
          active: true,
          sortOrder: i,
        });
      }

      await refreshMyBusiness();
      router.replace('/business-dashboard' as any);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
      setUploadingImages(false);
    }
  };

  const renderStep = () => {
    switch (step) {
      // ── Step 0: Basics ──────────────────────────────────────────────────
      case 0:
        return (
          <View style={styles.stepBody}>
            <Text style={styles.stepTitle}>Business Basics</Text>
            <Text style={styles.stepSub}>Tell us about your business</Text>

            {/* Logo */}
            <Text style={styles.label}>Logo</Text>
            <Pressable onPress={async () => { const u = await pickImage(); if (u) setLogoUri(u); }} style={styles.imagePicker}>
              {logoUri ? <Image source={{ uri: logoUri }} style={styles.imagePreview} contentFit="cover" /> : (
                <View style={styles.imagePlaceholder}>
                  <MaterialIcons name="add-photo-alternate" size={28} color={Colors.gold} />
                  <Text style={styles.imagePlaceholderText}>Add Logo</Text>
                </View>
              )}
            </Pressable>

            {/* Cover */}
            <Text style={styles.label}>Cover Image</Text>
            <Pressable onPress={async () => { const u = await pickImage(); if (u) setCoverUri(u); }} style={[styles.imagePicker, { height: 140 }]}>
              {coverUri ? <Image source={{ uri: coverUri }} style={styles.imagePreview} contentFit="cover" /> : (
                <View style={styles.imagePlaceholder}>
                  <MaterialIcons name="panorama" size={28} color={Colors.gold} />
                  <Text style={styles.imagePlaceholderText}>Add Cover Photo</Text>
                </View>
              )}
            </Pressable>

            <Text style={styles.label}>Business Name *</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="e.g. Jamaica Grill & Bar" placeholderTextColor={Colors.textMuted} />

            <Text style={styles.label}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: Spacing.md }}>
              <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                {categories.map((cat) => (
                  <Pressable key={cat.id} onPress={() => setCategoryId(cat.id)}
                    style={[styles.catChip, categoryId === cat.id && styles.catChipSelected]}>
                    <Text style={[styles.catChipText, categoryId === cat.id && { color: Colors.textOnGold }]}>{cat.name}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>

            <Text style={styles.label}>Description</Text>
            <TextInput style={[styles.input, styles.textarea]} value={description} onChangeText={setDescription}
              placeholder="Describe your business..." placeholderTextColor={Colors.textMuted} multiline numberOfLines={4} />

            <Text style={styles.label}>Price Range</Text>
            <View style={styles.priceRow}>
              {PRICE_RANGES.map((p) => (
                <Pressable key={p.value} onPress={() => setPriceRange(p.value)}
                  style={[styles.priceChip, priceRange === p.value && styles.priceChipSelected]}>
                  <Text style={[styles.priceChipText, priceRange === p.value && { color: Colors.gold }]}>{p.value}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        );

      // ── Step 1: Services ────────────────────────────────────────────────
      case 1:
        return (
          <View style={styles.stepBody}>
            <Text style={styles.stepTitle}>Services</Text>
            <Text style={styles.stepSub}>What do you offer? (optional)</Text>
            {services.map((s, i) => (
              <View key={i} style={styles.svcItem}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.svcName}>{s.name}</Text>
                  {s.startingPrice ? <Text style={styles.svcPrice}>From {s.startingPrice}</Text> : null}
                </View>
                <Pressable onPress={() => setServices((prev) => prev.filter((_, j) => j !== i))} hitSlop={8}>
                  <MaterialIcons name="close" size={18} color={Colors.error} />
                </Pressable>
              </View>
            ))}
            <TextInput style={styles.input} value={svcName} onChangeText={setSvcName} placeholder="Service name" placeholderTextColor={Colors.textMuted} />
            <TextInput style={[styles.input, { marginTop: Spacing.sm }]} value={svcDesc} onChangeText={setSvcDesc} placeholder="Description (optional)" placeholderTextColor={Colors.textMuted} />
            <TextInput style={[styles.input, { marginTop: Spacing.sm }]} value={svcPrice} onChangeText={setSvcPrice} placeholder="Starting price (optional, e.g. JMD 2,000)" placeholderTextColor={Colors.textMuted} />
            <Pressable onPress={addService} style={[styles.addBtn, !svcName.trim() && { opacity: 0.4 }]} disabled={!svcName.trim()}>
              <MaterialIcons name="add" size={18} color={Colors.textOnGold} />
              <Text style={styles.addBtnText}>Add Service</Text>
            </Pressable>
          </View>
        );

      // ── Step 2: Location ────────────────────────────────────────────────
      case 2:
        return (
          <View style={styles.stepBody}>
            <Text style={styles.stepTitle}>Location</Text>
            <Text style={styles.stepSub}>Where is your business located?</Text>

            <Text style={styles.label}>Branch / Location Name</Text>
            <TextInput style={styles.input} value={location.branchName} onChangeText={(v) => setLocation((p) => ({ ...p, branchName: v }))} placeholder="e.g. Kingston Main Branch" placeholderTextColor={Colors.textMuted} />

            <Text style={styles.label}>Parish *</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: Spacing.md }}>
              <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                {PARISHES.map((p) => (
                  <Pressable key={p} onPress={() => setLocation((prev) => ({ ...prev, parish: p }))}
                    style={[styles.catChip, location.parish === p && styles.catChipSelected]}>
                    <Text style={[styles.catChipText, location.parish === p && { color: Colors.textOnGold }]}>{p}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>

            <Text style={styles.label}>Street Address *</Text>
            <TextInput style={styles.input} value={location.address} onChangeText={(v) => setLocation((p) => ({ ...p, address: v }))} placeholder="e.g. 12 Hope Road" placeholderTextColor={Colors.textMuted} />

            <Text style={styles.label}>City / Community</Text>
            <TextInput style={styles.input} value={location.city} onChangeText={(v) => setLocation((p) => ({ ...p, city: v }))} placeholder="e.g. New Kingston" placeholderTextColor={Colors.textMuted} />

            <Text style={styles.label}>Phone</Text>
            <TextInput style={styles.input} value={location.phone} onChangeText={(v) => setLocation((p) => ({ ...p, phone: v }))} placeholder="+1 876 555 0100" placeholderTextColor={Colors.textMuted} keyboardType="phone-pad" />

            <Text style={styles.label}>WhatsApp</Text>
            <TextInput style={styles.input} value={location.whatsapp} onChangeText={(v) => setLocation((p) => ({ ...p, whatsapp: v }))} placeholder="+1 876 555 0100" placeholderTextColor={Colors.textMuted} keyboardType="phone-pad" />
          </View>
        );

      // ── Step 3: Hours ───────────────────────────────────────────────────
      case 3:
        return (
          <View style={styles.stepBody}>
            <Text style={styles.stepTitle}>Opening Hours</Text>
            <Text style={styles.stepSub}>Set your weekly schedule (optional)</Text>
            {DAY_NAMES.map((day) => {
              const h = hours[day];
              return (
                <View key={day} style={styles.dayRow}>
                  <Text style={styles.dayLabel}>{DAY_LABELS[day]}</Text>
                  <Switch
                    value={!h.closed}
                    onValueChange={(v) => setHours((prev) => ({ ...prev, [day]: { ...prev[day], closed: !v } }))}
                    trackColor={{ false: Colors.surfaceBorder, true: `${Colors.gold}66` }}
                    thumbColor={!h.closed ? Colors.gold : Colors.textMuted}
                  />
                  {!h.closed && (
                    <View style={styles.timeRow}>
                      <TextInput
                        style={styles.timeInput}
                        value={h.open}
                        onChangeText={(v) => setHours((prev) => ({ ...prev, [day]: { ...prev[day], open: v } }))}
                        placeholder="09:00"
                        placeholderTextColor={Colors.textMuted}
                      />
                      <Text style={styles.timeSep}>–</Text>
                      <TextInput
                        style={styles.timeInput}
                        value={h.close}
                        onChangeText={(v) => setHours((prev) => ({ ...prev, [day]: { ...prev[day], close: v } }))}
                        placeholder="17:00"
                        placeholderTextColor={Colors.textMuted}
                      />
                    </View>
                  )}
                  {h.closed && <Text style={styles.closedLabel}>Closed</Text>}
                </View>
              );
            })}
          </View>
        );

      // ── Step 4: Contact ─────────────────────────────────────────────────
      case 4:
        return (
          <View style={styles.stepBody}>
            <Text style={styles.stepTitle}>Contact & Social</Text>
            <Text style={styles.stepSub}>How can customers reach you?</Text>
            {[
              { label: 'Phone', value: phone, set: setPhone, placeholder: '+1 876 555 0100', keyboard: 'phone-pad' as const },
              { label: 'WhatsApp', value: whatsapp, set: setWhatsapp, placeholder: '+1 876 555 0100', keyboard: 'phone-pad' as const },
              { label: 'Email', value: email, set: setEmail, placeholder: 'info@mybusiness.com', keyboard: 'email-address' as const },
              { label: 'Website', value: website, set: setWebsite, placeholder: 'www.mybusiness.com', keyboard: 'url' as const },
              { label: 'Instagram', value: instagram, set: setInstagram, placeholder: '@mybusiness', keyboard: 'default' as const },
              { label: 'Facebook', value: facebook, set: setFacebook, placeholder: 'mybusiness', keyboard: 'default' as const },
              { label: 'TikTok', value: tiktok, set: setTiktok, placeholder: '@mybusiness', keyboard: 'default' as const },
            ].map((f) => (
              <View key={f.label}>
                <Text style={styles.label}>{f.label}</Text>
                <TextInput style={styles.input} value={f.value} onChangeText={f.set} placeholder={f.placeholder} placeholderTextColor={Colors.textMuted} keyboardType={f.keyboard} autoCapitalize="none" />
              </View>
            ))}
          </View>
        );

      // ── Step 5: Gallery ─────────────────────────────────────────────────
      case 5:
        return (
          <View style={styles.stepBody}>
            <Text style={styles.stepTitle}>Gallery</Text>
            <Text style={styles.stepSub}>Add photos of your business (optional)</Text>
            <View style={styles.galleryGrid}>
              {galleryUris.map((uri, i) => (
                <View key={i} style={styles.galleryThumb}>
                  <Image source={{ uri }} style={styles.galleryImg} contentFit="cover" />
                  <Pressable onPress={() => removeGallery(i)} style={styles.galleryRemove}>
                    <MaterialIcons name="close" size={14} color={Colors.textPrimary} />
                  </Pressable>
                </View>
              ))}
              {galleryUris.length < 10 && (
                <Pressable onPress={addGallery} style={styles.galleryAdd}>
                  <MaterialIcons name="add-photo-alternate" size={28} color={Colors.gold} />
                </Pressable>
              )}
            </View>
          </View>
        );

      // ── Step 6: Review ──────────────────────────────────────────────────
      case 6:
        return (
          <View style={styles.stepBody}>
            <Text style={styles.stepTitle}>Review & Submit</Text>
            <Text style={styles.stepSub}>Your business will be reviewed before going live.</Text>

            {coverUri ? (
              <Image source={{ uri: coverUri }} style={styles.reviewCover} contentFit="cover" />
            ) : null}

            <View style={styles.reviewCard}>
              {[
                { label: 'Name', value: name },
                { label: 'Category', value: categories.find((c) => c.id === categoryId)?.name ?? 'Not selected' },
                { label: 'Price Range', value: priceRange || 'Not set' },
                { label: 'Parish', value: location.parish || 'Not set' },
                { label: 'Address', value: location.address || 'Not set' },
                { label: 'Services', value: `${services.length} added` },
                { label: 'Gallery', value: `${galleryUris.length} photos` },
              ].map((r) => (
                <View key={r.label} style={styles.reviewRow}>
                  <Text style={styles.reviewLabel}>{r.label}</Text>
                  <Text style={styles.reviewValue}>{r.value}</Text>
                </View>
              ))}
            </View>

            <View style={styles.pendingNote}>
              <MaterialIcons name="info-outline" size={16} color={Colors.gold} />
              <Text style={styles.pendingNoteText}>
                Your business listing will be reviewed by our team before it becomes publicly visible. You will be notified once approved.
              </Text>
            </View>
          </View>
        );

      default:
        return null;
    }
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <MaterialIcons name="close" size={22} color={Colors.textPrimary} />
        </Pressable>
        <Text style={styles.topTitle}>Create Business</Text>
        <StepBar total={TOTAL_STEPS} current={step} />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 120 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {renderStep()}
      </ScrollView>

      {/* Bottom nav */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 8 }]}>
        {step > 0 && (
          <Pressable onPress={() => setStep((s) => s - 1)} style={styles.prevBtn}>
            <MaterialIcons name="arrow-back" size={20} color={Colors.textPrimary} />
            <Text style={styles.prevBtnText}>Back</Text>
          </Pressable>
        )}
        <View style={{ flex: 1 }} />
        {step < TOTAL_STEPS - 1 ? (
          <Pressable
            onPress={() => setStep((s) => s + 1)}
            disabled={!canAdvance()}
            style={[styles.nextBtn, !canAdvance() && { opacity: 0.4 }]}
          >
            <Text style={styles.nextBtnText}>Next</Text>
            <MaterialIcons name="arrow-forward" size={20} color={Colors.textOnGold} />
          </Pressable>
        ) : (
          <Pressable onPress={submit} disabled={submitting} style={[styles.nextBtn, submitting && { opacity: 0.6 }]}>
            {submitting ? (
              <ActivityIndicator color={Colors.textOnGold} size="small" />
            ) : (
              <>
                <Text style={styles.nextBtnText}>{uploadingImages ? 'Uploading...' : 'Submit for Review'}</Text>
                <MaterialIcons name="check" size={20} color={Colors.textOnGold} />
              </>
            )}
          </Pressable>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  topBar: { paddingHorizontal: Spacing.base, paddingBottom: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder, gap: Spacing.md },
  backBtn: { alignSelf: 'flex-start' },
  topTitle: { fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textPrimary },
  stepBody: { padding: Spacing.base, gap: Spacing.sm },
  stepTitle: { fontSize: Typography.xl, fontWeight: Typography.black, color: Colors.textPrimary, marginBottom: 4 },
  stepSub: { fontSize: Typography.base, color: Colors.textMuted, marginBottom: Spacing.lg },
  label: { fontSize: Typography.sm, fontWeight: Typography.medium, color: Colors.textSecondary, marginBottom: 6, marginTop: Spacing.md },
  input: { backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, color: Colors.textPrimary, fontSize: Typography.base, borderWidth: 1, borderColor: Colors.surfaceBorder },
  textarea: { height: 100, textAlignVertical: 'top' },
  imagePicker: { height: 100, borderRadius: Radius.md, borderWidth: 2, borderColor: Colors.surfaceBorder, borderStyle: 'dashed', overflow: 'hidden', marginBottom: Spacing.md },
  imagePreview: { width: '100%', height: '100%' },
  imagePlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.xs },
  imagePlaceholderText: { fontSize: Typography.sm, color: Colors.textMuted },
  catChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.full, backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: Colors.surfaceBorder },
  catChipSelected: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  catChipText: { fontSize: Typography.sm, color: Colors.textSecondary, fontWeight: Typography.medium },
  priceRow: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  priceChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: Radius.full, backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: Colors.surfaceBorder },
  priceChipSelected: { borderColor: Colors.gold },
  priceChipText: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textSecondary },
  svcItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder },
  svcName: { fontSize: Typography.base, fontWeight: Typography.medium, color: Colors.textPrimary },
  svcPrice: { fontSize: Typography.sm, color: Colors.gold, marginTop: 2 },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, backgroundColor: Colors.gold, borderRadius: Radius.md, paddingVertical: Spacing.md, marginTop: Spacing.md },
  addBtnText: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textOnGold },
  dayRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder, gap: Spacing.md },
  dayLabel: { width: 90, fontSize: Typography.sm, color: Colors.textPrimary, fontWeight: Typography.medium },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1 },
  timeInput: { flex: 1, backgroundColor: Colors.surfaceElevated, borderRadius: Radius.sm, paddingHorizontal: Spacing.sm, paddingVertical: 6, color: Colors.textPrimary, fontSize: Typography.sm, borderWidth: 1, borderColor: Colors.surfaceBorder, textAlign: 'center' },
  timeSep: { color: Colors.textMuted, fontSize: Typography.sm },
  closedLabel: { flex: 1, fontSize: Typography.sm, color: Colors.textMuted, textAlign: 'right' },
  galleryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  galleryThumb: { width: 96, height: 96, borderRadius: Radius.sm, overflow: 'hidden', position: 'relative' },
  galleryImg: { width: '100%', height: '100%' },
  galleryRemove: { position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  galleryAdd: { width: 96, height: 96, borderRadius: Radius.sm, borderWidth: 2, borderColor: Colors.surfaceBorder, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  reviewCover: { width: '100%', height: 160, borderRadius: Radius.lg, marginBottom: Spacing.lg },
  reviewCard: { backgroundColor: Colors.surfaceElevated, borderRadius: Radius.lg, padding: Spacing.md, gap: Spacing.sm, marginBottom: Spacing.lg },
  reviewRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: Spacing.xs },
  reviewLabel: { fontSize: Typography.sm, color: Colors.textMuted },
  reviewValue: { fontSize: Typography.sm, color: Colors.textPrimary, fontWeight: Typography.medium, textAlign: 'right', flex: 1, paddingLeft: Spacing.md },
  pendingNote: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start', backgroundColor: Colors.goldSurface, borderRadius: Radius.md, padding: Spacing.md, borderWidth: 1, borderColor: `${Colors.gold}33` },
  pendingNoteText: { flex: 1, fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 20 },
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.base, paddingTop: Spacing.md, backgroundColor: Colors.background, borderTopWidth: 1, borderTopColor: Colors.surfaceBorder, gap: Spacing.md },
  prevBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md },
  prevBtnText: { fontSize: Typography.base, color: Colors.textSecondary },
  nextBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.gold, borderRadius: Radius.lg, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md },
  nextBtnText: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textOnGold },
});
