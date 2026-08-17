-- ═══════════════════════════════════════════════════════════════════════════════
-- VYBZ HUB — Elite Homepage Placement
-- Migration: 20260817000002_elite_homepage_placement.sql
--
-- Adds elite_placement_type and elite_placement_target_id to user_profiles.
--
-- PRODUCT RULES:
--   - Elite subscription only (subscription_tier = 'elite', status active)
--   - One total selection per creator (event OR business — not both)
--   - Selection must be owned by the creator
--   - Target must be live (event.status = 'live', business.status = 'live')
--   - Past events auto-excluded at read time (Home tab filters by date)
--   - Suspended/rejected business auto-excluded (status != 'live')
--   - No Boost credit consumption
--   - Does NOT touch events.featured (editorial feature stays separate)
--
-- SECURITY MODEL:
--   - user can only write their OWN row (RLS: id = auth.uid())
--   - elite check is enforced by the set_elite_placement() SECURITY DEFINER RPC
--     The authenticated UPDATE column grant for these two cols is added below.
--   - Home tab reads placements via get_elite_placements() RPC (anon-safe, no PII)
--
-- COLUMNS:
--   elite_placement_type       text  — 'event' | 'business' | NULL (no selection)
--   elite_placement_target_id  uuid  — FK to events.id or businesses.id
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Add columns to user_profiles
alter table public.user_profiles
  add column if not exists elite_placement_type       text    check (elite_placement_type in ('event','business')),
  add column if not exists elite_placement_target_id  uuid;

comment on column public.user_profiles.elite_placement_type is
  'Elite Homepage Placement type: ''event'' | ''business'' | NULL. Elite-only; set via set_elite_placement() RPC.';

comment on column public.user_profiles.elite_placement_target_id is
  'UUID of the Event or Business selected for Elite Homepage Placement. References events.id or businesses.id depending on elite_placement_type.';

-- 2. Index for fast Home tab lookup (only non-null placements matter)
create index if not exists user_profiles_elite_placement_idx
  on public.user_profiles (elite_placement_type, elite_placement_target_id)
  where elite_placement_type is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. set_elite_placement() — SECURITY DEFINER RPC
--    Called by the ElitePlacementManager screen to set/clear a placement.
--    Server validates:
--      a) caller is authenticated (auth.uid())
--      b) caller has elite + active subscription in user_profiles
--      c) target exists and is live
--      d) target is owned by the caller (event.promoter_id or business.owner_id)
--    Returns: { ok: boolean, error: text }
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.set_elite_placement(
  p_type    text,   -- 'event' | 'business' | null (to clear)
  p_target  uuid    -- target id, or null to clear
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id  uuid  := auth.uid();
  v_tier     text;
  v_status   text;
  v_period   timestamptz;
begin
  -- Must be authenticated
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'Authentication required.');
  end if;

  -- Clear request: allow any authenticated user to clear their own placement
  if p_type is null or p_target is null then
    update public.user_profiles
      set elite_placement_type      = null,
          elite_placement_target_id = null
      where id = v_user_id;
    return jsonb_build_object('ok', true);
  end if;

  -- Validate type value
  if p_type not in ('event', 'business') then
    return jsonb_build_object('ok', false, 'error', 'Invalid placement type. Must be ''event'' or ''business''.');
  end if;

  -- Load entitlement from canonical source
  select subscription_tier, subscription_status, current_period_end
    into v_tier, v_status, v_period
    from public.user_profiles
    where id = v_user_id;

  -- Elite check
  if v_tier <> 'elite' then
    return jsonb_build_object('ok', false, 'error', 'Elite Homepage Placement requires an Elite subscription.');
  end if;

  -- Active subscription check (not expired/revoked/refunded)
  if v_status in ('expired', 'revoked', 'refunded') then
    return jsonb_build_object('ok', false, 'error', 'Your Elite subscription is no longer active.');
  end if;

  if v_period is null or v_period <= now() then
    return jsonb_build_object('ok', false, 'error', 'Your Elite subscription period has ended. Please renew to use this feature.');
  end if;

  -- Validate target: ownership + live status
  if p_type = 'event' then
    if not exists (
      select 1 from public.events
        where id = p_target
          and promoter_id = v_user_id
          and status = 'live'
          -- Ensure event has not passed (date + 36 hours > now)
          and (date::date + interval '36 hours') > now()
    ) then
      return jsonb_build_object('ok', false, 'error',
        'Event not found, not owned by you, not live, or has already passed.');
    end if;

  elsif p_type = 'business' then
    if not exists (
      select 1 from public.businesses
        where id = p_target
          and owner_id = v_user_id
          and status = 'live'
    ) then
      return jsonb_build_object('ok', false, 'error',
        'Business not found, not owned by you, or not live.');
    end if;
  end if;

  -- Set the placement
  update public.user_profiles
    set elite_placement_type      = p_type,
        elite_placement_target_id = p_target
    where id = v_user_id;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.set_elite_placement(text, uuid)
  to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. get_elite_placements() — anon-safe Home tab feed RPC
--    Returns active Elite placements for the Home tab.
--    Only returns placements where:
--      - creator is still elite + active subscription
--      - target is still live (events not past, businesses not suspended)
--    Privacy: returns only public-safe fields. No PII.
--    Limit: 6 placements max (prevents Home tab overflow).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.get_elite_placements(
  p_limit integer default 6
)
returns table (
  placement_type    text,
  target_id         uuid,
  creator_id        uuid,
  creator_name      text,
  -- Event fields (null if placement_type = 'business')
  event_title         text,
  event_date          text,
  event_venue         text,
  event_parish        text,
  event_cover_image   text,
  event_ticket_price  text,
  event_going_count   integer,
  -- Business fields (null if placement_type = 'event')
  biz_name            text,
  biz_category_label  text,
  biz_category_icon   text,
  biz_category_color  text,
  biz_logo_url        text,
  biz_cover_url       text,
  biz_primary_parish  text,
  biz_town            text,
  biz_verified        boolean,
  biz_avg_rating      numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_safe_limit integer := greatest(1, least(coalesce(p_limit, 6), 20));
begin
  return query
  select
    up.elite_placement_type   as placement_type,
    up.elite_placement_target_id as target_id,
    up.id                     as creator_id,
    up.name                   as creator_name,
    -- Event columns
    e.title                   as event_title,
    e.date                    as event_date,
    e.venue                   as event_venue,
    e.parish                  as event_parish,
    e.cover_image             as event_cover_image,
    e.ticket_price            as event_ticket_price,
    e.going_count             as event_going_count,
    -- Business columns (privacy-safe: no lat/lon/street_address)
    b.name                    as biz_name,
    bc.label                  as biz_category_label,
    bc.icon                   as biz_category_icon,
    bc.color                  as biz_category_color,
    b.logo_url                as biz_logo_url,
    b.cover_url               as biz_cover_url,
    b.primary_parish          as biz_primary_parish,
    b.town                    as biz_town,
    b.verified                as biz_verified,
    b.avg_rating              as biz_avg_rating

  from public.user_profiles up
  -- Validate Elite entitlement
  where up.elite_placement_type is not null
    and up.elite_placement_target_id is not null
    and up.subscription_tier = 'elite'
    and up.subscription_status not in ('expired', 'revoked', 'refunded')
    and up.current_period_end is not null
    and up.current_period_end > now()

  -- Join live event (only for event placements)
  left join public.events e
    on up.elite_placement_type = 'event'
    and e.id = up.elite_placement_target_id
    and e.status = 'live'
    and (e.date::date + interval '36 hours') > now()   -- not past

  -- Join live business (only for business placements)
  left join public.businesses b
    on up.elite_placement_type = 'business'
    and b.id = up.elite_placement_target_id
    and b.status = 'live'

  left join public.business_categories bc
    on bc.id = b.category_id

  -- Only return rows where the join resolved (target still live)
  where (
    (up.elite_placement_type = 'event'    and e.id    is not null) or
    (up.elite_placement_type = 'business' and b.id    is not null)
  )

  order by up.id  -- deterministic; could order by featured_priority in future
  limit v_safe_limit;
end;
$$;

grant execute on function public.get_elite_placements(integer)
  to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Update get_public_promoter_profiles to include elite_placement columns
--    NOTE: The actual function definition depends on the live database state.
--    The columns are readable via user_profiles for authenticated users
--    who own their own row (RLS: id = auth.uid()).
--    The public profile RPC already returns public-safe fields; placement
--    data is not needed on public profiles — it is only consumed by the Home tab
--    via get_elite_placements() above.
-- ─────────────────────────────────────────────────────────────────────────────

do $$ begin
  raise notice 'Migration 20260817000002: Elite Homepage Placement columns + set_elite_placement() RPC + get_elite_placements() RPC. Server-authoritative entitlement checks. Privacy-safe Home tab feed.';
end $$;
