-- ═══════════════════════════════════════════════════════════════════════════════
-- VYBZ HUB — SEARCH PRIORITY FINAL
-- Migration: search_events v3, search_businesses v4
--
-- RANKING MODEL (both RPCs):
--   When query supplied:
--     PRIMARY ORDER:   text_score DESC          ← absolute relevance gate
--     SECONDARY ORDER: (organic + boost + sub)  ← paid/quality signals only
--                                                  within same relevance band
--     TERTIARY:        date/recency tie-breaks
--
--   When no query (parish/category discovery):
--     Single blended score: organic + boost + sub + proximity
--     Free can beat Pro/Elite on organic quality; no paid-first grouping
--
-- ENTITLEMENT: user_profiles.subscription_tier / subscription_status /
--              current_period_end  (same canonical source everywhere)
--
-- BOOST (events): boosted=true AND boost_status='active' AND time not expired
--   All active boosts: same ranking bonus (1 unit) — duration ≠ strength
--   isEventPassed cutoff: event_date::date + interval '36 hours' > now()
--   (matches isEventPassed() in data.ts: Date.UTC(y, m-1, d+1, 12, 0, 0))
--
-- BOOST (businesses): business_promotions WHERE status='active'
--   AND (starts_at IS NULL OR starts_at <= now())
--   AND (ends_at IS NULL OR ends_at > now())
--   AND placement IN ('boost','directory')
--   DISTINCT ON business_id — one signal max, no stacking
--
-- SCOPE (events): p_scope text: 'upcoming' | 'past' | 'all'
--
-- SECURITY: entitlement server-side; no subscription internals returned
-- PERFORMANCE: single LEFT JOIN per table; no N+1
-- PAGINATION: clamped 1–100 limit, 0+ offset
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1.  search_events v3
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.search_events(
  p_parish   text    default null,
  p_type_id  text    default null,
  p_query    text    default null,
  p_scope    text    default 'upcoming',  -- 'upcoming' | 'past' | 'all'
  p_limit    integer default 40,
  p_offset   integer default 0
)
returns table (
  id                        uuid,
  title                     text,
  description               text,
  type                      text,
  type_label                text,
  event_types               text[],
  parish                    text,
  date                      text,
  start_time                text,
  end_time                  text,
  venue                     text,
  address                   text,
  cover_image               text,
  flyer_images              text[],
  ticket_price              text,
  ticket_link               text,
  dress_code                text,
  age_limit                 text,
  lineup                    text[],
  lineup_entries            jsonb,
  recurring                 boolean,
  recurring_frequency       text,
  promoter_id               uuid,
  promoter_name             text,
  going_count               integer,
  interested_count          integer,
  view_count                integer,
  featured                  boolean,
  tags                      text[],
  status                    text,
  boosted                   boolean,
  boost_type                text,
  boost_status              text,
  boost_expires_at          timestamptz,
  boost_impressions         integer,
  promoter_tier             text,
  selling_tickets_in_app    boolean,
  ticket_provider_name      text,
  physical_ticket_locations jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clean_query  text    := nullif(trim(p_query), '');
  v_safe_limit   integer := greatest(1, least(coalesce(p_limit, 40), 100));
  v_safe_offset  integer := greatest(0, coalesce(p_offset, 0));
  v_scope        text    := coalesce(p_scope, 'upcoming');
begin
  -- Validate scope
  if v_scope not in ('upcoming', 'past', 'all') then
    raise exception 'Invalid p_scope value: %. Allowed: upcoming, past, all', v_scope;
  end if;

  return query
  with
  -- ── Live entitlement per promoter (single-pass, no N+1) ──────────────────
  -- Only rows that could contribute a priority signal are considered.
  -- Terminal statuses (expired/revoked/refunded) yield priority_score = 0.
  promoter_entitlements as (
    select
      up.id as promoter_id,
      case
        when up.subscription_tier in ('pro', 'elite')
          and up.subscription_status in ('active','trialing','canceled','past_due')
          and up.subscription_status not in ('expired','revoked','refunded')
          and up.current_period_end is not null
          and up.current_period_end > now()
        then 1
        else 0
      end as priority_score
    from user_profiles up
  ),

  -- ── Base query with all scores ─────────────────────────────────────────────
  base as (
    select
      e.*,
      coalesce(pe.priority_score, 0)::integer as sub_priority,

      -- ── Text relevance (0–185 range; higher = better match) ───────────────
      -- Exact title match scores 100 + 50 + 20 = 170 (most common)
      -- Partial description match = 3 (weakest)
      -- Range deliberately wide so any 1-point difference (=1 final point when
      -- multiplied) is meaningful, and exact matches are far above weak matches.
      case
        when v_clean_query is null then 0
        else (
            case when lower(e.title) = lower(v_clean_query)                             then 100 else 0 end
          + case when lower(e.title) like lower(v_clean_query) || '%'                   then 50  else 0 end
          + case when lower(e.title) like '%' || lower(v_clean_query) || '%'            then 20  else 0 end
          + case when lower(e.promoter_name) like '%' || lower(v_clean_query) || '%'    then 15  else 0 end
          + case when lower(e.venue)         like '%' || lower(v_clean_query) || '%'    then 10  else 0 end
          + case when lower(e.type_label)    like '%' || lower(v_clean_query) || '%'    then 8   else 0 end
          + case when lower(e.description)   like '%' || lower(v_clean_query) || '%'    then 3   else 0 end
        )
      end as text_score,

      -- ── Active Boost score (0 or 1) ───────────────────────────────────────
      -- All active boosts receive the same bounded bonus regardless of duration.
      -- Duration = HOW LONG the boost lasts, NOT how strong it ranks.
      -- isEventPassed() cutoff: date::date + 36 hours = Date.UTC(y,m-1,d+1,12,0,0)
      case
        when e.boosted
          and (e.boost_status = 'active')
          and (
            -- until_event_end: valid while event has not passed
            (e.boost_type = 'until_event_end'
              and (e.date::date + interval '36 hours') > now())
            or
            -- time-limited: valid before wall-clock expiry
            (e.boost_type in ('three_day','seven_day')
              and e.boost_expires_at is not null
              and e.boost_expires_at > now())
            or
            -- legacy: boosted=true, no type set
            (e.boost_type is null and e.boost_expires_at is null)
          )
        then 1
        else 0
      end as boost_score,

      -- ── Organic quality (engagement, bounded to prevent domination) ────────
      -- max ~10 for a very popular event; keeps organic meaningful vs paid signals
      least(
        (e.going_count + e.interested_count)::numeric * 0.05,
        10.0
      ) as organic_score,

      -- ── Date proximity for discovery (no-query) ───────────────────────────
      -- Upcoming events closer to today score higher (max contribution 5.0)
      -- Past events: reverse order (most recently passed = higher score)
      case
        when v_scope = 'upcoming' or (v_scope = 'all' and (e.date::date + interval '36 hours') > now())
        then greatest(0.0,
               5.0 - least((e.date::date - current_date)::numeric * 0.1, 5.0))
        else greatest(0.0,
               5.0 - least((current_date - e.date::date)::numeric * 0.1, 5.0))
      end as proximity_score

    from events e
    left join promoter_entitlements pe on pe.promoter_id = e.promoter_id
    where
      -- Hard gate 1: only live events
      e.status = 'live'
      -- Hard gate 2: scope filter using isEventPassed() semantics
      --   upcoming:  event date + 36 hours > now()  (not yet passed)
      --   past:      event date + 36 hours <= now() (has passed)
      --   all:       no date filter
      and (
        v_scope = 'all'
        or (v_scope = 'upcoming' and (e.date::date + interval '36 hours') > now())
        or (v_scope = 'past'     and (e.date::date + interval '36 hours') <= now())
      )
      -- Hard gate 3: parish filter
      and (p_parish is null or e.parish = p_parish)
      -- Hard gate 4: event type filter
      and (
        p_type_id is null
        or e.type = p_type_id
        or p_type_id = any(e.event_types)
      )
      -- Hard gate 5: text relevance gate (must match at least one field)
      and (
        v_clean_query is null
        or lower(e.title)         like '%' || lower(v_clean_query) || '%'
        or lower(e.promoter_name)  like '%' || lower(v_clean_query) || '%'
        or lower(e.venue)         like '%' || lower(v_clean_query) || '%'
        or lower(e.type_label)    like '%' || lower(v_clean_query) || '%'
        or lower(e.description)   like '%' || lower(v_clean_query) || '%'
      )
  )

  select
    base.id,
    base.title,
    base.description,
    base.type,
    base.type_label,
    base.event_types,
    base.parish,
    base.date,
    base.start_time,
    base.end_time,
    base.venue,
    base.address,
    base.cover_image,
    base.flyer_images,
    base.ticket_price,
    base.ticket_link,
    base.dress_code,
    base.age_limit,
    base.lineup,
    base.lineup_entries,
    base.recurring,
    base.recurring_frequency,
    base.promoter_id,
    base.promoter_name,
    base.going_count,
    base.interested_count,
    base.view_count,
    base.featured,
    base.tags,
    base.status,
    base.boosted,
    base.boost_type,
    base.boost_status,
    base.boost_expires_at,
    base.boost_impressions,
    base.promoter_tier,
    base.selling_tickets_in_app,
    base.ticket_provider_name,
    base.physical_ticket_locations
  from base
  order by
    -- ── WITH QUERY: text_score is the absolute primary gate ─────────────────
    -- Any 1-point relevance difference = 1 final point.
    -- Max non-text contribution = boost(3) + sub(1) + organic(10) + proximity(5)
    --   = 19 points.
    -- A 2-point text gap (20 pts) always beats max non-text signal.
    -- Exact title match (170) vs partial description (3) = 167 pt gap → always wins.
    base.text_score desc,
    -- ── Secondary: blended organic+paid signal (within equal relevance band) ─
    -- Boost and subscription are small additions to organic engagement.
    -- Prevents "all Boosted first, then all Pro, then all Free" grouping.
    (
        base.organic_score
      + (base.boost_score   * 3.0)   -- moderate bounded boost bonus (max 3)
      + (base.sub_priority  * 1.0)   -- small bounded subscription bonus (max 1)
      + base.proximity_score         -- date proximity (max 5, guides no-query discovery)
    ) desc,
    -- ── Tertiary: upcoming soonest / past most-recent first ─────────────────
    case when p_scope = 'past' then base.date end desc,
    case when p_scope != 'past' then base.date end asc,
    -- ── Deterministic final tie-break ─────────────────────────────────────
    base.created_at desc,
    base.id desc
  limit  v_safe_limit
  offset v_safe_offset;
end;
$$;

grant execute on function public.search_events(text, text, text, text, integer, integer)
  to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2.  search_businesses v4
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.search_businesses(
  p_parish      text    default null,
  p_category_id uuid    default null,
  p_query       text    default null,
  p_limit       integer default 40,
  p_offset      integer default 0
)
returns table (
  id             uuid,
  name           text,
  category_id    uuid,
  category_label text,
  category_icon  text,
  category_color text,
  location_type  text,
  primary_parish text,
  town           text,
  phone          text,
  whatsapp       text,
  website        text,
  logo_url       text,
  cover_url      text,
  verified       boolean,
  avg_rating     numeric,
  review_count   integer,
  view_count     integer,
  serves_parish  boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clean_query text    := nullif(trim(p_query), '');
  v_safe_limit  integer := greatest(1, least(coalesce(p_limit, 40), 100));
  v_safe_offset integer := greatest(0, coalesce(p_offset, 0));
begin
  return query
  with
  -- ── Active Business Boosts ────────────────────────────────────────────────
  -- Covers unified placement='boost' (current production) AND
  -- legacy placement='directory' rows for backward compatibility.
  -- Includes starts_at <= now() check for production boost activation.
  -- DISTINCT ON: one signal per business — no stacking of legacy+unified rows.
  -- Result: boost_score = 1 for any qualifying active boost (uniform strength).
  active_boosts as (
    select distinct on (bp.business_id)
      bp.business_id,
      1 as boost_score
    from business_promotions bp
    where bp.status = 'active'
      and (bp.starts_at is null or bp.starts_at <= now())
      and (bp.ends_at is null or bp.ends_at > now())
      and bp.placement in ('boost', 'directory')
    order by bp.business_id, bp.ends_at desc nulls last
  ),

  -- ── Pro/Elite owner entitlement (single LEFT JOIN, no N+1) ───────────────
  -- Canonical source: user_profiles (same as Posts, Boosts, Creator Analytics).
  -- Pro and Elite receive the same V1 priority_score = 1.
  owner_entitlements as (
    select
      b_inner.id as business_id,
      case
        when up.subscription_tier in ('pro', 'elite')
          and up.subscription_status in ('active','trialing','canceled','past_due')
          and up.subscription_status not in ('expired','revoked','refunded')
          and up.current_period_end is not null
          and up.current_period_end > now()
        then 1
        else 0
      end as priority_score
    from businesses b_inner
    left join user_profiles up on up.id = b_inner.owner_id
    where b_inner.status = 'live'
  ),

  -- ── Base business query ───────────────────────────────────────────────────
  base as (
    select
      b.id,
      b.name,
      b.category_id,
      bc.label      as category_label,
      bc.icon       as category_icon,
      bc.color      as category_color,
      b.location_type,
      b.primary_parish,
      b.town,
      b.phone,
      b.whatsapp,
      b.website,
      -- Privacy-safe: latitude, longitude, street_address NOT returned
      b.logo_url,
      b.cover_url,
      b.verified,
      b.avg_rating,
      b.review_count,
      b.view_count,
      b.created_at,
      case
        when p_parish is not null and b.primary_parish <> p_parish
          and exists (
            select 1 from business_service_areas sa
            where sa.business_id = b.id and sa.parish = p_parish
          )
        then true
        else false
      end as serves_parish,

      -- ── Text relevance (0–185) ────────────────────────────────────────────
      case
        when v_clean_query is null then 0
        else (
            case when lower(b.name) = lower(v_clean_query)                               then 100 else 0 end
          + case when lower(b.name) like lower(v_clean_query) || '%'                     then 50  else 0 end
          + case when lower(b.name) like '%' || lower(v_clean_query) || '%'              then 20  else 0 end
          + case when lower(bc.label) like '%' || lower(v_clean_query) || '%'            then 10  else 0 end
          + case when lower(coalesce(b.town,'')) like '%' || lower(v_clean_query) || '%' then 5   else 0 end
          + case when lower(coalesce(b.description,'')) like '%' || lower(v_clean_query) || '%' then 3 else 0 end
        )
      end as text_score,

      -- ── Organic quality ───────────────────────────────────────────────────
      -- Rating: 0–5 scaled ×1.2 → max 6.0
      -- View signal: ln(views+1)×0.3, capped at 3.0
      -- Together max ~9. Dominates paid signals (boost max 3, sub max 1).
      (coalesce(b.avg_rating, 0) * 1.2)
        + least(ln(greatest(b.view_count::numeric, 1) + 1) * 0.3, 3.0) as organic_score,

      coalesce(ab.boost_score, 0)   as boost_score,
      coalesce(oe.priority_score, 0) as priority_score

    from businesses b
    join business_categories bc on bc.id = b.category_id
    left join active_boosts ab        on ab.business_id = b.id
    left join owner_entitlements oe   on oe.business_id = b.id
    where
      -- Hard gate 1: only live businesses
      b.status = 'live'
      -- Hard gate 2: category filter
      and (p_category_id is null or b.category_id = p_category_id)
      -- Hard gate 3: parish filter — primary parish OR service area
      and (
        p_parish is null
        or b.primary_parish = p_parish
        or exists (
          select 1 from business_service_areas sa
          where sa.business_id = b.id and sa.parish = p_parish
        )
      )
      -- Hard gate 4: text relevance gate
      and (
        v_clean_query is null
        or lower(b.name)                     like '%' || lower(v_clean_query) || '%'
        or lower(bc.label)                   like '%' || lower(v_clean_query) || '%'
        or lower(coalesce(b.town,''))        like '%' || lower(v_clean_query) || '%'
        or lower(coalesce(b.description,'')) like '%' || lower(v_clean_query) || '%'
      )
  )

  select
    base.id,
    base.name,
    base.category_id,
    base.category_label,
    base.category_icon,
    base.category_color,
    base.location_type,
    base.primary_parish,
    base.town,
    base.phone,
    base.whatsapp,
    base.website,
    base.logo_url,
    base.cover_url,
    base.verified,
    base.avg_rating,
    base.review_count,
    base.view_count,
    base.serves_parish
  from base
  order by
    -- WITH QUERY: text_score is absolute primary gate (same guarantee as events)
    base.text_score desc,
    -- Secondary: blended organic+paid within same relevance band
    -- organic(max ~9) + boost(max 3) + sub(max 1) = max 13
    -- organic dominates: rating 5.0 × 1.2 = 6.0 > boost(3) + sub(1) = 4
    -- A well-rated Free business beats a low-quality Pro/Elite
    (
        base.organic_score
      + (base.boost_score    * 3.0)   -- moderate bounded boost (max 3)
      + (base.priority_score * 1.0)   -- small bounded subscription (max 1)
    ) desc,
    -- Organic tie-breakers: rating → views → newest → deterministic
    coalesce(base.avg_rating, 0) desc,
    base.view_count desc,
    base.created_at desc,
    base.id desc
  limit  v_safe_limit
  offset v_safe_offset;
end;
$$;

grant execute on function public.search_businesses(text, uuid, text, integer, integer)
  to anon, authenticated;

do $$ begin
  raise notice 'Migration 20260817000000: search_events v3 + search_businesses v4. Relevance-first ranking, p_scope param, isEventPassed-matched cutoff, uniform boost strength, authoritative business boost eligibility, pagination clamped 1-100.';
end $$;
