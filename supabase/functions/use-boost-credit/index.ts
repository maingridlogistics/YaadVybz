// use-boost-credit — Atomic server-side boost credit redemption.
//
// ISSUE-010 FIX: Refactored to use the `use_boost_credit_atomic` PostgreSQL
//   function which executes the full credit-decrement → event-activate →
//   purchase-record pipeline in a single database transaction.
//
//   Guarantees:
//   • If two devices simultaneously try to spend the last credit, only ONE
//     succeeds (PostgreSQL FOR UPDATE row lock on user_profiles).
//   • If boost activation fails inside the transaction, the credit decrement
//     is rolled back automatically — no separate compensating transaction needed.
//
// ISSUE-011 FIX: No placeholder stripe_checkout_session inserted.
//   The atomic RPC inserts with that column omitted (nullable after migration).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const VALID_BOOST_TYPES = ['three_day', 'seven_day', 'until_event_end'] as const;
type BoostType = typeof VALID_BOOST_TYPES[number];

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

  // ── 3. Atomic credit redemption via PostgreSQL RPC ───────────────────────────
  //
  // use_boost_credit_atomic does the following in a SINGLE transaction:
  //   1. SELECT ... FOR UPDATE (row lock on user_profiles)
  //   2. Check remaining_boosts > 0
  //   3. UPDATE remaining_boosts = remaining_boosts - 1
  //   4. UPDATE events SET boosted = true ... WHERE status = 'live'
  //   5. INSERT INTO boost_purchases ...
  //
  // If step 4 or 5 fails, the entire transaction rolls back including step 3.
  // Concurrent requests are safely serialized by the row lock.
  const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc('use_boost_credit_atomic', {
    p_user_id:    user.id,
    p_event_id:   eventId,
    p_boost_type: boostType as BoostType,
  });

  if (rpcError) {
    console.error(`[use-boost-credit] RPC error: user=${user.id.slice(0,8)} event=${eventId}`, rpcError.message);
    return new Response(JSON.stringify({ ok: false, error: 'Failed to process boost credit. Please try again.' }), {
      status: 500, headers: jsonHeaders,
    });
  }

  const result = rpcResult as { ok: boolean; boost_expires_at: string | null; remaining_boosts: number; error?: string } | null;

  if (!result?.ok) {
    const errMsg = result?.error ?? 'Unknown error during boost credit redemption';
    const statusCode = errMsg.includes('No boost credits') ? 400
      : errMsg.includes('not found') || errMsg.includes('not live') ? 403
      : 500;
    console.warn(`[use-boost-credit] Failed: user=${user.id.slice(0,8)} event=${eventId} error=${errMsg}`);
    return new Response(JSON.stringify({ ok: false, error: errMsg }), {
      status: statusCode, headers: jsonHeaders,
    });
  }

  console.log(
    `[use-boost-credit] Credit redeemed atomically: user=${user.id.slice(0,8)} event=${eventId} ` +
    `type=${boostType} remaining=${result.remaining_boosts}`
  );

  return new Response(
    JSON.stringify({
      ok:              true,
      boostExpiresAt:  result.boost_expires_at,
      remainingBoosts: result.remaining_boosts,
    }),
    { status: 200, headers: jsonHeaders },
  );
});
