// ─── Business Promotion Service ───────────────────────────────────────────────
// Handles promotion record lifecycle, product loading, and discovery queries.
//
// SECURITY MODEL:
//   • Owners can INSERT a promotion with status='pending_payment'
//   • Owners CANNOT activate or change payment_status — server only
//   • activate_business_promotion() RPC is SECURITY DEFINER — called by edge function
//   • get_promoted_businesses() RPC is SECURITY DEFINER — returns public-safe fields only

import { getSupabaseClient } from '../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export type PromotionPlacement = 'home' | 'explore' | 'parish' | 'category';
export type PromotionStatus =
  | 'pending_payment'
  | 'paid'
  | 'active'
  | 'expired'
  | 'cancelled'
  | 'refunded';

export interface PromotionProduct {
  id: string;
  placement: PromotionPlacement;
  duration_days: number;
  label: string;
  description: string;
  amount_usd: number;          // cents  e.g. 999 = $9.99
  apple_product_id: string | null;
  google_product_id: string | null;
  sort_order: number;
}

export interface BusinessPromotion {
  id: string;
  business_id: string;
  owner_id: string;
  product_id: string | null;
  placement: PromotionPlacement;
  parish: string | null;
  duration_days: number;
  starts_at: string | null;
  ends_at: string | null;
  status: PromotionStatus;
  payment_status: string;
  amount: number;
  currency: string;
  payment_provider: string | null;
  impression_count: number;
  click_count: number;
  created_at: string;
  updated_at: string;
  // joined
  businesses?: {
    name: string;
    logo_url: string | null;
    cover_url: string | null;
    primary_parish: string;
    business_categories: { label: string; icon: string; color: string } | null;
  };
}

export interface PromotedBusiness {
  id: string;
  name: string;
  category_id: string;
  category_label: string;
  category_icon: string;
  category_color: string;
  location_type: string;
  primary_parish: string;
  town: string;
  logo_url: string | null;
  cover_url: string | null;
  verified: boolean;
  avg_rating: number | null;
  review_count: number;
  promotion_id: string;
  placement: string;
  ends_at: string;
}

export interface EligiblePromoContext {
  parishes: string[];  // parishes the business can buy parish promotion for
  category_id: string;
  category_label: string;
}

// ─── Load promotion products ──────────────────────────────────────────────────

export async function fetchPromotionProducts(
  placement?: PromotionPlacement,
): Promise<PromotionProduct[]> {
  const supabase = getSupabaseClient();
  let query = supabase
    .from('business_promotion_products')
    .select('*')
    .eq('enabled', true)
    .order('sort_order', { ascending: true });

  if (placement) {
    query = query.eq('placement', placement);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[promotionService] fetchPromotionProducts:', error.message);
    return [];
  }
  return (data ?? []) as PromotionProduct[];
}

// ─── Fetch owner's own promotions ─────────────────────────────────────────────

export async function fetchMyPromotions(businessId?: string): Promise<BusinessPromotion[]> {
  const supabase = getSupabaseClient();
  let query = supabase
    .from('business_promotions')
    .select(`
      *,
      businesses (
        name, logo_url, cover_url, primary_parish,
        business_categories ( label, icon, color )
      )
    `)
    .order('created_at', { ascending: false });

  if (businessId) {
    query = query.eq('business_id', businessId);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[promotionService] fetchMyPromotions:', error.message);
    return [];
  }
  return (data ?? []) as BusinessPromotion[];
}

// ─── Get promoted businesses for a discovery placement ───────────────────────

export async function fetchPromotedBusinesses(params: {
  placement: PromotionPlacement;
  parish?: string;
  categoryId?: string;
  limit?: number;
}): Promise<PromotedBusiness[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('get_promoted_businesses', {
    p_placement:   params.placement,
    p_parish:      params.parish ?? null,
    p_category_id: params.categoryId ?? null,
    p_limit:       params.limit ?? 6,
  });

  if (error) {
    console.error('[promotionService] fetchPromotedBusinesses:', error.message);
    return [];
  }
  return (data ?? []) as PromotedBusiness[];
}

// ─── Get eligible promotion context for a business ───────────────────────────
// Returns which parishes + category the business can buy promotion for.

export async function fetchPromoEligibility(businessId: string): Promise<EligiblePromoContext | null> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('businesses')
    .select(`
      status, primary_parish, category_id,
      business_categories ( label ),
      business_service_areas ( parish )
    `)
    .eq('id', businessId)
    .maybeSingle();

  if (error || !data) return null;
  if (data.status !== 'live') return null;  // Only live businesses can promote

  const serviceParishes: string[] = (data.business_service_areas ?? []).map(
    (sa: { parish: string }) => sa.parish,
  );
  const parishes = Array.from(new Set([data.primary_parish, ...serviceParishes]));
  const cat = Array.isArray(data.business_categories)
    ? data.business_categories[0]
    : (data.business_categories as { label: string } | null);

  return {
    parishes,
    category_id: data.category_id,
    category_label: cat?.label ?? 'Business',
  };
}

// ─── Create a pending promotion record (owner-initiated) ─────────────────────
// Uses the server-side validated RPC which:
//   a) verifies owner_id = auth.uid()
//   b) verifies business.status = 'live'
//   c) resolves authoritative placement/duration_days/amount from product table
//   d) validates parish eligibility for parish placement
// Client-submitted durationDays/amountUsd are IGNORED — server reads from product table.

export async function createPendingPromotion(params: {
  businessId: string;
  productId: string;
  placement: PromotionPlacement;
  parish?: string;
  durationDays: number;  // kept for interface compat — server ignores and uses product table
  amountUsd: number;     // kept for interface compat — server ignores and uses product table
}): Promise<{ promotionId: string | null; error: string | null }> {
  const supabase = getSupabaseClient();

  // Use the SECURITY DEFINER validated RPC — never direct insert
  const { data, error } = await supabase.rpc('create_business_promotion_pending', {
    p_business_id: params.businessId,
    p_product_id:  params.productId,
    p_parish:      params.parish ?? null,
  });

  if (error) {
    console.error('[promotionService] createPendingPromotion:', error.message);
    return { promotionId: null, error: error.message };
  }
  return { promotionId: data as string, error: null };
}

// ─── Record a promotion click (analytics) ────────────────────────────────────
// Uses controlled RPC — clients cannot directly set click_count.
// Best-effort — does not throw on failure.

export async function recordPromotionClick(
  promotionId: string,
  businessId: string,
  placement: string,
): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    await supabase.rpc('record_promotion_click', {
      p_promotion_id: promotionId,
      p_business_id:  businessId,
      p_placement:    placement,
    });
  } catch {
    // Analytics is non-critical — fail silently
  }
}

// ─── Record a promotion impression (analytics) ────────────────────────────────
// Call when a promoted card becomes visible on screen.
// Uses controlled RPC — clients cannot directly set impression_count.
// Best-effort — does not throw on failure.

export async function recordPromotionImpression(
  promotionId: string,
): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    await supabase.rpc('record_promotion_impression', {
      p_promotion_id: promotionId,
    });
  } catch {
    // Analytics is non-critical — fail silently
  }
}

// ─── Check if a business has an active promotion for a placement ──────────────

export async function hasActivePromotion(
  businessId: string,
  placement: PromotionPlacement,
): Promise<boolean> {
  const supabase = getSupabaseClient();
  const now = new Date().toISOString();
  const { data } = await supabase
    .from('business_promotions')
    .select('id')
    .eq('business_id', businessId)
    .eq('placement', placement)
    .eq('status', 'active')
    .lte('starts_at', now)
    .gt('ends_at', now)
    .limit(1);

  return (data ?? []).length > 0;
}

// ─── Format promotion status for display ─────────────────────────────────────

export function formatPromotionStatus(status: PromotionStatus): {
  label: string;
  color: string;
  icon: string;
} {
  const map: Record<PromotionStatus, { label: string; color: string; icon: string }> = {
    pending_payment: { label: 'Pending Payment', color: '#FF9800', icon: 'hourglass-empty' },
    paid:            { label: 'Paid',            color: '#2196F3', icon: 'check-circle-outline' },
    active:          { label: 'Active',          color: '#00C853', icon: 'rocket-launch' },
    expired:         { label: 'Expired',         color: '#78909C', icon: 'event-busy' },
    cancelled:       { label: 'Cancelled',       color: '#F44336', icon: 'cancel' },
    refunded:        { label: 'Refunded',        color: '#9E9E9E', icon: 'currency-exchange' },
  };
  return map[status] ?? { label: status, color: '#78909C', icon: 'info' };
}

// ─── Placement display info ───────────────────────────────────────────────────

export function getPlacementInfo(placement: PromotionPlacement): {
  label: string;
  icon: string;
  description: string;
} {
  const map: Record<PromotionPlacement, { label: string; icon: string; description: string }> = {
    home:     { label: 'Home Featured',     icon: 'home',      description: 'Featured in the Home feed' },
    explore:  { label: 'Explore Featured',  icon: 'explore',   description: 'Featured in Businesses discovery' },
    parish:   { label: 'Parish Featured',   icon: 'place',     description: 'Featured in your Parish page' },
    category: { label: 'Category Featured', icon: 'category',  description: 'Featured in your Category page' },
  };
  return map[placement] ?? { label: placement, icon: 'star', description: '' };
}

// ─── Days remaining helper ────────────────────────────────────────────────────

export function daysRemaining(endsAt: string | null): number {
  if (!endsAt) return 0;
  const diff = new Date(endsAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}
