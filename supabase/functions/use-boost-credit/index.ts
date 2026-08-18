// use-boost-credit — Atomic server-side boost credit redemption.
//
// CRITICAL SECURITY NOTE:
//   This function calls use_boost_credit_atomic() using a USER-SCOPED Supabase
//   client (created with the user's JWT token), NOT the service-role client.
//
//   Reason: use_boost_credit_atomic is SECURITY DEFINER and uses auth.uid()
//   internally to identify the caller. When called via service_role, auth.uid()
//   returns NULL and authentication fails. The user-scoped client passes the JWT
//   so auth.uid() resolves to the verified user identity.
//
// SECURITY MODEL:
//   • Caller's JWT is verified by Supabase before the RPC executes
//   • Ownership validated inside the atomic DB RPC (FOR UPDATE row lock)
//   • target status (live) enforced server-side
//   • race-condition-safe: credit check + activation in single transaction
//   • until_event_end is rejected from credit redemption path by RPC
//   • Business boosts activate via business_promotions (placement='boost')
//   • Event boosts activate via events table + boost_purchases
//   • Idempotency via boost_credit_ledger UNIQUE(idempotency_key)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

// Included monthly credits may ONLY redeem 3-day boosts.
// 7-day and until_event_end are separately purchased paid options.
const VALID_BOOST_TYPES_FOR_CREDITS = ['three_day'] as const;
const ALL_VALID_BOOST_TYPES = ['three_day', 'seven_day', 'until_event_end'] as const;
type BoostType = typeof ALL_VALID_BOOST_TYPES[number];

const VALID_TARGET_TYPES = ['event', 'business'] as const;
type TargetType = typeof VALID_TARGET_TYPES[number];

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

  // ── 1. Extract and validate Authorization header ─────────────────────────────
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) {
    return new Response(JSON.stringify({ ok: false, error: 'Authorization required' }), {
      status: 401, headers: jsonHeaders,
    });
  }

  // ── 2. Parse and validate body FIRST (before network calls) ──────────────────
  let body: {
    eventId?: string;
    businessId?: string;
    boostType?: string;
    targetType?: string;
    idempotencyKey?: string;
  };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON body' }), {
      status: 400, headers: jsonHeaders,
    });
  }

  const boostType = (body.boostType ?? '') as string;
  const { eventId, businessId, idempotencyKey } = body;

  // until_event_end is event-only, but NOT redeemable via subscription credits
  if (boostType === 'until_event_end') {
    return new Response(
      JSON.stringify({
        ok: false,
        error: 'Until Event Ends is a separately purchased Boost and cannot be redeemed with included subscription credits',
      }),
      { status: 400, headers: jsonHeaders },
    );
  }

  if (!boostType || !(VALID_BOOST_TYPES_FOR_CREDITS as readonly string[]).includes(boostType)) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: 'Included Boost credits can only be used for 3-Day Boosts. 7-Day and Until Event Ends boosts must be purchased separately.',
      }),
      { status: 400, headers: jsonHeaders },
    );
  }

  // Strict target-type validation — no inference, no fallback
  const rawTargetType = (body.targetType ?? 'event') as string;
  if (!(VALID_TARGET_TYPES as readonly string[]).includes(rawTargetType)) {
    return new Response(
      JSON.stringify({ ok: false, error: 'targetType must be event or business' }),
      { status: 400, headers: jsonHeaders },
    );
  }
  const targetType = rawTargetType as TargetType;

  if (targetType === 'event') {
    if (!eventId || typeof eventId !== 'string') {
      return new Response(JSON.stringify({ ok: false, error: 'eventId is required for event boost' }), {
        status: 400, headers: jsonHeaders,
      });
    }
    if (businessId) {
      return new Response(JSON.stringify({ ok: false, error: 'businessId must be null for event boost' }), {
        status: 400, headers: jsonHeaders,
      });
    }
  } else if (targetType === 'business') {
    if (!businessId || typeof businessId !== 'string') {
      return new Response(JSON.stringify({ ok: false, error: 'businessId is required for business boost' }), {
        status: 400, headers: jsonHeaders,
      });
    }
    if (eventId) {
      return new Response(JSON.stringify({ ok: false, error: 'eventId must be null for business boost' }), {
        status: 400, headers: jsonHeaders,
      });
    }
  }

  // ── 3. Verify the user's JWT using admin client ──────────────────────────────
  // We use admin only for auth.getUser() — the RPC itself is called via user client.
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

  // ── 4. Verify premium access: lifetime_pro_owned OR admin_elite ─────────────
  // Included monthly boost credits are exclusive to Pro and Elite users.
  // Free users cannot consume included credits. This mirrors the DB-level
  // check inside use_boost_credit_atomic but provides a structured error message
  // BEFORE reaching the RPC, avoiding a generic DB exception.
  const { data: profileEntitlement, error: profileErr } = await supabaseAdmin
    .from('user_profiles')
    .select('lifetime_pro_owned, admin_elite')
    .eq('id', user.id)
    .maybeSingle();

  if (profileErr || !profileEntitlement) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Could not verify account entitlements. Please try again.' }),
      { status: 500, headers: jsonHeaders },
    );
  }

  const hasPremiumAccess =
    (profileEntitlement.lifetime_pro_owned === true) ||
    (profileEntitlement.admin_elite === true);

  if (!hasPremiumAccess) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: 'Pro access is required to use included Boost credits. Upgrade to Vybz Hub Pro to unlock 10 monthly 3-day Boosts.',
      }),
      { status: 403, headers: jsonHeaders },
    );
  }

  // ── 5. Create a USER-SCOPED client for the RPC call ──────────────────────────
  // CRITICAL: This ensures auth.uid() inside use_boost_credit_atomic() resolves
  // to the authenticated user's ID, not NULL (which service_role would produce).
  const supabaseUser = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    {
      global: {
        headers: { Authorization: `Bearer ${token}` },
      },
    },
  );

  // ── 6. Atomic credit redemption via PostgreSQL RPC ───────────────────────────
  // The RPC enforces:
  //   • auth.uid() === authenticated user (identity cannot be spoofed)
  //   • boost_credit_ledger is the authoritative usage source
  //   • FOR UPDATE lock prevents race conditions
  //   • Idempotency via UNIQUE(idempotency_key) in boost_credit_ledger
  const rpcParams: Record<string, unknown> = {
    // p_user_id is IGNORED by the RPC (auth.uid() is used instead)
    // Omitting it to be explicit, but passing null is also safe.
    p_user_id:          null,
    p_boost_type:       boostType as BoostType,
    p_target_type:      targetType,
    p_event_id:         targetType === 'event'    ? (eventId    ?? null) : null,
    p_business_id:      targetType === 'business' ? (businessId ?? null) : null,
    p_idempotency_key:  idempotencyKey ?? null,
  };

  const { data: rpcResult, error: rpcError } = await supabaseUser.rpc(
    'use_boost_credit_atomic',
    rpcParams,
  );

  if (rpcError) {
    console.error(
      `[use-boost-credit] RPC error: user=${user.id.slice(0, 8)} ` +
      `target=${targetType}/${targetType === 'event' ? eventId : businessId}`,
      rpcError.message,
    );
    return new Response(
      JSON.stringify({ ok: false, error: 'Failed to process boost credit. Please try again.' }),
      { status: 500, headers: jsonHeaders },
    );
  }

  const result = rpcResult as {
    ok: boolean;
    idempotent?: boolean;
    boost_expires_at: string | null;
    remaining_boosts?: number;
    remaining_credits?: number;
    target_type?: string;
    promotion_id?: string;
    error?: string;
    message?: string;
  } | null;

  if (!result?.ok) {
    const errMsg = result?.error ?? 'Unknown error during boost credit redemption';
    const statusCode =
      errMsg.includes('Insufficient') || errMsg.includes('credits') ? 400
      : errMsg.includes('not found') || errMsg.includes('not live') || errMsg.includes('not owned') ? 403
      : errMsg.includes('Unauthorized') ? 403
      : errMsg.includes('until_event_end') ? 400
      : 500;

    console.warn(
      `[use-boost-credit] Failed: user=${user.id.slice(0, 8)} ` +
      `target=${targetType} error=${errMsg}`,
    );
    return new Response(JSON.stringify({ ok: false, error: errMsg }), {
      status: statusCode, headers: jsonHeaders,
    });
  }

  console.log(
    `[use-boost-credit] Credit redeemed: user=${user.id.slice(0, 8)} ` +
    `target=${targetType}/${targetType === 'event' ? eventId : businessId} ` +
    `type=${boostType} remaining=${result.remaining_credits ?? result.remaining_boosts} ` +
    `idempotent=${result.idempotent ?? false}`,
  );

  return new Response(
    JSON.stringify({
      ok:               true,
      idempotent:       result.idempotent ?? false,
      boostExpiresAt:   result.boost_expires_at,
      remainingBoosts:  result.remaining_boosts ?? null,
      remainingCredits: result.remaining_credits ?? null,
      targetType:       result.target_type ?? targetType,
      promotionId:      result.promotion_id ?? null,
      message:          result.message ?? null,
    }),
    { status: 200, headers: jsonHeaders },
  );
});
