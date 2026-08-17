-- ═══════════════════════════════════════════════════════════════════════════════
-- VYBZ HUB — Elite Homepage Placement
-- Migration: 20260817000002_elite_homepage_placement.sql
-- Version: CORRECTED (SQL syntax fix + security hardening)
--
-- PRODUCT RULES:
--   - Elite subscription only (subscription_tier = 'elite', status active)
--   - One total selection per creator (event OR business — not both)
--   - Selection must be owned by the creator
--   - Target must be live (event.status='live', business.status='live')
--   - Past events auto-excluded at read time (date + 36 hours, same as isEventPassed)
--   - Suspended/rejected businesses auto-excluded (status != 'live')
--   - No Boost credit consumption
--   - Does NOT touch events.featured (editorial stays separate)
--   - Does NOT label selection as "Boosted"
--
-- ENTITLEMENT (fail-closed, explicit allowed-list):
--   tier = 'elite'
--   AND status IN ('active', 'trialing', 'canceled', 'past_due')
--   AND current_period_end IS NOT NULL AND current_period_end > now()
--   Terminal statuses (expired/revoked/refunded/null/unexpected) → DENY
--
-- OWNERSHIP (enforced independently in BOTH setter AND reader):
--   event placement: e.promoter_id = up.id
--   business placement: b.owner_id = up.id
--
-- SECURITY MODEL:
--   - set_elite_placement() is SECURITY DEFINER (runs as postgres owner)
--   - get_elite_placements() is SECURITY DEFINER, anon-safe, no PII returned
--   - Column-level protection: elite_placement_* NOT in authenticated UPDATE grant
--     (see migration 20260817000003 for column-level REVOKE)
--   - EXECUTE on set_elite_placement explicitly granted only to 'authenticated'
--   - EXECUTE on get_elite_placements granted to 'anon' and 'authenticated'
--
-- PRIVACY:
--   get_elite_placements() returns only public-safe fields.
--   No lat/lon, no street_address, no private home_based/hybrid location.
--   Same projection rules as other public-facing business RPCs.
--
-- ESTABLISHED CONSTANTS (from search_priority_final.sql):
--   isEventPassed: (event_date::date + interval '36 hours') > now()
--   Allowed entitlement statuses: 'active', 'trialing', 'canceled', 'past_due'
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Add columns to user_profiles (safe: IF NOT EXISTS)
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.user_profiles
  add column if not exists elite_placement_type       text
    check (elite_placement_type in ('event', 'business')),
  add column if not exists elite_placement_target_id  uuid;

comment on column public.user_profiles.elite_placement_type is
  'Elite Homepage Placement type: ''event'' | ''business'' | NULL. '
  'Elite-only; writable only via set_elite_placement() SECURITY DEFINER RPC. '
  'Direct authenticated UPDATE is blocked by column-level privilege (migration 20260817000003).';

comment on column public.user_profiles.elite_placement_target_id is
  'UUID of the Event or Business selected for Elite Homepage Placement. '
  'References events.id or businesses.id depending on elite_placement_type. '
  'Direct authenticated UPDATE is blocked by column-level privilege.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Index for fast Home tab lookup (only non-null placements matter)
-- ─────────────────────────────────────────────────────────────────────────────
create index if not exists user_profiles_elite_placement_idx
  on public.user_profiles (elite_placement_type, elite_placement_target_id)
  where elite_placement_type is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. set_elite_placement() — SECURITY DEFINER setter RPC
--
--    Entitlement: FAIL CLOSED — explicit allowed-list approach.
--    Direct authenticated UPDATE of elite_placement_* columns is separately
--    blocked by column-level REVOKE (migration 20260817000003).
--
--    Idempotency: calling with the same type+target twice → same result.
--    Clearing: p_type=null OR p_target=null → clears both columns.
--
--    Returns: { ok: boolean, error?: text }
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
  v_user_id  uuid        := auth.uid();
  v_tier     text;
  v_status   text;
  v_period   timestamptz;
begin
  -- ── 1. Authentication ─────────────────────────────────────────────────────
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'Authentication required.');
  end if;

  -- ── 2. Clear request: any authenticated user can clear their own placement ─
  --    (clearing requires no entitlement — reduces friction for expired users)
  if p_type is null or p_target is null then
    update public.user_profiles
      set elite_placement_type      = null,
          elite_placement_target_id = null
      where id = v_user_id;
    return jsonb_build_object('ok', true);
  end if;

  -- ── 3. Type validation ───────────────────────────────────────────────────
  if p_type not in ('event', 'business') then
    return jsonb_build_object('ok', false, 'error',
      'Invalid placement type. Must be ''event'' or ''business''.');
  end if;

  -- ── 4. Load entitlement from canonical source (user_profiles) ───────────
  select subscription_tier, subscription_status, current_period_end
    into v_tier, v_status, v_period
    from public.user_profiles
    where id = v_user_id;

  -- ── 5. Elite tier check ──────────────────────────────────────────────────
  if coalesce(v_tier, 'free') <> 'elite' then
    return jsonb_build_object('ok', false, 'error',
      'Elite Homepage Placement requires an Elite subscription.');
  end if;

  -- ── 6. FAIL-CLOSED status check (explicit allowed-list) ─────────────────
  --    Only explicitly approved paid statuses are granted access.
  --    Anything outside this list (including NULL, 'expired', 'revoked',
  --    'refunded', unexpected values) is denied immediately.
  if coalesce(v_status, '') not in ('active', 'trialing', 'canceled', 'past_due') then
    return jsonb_build_object('ok', false, 'error',
      'Your Elite subscription status does not permit this feature. '
      'Status: ' || coalesce(v_status, 'unknown'));
  end if;

  -- ── 7. Period end check ──────────────────────────────────────────────────
  if v_period is null or v_period <= now() then
    return jsonb_build_object('ok', false, 'error',
      'Your Elite subscription period has ended. Please renew to use this feature.');
  end if;

  -- ── 8. Target ownership + eligibility ───────────────────────────────────
  if p_type = 'event' then
    if not exists (
      select 1 from public.events
        where id            = p_target
          and promoter_id   = v_user_id        -- OWNERSHIP: must be caller's event
          and status        = 'live'
          -- isEventPassed semantics (same constant as search_events RPC):
          and (date::date + interval '36 hours') > now()
    ) then
      return jsonb_build_object('ok', false, 'error',
        'Event not found, not owned by you, not live, or has already passed.');
    end if;

  elsif p_type = 'business' then
    if not exists (
      select 1 from public.businesses
        where id       = p_target
          and owner_id = v_user_id             -- OWNERSHIP: must be caller's business
          and status   = 'live'
    ) then
      return jsonb_build_object('ok', false, 'error',
        'Business not found, not owned by you, or not live.');
    end if;
  end if;

  -- ── 9. Idempotent upsert ─────────────────────────────────────────────────
  --    Setting the same type+target again produces the same result (no error).
  update public.user_profiles
    set elite_placement_type      = p_type,
        elite_placement_target_id = p_target
    where id = v_user_id;

  return jsonb_build_object('ok', true);
end;
$$;

-- SECURITY: explicitly revoke from PUBLIC/anon; grant only to authenticated
revoke execute on function public.set_elite_placement(text, uuid) from public;
revoke execute on function public.set_elite_placement(text, uuid) from anon;
grant  execute on function public.set_elite_placement(text, uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. get_elite_placements() — anon-safe Home tab feed RPC
--
--    CORRECTED SQL: WHERE clause placed AFTER all LEFT JOINs (valid SQL syntax).
--
--    OWNERSHIP independently enforced in JOIN conditions:
--      e.promoter_id = up.id  (event belongs to the creator in the row)
--      b.owner_id    = up.id  (business belongs to the creator in the row)
--    This protects against corrupted/legacy data and direct-update bypasses.
--
--    ENTITLEMENT re-verified at read time (explicit allowed-list).
--    Only active Elite subscriptions with future period_end appear in feed.
--
--    PRIVACY: no lat/lon, no street_address, no private home-based location.
--    Returns only public-safe fields (same projection as public business RPC).
--
--    LIMIT: clamped 1–20.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.get_elite_placements(
  p_limit integer default 6
)
returns table (
  placement_type      text,
  target_id           uuid,
  creator_id          uuid,
  creator_name        text,
  -- Event fields (null when placement_type = 'business')
  event_title         text,
  event_date          text,
  event_venue         text,
  event_parish        text,
  event_cover_image   text,
  event_ticket_price  text,
  event_going_count   integer,
  -- Business fields (null when placement_type = 'event')
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
    up.elite_placement_type          as placement_type,
    up.elite_placement_target_id     as target_id,
    up.id                            as creator_id,
    up.name                          as creator_name,
    -- Event columns (null when no matching event join)
    e.title                          as event_title,
    e.date                           as event_date,
    e.venue                          as event_venue,
    e.parish                         as event_parish,
    e.cover_image                    as event_cover_image,
    e.ticket_price                   as event_ticket_price,
    e.going_count                    as event_going_count,
    -- Business columns (privacy-safe: no lat/lon/street_address)
    b.name                           as biz_name,
    bc.label                         as biz_category_label,
    bc.icon                          as biz_category_icon,
    bc.color                         as biz_category_color,
    b.logo_url                       as biz_logo_url,
    b.cover_url                      as biz_cover_url,
    b.primary_parish                 as biz_primary_parish,
    b.town                           as biz_town,
    b.verified                       as biz_verified,
    b.avg_rating                     as biz_avg_rating

  from public.user_profiles up

  -- ── Event join: OWNERSHIP + live + not-past ────────────────────────────────
  -- e.promoter_id = up.id independently verifies the event belongs to this
  -- creator even if set_elite_placement() was bypassed or data is corrupted.
  left join public.events e
    on up.elite_placement_type = 'event'
   and e.id             = up.elite_placement_target_id
   and e.promoter_id    = up.id                          -- ownership re-check
   and e.status         = 'live'
   and (e.date::date + interval '36 hours') > now()      -- isEventPassed constant

  -- ── Business join: OWNERSHIP + live ───────────────────────────────────────
  -- b.owner_id = up.id independently verifies the business belongs to this
  -- creator. Privacy: no lat/lon, no street_address exposed.
  left join public.businesses b
    on up.elite_placement_type = 'business'
   and b.id        = up.elite_placement_target_id
   and b.owner_id  = up.id                               -- ownership re-check
   and b.status    = 'live'

  left join public.business_categories bc
    on bc.id = b.category_id

  -- ── WHERE after all JOINs (corrected SQL order) ────────────────────────────
  where
    -- Placement must be set
    up.elite_placement_type      is not null
    and up.elite_placement_target_id is not null
    -- Elite tier required
    and up.subscription_tier     = 'elite'
    -- FAIL-CLOSED: explicit allowed-list (not NOT IN)
    and coalesce(up.subscription_status, '') in ('active', 'trialing', 'canceled', 'past_due')
    -- Valid paid-through period required
    and up.current_period_end    is not null
    and up.current_period_end    > now()
    -- Target must still be live (join resolved)
    and (
      (up.elite_placement_type = 'event'    and e.id is not null)
      or
      (up.elite_placement_type = 'business' and b.id is not null)
    )

  order by up.id   -- deterministic; stable across calls
  limit v_safe_limit;
end;
$$;

-- SECURITY: anon-safe Home tab feed (intentional public access)
revoke execute on function public.get_elite_placements(integer) from public;
grant  execute on function public.get_elite_placements(integer) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Migration notice
-- ─────────────────────────────────────────────────────────────────────────────
do $$ begin
  raise notice
    'Migration 20260817000002 (CORRECTED): '
    'Elite Homepage Placement columns + set_elite_placement() SECURITY DEFINER + '
    'get_elite_placements() anon-safe RPC. '
    'Fail-closed entitlement (explicit allowed-list), ownership re-verified in reader, '
    'corrected JOIN/WHERE SQL order, explicit execute grants. '
    'Column-level protection for elite_placement_* applied in migration 20260817000003.';
end $$;
