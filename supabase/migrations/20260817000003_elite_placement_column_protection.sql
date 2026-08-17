-- ═══════════════════════════════════════════════════════════════════════════════
-- VYBZ HUB — Elite Placement Column Protection (CORRECTED)
-- Migration: 20260817000003_elite_placement_column_protection.sql
--
-- ARCHITECTURE:
--   The EXISTING protection model for privileged user_profiles fields is:
--     1. Table-level UPDATE is REVOKED from 'authenticated'
--     2. Only specific safe columns have column-level UPDATE GRANTS to authenticated
--        (name, phone, home_parish, preferred_parishes, interests, avatar_url,
--         email_notif_*, push_notif_*)
--     3. Privileged fields (subscription_tier, subscription_status, roles, etc.)
--        are simply NOT in the authenticated column-level grant list
--
--   THIS IS THE CORRECT MECHANISM — no trigger needed.
--
--   The SECURITY DEFINER trigger approach in the first draft of this migration was
--   architecturally incorrect because inside a SECURITY DEFINER trigger function,
--   current_user becomes the function owner (postgres), not 'authenticated'.
--   The check `current_user = 'authenticated'` would therefore NEVER fire and
--   the trigger would never block anything.
--
-- CORRECTED APPROACH:
--   1. Drop the broken trigger and its function (if they were applied)
--   2. Confirm elite_placement_type and elite_placement_target_id are NOT
--      in the authenticated column-level UPDATE grant (matching other protected fields)
--   3. The set_elite_placement() SECURITY DEFINER function runs as the postgres
--      owner role, bypassing the column-level restrictions legitimately —
--      this is the correct trusted write path
--
-- PROTECTION VERIFIED BY:
--   An authenticated client cannot run:
--     UPDATE user_profiles SET elite_placement_type = 'event' WHERE id = auth.uid();
--   because:
--     (a) Table-level UPDATE is not granted to 'authenticated'
--     (b) Column-level UPDATE on elite_placement_type is not granted to 'authenticated'
--   The column-level check acts as defense-in-depth.
--
-- TRUSTED WRITE PATH:
--   set_elite_placement() SECURITY DEFINER → runs as postgres → UPDATE succeeds
--   service_role → bypasses RLS → UPDATE succeeds
--   Admin with service_role key → UPDATE succeeds
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Drop the broken SECURITY DEFINER trigger and function
--    (These were defined in an earlier version of this migration but are
--    architecturally incorrect — the current_user check does not work
--    inside a SECURITY DEFINER function as expected.)
-- ─────────────────────────────────────────────────────────────────────────────
drop trigger if exists protect_elite_placement_columns_trigger on public.user_profiles;
drop function if exists public.protect_elite_placement_columns();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Column-level REVOKE — defense-in-depth
--    The table-level UPDATE is already revoked from authenticated (per the
--    user_profiles privilege audit documented in the table description).
--    These column-level REVOKEs are explicit additional assertions that
--    match how all other privileged columns (subscription_tier, roles, etc.)
--    are handled: they simply have no column-level UPDATE grant to authenticated.
--    Adding an explicit REVOKE ensures these columns cannot be accidentally
--    granted in future refactoring without an intentional grant statement.
-- ─────────────────────────────────────────────────────────────────────────────
revoke update (elite_placement_type, elite_placement_target_id)
  on public.user_profiles
  from authenticated;

revoke update (elite_placement_type, elite_placement_target_id)
  on public.user_profiles
  from anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Privilege verification
--    These DO statements confirm the protection architecture at migration time.
--    They do not modify the database — they verify the expected state.
-- ─────────────────────────────────────────────────────────────────────────────
do $$ begin
  -- Confirm authenticated does NOT have table-level UPDATE on user_profiles
  -- (This matches the documented privilege audit: table-level UPDATE revoked)
  if has_table_privilege('authenticated', 'public.user_profiles', 'UPDATE') then
    raise warning
      'PRIVILEGE WARNING: authenticated has table-level UPDATE on user_profiles. '
      'This may allow direct modification of protected fields. '
      'Verify that only safe columns have column-level UPDATE grants.';
  else
    raise notice
      'VERIFIED: authenticated does not have table-level UPDATE on user_profiles. '
      'Protection architecture is correct.';
  end if;

  -- Confirm authenticated does NOT have column-level UPDATE on the elite columns
  if has_column_privilege('authenticated', 'public.user_profiles', 'elite_placement_type', 'UPDATE') then
    raise warning
      'PRIVILEGE WARNING: authenticated has UPDATE on elite_placement_type. '
      'This should be revoked. Direct client modification is possible.';
  else
    raise notice
      'VERIFIED: authenticated cannot UPDATE elite_placement_type.';
  end if;

  if has_column_privilege('authenticated', 'public.user_profiles', 'elite_placement_target_id', 'UPDATE') then
    raise warning
      'PRIVILEGE WARNING: authenticated has UPDATE on elite_placement_target_id. '
      'This should be revoked. Direct client modification is possible.';
  else
    raise notice
      'VERIFIED: authenticated cannot UPDATE elite_placement_target_id.';
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Migration summary
-- ─────────────────────────────────────────────────────────────────────────────
do $$ begin
  raise notice
    'Migration 20260817000003 (CORRECTED): '
    'Dropped broken SECURITY DEFINER trigger (current_user check was ineffective). '
    'Protection relies on the established user_profiles privilege model: '
    'table-level UPDATE revoked from authenticated + no column-level grant '
    'for elite_placement_type / elite_placement_target_id. '
    'set_elite_placement() SECURITY DEFINER is the sole trusted write path. '
    'Column-level REVOKE applied as explicit defense-in-depth.';
end $$;
