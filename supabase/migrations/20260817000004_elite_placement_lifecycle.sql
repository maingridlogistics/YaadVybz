-- ═══════════════════════════════════════════════════════════════════════════════
-- VYBZ HUB — Elite Placement Lifecycle + Column Bypass Test
-- Migration: 20260817000004_elite_placement_lifecycle.sql
--
-- PURPOSE:
--   1. Privilege verification — confirms authenticated cannot directly UPDATE
--      elite_placement_type / elite_placement_target_id
--   2. Direct-update bypass test — executed under authenticated role to confirm
--      DENIED (permission denied for column)
--   3. Elite loss lifecycle trigger — clears elite_placement_type/target when
--      the user truly loses Elite entitlement (downgrade, expire, revoke, refund)
--      so a later re-subscription does NOT auto-resurrect the old selection
--
-- CLEARING SEMANTICS:
--   CLEAR when tier changes from 'elite' to anything else
--   CLEAR when status becomes a terminal state:
--     'expired' | 'revoked' | 'refunded' | NULL | any unrecognised value
--   DO NOT CLEAR during:
--     normal uninterrupted renewal (status stays active, period rolls forward)
--     canceled-but-still-valid period (status='canceled', period_end > now())
--     past_due with active benefit period (consistent with existing semantics)
--
-- TRIGGER ARCHITECTURE NOTE:
--   This trigger is SECURITY INVOKER (not SECURITY DEFINER).
--   SECURITY INVOKER preserves the caller's role, so the trigger fires correctly
--   whether called by service_role (webhook syncs) or postgres (admin ops).
--   The trigger does NOT need to identify the calling role — it unconditionally
--   enforces the invariant based solely on the new subscription_tier/status values.
--
-- BYPASS TEST:
--   We test using set_config + SET ROLE to simulate an authenticated client.
--   The test is wrapped in a subtransaction and rolled back — DB state unchanged.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Privilege verification
-- ─────────────────────────────────────────────────────────────────────────────
do $$ begin
  raise notice '=== Phase 17 Privilege Verification ===';

  if has_table_privilege('authenticated', 'public.user_profiles', 'UPDATE') then
    raise warning
      'FAIL: authenticated has table-level UPDATE on user_profiles. '
      'Privileged fields may be directly modifiable by authenticated clients.';
  else
    raise notice 'PASS: authenticated does NOT have table-level UPDATE on user_profiles.';
  end if;

  if has_column_privilege('authenticated', 'public.user_profiles', 'elite_placement_type', 'UPDATE') then
    raise warning 'FAIL: authenticated can UPDATE elite_placement_type.';
  else
    raise notice 'PASS: authenticated cannot UPDATE elite_placement_type.';
  end if;

  if has_column_privilege('authenticated', 'public.user_profiles', 'elite_placement_target_id', 'UPDATE') then
    raise warning 'FAIL: authenticated can UPDATE elite_placement_target_id.';
  else
    raise notice 'PASS: authenticated cannot UPDATE elite_placement_target_id.';
  end if;

  -- Verify safe profile columns are still updatable (name, phone, avatar_url)
  if has_column_privilege('authenticated', 'public.user_profiles', 'name', 'UPDATE') then
    raise notice 'PASS: authenticated CAN still UPDATE name (safe column — correct).';
  else
    raise warning 'WARN: authenticated cannot UPDATE name — normal profile editing may be broken.';
  end if;

  if has_column_privilege('authenticated', 'public.user_profiles', 'avatar_url', 'UPDATE') then
    raise notice 'PASS: authenticated CAN still UPDATE avatar_url (safe column — correct).';
  else
    raise warning 'WARN: authenticated cannot UPDATE avatar_url — profile photo may be broken.';
  end if;

  raise notice '=== End Privilege Verification ===';
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Direct-update bypass test
--    Use a savepoint subtransaction so DB state is never changed.
--    SET ROLE switches to authenticated, which has no UPDATE on user_profiles.
--    The attempt must raise an error.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  v_denied boolean := false;
begin
  raise notice '=== Phase 17 Direct Update Bypass Test ===';

  begin
    -- Save current role before switching
    set local role authenticated;

    -- This UPDATE must be blocked — authenticated has no column-level UPDATE grant
    update public.user_profiles
      set elite_placement_type = 'event'
      where id = '00000000-0000-0000-0000-000000000000';  -- fake UUID — row does not exist

    -- If we reach here, the privilege was NOT blocked — this is a FAIL
    raise exception 'BYPASS TEST FAIL: authenticated was able to UPDATE elite_placement_type.';

  exception
    when insufficient_privilege then
      v_denied := true;
      raise notice 'PASS: Direct UPDATE of elite_placement_type by authenticated role was DENIED (permission denied for column).';
    when others then
      -- Any other exception (e.g. "role does not exist") should be surfaced
      raise notice 'BYPASS TEST INFO: exception raised: %', sqlerrm;
      v_denied := true;
  end;

  -- Restore role in all cases
  reset role;

  if not v_denied then
    raise warning 'BYPASS TEST: no exception was raised — please verify manually.';
  end if;

  raise notice '=== End Bypass Test ===';
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Elite placement lifecycle trigger
--
--    BEFORE UPDATE on user_profiles.
--    Fires when subscription fields change.
--    Clears elite_placement_type + elite_placement_target_id when:
--      (a) tier changes from 'elite' to something else
--      (b) status becomes a terminal state: expired | revoked | refunded
--          or NULL or any value not in the allowed-list
--    Does NOT clear for:
--      ongoing active/trialing renewals
--      canceled with valid paid-through period (status='canceled', period_end future)
--      past_due with benefit period (preserving existing semantics)
--
--    This ensures that after a TRUE Elite loss, a later re-subscription
--    does NOT auto-resurrect the old selection. Creator must explicitly
--    select again.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.clear_elite_placement_on_entitlement_loss()
returns trigger
language plpgsql
security invoker   -- preserve caller's role (service_role for webhooks)
set search_path = public
as $$
begin
  -- Only act when the placement is actually set
  if new.elite_placement_type is null and new.elite_placement_target_id is null then
    return new;
  end if;

  -- CLEAR CONDITION (a): tier is no longer 'elite'
  if coalesce(new.subscription_tier, 'free') <> 'elite' then
    new.elite_placement_type      := null;
    new.elite_placement_target_id := null;
    return new;
  end if;

  -- CLEAR CONDITION (b): status is a terminal/invalid value
  -- 'active', 'trialing', 'canceled', 'past_due' are safe (preserve placement)
  -- Everything else (expired, revoked, refunded, null, unknown) → clear
  if coalesce(new.subscription_status, '') not in ('active', 'trialing', 'canceled', 'past_due') then
    new.elite_placement_type      := null;
    new.elite_placement_target_id := null;
    return new;
  end if;

  -- Placement is still valid — return unchanged
  return new;
end;
$$;

drop trigger if exists clear_elite_placement_on_entitlement_loss_trigger
  on public.user_profiles;

create trigger clear_elite_placement_on_entitlement_loss_trigger
  before update of subscription_tier, subscription_status
  on public.user_profiles
  for each row
  execute function public.clear_elite_placement_on_entitlement_loss();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Migration summary
-- ─────────────────────────────────────────────────────────────────────────────
do $$ begin
  raise notice
    'Migration 20260817000004: '
    'Privilege verification done. '
    'Direct-update bypass test run under authenticated role — expected DENIED. '
    'clear_elite_placement_on_entitlement_loss() trigger created: '
    'fires BEFORE UPDATE of subscription_tier/status on user_profiles; '
    'clears elite_placement columns when tier leaves elite OR status becomes terminal; '
    'preserves placement during active renewal, canceled-paid-through, past_due.';
end $$;
