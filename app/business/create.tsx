// ─── List Your Business — Multi-step wizard ───────────────────────────────────
// 10 steps: Basics → Location → Location Details → Contact → Hours → Services
//           → Photos → Service Areas → About → Review & Submit
// Draft persisted to AsyncStorage. New businesses always submit as 'pending'.

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, StyleSheet, ScrollView, Pressable,
  KeyboardAvoidingView, Platform, Alert, Switch, ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import { JAMAICA_PARISHES } from '../../constants/parishes';
import { useBusinesses } from '../../hooks/useBusinesses';
import { useAuth } from '../../hooks/useAuth';
import {
  createBusiness,
  upsertBusinessHours,
  replaceBusinessServices,
  replaceServiceAreas,
  addBusinessPhoto,
} from '../../services/businessService';
import { getSupabaseClient } from '../../lib/supabase';

const DRAFT_KEY = '@vybzhub/biz_create_draft';
const TOTAL_STEPS = 10;
const STEP_LABELS = [
  'Basics', 'Location', 'Address', 'Contact',
  'Hours', 'Services', 'Photos', 'Areas', 'About', 'Review',
];

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

const LOCATION_TYPES = [
  { key: 'physical',  label: 'Physical',   icon: 'storefront',  desc: 'Customers visit your shop/office' },
  { key: 'home_based',label: 'Home-Based', icon: 'home',        desc: 'Based at your home address' },
  { key: 'mobile',    label: 'Mobile',     icon: 'two-wheeler', desc: 'You travel to customers' },
  { key: 'online',    label: 'Online',     icon: 'language',    desc: 'No physical location' },
  { key: 'hybrid',    label: 'Hybrid',     icon: 'business',    desc: 'Both physical and online' },
] as const;
type LocationType = typeof LOCATION_TYPES[number]['key'];

interface HourEntry {
  day_of_week: number;
  open_time: string;
  close_time: string;
  closed: boolean;
}

interface ServiceEntry {
  name: string;
  description: string;
  price_text: string;
  enabled: boolean;
}

interface FormData {
  name: string;
  category_id: string;
  description: string;
  location_type: LocationType;
  location_is_public: boolean;
  primary_parish: string;
  town: string;
  street_address: string;
  phone: string;
  whatsapp: string;
  website: string;
  instagram: string;
  facebook: string;
  logo_url: string;
  cover_url: string;
  photo_urls: string[];
  service_areas: string[];
  hours: HourEntry[];
  services: ServiceEntry[];
}

const DEFAULT_HOURS: HourEntry[] = DAYS.map((_, i) => ({
  day_of_week: i,
  open_time: '09:00',
  close_time: '17:00',
  closed: i === 0 || i === 6, // Sun+Sat closed by default
}));

const INITIAL_FORM: FormData = {
  name: '', category_id: '', description: '',
  location_type: 'physical', location_is_public: true,
  primary_parish: '', town: '',
  street_address: '', phone: '', whatsapp: '',
  website: '', instagram: '', facebook: '',
  logo_url: '', cover_url: '', photo_urls: [],
  service_areas: [], hours: DEFAULT_HOURS, services: [],
};

// ─── Step progress bar ────────────────────────────────────────────────────────
function StepBar({ step }: { step: number }) {
  return (
    <View style={sp.wrap}>
      {STEP_LABELS.map((_, i) => (
        <View
          key={i}
          style={[
            sp.seg,
            i < step && sp.done,
            i === step && sp.active,
          ]}
        />
      ))}
    </View>
  );
}
const sp = StyleSheet.create({
  wrap: { flexDirection: 'row', gap: 3, paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm },
  seg: { flex: 1, height: 3, borderRadius: 2, backgroundColor: Colors.surfaceBorder },
  done: { backgroundColor: Colors.gold },
  active: { backgroundColor: Colors.gold },
});

// ─── Field ────────────────────────────────────────────────────────────────────
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: Spacing.xs }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
        <Text style={f.label}>{label}</Text>
        {hint ? <Text style={f.hint}>{hint}</Text> : null}
      </View>
      {children}
    </View>
  );
}
const f = StyleSheet.create({
  label: { fontSize: Typography.sm, color: Colors.textSecondary, fontWeight: Typography.semibold },
  hint: { fontSize: Typography.xs, color: Colors.textMuted },
});

// ─── Input ────────────────────────────────────────────────────────────────────
const inp = StyleSheet.create({
  base: {
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1.5, borderColor: Colors.surfaceBorder,
    paddingHorizontal: Spacing.md, height: 52,
    fontSize: Typography.base, color: Colors.textPrimary,
  },
  multi: { height: 100, paddingTop: Spacing.md, textAlignVertical: 'top' },
});

// ─── Parish picker modal ──────────────────────────────────────────────────────
function ParishPickerRow({ value, onSelect }: { value: string; onSelect: (p: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <View>
      <Pressable onPress={() => setOpen(!open)} style={inp.base}>
        <Text style={{ color: value ? Colors.textPrimary : Colors.textMuted, lineHeight: 50, fontSize: Typography.base }}>
          {value || 'Select parish...'}
        </Text>
      </Pressable>
      {open && (
        <ScrollView style={dd.list} nestedScrollEnabled showsVerticalScrollIndicator={false}>
          {JAMAICA_PARISHES.map((p) => (
            <Pressable key={p} onPress={() => { onSelect(p); setOpen(false); }}
              style={({ pressed }) => [dd.item, value === p && dd.itemActive, pressed && { opacity: 0.7 }]}>
              <Text style={[dd.itemText, value === p && { color: Colors.gold }]}>{p}</Text>
              {value === p && <MaterialIcons name="check" size={14} color={Colors.gold} />}
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
const dd = StyleSheet.create({
  list: { backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.surfaceBorder, maxHeight: 200, marginTop: 4 },
  item: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder },
  itemActive: { backgroundColor: Colors.goldSurface },
  itemText: { fontSize: Typography.base, color: Colors.textSecondary },
});

// ─── Main wizard ──────────────────────────────────────────────────────────────
export default function CreateBusinessScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { categories, loadCategories } = useBusinesses();
  const scrollRef = useRef<ScrollView>(null);

  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormData>({ ...INITIAL_FORM });
  const [submitting, setSubmitting] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => { loadCategories(); }, [loadCategories]);

  // Load draft
  useEffect(() => {
    AsyncStorage.getItem(DRAFT_KEY).then((raw) => {
      if (!raw) return;
      try { setForm({ ...INITIAL_FORM, ...JSON.parse(raw) }); setHasDraft(true); } catch {}
    });
  }, []);

  const saveDraft = useCallback((f: FormData) => {
    AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(f)).catch(() => {});
  }, []);
  const clearDraft = useCallback(() => { AsyncStorage.removeItem(DRAFT_KEY).catch(() => {}); }, []);

  const update = useCallback((key: keyof FormData, value: any) => {
    setForm((prev) => { const next = { ...prev, [key]: value }; saveDraft(next); return next; });
  }, [saveDraft]);

  const goNext = () => {
    if (step < TOTAL_STEPS - 1) {
      setStep((s) => s + 1);
      setTimeout(() => scrollRef.current?.scrollTo({ y: 0, animated: false }), 50);
    }
  };

  const goBack = () => {
    if (step > 0) { setStep((s) => s - 1); setTimeout(() => scrollRef.current?.scrollTo({ y: 0, animated: false }), 50); }
    else router.back();
  };

  const isStepValid = (): boolean => {
    switch (step) {
      case 0: return form.name.trim().length > 1 && !!form.category_id;
      case 1: return !!form.primary_parish;
      default: return true;
    }
  };

  // Upload image helper
  const pickImage = useCallback(async (field: 'logo_url' | 'cover_url' | 'photo_urls') => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission Required', 'Please allow photo library access.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: field !== 'photo_urls',
      aspect: [1, 1],
      quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;
    const uri = result.assets[0].uri;
    const supabase = getSupabaseClient();
    try {
      // Verify session is active before uploading — stale session causes RLS rejection
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        Alert.alert('Session Expired', 'Your session has expired. Please sign in again and retry.');
        return;
      }
      // Normalise extension — iOS URIs may end in .jpeg, .heic, .HEIF, etc.
      const rawExt = (uri.split('.').pop() ?? 'jpg').toLowerCase();
      const ext = rawExt === 'jpeg' ? 'jpeg' : rawExt === 'png' ? 'png' : rawExt === 'webp' ? 'webp' : 'jpeg';
      const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
      const path = `${session.user.id}/${Date.now()}.${ext}`;
      // Use fetch().arrayBuffer() — reliable on React Native / Hermes (avoids FileReader issues)
      const arrayBuffer = await fetch(uri).then((r) => r.arrayBuffer());
      const { error } = await supabase.storage.from('business-images').upload(path, arrayBuffer, {
        contentType: mimeType, upsert: true,
      });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from('business-images').getPublicUrl(path);
      const publicUrl = urlData.publicUrl;
      if (field === 'photo_urls') {
        update('photo_urls', [...form.photo_urls, publicUrl]);
      } else {
        update(field, publicUrl);
      }
    } catch (e: any) {
      Alert.alert('Upload failed', e.message ?? 'Could not upload image. Please try again.');
    }
  }, [form.photo_urls, update]);

  // Submit
  const handleSubmit = async () => {
    if (submitting || !user) return;
    setSubmitting(true);
    try {
      // Determine public address: physical=always, hybrid=user-controlled, others=never
      const shouldExposeAddress =
        form.location_type === 'physical' ||
        (form.location_type === 'hybrid' && form.location_is_public);
      // ── Atomic business submission — DB trigger enforce_business_submit_entitlement
      // The AFTER INSERT trigger consumes post allowance atomically.
      // If allowance is exceeded or billing period unavailable, the INSERT is
      // rolled back server-side. The error bubbles up through createBusiness.
      const { id, error } = await createBusiness({
        name: form.name.trim(),
        category_id: form.category_id,
        description: form.description.trim(),
        location_type: form.location_type,
        location_is_public: form.location_type === 'physical' ? true : form.location_is_public,
        primary_parish: form.primary_parish,
        town: form.town.trim(),
        street_address: shouldExposeAddress ? (form.street_address.trim() || null) : null,
        phone: form.phone.trim() || null,
        whatsapp: form.whatsapp.trim() || null,
        website: form.website.trim() || null,
        instagram: form.instagram.trim() || null,
        facebook: form.facebook.trim() || null,
        logo_url: form.logo_url || null,
        cover_url: form.cover_url || null,
      }, user.id);

      if (error || !id) {
        const msg = error ?? 'Please try again.';
        if (
          msg.includes('Post limit reached') ||
          msg.includes('posts used') ||
          msg.includes('billing cycle')
        ) {
          Alert.alert('Post Limit Reached', msg + '\n\nUpgrade your plan for more posts per cycle.');
        } else if (
          msg.includes('Subscription entitlement could not be verified') ||
          msg.includes('billing period has expired')
        ) {
          Alert.alert('Subscription Sync Required', msg);
        } else {
          Alert.alert('Submission Failed', msg);
        }
        return;
      }

      // Parallel: hours, services, service areas, photos
      await Promise.all([
        upsertBusinessHours(id, form.hours),
        replaceBusinessServices(id, form.services.filter((s) => s.name.trim()).map((s, i) => ({ ...s, sort_order: i }))),
        replaceServiceAreas(id, form.service_areas),
        ...form.photo_urls.map((url) => addBusinessPhoto(id, url)),
      ]);

      clearDraft();
      setSubmitted(true);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Unexpected error.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) {
    return (
      <View style={s.container}>
        <SafeAreaView edges={['top']} />
        <View style={s.center}>
          <Text style={s.gateTitle}>Sign In Required</Text>
          <Pressable onPress={() => router.push('/auth' as any)} style={s.goldBtn}>
            <LinearGradient colors={[Colors.gold, Colors.goldDim]} style={s.goldBtnInner}>
              <Text style={s.goldBtnText}>Sign In</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    );
  }

  // ── Success screen ──
  if (submitted) {
    return (
      <View style={s.container}>
        <SafeAreaView edges={['top']} />
        <View style={s.center}>
          <View style={s.successIcon}>
            <MaterialIcons name="pending-actions" size={40} color={Colors.gold} />
          </View>
          <Text style={s.gateTitle}>Business Submitted!</Text>
          <Text style={s.gateSub}>
            Your listing is now pending admin review. You will be notified once it is approved and goes live on Vybz Hub.
          </Text>
          <Pressable onPress={() => router.push('/business/manage' as any)} style={s.goldBtn}>
            <LinearGradient colors={[Colors.gold, Colors.goldDim]} style={s.goldBtnInner}>
              <MaterialIcons name="storefront" size={18} color={Colors.textOnGold} />
              <Text style={s.goldBtnText}>View My Businesses</Text>
            </LinearGradient>
          </Pressable>
          <Pressable onPress={() => router.replace('/(tabs)/browse' as any)} style={s.secondaryLink}>
            <Text style={s.secondaryLinkText}>Return to Explore</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={s.container}>
      {/* Header */}
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        <View style={s.header}>
          <Pressable onPress={goBack} style={s.backBtn} hitSlop={8}>
            <MaterialIcons name="arrow-back" size={20} color={Colors.textPrimary} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>{STEP_LABELS[step]}</Text>
            <Text style={s.headerSub}>Step {step + 1} of {TOTAL_STEPS}</Text>
          </View>
          {hasDraft && step === 0 && (
            <Pressable
              onPress={() => Alert.alert('Clear Draft', 'Discard your saved draft?', [
                { text: 'Keep', style: 'cancel' },
                { text: 'Clear', style: 'destructive', onPress: () => { clearDraft(); setForm({ ...INITIAL_FORM }); setHasDraft(false); } },
              ])}
              style={s.draftBadge}
            >
              <Text style={s.draftText}>Draft saved</Text>
            </Pressable>
          )}
        </View>
        <StepBar step={step} />
      </SafeAreaView>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">

          {/* ── STEP 0: Basics ── */}
          {step === 0 && (
            <View style={s.stepWrap}>
              <Field label="Business Name *">
                <TextInput style={inp.base} placeholder="e.g. Mandeville Cutz" placeholderTextColor={Colors.textMuted} value={form.name} onChangeText={(v) => update('name', v)} />
              </Field>
              <Field label="Category *">
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.catRail}>
                  {categories.map((cat) => {
                    const active = form.category_id === cat.id;
                    return (
                      <Pressable key={cat.id} onPress={() => update('category_id', cat.id)}
                        style={[s.catCard, active && { borderColor: cat.color, backgroundColor: `${cat.color}18` }]}>
                        <MaterialIcons name={cat.icon as any} size={22} color={active ? cat.color : Colors.textMuted} />
                        <Text style={[s.catCardLabel, active && { color: cat.color }]} numberOfLines={2}>{cat.label}</Text>
                        {active && <View style={[s.catCheck, { backgroundColor: cat.color }]}><MaterialIcons name="check" size={10} color="#fff" /></View>}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </Field>
            </View>
          )}

          {/* ── STEP 1: Location type + parish ── */}
          {step === 1 && (
            <View style={s.stepWrap}>
              <Field label="Location Type *">
                {LOCATION_TYPES.map((lt) => {
                  const active = form.location_type === lt.key;
                  return (
                    <Pressable key={lt.key} onPress={() => update('location_type', lt.key)}
                      style={({ pressed }) => [s.ltCard, active && s.ltCardActive, pressed && { opacity: 0.8 }]}>
                      <MaterialIcons name={lt.icon as any} size={22} color={active ? Colors.gold : Colors.textMuted} />
                      <View style={{ flex: 1 }}>
                        <Text style={[s.ltLabel, active && { color: Colors.gold }]}>{lt.label}</Text>
                        <Text style={s.ltDesc}>{lt.desc}</Text>
                      </View>
                      {active && <MaterialIcons name="check-circle" size={18} color={Colors.gold} />}
                    </Pressable>
                  );
                })}
              </Field>
              <Field label="Primary Parish *">
                <ParishPickerRow value={form.primary_parish} onSelect={(p) => update('primary_parish', p)} />
              </Field>
              <Field label="Town / Community" hint="Optional">
                <TextInput style={inp.base} placeholder="e.g. Mandeville" placeholderTextColor={Colors.textMuted} value={form.town} onChangeText={(v) => update('town', v)} />
              </Field>
            </View>
          )}

          {/* ── STEP 2: Address details (conditional) ── */}
          {step === 2 && (
            <View style={s.stepWrap}>
              {form.location_type === 'physical' ? (
                <Field label="Street Address" hint="Shown publicly to customers">
                  <TextInput style={inp.base} placeholder="e.g. 12 Main Street, Mandeville" placeholderTextColor={Colors.textMuted} value={form.street_address} onChangeText={(v) => update('street_address', v)} />
                </Field>
              ) : form.location_type === 'hybrid' ? (
                <View style={{ gap: Spacing.base }}>
                  {/* Public location opt-in for hybrid */}
                  <Pressable
                    onPress={() => update('location_is_public', !form.location_is_public)}
                    style={[s.ltCard, form.location_is_public && s.ltCardActive]}
                  >
                    <MaterialIcons
                      name={form.location_is_public ? 'visibility' : 'visibility-off'}
                      size={22}
                      color={form.location_is_public ? Colors.gold : Colors.textMuted}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={[s.ltLabel, form.location_is_public && { color: Colors.gold }]}>
                        {form.location_is_public ? 'Address is Public' : 'Keep Address Private'}
                      </Text>
                      <Text style={s.ltDesc}>
                        {form.location_is_public
                          ? 'Street address and coordinates are visible to all users.'
                          : 'Only town and parish are shown publicly. Toggle to make address public.'}
                      </Text>
                    </View>
                    {form.location_is_public && <MaterialIcons name="check-circle" size={18} color={Colors.gold} />}
                  </Pressable>
                  {form.location_is_public && (
                    <Field label="Street Address" hint="Shown publicly to customers">
                      <TextInput style={inp.base} placeholder="e.g. 12 Main Street, Mandeville" placeholderTextColor={Colors.textMuted} value={form.street_address} onChangeText={(v) => update('street_address', v)} />
                    </Field>
                  )}
                </View>
              ) : form.location_type === 'home_based' ? (
                <View style={s.privacyCard}>
                  <MaterialIcons name="shield" size={24} color={Colors.greenLight} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.privacyTitle}>Address Privacy Protected</Text>
                    <Text style={s.privacySub}>Home-based businesses do not need to share a public address. Customers can contact you directly.</Text>
                  </View>
                </View>
              ) : form.location_type === 'online' ? (
                <View style={s.infoCard}>
                  <MaterialIcons name="language" size={22} color={Colors.info} />
                  <Text style={s.infoText}>Online businesses do not require a physical address.</Text>
                </View>
              ) : form.location_type === 'mobile' ? (
                <View style={s.infoCard}>
                  <MaterialIcons name="two-wheeler" size={22} color={Colors.gold} />
                  <Text style={s.infoText}>Mobile businesses travel to customers. Add service areas in Step 8 to show which parishes you cover.</Text>
                </View>
              ) : null}
            </View>
          )}

          {/* ── STEP 3: Contact ── */}
          {step === 3 && (
            <View style={s.stepWrap}>
              <Field label="Phone Number" hint="Optional">
                <TextInput style={inp.base} placeholder="+1 876 000 0000" placeholderTextColor={Colors.textMuted} value={form.phone} onChangeText={(v) => update('phone', v)} keyboardType="phone-pad" />
              </Field>
              <Field label="WhatsApp Number" hint="Optional">
                <TextInput style={inp.base} placeholder="+1 876 000 0000" placeholderTextColor={Colors.textMuted} value={form.whatsapp} onChangeText={(v) => update('whatsapp', v)} keyboardType="phone-pad" />
              </Field>
              <Field label="Website" hint="Optional">
                <TextInput style={inp.base} placeholder="https://yourbusiness.com" placeholderTextColor={Colors.textMuted} value={form.website} onChangeText={(v) => update('website', v)} keyboardType="url" autoCapitalize="none" />
              </Field>
              <Field label="Instagram" hint="Optional — @handle or full URL">
                <TextInput style={inp.base} placeholder="@yourhandle" placeholderTextColor={Colors.textMuted} value={form.instagram} onChangeText={(v) => update('instagram', v)} autoCapitalize="none" />
              </Field>
              <Field label="Facebook" hint="Optional">
                <TextInput style={inp.base} placeholder="facebook.com/yourpage" placeholderTextColor={Colors.textMuted} value={form.facebook} onChangeText={(v) => update('facebook', v)} autoCapitalize="none" />
              </Field>
            </View>
          )}

          {/* ── STEP 4: Hours ── */}
          {step === 4 && (
            <View style={s.stepWrap}>
              <Text style={s.stepIntroText}>Set your opening hours. Times are Jamaica local time (UTC-5).</Text>
              {form.hours.map((h, i) => (
                <View key={i} style={s.hoursRow}>
                  <View style={s.hoursDay}>
                    <Text style={[s.hoursDayLabel, !h.closed && { color: Colors.textPrimary }]}>{DAYS[i].slice(0, 3)}</Text>
                    <Switch
                      value={!h.closed}
                      onValueChange={(v) => {
                        const next = [...form.hours];
                        next[i] = { ...next[i], closed: !v };
                        update('hours', next);
                      }}
                      trackColor={{ false: Colors.surfaceBorder, true: Colors.gold }}
                      thumbColor={!h.closed ? Colors.textOnGold : Colors.textMuted}
                    />
                  </View>
                  {!h.closed ? (
                    <View style={s.hoursTimes}>
                      <TextInput
                        style={s.hoursInput}
                        value={h.open_time}
                        onChangeText={(v) => {
                          const next = [...form.hours];
                          next[i] = { ...next[i], open_time: v };
                          update('hours', next);
                        }}
                        placeholder="09:00"
                        placeholderTextColor={Colors.textMuted}
                      />
                      <Text style={s.hoursDash}>–</Text>
                      <TextInput
                        style={s.hoursInput}
                        value={h.close_time}
                        onChangeText={(v) => {
                          const next = [...form.hours];
                          next[i] = { ...next[i], close_time: v };
                          update('hours', next);
                        }}
                        placeholder="17:00"
                        placeholderTextColor={Colors.textMuted}
                      />
                    </View>
                  ) : (
                    <Text style={s.hoursClosed}>Closed</Text>
                  )}
                </View>
              ))}
            </View>
          )}

          {/* ── STEP 5: Services ── */}
          {step === 5 && (
            <View style={s.stepWrap}>
              <Text style={s.stepIntroText}>Add services you offer with optional pricing. You can update these later.</Text>
              {form.services.map((svc, i) => (
                <View key={i} style={s.svcCard}>
                  <View style={s.svcHeader}>
                    <Text style={s.svcNum}>Service {i + 1}</Text>
                    <Pressable onPress={() => update('services', form.services.filter((_, j) => j !== i))} hitSlop={8}>
                      <MaterialIcons name="close" size={18} color={Colors.textMuted} />
                    </Pressable>
                  </View>
                  <TextInput style={[inp.base, { marginBottom: Spacing.xs }]} placeholder="Service name *" placeholderTextColor={Colors.textMuted} value={svc.name} onChangeText={(v) => { const n = [...form.services]; n[i] = { ...n[i], name: v }; update('services', n); }} />
                  <TextInput style={[inp.base, inp.multi, { marginBottom: Spacing.xs }]} placeholder="Description (optional)" placeholderTextColor={Colors.textMuted} value={svc.description} onChangeText={(v) => { const n = [...form.services]; n[i] = { ...n[i], description: v }; update('services', n); }} multiline />
                  <TextInput style={inp.base} placeholder="Price (e.g. JMD 2,500)" placeholderTextColor={Colors.textMuted} value={svc.price_text} onChangeText={(v) => { const n = [...form.services]; n[i] = { ...n[i], price_text: v }; update('services', n); }} />
                </View>
              ))}
              {form.services.length < 20 && (
                <Pressable onPress={() => update('services', [...form.services, { name: '', description: '', price_text: '', enabled: true }])} style={s.addBtn}>
                  <MaterialIcons name="add" size={16} color={Colors.gold} />
                  <Text style={s.addBtnText}>Add Service</Text>
                </Pressable>
              )}
            </View>
          )}

          {/* ── STEP 6: Photos ── */}
          {step === 6 && (
            <View style={s.stepWrap}>
              <Text style={s.stepIntroText}>Add a logo and cover photo. Additional photos can be added after listing.</Text>
              <Field label="Logo">
                <Pressable onPress={() => pickImage('logo_url')} style={s.photoPickerBtn}>
                  {form.logo_url ? (
                    <Image source={{ uri: form.logo_url }} style={s.photoPrev} contentFit="cover" />
                  ) : (
                    <View style={s.photoPickerEmpty}>
                      <MaterialIcons name="add-photo-alternate" size={28} color={Colors.textMuted} />
                      <Text style={s.photoPickerLabel}>Tap to upload logo</Text>
                    </View>
                  )}
                </Pressable>
              </Field>
              <Field label="Cover Photo">
                <Pressable onPress={() => pickImage('cover_url')} style={s.photoCoverBtn}>
                  {form.cover_url ? (
                    <Image source={{ uri: form.cover_url }} style={s.photoCoverPrev} contentFit="cover" />
                  ) : (
                    <View style={s.photoPickerEmpty}>
                      <MaterialIcons name="add-photo-alternate" size={28} color={Colors.textMuted} />
                      <Text style={s.photoPickerLabel}>Tap to upload cover photo</Text>
                    </View>
                  )}
                </Pressable>
              </Field>
            </View>
          )}

          {/* ── STEP 7: Service Areas ── */}
          {step === 7 && (
            <View style={s.stepWrap}>
              <Text style={s.stepIntroText}>
                {form.location_type === 'mobile' || form.location_type === 'home_based'
                  ? 'Select all parishes you serve. Customers can find you when searching these areas.'
                  : 'Optional: select additional parishes you deliver to or serve beyond your primary parish.'}
              </Text>
              <View style={s.parishGrid}>
                {JAMAICA_PARISHES.map((parish) => {
                  const active = form.service_areas.includes(parish);
                  return (
                    <Pressable key={parish} onPress={() => {
                      const next = active ? form.service_areas.filter((p) => p !== parish) : [...form.service_areas, parish];
                      update('service_areas', next);
                    }} style={[s.parishChip, active && s.parishChipActive]}>
                      <MaterialIcons name={active ? 'place' : 'add-location-alt'} size={12} color={active ? Colors.textOnGold : Colors.textMuted} />
                      <Text style={[s.parishChipText, active && { color: Colors.textOnGold }]}>{parish}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {/* ── STEP 8: About / Description ── */}
          {step === 8 && (
            <View style={s.stepWrap}>
              <Field label="About Your Business" hint="Tell customers what you do and what makes you unique">
                <TextInput
                  style={[inp.base, { height: 160, paddingTop: Spacing.md, textAlignVertical: 'top' }]}
                  placeholder="Describe your business, specialties, and why customers should choose you..."
                  placeholderTextColor={Colors.textMuted}
                  value={form.description}
                  onChangeText={(v) => update('description', v)}
                  multiline
                  maxLength={800}
                />
                <Text style={s.charCount}>{form.description.length}/800</Text>
              </Field>
            </View>
          )}

          {/* ── STEP 9: Review & Submit ── */}
          {step === 9 && (
            <View style={s.stepWrap}>
              <View style={s.reviewCard}>
                <Text style={s.reviewTitle}>{form.name || 'Your Business'}</Text>
                {/* Category */}
                {form.category_id && (() => {
                  const cat = categories.find((c) => c.id === form.category_id);
                  return cat ? (
                    <View style={s.reviewRow}>
                      <MaterialIcons name="category" size={14} color={Colors.gold} />
                      <Text style={s.reviewVal}>{cat.label}</Text>
                    </View>
                  ) : null;
                })()}
                <View style={s.reviewRow}>
                  <MaterialIcons name="place" size={14} color={Colors.gold} />
                  <Text style={s.reviewVal}>{form.primary_parish}{form.town ? `, ${form.town}` : ''}</Text>
                </View>
                <View style={s.reviewRow}>
                  <MaterialIcons name="business" size={14} color={Colors.gold} />
                  <Text style={s.reviewVal}>{LOCATION_TYPES.find((lt) => lt.key === form.location_type)?.label ?? form.location_type}</Text>
                </View>
                {form.phone ? (
                  <View style={s.reviewRow}>
                    <MaterialIcons name="phone" size={14} color={Colors.gold} />
                    <Text style={s.reviewVal}>{form.phone}</Text>
                  </View>
                ) : null}
                {form.services.filter((s) => s.name.trim()).length > 0 && (
                  <View style={s.reviewRow}>
                    <MaterialIcons name="list-alt" size={14} color={Colors.gold} />
                    <Text style={s.reviewVal}>{form.services.filter((s) => s.name.trim()).length} service{form.services.filter((s) => s.name.trim()).length !== 1 ? 's' : ''}</Text>
                  </View>
                )}
                {form.service_areas.length > 0 && (
                  <View style={s.reviewRow}>
                    <MaterialIcons name="near-me" size={14} color={Colors.gold} />
                    <Text style={s.reviewVal}>Serves {form.service_areas.length} parish{form.service_areas.length !== 1 ? 'es' : ''}</Text>
                  </View>
                )}
              </View>
              <View style={s.pendingNote}>
                <MaterialIcons name="pending-actions" size={18} color={Colors.gold} />
                <Text style={s.pendingNoteText}>
                  Your listing will be submitted as <Text style={{ color: Colors.gold, fontWeight: Typography.bold }}>Pending Review</Text>. Our team will approve it and notify you once it is live.
                </Text>
              </View>
            </View>
          )}

          {/* Nav buttons */}
          <View style={s.navRow}>
            <Pressable onPress={goBack} style={({ pressed }) => [s.navBack, pressed && { opacity: 0.7 }]}>
              <MaterialIcons name="arrow-back" size={18} color={Colors.textSecondary} />
              <Text style={s.navBackText}>Back</Text>
            </Pressable>
            {step < TOTAL_STEPS - 1 ? (
              <Pressable onPress={goNext} disabled={!isStepValid()} style={({ pressed }) => [s.navNext, !isStepValid() && { opacity: 0.4 }, pressed && { opacity: 0.85 }]}>
                <LinearGradient colors={[Colors.gold, Colors.goldDim]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.navNextInner}>
                  <Text style={s.navNextText}>Next →</Text>
                </LinearGradient>
              </Pressable>
            ) : (
              <Pressable onPress={handleSubmit} disabled={submitting} style={({ pressed }) => [s.navNext, pressed && { opacity: 0.85 }]}>
                <LinearGradient colors={[Colors.gold, Colors.goldDim]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.navNextInner}>
                  {submitting
                    ? <ActivityIndicator size="small" color={Colors.textOnGold} />
                    : <Text style={s.navNextText}>Submit Business</Text>
                  }
                </LinearGradient>
              </Pressable>
            )}
          </View>

          <View style={{ height: Spacing.xxl * 2 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.base, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder, gap: Spacing.md },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.surfaceBorder },
  headerTitle: { fontSize: Typography.md, fontWeight: Typography.black, color: Colors.textPrimary },
  headerSub: { fontSize: Typography.xs, color: Colors.textMuted },
  draftBadge: { paddingHorizontal: Spacing.sm, paddingVertical: 3, backgroundColor: Colors.goldSurface, borderRadius: Radius.full, borderWidth: 1, borderColor: `${Colors.gold}33` },
  draftText: { fontSize: 11, color: Colors.gold, fontWeight: Typography.semibold },
  content: { paddingHorizontal: Spacing.base, paddingTop: Spacing.lg, gap: Spacing.base },
  stepWrap: { gap: Spacing.base },
  stepIntroText: { fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 21 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.lg, paddingHorizontal: Spacing.xl },
  gateTitle: { fontSize: Typography.xl, fontWeight: Typography.black, color: Colors.textPrimary, textAlign: 'center' },
  gateSub: { fontSize: Typography.base, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  secondaryLink: { paddingVertical: Spacing.sm },
  secondaryLinkText: { fontSize: Typography.sm, color: Colors.textMuted, textDecorationLine: 'underline' },
  goldBtn: { borderRadius: Radius.lg, overflow: 'hidden' },
  goldBtnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md },
  goldBtnText: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textOnGold },
  successIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: Colors.goldSurface, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: `${Colors.gold}44` },
  // Category rail
  catRail: { gap: Spacing.sm, paddingBottom: 2, paddingTop: 2 },
  catCard: { width: 88, alignItems: 'center', gap: 5, padding: Spacing.sm, borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.surfaceBorder, backgroundColor: Colors.surface, position: 'relative', minHeight: 84, justifyContent: 'center' },
  catCardLabel: { fontSize: 10, color: Colors.textMuted, textAlign: 'center', lineHeight: 13 },
  catCheck: { position: 'absolute', top: 5, right: 5, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  // Location type
  ltCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.surfaceBorder },
  ltCardActive: { borderColor: Colors.gold, backgroundColor: Colors.goldSurface },
  ltLabel: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textSecondary },
  ltDesc: { fontSize: 12, color: Colors.textMuted, marginTop: 1 },
  // Privacy / info cards
  privacyCard: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, backgroundColor: `${Colors.greenLight}0F`, borderRadius: Radius.lg, padding: Spacing.base, borderWidth: 1, borderColor: `${Colors.greenLight}33` },
  privacyTitle: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.greenLight, marginBottom: 3 },
  privacySub: { fontSize: Typography.xs, color: Colors.textSecondary, lineHeight: 18 },
  infoCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.goldSurface, borderRadius: Radius.lg, padding: Spacing.base, borderWidth: 1, borderColor: `${Colors.gold}33` },
  infoText: { flex: 1, fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 20 },
  // Hours
  hoursRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.xs, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder },
  hoursDay: { width: 88, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  hoursDayLabel: { fontSize: Typography.xs, color: Colors.textMuted, fontWeight: Typography.semibold, width: 28 },
  hoursTimes: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, flex: 1 },
  hoursInput: { flex: 1, backgroundColor: Colors.surface, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.surfaceBorder, paddingHorizontal: Spacing.sm, height: 38, fontSize: Typography.sm, color: Colors.textPrimary, textAlign: 'center' },
  hoursDash: { color: Colors.textMuted, fontSize: Typography.sm },
  hoursClosed: { flex: 1, fontSize: Typography.xs, color: Colors.textMuted, fontStyle: 'italic' },
  // Services
  svcCard: { backgroundColor: Colors.surfaceElevated, borderRadius: Radius.lg, padding: Spacing.md, gap: Spacing.xs, borderWidth: 1, borderColor: Colors.surfaceBorder },
  svcHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.xs },
  svcNum: { fontSize: Typography.xs, color: Colors.gold, fontWeight: Typography.bold, textTransform: 'uppercase' },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.xs, paddingVertical: Spacing.md, borderRadius: Radius.md, borderWidth: 1.5, borderColor: `${Colors.gold}55`, backgroundColor: Colors.goldSurface },
  addBtnText: { fontSize: Typography.sm, color: Colors.gold, fontWeight: Typography.semibold },
  // Photos
  photoPickerBtn: { width: 100, height: 100, borderRadius: Radius.lg, overflow: 'hidden', borderWidth: 1.5, borderColor: Colors.surfaceBorder, borderStyle: 'dashed' },
  photoPrev: { width: 100, height: 100 },
  photoCoverBtn: { height: 140, borderRadius: Radius.lg, overflow: 'hidden', borderWidth: 1.5, borderColor: Colors.surfaceBorder, borderStyle: 'dashed' },
  photoCoverPrev: { width: '100%', height: 140 },
  photoPickerEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surfaceElevated, gap: Spacing.xs },
  photoPickerLabel: { fontSize: 11, color: Colors.textMuted, textAlign: 'center' },
  // Service areas
  parishGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  parishChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.full, backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.surfaceBorder },
  parishChipActive: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  parishChipText: { fontSize: Typography.sm, color: Colors.textMuted, fontWeight: Typography.medium },
  // About
  charCount: { fontSize: 11, color: Colors.textMuted, textAlign: 'right', marginTop: 3 },
  // Review
  reviewCard: { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.base, gap: Spacing.sm, borderWidth: 1, borderColor: Colors.surfaceBorder },
  reviewTitle: { fontSize: Typography.lg, fontWeight: Typography.black, color: Colors.textPrimary, marginBottom: Spacing.xs },
  reviewRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  reviewVal: { fontSize: Typography.sm, color: Colors.textSecondary },
  pendingNote: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, backgroundColor: Colors.goldSurface, borderRadius: Radius.lg, padding: Spacing.base, borderWidth: 1, borderColor: `${Colors.gold}33` },
  pendingNoteText: { flex: 1, fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 21 },
  // Nav
  navRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  navBack: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, paddingVertical: Spacing.md, paddingHorizontal: Spacing.md, flex: 1 },
  navBackText: { fontSize: Typography.base, color: Colors.textSecondary },
  navNext: { flex: 2, borderRadius: Radius.lg, overflow: 'hidden' },
  navNextInner: { paddingVertical: Spacing.md + 2, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: Spacing.sm },
  navNextText: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textOnGold },
});
