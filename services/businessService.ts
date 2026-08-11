
// ─── Vybz Hub — Business Service Layer ────────────────────────────────────────
// Pure data operations — no React imports.

import { supabase } from '../lib/supabase';
import {
  Business,
  BusinessCategory,
  BusinessData,
  BusinessLocation,
  BusinessPromotion,
  BusinessRevision,
  BusinessService,
  BusinessAnalyticsEvent,
} from '../types/business';

// ─── Mappers ──────────────────────────────────────────────────────────────────

export function mapBusinessFromDb(row: any): Business {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name ?? '',
    slug: row.slug ?? undefined,
    categoryId: row.category_id ?? '',
    secondaryCategoryIds: row.secondary_category_ids ?? [],
    description: row.description ?? '',
    logoUrl: row.logo_url ?? '',
    coverUrl: row.cover_url ?? '',
    galleryUrls: row.gallery_urls ?? [],
    featuredImageUrl: row.featured_image_url ?? '',
    phone: row.phone ?? '',
    whatsapp: row.whatsapp ?? '',
    email: row.email ?? '',
    website: row.website ?? '',
    instagram: row.instagram ?? '',
    facebook: row.facebook ?? '',
    tiktok: row.tiktok ?? '',
    otherSocialLinks: row.other_social_links ?? {},
    priceRange: row.price_range ?? '',
    status: row.status ?? 'pending',
    flagReason: row.flag_reason ?? undefined,
    rejectedReason: row.rejected_reason ?? undefined,
    approvedAt: row.approved_at ?? undefined,
    approvedBy: row.approved_by ?? undefined,
    pendingRevisionId: row.pending_revision_id ?? undefined,
    featured: row.featured ?? false,
    featuredPriority: row.featured_priority ?? 0,
    verified: row.verified ?? false,
    viewCount: row.view_count ?? 0,
    phoneClickCount: row.phone_click_count ?? 0,
    whatsappClickCount: row.whatsapp_click_count ?? 0,
    emailClickCount: row.email_click_count ?? 0,
    websiteClickCount: row.website_click_count ?? 0,
    directionsClickCount: row.directions_click_count ?? 0,
    createdAt: row.created_at ?? '',
    updatedAt: row.updated_at ?? '',
    category: row.business_categories ? mapCategoryFromDb(row.business_categories) : undefined,
    locations: row.business_locations ? row.business_locations.map(mapLocationFromDb) : undefined,
    services: row.business_services ? row.business_services.map(mapServiceFromDb) : undefined,
    promotions: row.business_promotions ? row.business_promotions.map(mapPromotionFromDb) : undefined,
  };
}

export function mapCategoryFromDb(row: any): BusinessCategory {
  return {
    id: row.id,
    name: row.name ?? '',
    icon: row.icon ?? 'store',
    color: row.color ?? '#FFD700',
    active: row.active ?? true,
    sortOrder: row.sort_order ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapLocationFromDb(row: any): BusinessLocation {
  return {
    id: row.id,
    businessId: row.business_id,
    ownerId: row.owner_id,
    branchName: row.branch_name ?? '',
    parish: row.parish ?? '',
    address: row.address ?? '',
    city: row.city ?? '',
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
    phone: row.phone ?? '',
    whatsapp: row.whatsapp ?? '',
    email: row.email ?? '',
    openingHours: row.opening_hours ?? {},
    notes: row.notes ?? undefined,
    isPrimary: row.is_primary ?? false,
    active: row.active ?? true,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapServiceFromDb(row: any): BusinessService {
  return {
    id: row.id,
    businessId: row.business_id,
    ownerId: row.owner_id,
    name: row.name ?? '',
    description: row.description ?? '',
    startingPrice: row.starting_price ?? undefined,
    imageUrl: row.image_url ?? undefined,
    active: row.active ?? true,
    sortOrder: row.sort_order ?? 0,
    createdAt: row.created_at,
  };
}

export function mapPromotionFromDb(row: any): BusinessPromotion {
  return {
    id: row.id,
    businessId: row.business_id,
    ownerId: row.owner_id,
    title: row.title ?? '',
    description: row.description ?? '',
    imageUrl: row.image_url ?? undefined,
    promoCode: row.promo_code ?? undefined,
    startDate: row.start_date ?? '',
    endDate: row.end_date ?? undefined,
    active: row.active ?? true,
    status: row.status ?? 'live',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapRevisionFromDb(row: any): BusinessRevision {
  return {
    id: row.id,
    businessId: row.business_id,
    ownerId: row.owner_id,
    revisionData: row.revision_data ?? {},
    status: row.status ?? 'pending',
    submittedAt: row.submitted_at ?? '',
    reviewedAt: row.reviewed_at ?? undefined,
    reviewedBy: row.reviewed_by ?? undefined,
    rejectionReason: row.rejection_reason ?? undefined,
  };
}

// ─── Category queries ─────────────────────────────────────────────────────────

export async function fetchCategories(): Promise<{ data: BusinessCategory[]; error: string | null }> {
  const { data, error } = await supabase
    .from('business_categories')
    .select('*')
    .eq('active', true)
    .order('sort_order', { ascending: true });

  if (error) return { data: [], error: error.message };
  return { data: (data ?? []).map(mapCategoryFromDb), error: null };
}

// ─── Business queries ─────────────────────────────────────────────────────────

export async function fetchLiveBusinesses(opts?: {
  categoryId?: string;
  parish?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ data: Business[]; error: string | null }> {
  let query = supabase
    .from('businesses')
    .select(`
      *,
      business_categories ( id, name, icon, color ),
      business_locations ( id, parish, is_primary, latitude, longitude, opening_hours, active )
    `)
    .eq('status', 'live')
    .order('featured_priority', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(opts?.limit ?? 100);

  if (opts?.categoryId) query = query.eq('category_id', opts.categoryId);
  if (opts?.parish) {
    // Filter via join — we can only filter on business columns here; parish
    // filtering by location is done client-side after fetch.
  }
  if (opts?.search) {
    query = query.or(`name.ilike.%${opts.search}%,description.ilike.%${opts.search}%`);
  }

  const { data, error } = await query;
  if (error) return { data: [], error: error.message };
  return { data: (data ?? []).map(mapBusinessFromDb), error: null };
}

export async function fetchBusinessById(id: string): Promise<{ data: Business | null; error: string | null }> {
  const { data, error } = await supabase
    .from('businesses')
    .select(`
      *,
      business_categories ( id, name, icon, color, active, sort_order ),
      business_locations ( * ),
      business_services ( * ),
      business_promotions ( * )
    `)
    .eq('id', id)
    .maybeSingle();

  if (error) return { data: null, error: error.message };
  if (!data) return { data: null, error: 'Business not found' };
  return { data: mapBusinessFromDb(data), error: null };
}

export async function fetchMyBusiness(ownerId: string): Promise<{ data: Business | null; error: string | null }> {
  const { data, error } = await supabase
    .from('businesses')
    .select(`
      *,
      business_categories ( id, name, icon, color, active, sort_order ),
      business_locations ( * ),
      business_services ( * ),
      business_promotions ( * )
    `)
    .eq('owner_id', ownerId)
    .maybeSingle();

  if (error) return { data: null, error: error.message };
  if (!data) return { data: null, error: null };
  return { data: mapBusinessFromDb(data), error: null };
}

// ─── Business mutations ───────────────────────────────────────────────────────

export async function createBusiness(
  ownerId: string,
  businessData: BusinessData,
): Promise<{ data: Business | null; error: string | null }> {
  const dbRow = {
    owner_id: ownerId,
    name: businessData.name,
    category_id: businessData.categoryId || null,
    secondary_category_ids: businessData.secondaryCategoryIds,
    description: businessData.description,
    logo_url: businessData.logoUrl,
    cover_url: businessData.coverUrl,
    gallery_urls: businessData.galleryUrls,
    featured_image_url: businessData.featuredImageUrl,
    phone: businessData.phone,
    whatsapp: businessData.whatsapp,
    email: businessData.email,
    website: businessData.website,
    instagram: businessData.instagram,
    facebook: businessData.facebook,
    tiktok: businessData.tiktok,
    other_social_links: businessData.otherSocialLinks,
    price_range: businessData.priceRange,
    status: 'pending',
  };

  const { data, error } = await supabase
    .from('businesses')
    .insert(dbRow)
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data: mapBusinessFromDb(data), error: null };
}

export async function submitBusinessRevision(
  businessId: string,
  ownerId: string,
  revisionData: Partial<BusinessData>,
): Promise<{ data: BusinessRevision | null; error: string | null }> {
  const { data, error } = await supabase
    .from('business_revisions')
    .insert({
      business_id: businessId,
      owner_id: ownerId,
      revision_data: revisionData,
      status: 'pending',
    })
    .select()
    .single();

  if (error) return { data: null, error: error.message };

  // Link revision to business as pending_revision_id
  await supabase
    .from('businesses')
    .update({ pending_revision_id: data.id })
    .eq('id', businessId);

  return { data: mapRevisionFromDb(data), error: null };
}

// ─── Location mutations ───────────────────────────────────────────────────────

export async function createLocation(
  businessId: string,
  ownerId: string,
  loc: Omit<BusinessLocation, 'id' | 'businessId' | 'ownerId' | 'createdAt' | 'updatedAt'>,
): Promise<{ data: BusinessLocation | null; error: string | null }> {
  const { data, error } = await supabase
    .from('business_locations')
    .insert({
      business_id: businessId,
      owner_id: ownerId,
      branch_name: loc.branchName,
      parish: loc.parish,
      address: loc.address,
      city: loc.city,
      latitude: loc.latitude,
      longitude: loc.longitude,
      phone: loc.phone,
      whatsapp: loc.whatsapp,
      email: loc.email,
      opening_hours: loc.openingHours,
      notes: loc.notes,
      is_primary: loc.isPrimary,
      active: loc.active,
    })
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data: mapLocationFromDb(data), error: null };
}

export async function updateLocation(
  locationId: string,
  updates: Partial<Omit<BusinessLocation, 'id' | 'businessId' | 'ownerId'>>,
): Promise<{ error: string | null }> {
  const dbUpdates: Record<string, any> = {};
  if (updates.branchName !== undefined) dbUpdates.branch_name = updates.branchName;
  if (updates.parish !== undefined) dbUpdates.parish = updates.parish;
  if (updates.address !== undefined) dbUpdates.address = updates.address;
  if (updates.city !== undefined) dbUpdates.city = updates.city;
  if (updates.latitude !== undefined) dbUpdates.latitude = updates.latitude;
  if (updates.longitude !== undefined) dbUpdates.longitude = updates.longitude;
  if (updates.phone !== undefined) dbUpdates.phone = updates.phone;
  if (updates.whatsapp !== undefined) dbUpdates.whatsapp = updates.whatsapp;
  if (updates.email !== undefined) dbUpdates.email = updates.email;
  if (updates.openingHours !== undefined) dbUpdates.opening_hours = updates.openingHours;
  if (updates.notes !== undefined) dbUpdates.notes = updates.notes;
  if (updates.isPrimary !== undefined) dbUpdates.is_primary = updates.isPrimary;
  if (updates.active !== undefined) dbUpdates.active = updates.active;

  const { error } = await supabase
    .from('business_locations')
    .update(dbUpdates)
    .eq('id', locationId);

  return { error: error?.message ?? null };
}

export async function deleteLocation(locationId: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('business_locations')
    .delete()
    .eq('id', locationId);
  return { error: error?.message ?? null };
}

// ─── Service mutations ────────────────────────────────────────────────────────

export async function createService(
  businessId: string,
  ownerId: string,
  svc: Omit<BusinessService, 'id' | 'businessId' | 'ownerId' | 'createdAt'>,
): Promise<{ data: BusinessService | null; error: string | null }> {
  const { data, error } = await supabase
    .from('business_services')
    .insert({
      business_id: businessId,
      owner_id: ownerId,
      name: svc.name,
      description: svc.description,
      starting_price: svc.startingPrice,
      image_url: svc.imageUrl,
      active: svc.active,
      sort_order: svc.sortOrder,
    })
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data: mapServiceFromDb(data), error: null };
}

export async function updateService(
  serviceId: string,
  updates: Partial<Omit<BusinessService, 'id' | 'businessId' | 'ownerId'>>,
): Promise<{ error: string | null }> {
  const dbUpdates: Record<string, any> = {};
  if (updates.name !== undefined) dbUpdates.name = updates.name;
  if (updates.description !== undefined) dbUpdates.description = updates.description;
  if (updates.startingPrice !== undefined) dbUpdates.starting_price = updates.startingPrice;
  if (updates.imageUrl !== undefined) dbUpdates.image_url = updates.imageUrl;
  if (updates.active !== undefined) dbUpdates.active = updates.active;
  if (updates.sortOrder !== undefined) dbUpdates.sort_order = updates.sortOrder;

  const { error } = await supabase
    .from('business_services')
    .update(dbUpdates)
    .eq('id', serviceId);

  return { error: error?.message ?? null };
}

export async function deleteService(serviceId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('business_services').delete().eq('id', serviceId);
  return { error: error?.message ?? null };
}

// ─── Promotion mutations ──────────────────────────────────────────────────────

export async function createPromotion(
  businessId: string,
  ownerId: string,
  promo: Omit<BusinessPromotion, 'id' | 'businessId' | 'ownerId' | 'createdAt' | 'updatedAt'>,
): Promise<{ data: BusinessPromotion | null; error: string | null }> {
  const { data, error } = await supabase
    .from('business_promotions')
    .insert({
      business_id: businessId,
      owner_id: ownerId,
      title: promo.title,
      description: promo.description,
      image_url: promo.imageUrl,
      promo_code: promo.promoCode,
      start_date: promo.startDate,
      end_date: promo.endDate,
      active: promo.active,
      status: 'live',
    })
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data: mapPromotionFromDb(data), error: null };
}

export async function updatePromotion(
  promotionId: string,
  updates: Partial<Omit<BusinessPromotion, 'id' | 'businessId' | 'ownerId'>>,
): Promise<{ error: string | null }> {
  const dbUpdates: Record<string, any> = {};
  if (updates.title !== undefined) dbUpdates.title = updates.title;
  if (updates.description !== undefined) dbUpdates.description = updates.description;
  if (updates.imageUrl !== undefined) dbUpdates.image_url = updates.imageUrl;
  if (updates.promoCode !== undefined) dbUpdates.promo_code = updates.promoCode;
  if (updates.startDate !== undefined) dbUpdates.start_date = updates.startDate;
  if (updates.endDate !== undefined) dbUpdates.end_date = updates.endDate;
  if (updates.active !== undefined) dbUpdates.active = updates.active;

  const { error } = await supabase
    .from('business_promotions')
    .update(dbUpdates)
    .eq('id', promotionId);

  return { error: error?.message ?? null };
}

export async function deletePromotion(promotionId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('business_promotions').delete().eq('id', promotionId);
  return { error: error?.message ?? null };
}

// ─── Analytics ───────────────────────────────────────────────────────────────

export async function trackBusinessEvent(evt: BusinessAnalyticsEvent): Promise<void> {
  await supabase.from('business_analytics_events').insert({
    business_id: evt.businessId,
    event_type: evt.eventType,
    location_id: evt.locationId ?? null,
    promotion_id: evt.promotionId ?? null,
    session_id: evt.sessionId ?? null,
  });

  // Also increment the denormalized counter on the businesses row for fast reads
  const colMap: Record<string, string> = {
    profile_view:      'view_count',
    phone_click:       'phone_click_count',
    whatsapp_click:    'whatsapp_click_count',
    email_click:       'email_click_count',
    website_click:     'website_click_count',
    directions_click:  'directions_click_count',
  };
  const col = colMap[evt.eventType];
  if (col) {
    supabase.rpc('increment_business_stat', {
      p_business_id: evt.businessId,
      p_column: col,
    }).then(() => {}).catch(() => {});
  }
}

// ─── Admin queries ────────────────────────────────────────────────────────────

export async function fetchAllBusinessesAdmin(): Promise<{ data: Business[]; error: string | null }> {
  const { data, error } = await supabase
    .from('businesses')
    .select(`
      *,
      business_categories ( id, name, icon, color )
    `)
    .order('created_at', { ascending: false });

  if (error) return { data: [], error: error.message };
  return { data: (data ?? []).map(mapBusinessFromDb), error: null };
}

export async function fetchPendingRevisions(): Promise<{ data: BusinessRevision[]; error: string | null }> {
  const { data, error } = await supabase
    .from('business_revisions')
    .select('*')
    .eq('status', 'pending')
    .order('submitted_at', { ascending: true });

  if (error) return { data: [], error: error.message };
  return { data: (data ?? []).map(mapRevisionFromDb), error: null };
}

export async function adminApproveBusiness(
  businessId: string,
  adminId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('businesses')
    .update({
      status: 'live',
      approved_at: new Date().toISOString(),
      approved_by: adminId,
      rejected_reason: null,
      flag_reason: null,
    })
    .eq('id', businessId);

  return { error: error?.message ?? null };
}

export async function adminRejectBusiness(
  businessId: string,
  reason: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('businesses')
    .update({
      status: 'rejected',
      rejected_reason: reason,
    })
    .eq('id', businessId);

  return { error: error?.message ?? null };
}

export async function adminApproveRevision(
  revisionId: string,
  businessId: string,
  adminId: string,
  revisionData: Partial<BusinessData>,
): Promise<{ error: string | null }> {
  // Build update payload from revision data
  const updates: Record<string, any> = {};
  if (revisionData.name !== undefined) updates.name = revisionData.name;
  if (revisionData.categoryId !== undefined) updates.category_id = revisionData.categoryId;
  if (revisionData.description !== undefined) updates.description = revisionData.description;
  if (revisionData.logoUrl !== undefined) updates.logo_url = revisionData.logoUrl;
  if (revisionData.coverUrl !== undefined) updates.cover_url = revisionData.coverUrl;
  if (revisionData.galleryUrls !== undefined) updates.gallery_urls = revisionData.galleryUrls;
  if (revisionData.phone !== undefined) updates.phone = revisionData.phone;
  if (revisionData.whatsapp !== undefined) updates.whatsapp = revisionData.whatsapp;
  if (revisionData.email !== undefined) updates.email = revisionData.email;
  if (revisionData.website !== undefined) updates.website = revisionData.website;
  if (revisionData.instagram !== undefined) updates.instagram = revisionData.instagram;
  if (revisionData.facebook !== undefined) updates.facebook = revisionData.facebook;
  if (revisionData.tiktok !== undefined) updates.tiktok = revisionData.tiktok;
  if (revisionData.priceRange !== undefined) updates.price_range = revisionData.priceRange;
  updates.pending_revision_id = null;

  const [bizResult, revResult] = await Promise.all([
    supabase.from('businesses').update(updates).eq('id', businessId),
    supabase.from('business_revisions').update({
      status: 'approved',
      reviewed_at: new Date().toISOString(),
      reviewed_by: adminId,
    }).eq('id', revisionId),
  ]);

  return { error: bizResult.error?.message ?? revResult.error?.message ?? null };
}

export async function adminRejectRevision(
  revisionId: string,
  businessId: string,
  reason: string,
  adminId: string,
): Promise<{ error: string | null }> {
  const [, revResult] = await Promise.all([
    supabase.from('businesses').update({ pending_revision_id: null }).eq('id', businessId),
    supabase.from('business_revisions').update({
      status: 'rejected',
      reviewed_at: new Date().toISOString(),
      reviewed_by: adminId,
      rejection_reason: reason,
    }).eq('id', revisionId),
  ]);

  return { error: revResult.error?.message ?? null };
}

// ─── ESLint: dynamic require is intentional for React Native FileSystem ──────
// The following `eslint-disable` comment is removed because the error message
// "Definition for rule '@typescript-eslint/no-var-requires' was not found"
// indicates that the ESLint rule itself is not configured, rendering the disable
// comment ineffective and potentially misleading. The `require` statement itself
// is valid JavaScript/TypeScript syntax in appropriate environments (e.g., CommonJS
// modules or when configured with `allowSyntheticDefaultImports` and `esModuleInterop`).
// No TypeScript syntax error exists here.

import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { Platform } from 'react-native';

async function readImageBuffer(uri: string): Promise<ArrayBuffer> {
  if (Platform.OS === 'web') {
    const res = await fetch(uri);
    return res.arrayBuffer();
  }
  const FileSystem = require('expo-file-system');
  const base64: string = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer as ArrayBuffer;
}

export async function uploadBusinessImage(
  uri: string,
  userId: string,
  subfolder: 'logo' | 'cover' | 'gallery' | 'services' | 'promotions',
): Promise<string> {
  if (uri.startsWith('http://') || uri.startsWith('https://')) return uri;

  // Probe + compress
  const probe = await manipulateAsync(uri, [], { compress: 1, format: SaveFormat.JPEG });
  const maxPx = subfolder === 'logo' ? 512 : 1200;
  const longest = Math.max(probe.width, probe.height);
  const actions: Parameters<typeof manipulateAsync>[1] = longest > maxPx
    ? [{ resize: probe.height > probe.width ? { height: maxPx } : { width: maxPx } }]
    : [];
  const compressed = await manipulateAsync(uri, actions, { compress: 0.82, format: SaveFormat.JPEG });
  const buffer = await readImageBuffer(compressed.uri);

  const path = `${userId}/${subfolder}/${Date.now()}.jpg`;
  const { error } = await supabase.storage
    .from('business-images')
    .upload(path, buffer, { contentType: 'image/jpeg', upsert: false });

  if (error) throw new Error(`Business image upload failed: ${error.message}`);

  const { data: { publicUrl } } = supabase.storage.from('business-images').getPublicUrl(path);
  return publicUrl;
}
