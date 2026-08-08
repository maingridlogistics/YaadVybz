// verify-apple-transaction — iOS client → Vybz Hub server transaction verification.
//
// The iOS client sends the raw JWS-signed transaction from StoreKit 2 BEFORE
// calling transaction.finish().  This function verifies the signature, checks
// idempotency, and activates the subscription entitlement or consumable boost.
// Only after receiving { ok: true } should the client call transaction.finish().
//
// SECURITY MODEL:
//   • Authenticated user JWT required — no anonymous calls accepted
//   • JWS signature verified against Apple x5c cert chain (primary security check)
//   • appAccountToken in transaction must match authenticated user ID (anti-replay)
//   • apple_transactions table enforces idempotency (UNIQUE transaction_id)
//   • Sandbox environment cannot activate production entitlements
//   • Consumable boost transactions stored permanently — Restore Purchases cannot
//     re-activate old boosts (consumables never appear in currentEntitlements)
//
// Request:  POST /functions/v1/verify-apple-transaction
//   Auth:   Bearer <supabase_access_token>
//   Body:   { signedTransaction, purchaseType, eventId? }
//
// Response: { ok, environment, tier? } | { ok, environment, boostType?, boostExpiresAt? }

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import {
  verifyAppleJWS,
  type AppleTransactionPayload,
} from '../_shared/appleJws.ts';
import {
  syncSubscriptionEntitlements,
  activateBoostEntitlement,
  checkAppleTransactionIdempotency,
  recordAppleTransaction,
  type PlanTier,
  type BoostType,
} from '../_shared/entitlements.ts';
import { checkSubscriptionEligibility } from '../_shared/subscriptionGuard.ts';

// ─── Product ID → entitlement maps ───────────────────────────────────────────

/** All 4 subscription product IDs → plan + billing cycle */
const SUBSCRIPTION_PRODUCTS: Record<string, { plan: 'pro' | 'elite'; cycle: 'monthly' | 'yearly' }> = {
  'com.vybzhub.subscription.promoter_pro.monthly': { plan: 'pro',   cycle: 'monthly' },
  'com.vybzhub.subscription.promoter_pro.yearly':  { plan: 'pro',   cycle: 'yearly'  },
  'com.vybzhub.subscription.elite.monthly':         { plan: 'elite', cycle: 'monthly' },
  'com.vybzhub.subscription.elite.yearly':          { plan: 'elite', cycle: 'yearly'  },
};

/** All 3 boost consumable product IDs → boost type */
const BOOST_PRODUCTS: Record<string, BoostType> = {
  'com.vybzhub.boost.three_day':        'three_day',
  'com.vybzhub.boost.seven_day':        'seven_day',
  'com.vybzhub.boost.until_event_end':  'until_event_end',
};

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

  // ── 2. Parse body ────────────────────────────────────────────────────────────
  let body: {
    signedTransaction?: string;
    purchaseType?: 'subscription' | 'consumable';
    eventId?: string;
  };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON body' }), {
      status: 400, headers: jsonHeaders,
    });
  }

  const { signedTransaction, purchaseType, eventId } = body;

  if (!signedTransaction || typeof signedTransaction !== 'string') {
    return new Response(JSON.stringify({ ok: false, error: 'signedTransaction is required' }), {
      status: 400, headers: jsonHeaders,
    });
  }
  if (purchaseType !== 'subscription' && purchaseType !== 'consumable') {
    return new Response(JSON.stringify({ ok: false, error: 'purchaseType must be "subscription" or "consumable"' }), {
      status: 400, headers: jsonHeaders,
    });
  }
  if (purchaseType === 'consumable' && !eventId) {
    return new Response(JSON.stringify({ ok: false, error: 'eventId is required for consumable (boost) purchases' }), {
      status: 400, headers: jsonHeaders,
    });
  }

  // ── 3. Verify Apple JWS signature ────────────────────────────────────────────
  let tx: AppleTransactionPayload;
  try {
    tx = await verifyAppleJWS<AppleTransactionPayload>(signedTransaction);
  } catch (e) {
    console.error(`[verify-apple-tx] JWS verification failed user=${user.id.slice(0,8)}:`, String(e).slice(0, 200));
    return new Response(JSON.stringify({ ok: false, error: 'Apple transaction verification failed' }), {
      status: 400, headers: jsonHeaders,
    });
  }

  // ── 4. Bundle ID check ────────────────────────────────────────────────────────
  const expectedBundle = Deno.env.get('APPLE_BUNDLE_ID') ?? 'com.chambex.vybzhub';
  if (tx.bundleId !== expectedBundle) {
    console.error(`[verify-apple-tx] Bundle ID mismatch: got=${tx.bundleId} expected=${expectedBundle}`);
    return new Response(JSON.stringify({ ok: false, error: 'Transaction bundle ID does not match this app' }), {
      status: 400, headers: jsonHeaders,
    });
  }

  // ── 5. Sandbox guard ─────────────────────────────────────────────────────────
  // Sandbox transactions can be used for TestFlight + Sandbox testing.
  // APPLE_REJECT_SANDBOX=true to harden production if desired.
  const isSandbox = tx.environment === 'Sandbox';
  if (isSandbox && Deno.env.get('APPLE_REJECT_SANDBOX') === 'true') {
    console.warn(`[verify-apple-tx] Sandbox transaction rejected (env enforcement active)`);
    return new Response(JSON.stringify({ ok: false, error: 'Sandbox transactions not accepted' }), {
      status: 400, headers: jsonHeaders,
    });
  }

  // ── 6. appAccountToken cross-check (anti-replay across accounts) ─────────────
  // The iOS client sets appAccountToken = user.id during purchase initiation.
  // Verify the token matches the current authenticated user to prevent one
  // user passing another user's transaction ID to steal entitlements.
  if (tx.appAccountToken) {
    const txToken = tx.appAccountToken.toLowerCase().replace(/-/g, '');
    const sessionUid = user.id.toLowerCase().replace(/-/g, '');
    if (txToken !== sessionUid) {
      console.error(`[verify-apple-tx] appAccountToken mismatch: tx=${txToken.slice(0,8)} user=${sessionUid.slice(0,8)}`);
      return new Response(JSON.stringify({ ok: false, error: 'Transaction was initiated by a different account' }), {
        status: 403, headers: jsonHeaders,
      });
    }
  } else {
    // Log but don't reject — appAccountToken may be absent for Ask to Buy transactions
    // or legacy purchases being restored.
    console.warn(`[verify-apple-tx] No appAccountToken in transaction ${tx.transactionId} — skipping token check`);
  }

  // ── 7. Idempotency — check if transaction already processed ─────────────────
  const existing = await checkAppleTransactionIdempotency(supabaseAdmin, tx.transactionId);
  if (existing) {
    if (purchaseType === 'consumable') {
      // For consumables: only return cached success when the SAME event was originally boosted.
      // If the same JWS is submitted for a different event (replay attack), reject it.
      // The processed_action format is: boost_<boostType>_event_<eventId>
      const sameEvent = eventId ? existing.includes(`event_${eventId}`) : false;
      if (sameEvent) {
        console.log(`[verify-apple-tx] Duplicate consumable tx=${tx.transactionId} same event=${eventId} — cached success`);
        return new Response(JSON.stringify({ ok: true, cached: true, environment: tx.environment }), {
          status: 200, headers: jsonHeaders,
        });
      } else {
        // Transaction already consumed for a DIFFERENT event — reject.
        // The client must NOT call finishTransaction; the boost will not activate.
        console.warn(
          `[verify-apple-tx] Replay rejected: tx=${tx.transactionId} already used (action=${existing}) attempted for event=${eventId}`,
        );
        return new Response(
          JSON.stringify({ ok: false, error: 'This transaction has already been used to boost another event' }),
          { status: 409, headers: jsonHeaders },
        );
      }
    }
    // Subscriptions: cached ok is always correct — entitlement still applies to the user.
    console.log(`[verify-apple-tx] Duplicate subscription tx=${tx.transactionId} (action=${existing}) — cached success`);
    return new Response(JSON.stringify({ ok: true, cached: true, environment: tx.environment }), {
      status: 200, headers: jsonHeaders,
    });
  }

  // ── 7b. Cross-provider subscription guard (subscriptions only) ───────────────
  // Before activating any subscription entitlement, verify that the user does
  // not already have an active paid subscription from a DIFFERENT provider.
  // This is the server-side lock that prevents double billing.
  // Consumable boosts bypass this check — they are one-time purchases and do not
  // create ongoing subscription entitlements.
  if (purchaseType === 'subscription') {
    const eligibility = await checkSubscriptionEligibility(supabaseAdmin, user.id, 'apple');
    if (!eligibility.eligible) {
      const sub = eligibility.activeSubscription;
      const isSameApple = sub?.paymentProvider === 'apple';

      if (isSameApple) {
        // Same Apple subscription (e.g., upgrade via App Store) — allow and fall through.
        // Apple manages same-provider plan changes natively; the ASSN V2 notification
        // will fire DID_CHANGE_RENEWAL_PREF and later SUBSCRIBED/DID_RENEW.
        console.log(
          `[verify-apple-tx] Same-provider (Apple) subscription update allowed: user=${user.id.slice(0,8)}`
        );
        // Continue processing — do NOT return here
      } else {
        // DIFFERENT provider has an active subscription — block to prevent double billing.
        console.warn(
          `[verify-apple-tx] Cross-provider block: user=${user.id.slice(0,8)} ` +
          `has ${sub?.paymentProvider ?? 'unknown'} subscription (${sub?.status ?? 'unknown'}). ` +
          `Apple activation blocked.`
        );
        return new Response(
          JSON.stringify({
            ok: false,
            error: eligibility.reason,
            eligibility: eligibility.eligibility,
            activeProvider: sub?.paymentProvider ?? null,
          }),
          { status: 409, headers: jsonHeaders },
        );
      }
    }
  }

  // ── 8. Validate product ID ───────────────────────────────────────────────────
  const subConfig = SUBSCRIPTION_PRODUCTS[tx.productId];
  const boostType  = BOOST_PRODUCTS[tx.productId];

  if (purchaseType === 'subscription' && !subConfig) {
    console.error(`[verify-apple-tx] Unknown subscription product: ${tx.productId}`);
    return new Response(JSON.stringify({ ok: false, error: `Unknown subscription product: ${tx.productId}` }), {
      status: 400, headers: jsonHeaders,
    });
  }
  if (purchaseType === 'consumable' && !boostType) {
    console.error(`[verify-apple-tx] Unknown boost product: ${tx.productId}`);
    return new Response(JSON.stringify({ ok: false, error: `Unknown boost product: ${tx.productId}` }), {
      status: 400, headers: jsonHeaders,
    });
  }

  // ── 9a. Subscription activation ──────────────────────────────────────────────
  if (purchaseType === 'subscription' && subConfig) {
    const expiresDate = tx.expiresDate ? new Date(tx.expiresDate).toISOString() : null;
    const env: 'production' | 'sandbox' = isSandbox ? 'sandbox' : 'production';

    // Write entitlements to user_profiles and events.promoter_tier
    await syncSubscriptionEntitlements(supabaseAdmin, {
      userId:                user.id,
      plan:                  subConfig.plan as PlanTier,
      subscriptionStatus:    'active',
      paymentProvider:       'apple',
      currentPeriodEnd:      expiresDate,
      originalTransactionId: tx.originalTransactionId,
      environment:           env,
    });

    // Upsert subscription ledger (original_transaction_id is stable across renewals)
    await supabaseAdmin.from('subscriptions').upsert({
      user_id:                  user.id,
      plan:                     subConfig.plan,
      billing_cycle:            subConfig.cycle,
      status:                   'active',
      payment_provider:         'apple',
      original_transaction_id:  tx.originalTransactionId,
      provider_product_id:      tx.productId,
      provider_transaction_id:  tx.transactionId,
      current_period_end:       expiresDate,
      environment:              tx.environment,
      last_verified_at:         new Date().toISOString(),
    }, { onConflict: 'original_transaction_id' });

    // Record for idempotency (UNIQUE transaction_id — duplicate call returns cached success)
    await recordAppleTransaction(supabaseAdmin, {
      transactionId:          tx.transactionId,
      originalTransactionId:  tx.originalTransactionId,
      productId:              tx.productId,
      purchaseType:           'auto_renewable_subscription',
      userId:                 user.id,
      eventId:                null,
      environment:            tx.environment,
      processedAction:        `activate_${subConfig.plan}`,
      rawSignedPayload:       signedTransaction,
    });

    console.log(`[verify-apple-tx] Subscription activated: user=${user.id.slice(0,8)} plan=${subConfig.plan} cycle=${subConfig.cycle} env=${tx.environment}`);
    return new Response(JSON.stringify({
      ok:          true,
      environment: tx.environment,
      tier:        subConfig.plan,
    }), { status: 200, headers: jsonHeaders });
  }

  // ── 9b. Consumable boost activation ──────────────────────────────────────────
  if (purchaseType === 'consumable' && boostType && eventId) {
    // Ownership check — service role bypasses RLS but we still verify ownership
    const { data: eventRow } = await supabaseAdmin
      .from('events')
      .select('id, promoter_id')
      .eq('id', eventId)
      .eq('promoter_id', user.id)
      .maybeSingle();

    if (!eventRow) {
      return new Response(JSON.stringify({ ok: false, error: 'Event not found or you are not the owner' }), {
        status: 403, headers: jsonHeaders,
      });
    }

    const env: 'production' | 'sandbox' = isSandbox ? 'sandbox' : 'production';
    const { ok, boostExpiresAt, error: boostErr } = await activateBoostEntitlement(supabaseAdmin, {
      eventId,
      promoterId:      user.id,
      boostType,
      paymentProvider: 'apple',
      transactionId:   tx.transactionId,
      currency:        'usd',
      environment:     env,
    });

    if (!ok) {
      console.error(`[verify-apple-tx] Boost activation failed: ${boostErr}`);
      return new Response(JSON.stringify({ ok: false, error: boostErr ?? 'Boost activation failed' }), {
        status: 500, headers: jsonHeaders,
      });
    }

    // Record consumable transaction — prevents re-processing via Restore Purchases.
    // Consumables never appear in currentEntitlements, so Restore cannot re-trigger this.
    await recordAppleTransaction(supabaseAdmin, {
      transactionId:          tx.transactionId,
      originalTransactionId:  tx.originalTransactionId,
      productId:              tx.productId,
      purchaseType:           'consumable',
      userId:                 user.id,
      eventId,
      environment:            tx.environment,
      processedAction:        `boost_${boostType}_event_${eventId}`,
      rawSignedPayload:       signedTransaction,
    });

    console.log(`[verify-apple-tx] Boost activated: user=${user.id.slice(0,8)} type=${boostType} event=${eventId} env=${tx.environment}`);
    return new Response(JSON.stringify({
      ok:           true,
      environment:  tx.environment,
      boostType,
      boostExpiresAt,
    }), { status: 200, headers: jsonHeaders });
  }

  return new Response(JSON.stringify({ ok: false, error: 'Unhandled purchase type combination' }), {
    status: 400, headers: jsonHeaders,
  });
});
