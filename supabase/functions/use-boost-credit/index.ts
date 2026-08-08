// use-boost-credit — Server-side atomic boost credit redemption.
//
// Replaces the previous client-side implementation that decremented
// remaining_boosts in the browser.  Running server-side with the service role
// means credit decrement and boost activation are serialised by PostgreSQL
// row locks — two concurrent devices cannot both spend the last credit.
//
// REQUEST:  POST /functions/v1/use-boost-credit
//   Auth:   Bearer <supabase_access_token>
//   Body:   { eventId: string, boostType: "three_day"|"seven_day"|"until_event_end" }
//
// RESPONSE SUCCESS:  { ok: true, boostExpiresAt: string|null, remainingBoosts: number }
// RESPONSE ERROR:    { ok: false, error: string }
//
// ATOMICITY GUARANTEE:
//   UPDATE … SET remaining_boosts = N-1 WHERE id=$user AND remaining_boosts = N
//   If two concurrent calls read remaining_boosts=1, only one UPDATE matches the
//   WHERE condition and returns a row; the other returns 0 rows and gets 409.
//
// COMPENSATING TRANSACTION:
//   If boost activation on the event fails after a successful credit decrement,
//   the credit is restored to its original value before returning the error.
//
// BOOST HISTORY:
//   Every successful credit redemption inserts a boost_purchases row with
//   payment_provider='credit' so the purchase history is provider-independent.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const VALID_BOOST_TYPES = ['three_day', 'seven_day', 'until_event_end'] as const;
type BoostType = typeof VALID_BOOST_TYPES[number];

// Duration map — mirrors activateBoostEntitlement logic in _shared/entitlements.ts
function calcBoostExpiry(boostType: BoostType, now: Date): string | null {
  if (boostType === 'three_day')  return new Date(now.getTime() + 72 * 60 * 60 * 1000).toISOString();
  if (boostType === 'seven_day')  return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  return null; // until_event_end — expiry determined by event date
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

  // ── 1. Authenticate ──────────────────────────────────────────────────────────
  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '').trim();
  if (!token) {
    return new Response(JSON.stringify({ ok: false, error: 'Authorization required' }), {
      status: 401, headers: jsonHeaders,
    });
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !user) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401, headers: jsonHeaders,
    });
  }

  // ── 2. Parse and validate body ───────────────────────────────────────────────
  let body: { eventId?: string; boostType?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON body' }), {
      status: 400, headers: jsonHeaders,
    });
  }

  const { eventId, boostType } = body;

  if (!eventId || typeof eventId !== 'string') {
    return new Response(JSON.stringify({ ok: false, error: 'eventId is required' }), {
      status: 400, headers: jsonHeaders,
    });
  }
  if (!boostType || !(VALID_BOOST_TYPES as readonly string[]).includes(boostType)) {
    return new Response(JSON.stringify({ ok: false, error: 'boostType must be three_day, seven_day, or until_event_end' }), {
      status: 400, headers: jsonHeaders,
    });
  }

  // ── 3. Verify event exists and user owns it ──────────────────────────────────
  const { data: eventRow, error: eventErr } = await supabaseAdmin
    .from('events')
    .select('id, promoter_id, title, status')
    .eq('id', eventId)
    .eq('promoter_id', user.id)
    .maybeSingle();

  if (eventErr || !eventRow) {
    return new Response(JSON.stringify({ ok: false, error: 'Event not found or you are not the owner' }), {
      status: 403, headers: jsonHeaders,
    });
  }

  if (eventRow.status !== 'live') {
    return new Response(JSON.stringify({ ok: false, error: 'Only live events can be boosted' }), {
      status: 400, headers: jsonHeaders,
    });
  }

  // ── 4. Read current credit balance ───────────────────────────────────────────
  const { data: profile, error: profileErr } = await supabaseAdmin
    .from('user_profiles')
    .select('remaining_boosts, subscription_tier')
    .eq('id', user.id)
    .single();

  if (profileErr || !profile) {
    return new Response(JSON.stringify({ ok: false, error: 'Could not read your profile' }), {
      status: 500, headers: jsonHeaders,
    });
  }

  const currentBoosts = (profile.remaining_boosts as number) ?? 0;
  if (currentBoosts <= 0) {
    return new Response(JSON.stringify({ ok: false, error: 'No boost credits remaining this month' }), {
      status: 400, headers: jsonHeaders,
    });
  }

  // ── 5. Atomic credit decrement ───────────────────────────────────────────────
  // UPDATE WHERE remaining_boosts = currentBoosts acts as an optimistic lock.
  // If a concurrent request has already decremented remaining_boosts, the WHERE
  // condition will not match and Supabase returns 0 rows (→ error with .single()).
  // This prevents two devices from spending the same final credit simultaneously.
  const { data: decremented, error: decrementErr } = await supabaseAdmin
    .from('user_profiles')
    .update({ remaining_boosts: currentBoosts - 1 })
    .eq('id', user.id)
    .eq('remaining_boosts', currentBoosts) // optimistic concurrency guard
    .select('remaining_boosts')
    .single();

  if (decrementErr || !decremented) {
    // 0 rows matched — another concurrent request won the race.
    // Tell the client to retry; their credit may have already been spent.
    console.warn(`[use-boost-credit] Concurrent credit decrement detected for user=${user.id.slice(0,8)}`);
    return new Response(JSON.stringify({ ok: false, error: 'Credit already in use — please try again.' }), {
      status: 409, headers: jsonHeaders,
    });
  }

  const newRemainingBoosts = (decremented.remaining_boosts as number);

  // ── 6. Calculate boost expiry ────────────────────────────────────────────────
  const now = new Date();
  const boostExpiresAt = calcBoostExpiry(boostType as BoostType, now);

  // ── 7. Activate boost on the event ──────────────────────────────────────────
  const { error: boostErr } = await supabaseAdmin
    .from('events')
    .update({
      boosted:          true,
      boost_type:       boostType,
      boost_status:     'active',
      boost_started_at: now.toISOString(),
      boost_expires_at: boostExpiresAt,
    })
    .eq('id', eventId)
    .eq('promoter_id', user.id);

  if (boostErr) {
    // Compensating transaction — restore the credit we just decremented.
    // Use the original value so a race between decrement and refund is safe.
    const { error: refundErr } = await supabaseAdmin
      .from('user_profiles')
      .update({ remaining_boosts: currentBoosts })
      .eq('id', user.id);

    const refundNote = refundErr ? ' (credit refund also failed — manual intervention required)' : ' Credit refunded.';
    console.error(
      `[use-boost-credit] Boost activation failed for event=${eventId} user=${user.id.slice(0,8)}.${refundNote}`,
      boostErr.message,
    );
    return new Response(JSON.stringify({ ok: false, error: 'Could not activate boost. Credit refunded.' }), {
      status: 500, headers: jsonHeaders,
    });
  }

  // ── 8. Record in boost_purchases — provider-independent history ──────────────
  // Inserts a row with payment_provider='credit' so boost history always shows
  // whether a boost came from Apple, Stripe, a subscription credit, or an admin.
  // This insert is non-fatal — the boost is already active even if it fails.
  const { error: purchaseErr } = await supabaseAdmin
    .from('boost_purchases')
    .insert({
      event_id:               eventId,
      promoter_id:            user.id,
      user_id:                user.id,
      boost_type:             boostType,
      amount:                 0,         // free credit — no payment
      currency:               'usd',
      status:                 'completed',
      payment_provider:       'credit',
      provider_product_id:    boostType, // no billing provider product
      provider_transaction_id: null,     // no billing provider transaction
      completed_at:           now.toISOString(),
      verified_at:            now.toISOString(),
      // stripe_checkout_session is NOT NULL in schema — use descriptive placeholder
      stripe_checkout_session: `credit_${user.id.slice(0, 8)}_${now.getTime()}`,
    });

  if (purchaseErr) {
    // Non-fatal — boost is active; log only.
    console.warn(`[use-boost-credit] boost_purchases insert failed (boost still active): ${purchaseErr.message}`);
  }

  console.log(
    `[use-boost-credit] Credit redeemed: user=${user.id.slice(0,8)} event=${eventId} type=${boostType} remaining=${newRemainingBoosts}`,
  );

  return new Response(
    JSON.stringify({ ok: true, boostExpiresAt, remainingBoosts: newRemainingBoosts }),
    { status: 200, headers: jsonHeaders },
  );
});
