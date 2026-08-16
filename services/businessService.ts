// ─── Business Service ─────────────────────────────────────────────────────────
// All Supabase operations for the Business Directory.
// NO React imports — pure data functions only.

import { getSupabaseClient } from '../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BusinessCategory {
  id: string;
  slug: string;
  label: string;
  icon: string;
  color: string;
  sort_order: number;
  enabled: boolean;
}

/** Result row from search_businesses RPC */
export interface BusinessSearchResult {
  id: string;
  name: string;
  category_id: string;
  category_label: string;
  category_icon: string;
  category_color: string;
  location_type: 'physical' | 'home_based' | 'mobile' | 'online' | 'hybrid';
  primary_parish: string;
  town: string;
  phone: string | null;
  whatsapp: string | null;
  website: string | null;
  logo_url: string | null;
  cover_url: string | null;
  verified: boolean;
  avg_rating: number | null;
  review_count: number;
  view_count: number;
  serves_parish: boolean;
}

export interface BusinessSearchParams {
  parish?: string | null;
  categoryId?: string | null;
  query?: string | null;
  limit?: number;
  offset?: number;
}

export interface BusinessHours {
  id: string;
  business_id: string;
  day_of_week: number;
  open_time: string | null;
  close_time: string | null;
  closed: boolean;
  crosses_midnight: boolean;
}

export interface BusinessHoursMap {
  [dayOfWeek: number]: BusinessHours;
}

// ─── Categories ───────────────────────────────────────────────────────────────

export async function fetchBusinessCategories(): Promise<BusinessCategory[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('business_categories')
    .select('*')
    .eq('enabled', true)
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('[businessService] fetchBusinessCategories:', error.message);
    return [];
  }
  return (data ?? []) as BusinessCategory[];
}

// ─── Search / Browse ──────────────────────────────────────────────────────────

export async function searchBusinesses(
  params: BusinessSearchParams
): Promise<{ results: BusinessSearchResult[]; error: string | null }> {
  const supabase = getSupabaseClient();
  const { parish, categoryId, query, limit = 40, offset = 0 } = params;

  const { data, error } = await supabase.rpc('search_businesses', {
    p_parish:       parish       ?? null,
    p_category_id:  categoryId   ?? null,
    p_query:        query?.trim() || null,
    p_limit:        limit,
    p_offset:       offset,
  });

  if (error) {
    console.error('[businessService] searchBusinesses:', error.message);
    return { results: [], error: error.message };
  }

  return { results: (data ?? []) as BusinessSearchResult[], error: null };
}

// ─── Business Hours ───────────────────────────────────────────────────────────

export async function fetchBusinessHours(businessId: string): Promise<BusinessHoursMap> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('business_hours')
    .select('*')
    .eq('business_id', businessId);

  if (error || !data) return {};

  const map: BusinessHoursMap = {};
  for (const row of data as BusinessHours[]) {
    map[row.day_of_week] = row;
  }
  return map;
}

// ─── Open Now calculation (Jamaica UTC-5, no DST) ────────────────────────────

export function isBusinessOpenNow(hoursMap: BusinessHoursMap): boolean | null {
  if (!hoursMap || Object.keys(hoursMap).length === 0) return null;

  const nowJamMs = Date.now() - 5 * 60 * 60 * 1000;
  const nowJam = new Date(nowJamMs);
  const jamDay = nowJam.getUTCDay();
  const jamHour = nowJam.getUTCHours();
  const jamMin = nowJam.getUTCMinutes();
  const currentMinutes = jamHour * 60 + jamMin;

  const todayHours = hoursMap[jamDay];
  if (!todayHours || todayHours.closed) return false;
  if (!todayHours.open_time || !todayHours.close_time) return null;

  const [openH, openM] = todayHours.open_time.split(':').map(Number);
  const [closeH, closeM] = todayHours.close_time.split(':').map(Number);
  const openMinutes = openH * 60 + openM;
  const closeMinutes = closeH * 60 + closeM;

  if (todayHours.crosses_midnight) {
    return currentMinutes >= openMinutes || currentMinutes < closeMinutes;
  }
  return currentMinutes >= openMinutes && currentMinutes < closeMinutes;
}

// ─── View count ───────────────────────────────────────────────────────────────

export async function incrementBusinessView(businessId: string): Promise<void> {
  const supabase = getSupabaseClient();
  await supabase.rpc('increment_view_count', { p_table: 'businesses', p_id: businessId }).catch(() => {});
}

// ─── Favorites ────────────────────────────────────────────────────────────────

export async function fetchUserFavoriteBusinessIds(userId: string): Promise<string[]> {
  const supabase = getSupabaseClient();
  const { data } = await supabase
    .from('business_favorites')
    .select('business_id')
    .eq('user_id', userId);
  return (data ?? []).map((row: any) => row.business_id as string);
}

export async function addBusinessFavorite(userId: string, businessId: string): Promise<boolean> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('business_favorites')
    .insert({ user_id: userId, business_id: businessId });
  return !error;
}

export async function removeBusinessFavorite(userId: string, businessId: string): Promise<boolean> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('business_favorites')
    .delete()
    .eq('user_id', userId)
    .eq('business_id', businessId);
  return !error;
}

// ─── Full public profile (RPC — privacy safe) ───────────────────────────────

export interface BusinessPublicProfile {
  id: string;
  name: string;
  slug: string | null;
  category_id: string;
  category_label: string;
  category_icon: string;
  category_color: string;
  description: string;
  location_type: 'physical' | 'home_based' | 'mobile' | 'online' | 'hybrid';
  primary_parish: string;
  town: string;
  street_address: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  whatsapp: string | null;
  website: string | null;
  instagram: string | null;
  facebook: string | null;
  logo_url: string | null;
  cover_url: string | null;
  status: string;
  verified: boolean;
  featured: boolean;
  avg_rating: number | null;
  review_count: number;
  view_count: number;
  rejection_reason: string | null;
  created_at: string;
}

export async function fetchBusinessPublicProfile(
  businessId: string
): Promise<BusinessPublicProfile | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('get_business_public_profile', {
    p_business_id: businessId,
  });
  if (error || !data) {
    console.error('[businessService] fetchBusinessPublicProfile:', error?.message);
    return null;
  }
  return data as BusinessPublicProfile;
}

// ─── Business photos ──────────────────────────────────────────────────────────

export interface BusinessPhoto {
  id: string;
  business_id: string;
  url: string;
  caption: string;
  sort_order: number;
  created_at: string;
}

export async function fetchBusinessPhotos(businessId: string): Promise<BusinessPhoto[]> {
  const supabase = getSupabaseClient();
  const { data } = await supabase
    .from('business_photos')
    .select('*')
    .eq('business_id', businessId)
    .order('sort_order', { ascending: true });
  return (data ?? []) as BusinessPhoto[];
}

// ─── Business services ────────────────────────────────────────────────────────

export interface BusinessServiceItem {
  id: string;
  business_id: string;
  name: string;
  description: string;
  price_text: string | null;
  enabled: boolean;
  sort_order: number;
}

export async function fetchBusinessServicesById(
  businessId: string
): Promise<BusinessServiceItem[]> {
  const supabase = getSupabaseClient();
  const { data } = await supabase
    .from('business_services')
    .select('*')
    .eq('business_id', businessId)
    .eq('enabled', true)
    .order('sort_order', { ascending: true });
  return (data ?? []) as BusinessServiceItem[];
}

// ─── Business service areas ───────────────────────────────────────────────────

export interface BusinessServiceArea {
  id: string;
  business_id: string;
  parish: string;
}

export async function fetchBusinessServiceAreas(
  businessId: string
): Promise<BusinessServiceArea[]> {
  const supabase = getSupabaseClient();
  const { data } = await supabase
    .from('business_service_areas')
    .select('*')
    .eq('business_id', businessId)
    .order('parish', { ascending: true });
  return (data ?? []) as BusinessServiceArea[];
}

// ─── Parish business counts ───────────────────────────────────────────────────

export async function fetchBusinessCountsByParish(): Promise<Record<string, number>> {
  const supabase = getSupabaseClient();
  const { data } = await supabase
    .from('businesses')
    .select('primary_parish')
    .eq('status', 'live');

  if (!data) return {};
  const counts: Record<string, number> = {};
  for (const row of data as { primary_parish: string }[]) {
    counts[row.primary_parish] = (counts[row.primary_parish] ?? 0) + 1;
  }
  return counts;
}

// ─── Owner operations ─────────────────────────────────────────────────────────

export interface OwnedBusiness {
  id: string;
  name: string;
  slug: string | null;
  description: string;
  status: 'pending' | 'live' | 'rejected' | 'suspended';
  verified: boolean;
  featured: boolean;
  location_type: string;
  primary_parish: string;
  town: string;
  logo_url: string | null;
  cover_url: string | null;
  view_count: number;
  avg_rating: number | null;
  review_count: number;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
  category_id: string;
  business_categories: {
    id: string;
    slug: string;
    label: string;
    icon: string;
    color: string;
  } | null;
}

export async function fetchOwnedBusinesses(): Promise<OwnedBusiness[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('businesses')
    .select(`
      id, name, slug, description, status, verified, featured,
      location_type, primary_parish, town, logo_url, cover_url,
      view_count, avg_rating, review_count, rejection_reason,
      created_at, updated_at, category_id,
      business_categories(id, slug, label, icon, color)
    `)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[businessService] fetchOwnedBusinesses:', error.message);
    return [];
  }
  return (data ?? []) as OwnedBusiness[];
}

// ─── Business create/update ───────────────────────────────────────────────────

export interface BusinessFormData {
  name: string;
  category_id: string;
  description: string;
  location_type: 'physical' | 'home_based' | 'mobile' | 'online' | 'hybrid';
  primary_parish: string;
  town: string;
  street_address?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  website?: string | null;
  instagram?: string | null;
  facebook?: string | null;
  logo_url?: string | null;
  cover_url?: string | null;
}

export async function createBusiness(
  data: BusinessFormData,
  ownerId: string
): Promise<{ id: string | null; error: string | null }> {
  const supabase = getSupabaseClient();
  const { data: row, error } = await supabase
    .from('businesses')
    .insert({
      ...data,
      owner_id: ownerId,
      status: 'pending',
    })
    .select('id')
    .single();

  if (error) {
    console.error('[businessService] createBusiness:', error.message);
    return { id: null, error: error.message };
  }
  return { id: (row as any).id, error: null };
}

export async function updateBusiness(
  businessId: string,
  data: Partial<BusinessFormData>
): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('businesses')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', businessId);

  if (error) {
    console.error('[businessService] updateBusiness:', error.message);
    return { error: error.message };
  }
  return { error: null };
}

// ─── Business hours upsert ────────────────────────────────────────────────────

export async function upsertBusinessHours(
  businessId: string,
  hoursRows: {
    day_of_week: number;
    open_time: string | null;
    close_time: string | null;
    closed: boolean;
    crosses_midnight?: boolean;
  }[]
): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  const rows = hoursRows.map((h) => ({
    business_id: businessId,
    day_of_week: h.day_of_week,
    open_time: h.closed ? null : h.open_time,
    close_time: h.closed ? null : h.close_time,
    closed: h.closed,
    crosses_midnight: h.crosses_midnight ?? false,
  }));

  const { error } = await supabase
    .from('business_hours')
    .upsert(rows, { onConflict: 'business_id,day_of_week' });

  if (error) {
    console.error('[businessService] upsertBusinessHours:', error.message);
    return { error: error.message };
  }
  return { error: null };
}

// ─── Business services upsert ─────────────────────────────────────────────────

export async function replaceBusinessServices(
  businessId: string,
  services: { name: string; description: string; price_text: string | null; enabled: boolean; sort_order: number }[]
): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  // Delete existing, then insert fresh
  await supabase.from('business_services').delete().eq('business_id', businessId);
  if (services.length === 0) return { error: null };
  const rows = services.map((s, i) => ({ ...s, business_id: businessId, sort_order: s.sort_order ?? i }));
  const { error } = await supabase.from('business_services').insert(rows);
  if (error) return { error: error.message };
  return { error: null };
}

// ─── Service areas upsert ─────────────────────────────────────────────────────

export async function replaceServiceAreas(
  businessId: string,
  parishes: string[]
): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  await supabase.from('business_service_areas').delete().eq('business_id', businessId);
  if (parishes.length === 0) return { error: null };
  const rows = parishes.map((p) => ({ business_id: businessId, parish: p }));
  const { error } = await supabase.from('business_service_areas').insert(rows);
  if (error) return { error: error.message };
  return { error: null };
}

// ─── Business photos ──────────────────────────────────────────────────────────

export async function addBusinessPhoto(
  businessId: string,
  url: string,
  caption: string = ''
): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('business_photos')
    .insert({ business_id: businessId, url, caption, sort_order: Date.now() });
  if (error) return { error: error.message };
  return { error: null };
}

export async function deleteBusinessPhoto(photoId: string): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from('business_photos').delete().eq('id', photoId);
  if (error) return { error: error.message };
  return { error: null };
}

// ─── Admin moderation ─────────────────────────────────────────────────────────

export interface AdminBusinessRow {
  id: string;
  name: string;
  slug: string | null;
  status: string;
  verified: boolean;
  featured: boolean;
  location_type: string;
  primary_parish: string;
  town: string;
  description: string;
  phone: string | null;
  whatsapp: string | null;
  website: string | null;
  instagram: string | null;
  logo_url: string | null;
  cover_url: string | null;
  view_count: number;
  avg_rating: number | null;
  review_count: number;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
  owner_id: string;
  category_id: string;
  business_categories: { id: string; label: string; icon: string; color: string } | null;
}

export async function adminFetchBusinesses(
  status: string | null = null
): Promise<AdminBusinessRow[]> {
  const supabase = getSupabaseClient();
  let query = supabase
    .from('businesses')
    .select(`
      id, name, slug, status, verified, featured, location_type,
      primary_parish, town, description, phone, whatsapp, website, instagram,
      logo_url, cover_url, view_count, avg_rating, review_count,
      rejection_reason, created_at, updated_at, owner_id, category_id,
      business_categories(id, label, icon, color)
    `)
    .order('created_at', { ascending: false });

  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) {
    console.error('[businessService] adminFetchBusinesses:', error.message);
    return [];
  }
  return (data ?? []) as AdminBusinessRow[];
}

export async function adminApproveBusiness(businessId: string): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.rpc('admin_approve_business', { p_business_id: businessId });
  if (error) return { error: error.message };
  return { error: null };
}

export async function adminRejectBusiness(businessId: string, reason: string): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.rpc('admin_reject_business', { p_business_id: businessId, p_reason: reason });
  if (error) return { error: error.message };
  return { error: null };
}

export async function adminSuspendBusiness(businessId: string, reason: string): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.rpc('admin_suspend_business', { p_business_id: businessId, p_reason: reason });
  if (error) return { error: error.message };
  return { error: null };
}

export async function adminVerifyBusiness(businessId: string, verified: boolean): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.rpc('admin_verify_business', { p_business_id: businessId, p_verified: verified });
  if (error) return { error: error.message };
  return { error: null };
}
