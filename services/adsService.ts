// ─── Vybz Hub Ad Service ────────────────────────────────────────────────────
// All Supabase operations for ad_placements and ads tables.
// Public functions (fetchActiveAdsByPlacementName) respect RLS and only return
// enabled placements + active ads. Admin functions fetch everything.

import { supabase } from '../lib/supabase';

export interface AdPlacement {
  id: string;
  name: string;
  size: 'rectangle' | 'square';
  enabled: boolean;
  created_at: string;
}

export interface Ad {
  id: string;
  placement_id: string;
  image_url: string;
  target_url: string | null;
  label: string | null;
  active: boolean;
  sort_order: number;
  created_at: string;
}

// ─── Public (app-facing) ─────────────────────────────────────────────────────

/**
 * Fetch the enabled placement + its active ads by placement name.
 * Returns { placement: null, ads: [] } when the placement is disabled or
 * doesn't exist — the PlacementAd component renders nothing in that case.
 */
export async function fetchActiveAdsByPlacementName(
  name: string
): Promise<{ placement: AdPlacement | null; ads: Ad[] }> {
  try {
    const { data: placement } = await supabase
      .from('ad_placements')
      .select('*')
      .eq('name', name)
      .eq('enabled', true)
      .single();

    if (!placement) return { placement: null, ads: [] };

    const { data: ads } = await supabase
      .from('ads')
      .select('*')
      .eq('placement_id', placement.id)
      .eq('active', true)
      .order('sort_order', { ascending: true });

    return {
      placement: placement as AdPlacement,
      ads: (ads ?? []) as Ad[],
    };
  } catch {
    return { placement: null, ads: [] };
  }
}

// ─── Admin ───────────────────────────────────────────────────────────────────

/** Fetch all placements (admin can see disabled ones too via RLS). */
export async function fetchAllPlacementsAdmin(): Promise<AdPlacement[]> {
  const { data } = await supabase
    .from('ad_placements')
    .select('*')
    .order('created_at', { ascending: true });
  return (data ?? []) as AdPlacement[];
}

/** Fetch a single placement with ALL its ads (active + inactive) for admin. */
export async function fetchPlacementWithAdsAdmin(
  placementId: string
): Promise<{ placement: AdPlacement | null; ads: Ad[] }> {
  const { data: placement } = await supabase
    .from('ad_placements')
    .select('*')
    .eq('id', placementId)
    .single();

  if (!placement) return { placement: null, ads: [] };

  const { data: ads } = await supabase
    .from('ads')
    .select('*')
    .eq('placement_id', placementId)
    .order('sort_order', { ascending: true });

  return {
    placement: placement as AdPlacement,
    ads: (ads ?? []) as Ad[],
  };
}

/** Count total ads per placement (includes inactive — for admin list view). */
export async function fetchAdCountsByPlacement(): Promise<Record<string, number>> {
  const { data } = await supabase.from('ads').select('placement_id');
  const counts: Record<string, number> = {};
  (data ?? []).forEach((row: any) => {
    counts[row.placement_id] = (counts[row.placement_id] ?? 0) + 1;
  });
  return counts;
}

export async function togglePlacementEnabled(id: string, enabled: boolean) {
  return supabase.from('ad_placements').update({ enabled }).eq('id', id);
}

export async function toggleAdActive(id: string, active: boolean) {
  return supabase.from('ads').update({ active }).eq('id', id);
}

export async function updateAdSortOrder(id: string, sort_order: number) {
  return supabase.from('ads').update({ sort_order }).eq('id', id);
}

export async function deleteAd(id: string) {
  return supabase.from('ads').delete().eq('id', id);
}

export async function insertAd(
  placementId: string,
  imageUrl: string,
  targetUrl: string | null,
  label: string | null,
  sortOrder: number
) {
  return supabase
    .from('ads')
    .insert({
      placement_id: placementId,
      image_url: imageUrl,
      target_url: targetUrl || null,
      label: label || null,
      active: true,
      sort_order: sortOrder,
    })
    .select()
    .single();
}

export async function updateAd(
  id: string,
  fields: Partial<Omit<Ad, 'id' | 'placement_id' | 'created_at'>>
) {
  return supabase.from('ads').update(fields).eq('id', id).select().single();
}

export async function insertPlacement(name: string, size: 'rectangle' | 'square') {
  return supabase
    .from('ad_placements')
    .insert({ name, size, enabled: false })
    .select()
    .single();
}
