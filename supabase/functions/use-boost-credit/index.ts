// use-boost-credit — Atomic server-side boost credit redemption.
//
// Supports both Event and Business boost targets via targetType parameter.
//
// SECURITY:
//   • Ownership validated inside the atomic DB RPC (FOR UPDATE row lock)
//   • target status (live) enforced server-side
//   • race-condition-safe: credit decrement + activation in single transaction
//   • Business boosts activate via business_promotions table (placement='boost')
//   • Event boosts activate via events table + boost_purchases

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const VALID_BOOST_TYPES = ['three_day', 'seven_day', 'until_event_end'] as const;
type BoostType = typeof VALID_BOOST_TYPES[number];

const VALID_TARGET_TYPES = ['event', 'business'] as const;
type TargetType = typeof VALID_TARGET_TYPES[number];

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
  let body: {
    eventId?: string;
    businessId?: string;
    boostType?: string;
    targetType?: string;
  };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON body' }), {
      status: 400, headers: jsonHeaders,
    });
  }

  // Support both targetType-explicit and legacy eventId-only calls
  const rawTargetType = (body.targetType ?? 'event') as string;
  const targetType: TargetType = (VALID_TARGET_TYPES as readonly string[]).includes(rawTargetType)
    ? rawTargetType as TargetType
    : 'event';

  const { eventId, businessId, boostType } = body;

  // until_event_end is event-only
  if (boostType === 'until_event_end' && targetType === 'business') {
    return new Response(JSON.stringify({ ok: false, error: 'until_event_end is not available for Business Boosts' }), {
      status: 400, headers: jsonHeaders,
    });
  }

  if (!boostType || !(VALID_BOOST_TYPES as readonly string[]).includes(boostType)) {
    return new Response(JSON.stringify({ ok: false, error: 'boostType must be three_day, seven_day, or until_event_end' }), {
      status: 400, headers: jsonHeaders,
    });
  }

  if (targetType === 'event' && (!eventId || typeof eventId !== 'string')) {
    return new Response(JSON.stringify({ ok: false, error: 'eventId is required for event boost' }), {
      status: 400, headers: jsonHeaders,
    });
  }
  if (targetType === 'business' && (!businessId || typeof businessId !== 'string')) {
    return new Response(JSON.stringify({ ok: false, error: 'businessId is required for business boost' }), {
      status: 400, headers: jsonHeaders,
    });
  }

  // ── 3. Atomic credit redemption via PostgreSQL RPC ───────────────────────────
  //
  // use_boost_credit_atomic handles both event and business targets in a SINGLE
  // transaction with a FOR UPDATE row lock on user_profiles to prevent races.
  const rpcParams: Record<string, unknown> = {
    p_user_id:     user.id,
    p_boost_type:  boostType as BoostType,
    p_target_type: targetType,
    p_event_id:    targetType === 'event'    ? (eventId    ?? null) : null,
    p_business_id: targetType === 'business' ? (businessId ?? null) : null,
  };

  const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc(
    'use_boost_credit_atomic',
    rpcParams,
  );

  if (rpcError) {
    console.error(
      `[use-boost-credit] RPC error: user=${user.id.slice(0,8)} ` +
      `target=${targetType}/${targetType === 'event' ? eventId : businessId}`,
      rpcError.message,
    );
    return new Response(JSON.stringify({ ok: false, error: 'Failed to process boost credit. Please try again.' }), {
      status: 500, headers: jsonHeaders,
    });
  }

  const result = rpcResult as {
    ok: boolean;
    boost_expires_at: string | null;
    remaining_boosts: number;
    target_type?: string;
    promotion_id?: string;
    error?: string;
  } | null;

  if (!result?.ok) {
    const errMsg = result?.error ?? 'Unknown error during boost credit redemption';
    const statusCode = errMsg.includes('No boost credits') ? 400
      : errMsg.includes('not found') || errMsg.includes('not live') || errMsg.includes('not owned') ? 403
      : 500;
    console.warn(
      `[use-boost-credit] Failed: user=${user.id.slice(0,8)} ` +
      `target=${targetType} error=${errMsg}`,
    );
    return new Response(JSON.stringify({ ok: false, error: errMsg }), {
      status: statusCode, headers: jsonHeaders,
    });
  }

  console.log(
    `[use-boost-credit] Credit redeemed: user=${user.id.slice(0,8)} ` +
    `target=${targetType}/${targetType === 'event' ? eventId : businessId} ` +
    `type=${boostType} remaining=${result.remaining_boosts}`,
  );

  return new Response(
    JSON.stringify({
      ok:              true,
      boostExpiresAt:  result.boost_expires_at,
      remainingBoosts: result.remaining_boosts,
      targetType:      result.target_type ?? targetType,
      promotionId:     result.promotion_id ?? null,
    }),
    { status: 200, headers: jsonHeaders },
  );
});
