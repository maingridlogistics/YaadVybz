-- ═══════════════════════════════════════════════════════════════════════════════
-- VYBZ HUB — Elite Placement Column Protection
-- Migration: 20260817000003_elite_placement_column_protection.sql
--
-- PURPOSE:
--   Prevents normal authenticated clients from directly UPDATE-ing the
--   elite_placement_type and elite_placement_target_id columns on user_profiles
--   without going through the set_elite_placement() SECURITY DEFINER RPC.
--
-- CONTEXT:
--   Per the user_profiles privilege audit (2026-08-16), table-level UPDATE
--   was already revoked from the 'authenticated' role, and only specific safe
--   columns have column-level UPDATE grants (name, phone, home_parish, etc).
--   elite_placement_type and elite_placement_target_id are NOT in that safe list.
--
--   However, to be explicit and future-proof (e.g. if table-level UPDATE is
--   ever accidentally re-granted), this migration:
--     1. Explicitly ensures these columns are NOT in the authenticated grant list
--     2. Adds a trigger-based protection as a defense-in-depth layer
--
-- TRUSTED WRITE PATH:
--   set_elite_placement() runs as the postgres owner (SECURITY DEFINER).
--   service_role bypasses RLS entirely.
--   admin operations use service_role or SECURITY DEFINER RPCs.
--
-- ARCHITECTURE:
--   This follows the same pattern used for subscription_tier, subscription_status,
--   current_period_end, roles, and other privileged columns — they are not in the
--   authenticated column-level UPDATE grant; they are written only by trusted paths.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Explicitly revoke column-level UPDATE for elite_placement columns
--    from the authenticated role (defense-in-depth — table-level already revoked)
-- ─────────────────────────────────────────────────────────────────────────────
revoke update (elite_placement_type, elite_placement_target_id)
  on public.user_profiles
  from authenticated;

-- Also ensure anon role cannot write
revoke update (elite_placement_type, elite_placement_target_id)
  on public.user_profiles
  from anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Trigger-based protection (defense-in-depth layer 2)
--    Even if column-level privileges are accidentally restored, this trigger
--    blocks direct modification of elite_placement columns by non-privileged callers.
--    SECURITY DEFINER functions (running as postgres/service_role) bypass this
--    because they are not the 'authenticated' role.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.protect_elite_placement_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Block direct modification of elite_placement columns by non-privileged roles.
  -- SECURITY DEFINER RPCs run as the function owner (postgres), not 'authenticated'.
  -- service_role bypasses RLS and triggers entirely.
  if current_user = 'authenticated' then
    if (new.elite_placement_type      is distinct from old.elite_placement_type) or
       (new.elite_placement_target_id is distinct from old.elite_placement_target_id) then
      raise exception
        'Direct modification of elite_placement_type / elite_placement_target_id is not permitted. '
        'Use the set_elite_placement() RPC instead.'
        using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end;
$$;

-- Attach trigger to user_profiles UPDATE
drop trigger if exists protect_elite_placement_columns_trigger on public.user_profiles;
create trigger protect_elite_placement_columns_trigger
  before update on public.user_profiles
  for each row
  execute function public.protect_elite_placement_columns();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Migration notice
-- ─────────────────────────────────────────────────────────────────────────────
do $$ begin
  raise notice
    'Migration 20260817000003: '
    'elite_placement_type and elite_placement_target_id columns explicitly revoked from '
    '''authenticated'' and ''anon'' roles. Trigger-based protection layer added as '
    'defense-in-depth. Trusted write path: set_elite_placement() SECURITY DEFINER RPC only.';
end $$;
