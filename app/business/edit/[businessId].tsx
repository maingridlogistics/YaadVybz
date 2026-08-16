// ─── Edit Business ────────────────────────────────────────────────────────────
// Owners can edit all their business fields except moderation fields.
// Reuses the same form UI as Create, but pre-populates from existing data.

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TextInput, StyleSheet, ScrollView, Pressable,
  KeyboardAvoidingView, Platform, Alert, Switch, ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Colors, Typography, Spacing, Radius } from '../../../constants/theme';
import { JAMAICA_PARISHES } from '../../../constants/parishes';
import { useBusinesses } from '../../../hooks/useBusinesses';
import { useAuth } from '../../../hooks/useAuth';
import {
  updateBusiness,
  upsertBusinessHours,
  replaceBusinessServices,
  replaceServiceAreas,
  addBusinessPhoto,
  fetchBusinessPublicProfile,
  fetchBusinessHours,
  fetchBusinessServicesById,
  fetchBusinessServiceAreas,
  BusinessHoursMap,
} from '../../../services/businessService';
import { getSupabaseClient } from '../../../lib/supabase';

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

const LOCATION_TYPES = [
  { key: 'physical',  label: 'Physical',   icon: 'storefront',  desc: 'Customers visit your shop/office' },
  { key: 'home_based',label: 'Home-Based', icon: 'home',        desc: 'Based at your home address' },
  { key: 'mobile',    label: 'Mobile',     icon: 'two-wheeler', desc: 'You travel to customers' },
  { key: 'online',    label: 'Online',     icon: 'language',    desc: 'No physical location' },
  { key: 'hybrid',    label: 'Hybrid',     icon: 'business',    desc: 'Both physical and online' },
] as const;
type LocationType = typeof LOCATION_TYPES[number]['key'];

interface ServiceEntry { id?: string; name: string; description: string; price_text: string; enabled: boolean; }
interface HourEntry { day_of_week: number; open_time: string; close_time: string; closed: boolean; }

interface FormData {
  name: string; category_id: string; description: string;
  location_type: LocationType; location_is_public: boolean;
  primary_parish: string; town: string;
  street_address: string; phone: string; whatsapp: string;
  website: string; instagram: string; facebook: string;
  logo_url: string; cover_url: string;
  service_areas: string[]; hours: HourEntry[]; services: ServiceEntry[];
}

const DEFAULT_HOURS: HourEntry[] = DAYS.map((_, i) => ({
  day_of_week: i, open_time: '09:00', close_time: '17:00', closed: i === 0 || i === 6,
}));

// Tab system for edit
const TABS = ['Basic Info', 'Location', 'Contact', 'Hours', 'Services', 'Areas', 'About'] as const;
type EditTab = typeof TABS[number];

export default function EditBusinessScreen() {
  const { businessId } = useLocalSearchParams<{ businessId: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { categories, loadCategories } = useBusinesses();
  const scrollRef = useRef<ScrollView>(null);

  const [activeTab, setActiveTab] = useState<EditTab>('Basic Info');
  const [form, setForm] = useState<FormData>({
    name: '', category_id: '', description: '',
    location_type: 'physical', location_is_public: true,
    primary_parish: '', town: '',
    street_address: '', phone: '', whatsapp: '',
    website: '', instagram: '', facebook: '',
    logo_url: '', cover_url: '',
    service_areas: [], hours: DEFAULT_HOURS, services: [],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadCategories(); }, [loadCategories]);

  // Load existing data
  useEffect(() => {
    if (!businessId) return;
    (async () => {
      setLoading(true);
      const [profile, hoursMap, services, areas] = await Promise.all([
        fetchBusinessPublicProfile(businessId),
        fetchBusinessHours(businessId),
        fetchBusinessServicesById(businessId),
        fetchBusinessServiceAreas(businessId),
      ]);
      if (!profile) { router.back(); return; }

      const hours: HourEntry[] = DEFAULT_HOURS.map((def, i) => {
        const h = hoursMap[i];
        if (!h) return def;
        return { day_of_week: i, open_time: h.open_time ?? '09:00', close_time: h.close_time ?? '17:00', closed: h.closed };
      });

      setForm({
        name: profile.name,
        category_id: profile.category_id,
        description: profile.description ?? '',
        location_type: profile.location_type as LocationType,
        location_is_public: (profile as any).location_is_public ?? (profile.location_type === 'physical'),
        primary_parish: profile.primary_parish,
        town: profile.town ?? '',
        street_address: profile.street_address ?? '',
        phone: profile.phone ?? '',
        whatsapp: profile.whatsapp ?? '',
        website: profile.website ?? '',
        instagram: profile.instagram ?? '',
        facebook: profile.facebook ?? '',
        logo_url: profile.logo_url ?? '',
        cover_url: profile.cover_url ?? '',
        service_areas: areas.map((a) => a.parish),
        hours,
        services: services.map((s) => ({ id: s.id, name: s.name, description: s.description, price_text: s.price_text ?? '', enabled: s.enabled })),
      });
      setLoading(false);
    })();
  }, [businessId]);

  const update = useCallback((key: keyof FormData, value: any) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const pickImage = useCallback(async (field: 'logo_url' | 'cover_url') => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission Required', 'Please allow photo library access.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect: [1, 1], quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;
    const uri = result.assets[0].uri;
    const supabase = getSupabaseClient();
    try {
      const ext = uri.split('.').pop() ?? 'jpg';
      const path = `${user!.id}/${Date.now()}.${ext}`;
      const response = await fetch(uri);
      const blob = await response.blob();
      const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = reject;
        reader.readAsArrayBuffer(blob);
      });
      const { error } = await supabase.storage.from('business-images').upload(path, arrayBuffer, { contentType: `image/${ext}`, upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from('business-images').getPublicUrl(path);
      update(field, data.publicUrl);
    } catch (e: any) {
      Alert.alert('Upload failed', e.message ?? 'Could not upload image.');
    }
  }, [user, update]);

  const handleSave = async () => {
    if (saving || !businessId) return;
    setSaving(true);
    try {
      const shouldExposeAddress =
        form.location_type === 'physical' ||
        (form.location_type === 'hybrid' && form.location_is_public);
      const { error } = await updateBusiness(businessId, {
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
      });
      if (error) { Alert.alert('Save Failed', error); return; }

      await Promise.all([
        upsertBusinessHours(businessId, form.hours),
        replaceBusinessServices(businessId, form.services.filter((s) => s.name.trim()).map((s, i) => ({ ...s, sort_order: i }))),
        replaceServiceAreas(businessId, form.service_areas),
      ]);

      Alert.alert('Saved', 'Business updated successfully.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Unexpected error.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={s.container}>
        <SafeAreaView edges={['top']} />
        <View style={s.center}><ActivityIndicator size="large" color={Colors.gold} /></View>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.background }}>
        <View style={s.header}>
          <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={8}>
            <MaterialIcons name="arrow-back" size={20} color={Colors.textPrimary} />
          </Pressable>
          <Text style={s.headerTitle} numberOfLines={1}>Edit: {form.name}</Text>
          <Pressable onPress={handleSave} disabled={saving} style={({ pressed }) => [s.saveBtn, pressed && { opacity: 0.8 }]}>
            {saving ? <ActivityIndicator size="small" color={Colors.textOnGold} /> : <Text style={s.saveBtnText}>Save</Text>}
          </Pressable>
        </View>
        {/* Tab strip */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabStrip}>
          {TABS.map((tab) => (
            <Pressable key={tab} onPress={() => setActiveTab(tab)} style={[s.tab, activeTab === tab && s.tabActive]}>
              <Text style={[s.tabText, activeTab === tab && s.tabTextActive]}>{tab}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </SafeAreaView>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">

          {/* Basic Info */}
          {activeTab === 'Basic Info' && (
            <View style={s.pane}>
              <Field label="Business Name *">
                <TextInput style={inp.base} value={form.name} onChangeText={(v) => update('name', v)} placeholder="Business name" placeholderTextColor={Colors.textMuted} />
              </Field>
              <Field label="Category *">
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.catRail}>
                  {categories.map((cat) => {
                    const active = form.category_id === cat.id;
                    return (
                      <Pressable key={cat.id} onPress={() => update('category_id', cat.id)}
                        style={[s.catCard, active && { borderColor: cat.color, backgroundColor: `${cat.color}18` }]}>
                        <MaterialIcons name={cat.icon as any} size={20} color={active ? cat.color : Colors.textMuted} />
                        <Text style={[s.catLabel, active && { color: cat.color }]} numberOfLines={2}>{cat.label}</Text>
                        {active && <View style={[s.catCheck, { backgroundColor: cat.color }]}><MaterialIcons name="check" size={9} color="#fff" /></View>}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </Field>
              <Field label="Logo">
                <Pressable onPress={() => pickImage('logo_url')} style={s.photoBtn}>
                  {form.logo_url ? <Image source={{ uri: form.logo_url }} style={s.photoPreview} contentFit="cover" /> : <View style={s.photoEmpty}><MaterialIcons name="add-photo-alternate" size={24} color={Colors.textMuted} /><Text style={s.photoEmptyText}>Upload logo</Text></View>}
                </Pressable>
              </Field>
              <Field label="Cover Photo">
                <Pressable onPress={() => pickImage('cover_url')} style={s.photoCoverBtn}>
                  {form.cover_url ? <Image source={{ uri: form.cover_url }} style={s.photoCoverPreview} contentFit="cover" /> : <View style={[s.photoEmpty, { flex: 1, width: '100%' }]}><MaterialIcons name="add-photo-alternate" size={24} color={Colors.textMuted} /><Text style={s.photoEmptyText}>Upload cover</Text></View>}
                </Pressable>
              </Field>
            </View>
          )}

          {/* Location */}
          {activeTab === 'Location' && (
            <View style={s.pane}>
              <Field label="Location Type">
                {LOCATION_TYPES.map((lt) => {
                  const active = form.location_type === lt.key;
                  return (
                    <Pressable key={lt.key} onPress={() => update('location_type', lt.key)}
                      style={({ pressed }) => [s.ltCard, active && s.ltCardActive, pressed && { opacity: 0.8 }]}>
                      <MaterialIcons name={lt.icon as any} size={20} color={active ? Colors.gold : Colors.textMuted} />
                      <Text style={[s.ltLabel, active && { color: Colors.gold }]}>{lt.label}</Text>
                      {active && <MaterialIcons name="check-circle" size={16} color={Colors.gold} />}
                    </Pressable>
                  );
                })}
              </Field>
              <Field label="Primary Parish *">
                <ParishPickerRow value={form.primary_parish} onSelect={(p) => update('primary_parish', p)} />
              </Field>
              <Field label="Town / Community">
                <TextInput style={inp.base} value={form.town} onChangeText={(v) => update('town', v)} placeholder="e.g. Mandeville" placeholderTextColor={Colors.textMuted} />
              </Field>
              {form.location_type === 'physical' && (
                <Field label="Street Address">
                  <TextInput style={inp.base} value={form.street_address} onChangeText={(v) => update('street_address', v)} placeholder="e.g. 12 Main St, Mandeville" placeholderTextColor={Colors.textMuted} />
                </Field>
              )}
              {form.location_type === 'hybrid' && (
                <View style={{ gap: Spacing.base }}>
                  <Pressable
                    onPress={() => update('location_is_public', !form.location_is_public)}
                    style={[s.ltCard, form.location_is_public && s.ltCardActive]}
                  >
                    <MaterialIcons
                      name={form.location_is_public ? 'visibility' : 'visibility-off'}
                      size={20}
                      color={form.location_is_public ? Colors.gold : Colors.textMuted}
                    />
                    <Text style={[s.ltLabel, form.location_is_public && { color: Colors.gold }]}>
                      {form.location_is_public ? 'Address is Public' : 'Keep Address Private'}
                    </Text>
                    {form.location_is_public && <MaterialIcons name="check-circle" size={16} color={Colors.gold} />}
                  </Pressable>
                  {form.location_is_public && (
                    <Field label="Street Address">
                      <TextInput style={inp.base} value={form.street_address} onChangeText={(v) => update('street_address', v)} placeholder="e.g. 12 Main St, Mandeville" placeholderTextColor={Colors.textMuted} />
                    </Field>
                  )}
                </View>
              )}
            </View>
          )}

          {/* Contact */}
          {activeTab === 'Contact' && (
            <View style={s.pane}>
              {[
                { key: 'phone',     label: 'Phone',     placeholder: '+1 876 000 0000', kb: 'phone-pad' as const },
                { key: 'whatsapp',  label: 'WhatsApp',  placeholder: '+1 876 000 0000', kb: 'phone-pad' as const },
                { key: 'website',   label: 'Website',   placeholder: 'https://',        kb: 'url' as const },
                { key: 'instagram', label: 'Instagram', placeholder: '@handle',         kb: 'default' as const },
                { key: 'facebook',  label: 'Facebook',  placeholder: 'facebook.com/…',  kb: 'default' as const },
              ].map(({ key, label, placeholder, kb }) => (
                <Field key={key} label={label} hint="Optional">
                  <TextInput style={inp.base} value={(form as any)[key]} onChangeText={(v) => update(key as any, v)} placeholder={placeholder} placeholderTextColor={Colors.textMuted} keyboardType={kb} autoCapitalize="none" />
                </Field>
              ))}
            </View>
          )}

          {/* Hours */}
          {activeTab === 'Hours' && (
            <View style={s.pane}>
              {form.hours.map((h, i) => (
                <View key={i} style={s.hoursRow}>
                  <View style={s.hoursDay}>
                    <Text style={[s.hoursDayLabel, !h.closed && { color: Colors.textPrimary }]}>{DAYS[i].slice(0, 3)}</Text>
                    <Switch value={!h.closed} onValueChange={(v) => { const n = [...form.hours]; n[i] = { ...n[i], closed: !v }; update('hours', n); }} trackColor={{ false: Colors.surfaceBorder, true: Colors.gold }} thumbColor={!h.closed ? Colors.textOnGold : Colors.textMuted} />
                  </View>
                  {!h.closed ? (
                    <View style={s.hoursTimes}>
                      <TextInput style={s.hoursInput} value={h.open_time} onChangeText={(v) => { const n = [...form.hours]; n[i] = { ...n[i], open_time: v }; update('hours', n); }} placeholder="09:00" placeholderTextColor={Colors.textMuted} />
                      <Text style={s.hoursDash}>–</Text>
                      <TextInput style={s.hoursInput} value={h.close_time} onChangeText={(v) => { const n = [...form.hours]; n[i] = { ...n[i], close_time: v }; update('hours', n); }} placeholder="17:00" placeholderTextColor={Colors.textMuted} />
                    </View>
                  ) : (
                    <Text style={s.hoursClosed}>Closed</Text>
                  )}
                </View>
              ))}
            </View>
          )}

          {/* Services */}
          {activeTab === 'Services' && (
            <View style={s.pane}>
              {form.services.map((svc, i) => (
                <View key={i} style={s.svcCard}>
                  <View style={s.svcHeader}>
                    <Text style={s.svcNum}>Service {i + 1}</Text>
                    <Pressable onPress={() => update('services', form.services.filter((_, j) => j !== i))} hitSlop={8}>
                      <MaterialIcons name="close" size={18} color={Colors.textMuted} />
                    </Pressable>
                  </View>
                  <TextInput style={[inp.base, { marginBottom: Spacing.xs }]} placeholder="Service name *" placeholderTextColor={Colors.textMuted} value={svc.name} onChangeText={(v) => { const n = [...form.services]; n[i] = { ...n[i], name: v }; update('services', n); }} />
                  <TextInput style={[inp.base, { height: 72, paddingTop: Spacing.sm, textAlignVertical: 'top', marginBottom: Spacing.xs }]} placeholder="Description" placeholderTextColor={Colors.textMuted} value={svc.description} onChangeText={(v) => { const n = [...form.services]; n[i] = { ...n[i], description: v }; update('services', n); }} multiline />
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

          {/* Service Areas */}
          {activeTab === 'Areas' && (
            <View style={s.pane}>
              <Text style={s.sectionNote}>Select all parishes you serve beyond your primary parish.</Text>
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

          {/* About */}
          {activeTab === 'About' && (
            <View style={s.pane}>
              <Field label="Business Description">
                <TextInput style={[inp.base, { height: 180, paddingTop: Spacing.md, textAlignVertical: 'top' }]} placeholder="Describe your business..." placeholderTextColor={Colors.textMuted} value={form.description} onChangeText={(v) => update('description', v)} multiline maxLength={800} />
                <Text style={s.charCount}>{form.description.length}/800</Text>
              </Field>
            </View>
          )}

          <View style={{ height: 80 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Floating save button */}
      <View style={[s.floatSave, { paddingBottom: 16 }]}>
        <Pressable onPress={handleSave} disabled={saving} style={({ pressed }) => [s.floatSaveBtn, pressed && { opacity: 0.85 }]}>
          <LinearGradient colors={[Colors.gold, Colors.goldDim]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.floatSaveBtnInner}>
            {saving ? <ActivityIndicator size="small" color={Colors.textOnGold} /> : <><MaterialIcons name="save" size={18} color={Colors.textOnGold} /><Text style={s.floatSaveBtnText}>Save Changes</Text></>}
          </LinearGradient>
        </Pressable>
      </View>
    </View>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: Spacing.xs }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
        <Text style={{ fontSize: Typography.sm, color: Colors.textSecondary, fontWeight: Typography.semibold }}>{label}</Text>
        {hint ? <Text style={{ fontSize: Typography.xs, color: Colors.textMuted }}>{hint}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function ParishPickerRow({ value, onSelect }: { value: string; onSelect: (p: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <View>
      <Pressable onPress={() => setOpen(!open)} style={inp.base}>
        <Text style={{ color: value ? Colors.textPrimary : Colors.textMuted, lineHeight: 50, fontSize: Typography.base }}>{value || 'Select parish...'}</Text>
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

const inp = StyleSheet.create({
  base: { backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.surfaceBorder, paddingHorizontal: Spacing.md, height: 52, fontSize: Typography.base, color: Colors.textPrimary },
});
const dd = StyleSheet.create({
  list: { backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.surfaceBorder, maxHeight: 200, marginTop: 4 },
  item: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder },
  itemActive: { backgroundColor: Colors.goldSurface },
  itemText: { fontSize: Typography.base, color: Colors.textSecondary },
});

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.base, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder, gap: Spacing.sm },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.surfaceBorder },
  headerTitle: { flex: 1, fontSize: Typography.md, fontWeight: Typography.bold, color: Colors.textPrimary },
  saveBtn: { paddingHorizontal: Spacing.md, paddingVertical: 7, backgroundColor: Colors.gold, borderRadius: Radius.full },
  saveBtnText: { fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textOnGold },
  tabStrip: { paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm, gap: Spacing.xs },
  tab: { paddingHorizontal: Spacing.md, paddingVertical: 7, borderRadius: Radius.full, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.surfaceBorder },
  tabActive: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  tabText: { fontSize: Typography.xs, color: Colors.textMuted, fontWeight: Typography.medium },
  tabTextActive: { color: Colors.textOnGold, fontWeight: Typography.bold },
  content: { paddingHorizontal: Spacing.base, paddingTop: Spacing.md, gap: Spacing.base },
  pane: { gap: Spacing.base, paddingBottom: Spacing.xxl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  sectionNote: { fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 21 },
  charCount: { fontSize: 11, color: Colors.textMuted, textAlign: 'right', marginTop: 3 },
  catRail: { gap: Spacing.sm, paddingBottom: 2, paddingTop: 2 },
  catCard: { width: 80, alignItems: 'center', gap: 4, padding: Spacing.sm, borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.surfaceBorder, backgroundColor: Colors.surface, position: 'relative', minHeight: 76, justifyContent: 'center' },
  catLabel: { fontSize: 10, color: Colors.textMuted, textAlign: 'center', lineHeight: 13 },
  catCheck: { position: 'absolute', top: 4, right: 4, width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  ltCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.surfaceBorder },
  ltCardActive: { borderColor: Colors.gold, backgroundColor: Colors.goldSurface },
  ltLabel: { flex: 1, fontSize: Typography.sm, fontWeight: Typography.bold, color: Colors.textSecondary },
  photoBtn: { width: 90, height: 90, borderRadius: Radius.lg, overflow: 'hidden', borderWidth: 1.5, borderColor: Colors.surfaceBorder, borderStyle: 'dashed' },
  photoPreview: { width: 90, height: 90 },
  photoCoverBtn: { height: 130, borderRadius: Radius.lg, overflow: 'hidden', borderWidth: 1.5, borderColor: Colors.surfaceBorder, borderStyle: 'dashed' },
  photoCoverPreview: { width: '100%', height: 130 },
  photoEmpty: { alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surfaceElevated, flex: 1, gap: 4 },
  photoEmptyText: { fontSize: 11, color: Colors.textMuted, textAlign: 'center' },
  hoursRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.xs, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder },
  hoursDay: { width: 88, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  hoursDayLabel: { fontSize: Typography.xs, color: Colors.textMuted, fontWeight: Typography.semibold, width: 28 },
  hoursTimes: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, flex: 1 },
  hoursInput: { flex: 1, backgroundColor: Colors.surface, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.surfaceBorder, paddingHorizontal: Spacing.sm, height: 38, fontSize: Typography.sm, color: Colors.textPrimary, textAlign: 'center' },
  hoursDash: { color: Colors.textMuted, fontSize: Typography.sm },
  hoursClosed: { flex: 1, fontSize: Typography.xs, color: Colors.textMuted, fontStyle: 'italic' },
  svcCard: { backgroundColor: Colors.surfaceElevated, borderRadius: Radius.lg, padding: Spacing.md, gap: Spacing.xs, borderWidth: 1, borderColor: Colors.surfaceBorder },
  svcHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.xs },
  svcNum: { fontSize: Typography.xs, color: Colors.gold, fontWeight: Typography.bold, textTransform: 'uppercase' },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.xs, paddingVertical: Spacing.md, borderRadius: Radius.md, borderWidth: 1.5, borderColor: `${Colors.gold}55`, backgroundColor: Colors.goldSurface },
  addBtnText: { fontSize: Typography.sm, color: Colors.gold, fontWeight: Typography.semibold },
  parishGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  parishChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.full, backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.surfaceBorder },
  parishChipActive: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  parishChipText: { fontSize: Typography.sm, color: Colors.textMuted, fontWeight: Typography.medium },
  floatSave: { paddingHorizontal: Spacing.base, backgroundColor: Colors.background, borderTopWidth: 1, borderTopColor: Colors.surfaceBorder, paddingTop: Spacing.sm },
  floatSaveBtn: { borderRadius: Radius.lg, overflow: 'hidden' },
  floatSaveBtnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingVertical: Spacing.md },
  floatSaveBtnText: { fontSize: Typography.base, fontWeight: Typography.bold, color: Colors.textOnGold },
});
