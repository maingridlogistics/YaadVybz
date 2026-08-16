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
  /** true = matched via service area rather than primary parish */
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

/**
 * Server-side paginated business search.
 * Uses search_businesses RPC which joins service areas so that a business
 * with primary_parish=Clarendon but service_area=Manchester appears when
 * filtering by Manchester (with serves_parish=true to distinguish it).
 */
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

/**
 * Returns whether a business is currently open based on its hours.
 * Jamaica is UTC-5 year-round (no DST).
 */
export function isBusinessOpenNow(hoursMap: BusinessHoursMap): boolean | null {
  if (!hoursMap || Object.keys(hoursMap).length === 0) return null; // No hours set

  // Jamaica = UTC-5
  const nowUtcMs = Date.now();
  const nowJamMs = nowUtcMs - 5 * 60 * 60 * 1000;
  const nowJam = new Date(nowJamMs);

  const jamDay = nowJam.getUTCDay();       // 0=Sun…6=Sat
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
    // e.g. 22:00 – 02:00 — open if current >= open OR current < close
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

// ─── Owner operations ─────────────────────────────────────────────────────────

export async function fetchOwnedBusinesses(): Promise<any[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('businesses')
    .select(`
      id, name, slug, description, status, verified, featured,
      location_type, primary_parish, town, logo_url, cover_url,
      view_count, avg_rating, review_count, created_at, updated_at,
      category_id,
      business_categories(id, slug, label, icon, color)
    `)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[businessService] fetchOwnedBusinesses:', error.message);
    return [];
  }
  return data ?? [];
}
