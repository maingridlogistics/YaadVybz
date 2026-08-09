-- ─── VYBZ HUB BILLING FIX MIGRATION (CORRECTED) ─────────────────────────────
-- Parts: ISSUE-005, ISSUE-010, ISSUE-011, ISSUE-013, ISSUE-014, ISSUE-017, ISSUE-021
--
-- ROLLBACK SQL at end of file.

-- ─── 1. Add google_purchase_token to user_profiles (ISSUE-005) ───────────────
alter table public.user_profiles
  add column if not exists google_purchase_token text;

-- ─── 2. Make stripe_checkout_session nullable on boost_purchases (ISSUE-011) ──
alter table public.boost_purchases
  alter column stripe_checkout_session drop not null;

-- ─── 3. Add provider_purchase_token to boost_purchases ────────────────────────
-- boost_purchases already has provider_transaction_id (Google orderId) but the
-- Edge Functions store the Google purchase token (used for idempotency and refund
-- lookups) separately in provider_purchase_token.
alter table public.boost_purchases
  add column if not exists provider_purchase_token text;

-- ─── 4. Add rejection_reason to account_deletion_requests (ISSUE-014) ────────
alter table public.account_deletion_requests
  add column if not exists rejection_reason text;

-- ─── 5. Migrate existing Google tokens out of apple_original_transaction_id ──
-- Only migrates rows where payment_provider = 'google' — never touches real Apple data.
update public.user_profiles as p
set
  google_purchase_token         = p.apple_original_transaction_id,
  apple_original_transaction_id = null
from (
  select distinct user_id
  from public.subscriptions
  where payment_provider = 'google'
    and original_transaction_id is not null
) as g
where p.id = g.user_id
  and p.apple_original_transaction_id is not null;

-- ─── 6. Add billing lookup indexes (ISSUE-017) ───────────────────────────────

-- boost_purchases: idempotency lookups
create index if not exists boost_purchases_provider_purchase_token_idx
  on public.boost_purchases (provider_purchase_token)
  where provider_purchase_token is not null;

create index if not exists boost_purchases_apple_transaction_id_idx
  on public.boost_purchases (apple_transaction_id)
  where apple_transaction_id is not null;

create index if not exists boost_purchases_stripe_payment_intent_idx
  on public.boost_purchases (stripe_payment_intent)
  where stripe_payment_intent is not null;

-- subscriptions: idempotency and lookup indexes
create index if not exists subscriptions_original_transaction_id_idx
  on public.subscriptions (original_transaction_id)
  where original_transaction_id is not null;

create index if not exists subscriptions_provider_purchase_token_idx
  on public.subscriptions (provider_purchase_token)
  where provider_purchase_token is not null;

-- user_profiles: Google token lookup for RTDN handler
create index if not exists user_profiles_google_purchase_token_idx
  on public.user_profiles (google_purchase_token)
  where google_purchase_token is not null;

-- ─── 7. Atomic boost credit RPC (ISSUE-010) ──────────────────────────────────
create or replace function public.use_boost_credit_atomic(
  p_user_id    uuid,
  p_event_id   uuid,
  p_boost_type text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_boosts   int;
  v_boost_expires_at timestamptz;
  v_now              timestamptz := now();
begin
  -- Lock user profile row to serialize concurrent credit requests
  select remaining_boosts into v_current_boosts
  from user_profiles
  where id = p_user_id
  for update;

  if v_current_boosts is null or v_current_boosts <= 0 then
    return jsonb_build_object('ok', false, 'error', 'No boost credits remaining this month');
  end if;

  -- Atomically decrement exactly one credit
  update user_profiles
  set remaining_boosts = remaining_boosts - 1
  where id = p_user_id;

  -- Calculate expiry timestamp
  if p_boost_type = 'three_day' then
    v_boost_expires_at := v_now + interval '72 hours';
  elsif p_boost_type = 'seven_day' then
    v_boost_expires_at := v_now + interval '7 days';
  -- 'until_event_end': v_boost_expires_at remains null
  end if;

  -- Activate the boost (verifies event ownership and live status in WHERE)
  update events
  set
    boosted          = true,
    boost_type       = p_boost_type,
    boost_status     = 'active',
    boost_started_at = v_now,
    boost_expires_at = v_boost_expires_at
  where id          = p_event_id
    and promoter_id = p_user_id
    and status      = 'live';

  if not found then
    -- Rollback credit with safe relative increment
    update user_profiles
    set remaining_boosts = remaining_boosts + 1
    where id = p_user_id;

    return jsonb_build_object(
      'ok',    false,
      'error', 'Event not found, not live, or you are not the owner'
    );
  end if;

  -- Record the redemption (stripe_checkout_session is nullable after step 2)
  insert into boost_purchases (
    event_id, promoter_id, user_id, boost_type,
    amount, currency, status, payment_provider,
    completed_at, verified_at
  ) values (
    p_event_id, p_user_id, p_user_id, p_boost_type,
    0, 'usd', 'completed', 'credit',
    v_now, v_now
  );

  return jsonb_build_object(
    'ok',              true,
    'boost_expires_at', v_boost_expires_at,
    'remaining_boosts', v_current_boosts - 1
  );
end;
$$;

-- Grant execute only to service_role (called from Edge Functions using service key)
revoke all on function public.use_boost_credit_atomic(uuid, uuid, text) from public;
grant execute on function public.use_boost_credit_atomic(uuid, uuid, text) to service_role;

-- ─── ROLLBACK SQL ─────────────────────────────────────────────────────────────
-- alter table public.user_profiles drop column if exists google_purchase_token;
-- alter table public.boost_purchases alter column stripe_checkout_session set not null;
-- alter table public.boost_purchases drop column if exists provider_purchase_token;
-- alter table public.account_deletion_requests drop column if exists rejection_reason;
-- drop index if exists boost_purchases_provider_purchase_token_idx;
-- drop index if exists boost_purchases_apple_transaction_id_idx;
-- drop index if exists boost_purchases_stripe_payment_intent_idx;
-- drop index if exists subscriptions_original_transaction_id_idx;
-- drop index if exists subscriptions_provider_purchase_token_idx;
-- drop index if exists user_profiles_google_purchase_token_idx;
-- drop function if exists public.use_boost_credit_atomic(uuid, uuid, text);
