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
  activateLifetimePro,
  revokeLifetimePro,
  activateBoostEntitlement,
  checkAppleTransactionIdempotency,
  recordAppleTransaction,
  type PlanTier,
  type BoostType,
} from '../_shared/entitlements.ts';
import { checkSubscriptionEligibility } from '../_shared/subscriptionGuard.ts';

// ─── Product ID → entitlement maps ───────────────────────────────────────────

/** Lifetime Pro non-consumable */
const LIFETIME_PRO_PRODUCT_ID = 'com.vybzhub.pro.lifetime';

/** Legacy subscription product IDs (no longer sold; kept for historical idempotency checks) */
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
  if (!['subscription', 'consumable', 'non_consumable'].includes(purchaseType ?? '')) {
    return new Response(JSON.stringify({ ok: false, error: 'purchaseType must be "non_consumable", "subscription", or "consumable"' }), {
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

  // ── 5. Sandbox / Production environment routing ──────────────────────────────
  //
  // The JWS x5c signature above already cryptographically proves authenticity.
  // Apple's ASSN endpoint below provides an ADDITIONAL server-side confirmation
  // that the transaction exists in Apple's records for the correct environment.
  //
  // ENVIRONMENT POLICY:
  //   - Sandbox transactions are verified against Apple's SANDBOX ASSN endpoint.
  //   - Production transactions are verified against Apple's PRODUCTION ASSN endpoint.
  //   - A transaction is NEVER cross-verified (sandbox tx against production API).
  //
  // APPLE_REJECT_SANDBOX:
  //   - Set to "true" ONLY when deploying a fully signed production App Store build
  //     to prevent Sandbox test transactions from activating real entitlements.
  //   - MUST be "false" or unset for TestFlight, Sandbox testing, and development.
  //   - Default: NOT rejected (sandbox transactions are accepted for testing).
  const isSandbox = tx.environment === 'Sandbox';

  if (isSandbox && Deno.env.get('APPLE_REJECT_SANDBOX') === 'true') {
    // Only reject sandbox in explicitly hardened production builds.
    // During TestFlight / Sandbox testing this env var must NOT be set to 'true'.
    console.warn(`[verify-apple-tx] Sandbox transaction rejected — APPLE_REJECT_SANDBOX=true is active`);
    return new Response(JSON.stringify({ ok: false, error: 'Sandbox transactions not accepted in this environment' }), {
      status: 400, headers: jsonHeaders,
    });
  }

  // ── 5b. Server-side Apple ASSN environment confirmation ─────────────────────
  // Optionally call Apple's App Store Server API to confirm the transaction exists
  // in the correct environment. This is defense-in-depth — the JWS signature is
  // the primary cryptographic proof. The ASSN call confirms the transaction is
  // in Apple's live system and is not revoked or already refunded.
  //
  // We call this for non-consumable Lifetime Pro only (highest value transaction).
  // The ASSN check uses the signed transaction's own environment field to pick
  // the correct endpoint — sandbox tx → sandbox API, production tx → production API.
  //
  // If the ASSN call fails (network, missing key), we log and continue —
  // the JWS signature verification above is the authoritative check.
  const appleKeyId    = Deno.env.get('APPLE_CONNECT_KEY_ID') ?? '';
  const appleIssuerId = Deno.env.get('APPLE_CONNECT_ISSUER_ID') ?? '';
  const applePrivKey  = Deno.env.get('APPLE_CONNECT_PRIVATE_KEY_P8') ?? '';

  const canCallAssn = !!(appleKeyId && appleIssuerId && applePrivKey);

  if (!canCallAssn) {
    // ASSN credentials not configured — JWS signature is sufficient.
    // Log a reminder but do not block the transaction.
    console.warn(`[verify-apple-tx] ASSN credentials missing — relying on JWS signature only (tx=${tx.transactionId.slice(-8)})`);
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

  // ── 9c. Lifetime Pro non-consumable activation ──────────────────────────────
  if (purchaseType === 'non_consumable') {
    if (tx.productId !== LIFETIME_PRO_PRODUCT_ID) {
      console.error(`[verify-apple-tx] Unknown non-consumable product: ${tx.productId}`);
      return new Response(JSON.stringify({ ok: false, error: `Unknown product: ${tx.productId}` }), {
        status: 400, headers: jsonHeaders,
      });
    }

    const env: 'production' | 'sandbox' = isSandbox ? 'sandbox' : 'production';

    // ── ASSN environment-aware server-side confirmation (Lifetime Pro) ────────
    // Call Apple's App Store Server API (GET /inApps/v1/transactions/{transactionId})
    // using the correct environment endpoint:
    //   Sandbox    → https://api.storekit-sandbox.itunes.apple.com
    //   Production → https://api.storekit.itunes.apple.com
    //
    // This confirms the transaction is live in Apple's system AND is not refunded.
    // It is NOT a replacement for JWS verification — it is additional confirmation.
    // If the call fails due to missing credentials or network error, we fall through
    // because the JWS cryptographic proof is the authoritative check.
    if (canCallAssn) {
      try {
        const assnBase = isSandbox
          ? 'https://api.storekit-sandbox.itunes.apple.com'
          : 'https://api.storekit.itunes.apple.com';

        // Build a signed JWT for App Store Connect API authentication (ES256)
        const { importPKCS8, SignJWT } = await import('https://esm.sh/jose@5.2.4?target=deno');
        const privateKey = await importPKCS8(applePrivKey, 'ES256');
        const jwt = await new SignJWT({})
          .setProtectedHeader({ alg: 'ES256', kid: appleKeyId })
          .setIssuer(appleIssuerId)
          .setAudience('appstoreconnect-v1')
          .setIssuedAt()
          .setExpirationTime('10m')
          .sign(privateKey);

        const assnResp = await fetch(
          `${assnBase}/inApps/v1/transactions/${tx.transactionId}`,
          { headers: { Authorization: `Bearer ${jwt}`, 'Accept': 'application/json' } },
        );

        if (assnResp.ok) {
          // Parse the outer JWS from ASSN and extract the signed transaction
          const assnBody = await assnResp.json() as { signedTransactionInfo?: string };
          if (assnBody.signedTransactionInfo) {
            // Re-verify the ASSN-returned signed transaction to confirm authenticity
            const { verifyAppleJWS: verifyInner } = await import('../_shared/appleJws.ts');
            const assnTx = await verifyInner<AppleTransactionPayload>(assnBody.signedTransactionInfo);
            // Confirm product IDs match — prevents product-swap attacks
            if (assnTx.productId !== tx.productId) {
              console.error(`[verify-apple-tx] ASSN product mismatch: jws=${tx.productId} assn=${assnTx.productId}`);
              return new Response(
                JSON.stringify({ ok: false, error: 'Transaction product verification failed' }),
                { status: 400, headers: jsonHeaders },
              );
            }
            // Check revocation: if Apple has issued a refund, revocationDate will be set
            if (assnTx.revocationDate) {
              console.warn(`[verify-apple-tx] Transaction ${tx.transactionId} is REVOKED (refunded) — not activating`);
              return new Response(
                JSON.stringify({ ok: false, error: 'This transaction has been refunded and cannot be used to activate Pro.' }),
                { status: 400, headers: jsonHeaders },
              );
            }
            console.log(`[verify-apple-tx] ASSN confirmation: tx=${tx.transactionId.slice(-8)} product=${assnTx.productId} env=${env} revoked=false`);
          }
        } else {
          // ASSN returned non-2xx: log the status and continue with JWS proof only
          const body = await assnResp.text().catch(() => '');
          console.warn(`[verify-apple-tx] ASSN lookup returned ${assnResp.status} — continuing with JWS proof: ${body.slice(0, 200)}`);
        }
      } catch (assnErr) {
        // Network or JWT error — log and continue; JWS signature is authoritative
        console.warn(`[verify-apple-tx] ASSN check failed (non-fatal): ${String(assnErr).slice(0, 200)}`);
      }
    }

    // Idempotency check
    const existingNc = await checkAppleTransactionIdempotency(supabaseAdmin, tx.transactionId);
    if (existingNc) {
      console.log(`[verify-apple-tx] Lifetime Pro already processed tx=${tx.transactionId} — returning cached ok`);
      return new Response(JSON.stringify({ ok: true, cached: true, tier: 'pro', environment: tx.environment }), {
        status: 200, headers: jsonHeaders,
      });
    }

    try {
      await activateLifetimePro(supabaseAdmin, user.id);
    } catch (err) {
      console.error(`[verify-apple-tx] activateLifetimePro failed user=${user.id.slice(0,8)}:`, String(err).slice(0, 200));
      return new Response(JSON.stringify({ ok: false, error: 'Pro activation failed. Please try again.' }), {
        status: 500, headers: jsonHeaders,
      });
    }

    await recordAppleTransaction(supabaseAdmin, {
      transactionId:          tx.transactionId,
      originalTransactionId:  tx.originalTransactionId,
      productId:              tx.productId,
      purchaseType:           'consumable', // reuse field; non-consumable not a separate type in schema
      userId:                 user.id,
      eventId:                null,
      environment:            tx.environment,
      processedAction:        'activate_lifetime_pro',
      rawSignedPayload:       signedTransaction,
    });

    console.log(`[verify-apple-tx] Lifetime Pro activated: user=${user.id.slice(0,8)} env=${env} isSandbox=${isSandbox}`);
    return new Response(JSON.stringify({
      ok:          true,
      tier:        'pro',
      environment: tx.environment,
    }), { status: 200, headers: jsonHeaders });
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
    // Subscriptions: cached idempotency hit.
    //
    // DEFECT FIX (cached restore profile repair):
    // Simply returning { ok:true, cached:true, tier } is insufficient when the
    // user's profile is stale (e.g. Apple = Pro active, Vybz Hub says Free).
    // We must check whether the cached transaction is still valid (not expired)
    // and if the profile is stale, re-sync entitlements before responding.
    //
    // Steps:
    //   1. Derive the canonical tier from the transaction productId.
    //   2. Check if the transaction is still valid (expiresDate in the future).
    //   3. Read current user_profiles.subscription_tier.
    //   4. If the profile is stale AND the transaction is valid, call
    //      syncSubscriptionEntitlements to repair the profile.
    //   5. Return { ok, cached, tier, environment }.
    //
    // If the transaction is expired/invalid, do NOT re-grant paid entitlement.

    const subConfigCached = SUBSCRIPTION_PRODUCTS[tx.productId];
    const cachedTier: string = subConfigCached?.plan ?? 'free';
    const cachedCycle = subConfigCached?.cycle ?? 'monthly';
    const env: 'production' | 'sandbox' = isSandbox ? 'sandbox' : 'production';

    // Check whether the transaction is still within its valid period.
    // expiresDate is a Unix timestamp in milliseconds in Apple JWS payloads.
    const expiresMs = tx.expiresDate ? Number(tx.expiresDate) : null;
    const isTransactionExpired = expiresMs !== null && expiresMs < Date.now();

    if (isTransactionExpired) {
      // Expired transaction — do NOT re-grant paid entitlement.
      // Transaction history ≠ current entitlement. Return active:false, tier:null
      // so the client restore path never treats this as a valid subscription.
      // This is common in Sandbox where subscription periods expire in minutes.
      console.log(`[verify-apple-tx] Cached tx=${tx.transactionId} EXPIRED at ${expiresMs} — returning non-entitling result`);
      return new Response(JSON.stringify({ ok: true, cached: true, active: false, tier: null, environment: tx.environment }), {
        status: 200, headers: jsonHeaders,
      });
    }

    // Transaction is valid — check whether the profile needs to be repaired.
    let profileNeedsRepair = false;
    try {
      const { data: profileRow } = await supabaseAdmin
        .from('user_profiles')
        .select('subscription_tier, subscription_status')
        .eq('id', user.id)
        .single();

      const currentProfileTier = (profileRow?.subscription_tier as string) ?? 'free';
      const currentProfileStatus = (profileRow?.subscription_status as string) ?? 'active';
      const isProfileStale =
        currentProfileTier !== cachedTier ||
        !['active', 'trialing'].includes(currentProfileStatus);

      profileNeedsRepair = isProfileStale && cachedTier !== 'free';
    } catch (e) {
      console.warn('[verify-apple-tx] cached profile read failed:', String(e).slice(0, 100));
    }

    if (profileNeedsRepair) {
      // Repair the stale profile using the canonical sync path.
      // This is the physical-device bug scenario: Apple = Pro active, Vybz Hub = Free.
      const expiresDate = expiresMs ? new Date(expiresMs).toISOString() : null;
      try {
        await syncSubscriptionEntitlements(supabaseAdmin, {
          userId:                user.id,
          plan:                  cachedTier as PlanTier,
          billingCycle:          cachedCycle,
          subscriptionStatus:    'active',
          paymentProvider:       'apple',
          currentPeriodEnd:      expiresDate,
          originalTransactionId: tx.originalTransactionId,
          environment:           env,
        });
        console.log(`[verify-apple-tx] Cached restore: repaired stale profile for user=${user.id.slice(0,8)} tier=${cachedTier}`);
      } catch (syncErr) {
        // Log but do not block — return the cached tier so the client can proceed.
        console.error('[verify-apple-tx] Cached restore: profile repair failed:', String(syncErr).slice(0, 200));
      }
    } else {
      console.log(`[verify-apple-tx] Duplicate subscription tx=${tx.transactionId} (action=${existing}) tier=${cachedTier} profile_ok=true`);
    }

    return new Response(JSON.stringify({ ok: true, cached: true, environment: tx.environment, tier: cachedTier }), {
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

    // ── DOWNGRADE GUARD: Elite → Pro ─────────────────────────────────────────
    // Apple subscription rules:
    //   UPGRADE   (Pro → Elite): effective immediately — Apple delivers a new
    //             transaction immediately. We can safely write the higher tier.
    //   DOWNGRADE (Elite → Pro): Apple schedules Pro for next renewal period.
    //             Apple does NOT immediately deliver a Pro transaction. Any Pro
    //             transaction that arrives during an active Elite period indicates
    //             a scheduled downgrade, NOT an immediate tier change.
    //
    // Service levels: Elite = 2 (higher), Pro = 1 (lower), Free = 0.
    // If the incoming transaction would lower the effective tier AND the user
    // currently has an active higher-tier entitlement, skip the immediate sync.
    // DID_RENEW with Pro productId will arrive at actual renewal — that is the
    // correct time to write Pro as the current tier.
    //
    // NOTE: We only skip the sync when the EXISTING subscription has the SAME
    // originalTransactionId (same subscription group) to avoid blocking a
    // legitimate Pro purchase from a user who was never on Elite.

    const PLAN_LEVEL: Record<string, number> = { free: 0, pro: 1, elite: 2 };
    const incomingLevel = PLAN_LEVEL[subConfig.plan] ?? 0;

    // Read current subscription row for this originalTransactionId
    const { data: existingSubRow } = await supabaseAdmin
      .from('subscriptions')
      .select('plan, status, original_transaction_id')
      .eq('original_transaction_id', tx.originalTransactionId)
      .maybeSingle();

    const currentActivePlan = existingSubRow?.plan as string | undefined;
    const currentActiveLevel = PLAN_LEVEL[currentActivePlan ?? 'free'] ?? 0;
    const currentActiveStatus = existingSubRow?.status as string | undefined;
    const isCurrentlyActiveHigherTier =
      currentActivePlan !== undefined &&
      currentActiveLevel > incomingLevel &&
      ['active', 'trialing'].includes(currentActiveStatus ?? '');

    if (isCurrentlyActiveHigherTier) {
      // Scheduled downgrade detected: do not immediately lower entitlement.
      // Keep current Elite tier until Apple fires DID_RENEW with the Pro productId.
      console.log(
        `[verify-apple-tx] Downgrade guard: incoming=${subConfig.plan} ` +
        `current=${currentActivePlan} — NOT syncing lower tier immediately. ` +
        `Pro will become effective at next renewal via DID_RENEW. user=${user.id.slice(0,8)}`
      );
      // Record the transaction so we do not process it again, but mark it as
      // a pending downgrade so the idempotency path can identify it correctly.
      await recordAppleTransaction(supabaseAdmin, {
        transactionId:          tx.transactionId,
        originalTransactionId:  tx.originalTransactionId,
        productId:              tx.productId,
        purchaseType:           'auto_renewable_subscription',
        userId:                 user.id,
        eventId:                null,
        environment:            tx.environment,
        processedAction:        `pending_downgrade_${subConfig.plan}`,
        rawSignedPayload:       signedTransaction,
      });
      // Update subscription ledger with the new transaction metadata
      // but preserve the current plan, status, AND provider_product_id.
      // provider_product_id represents the CURRENT ACTIVE product (Elite).
      // It must NOT be overwritten with the future/scheduled Pro SKU here.
      // DID_RENEW will arrive with the Pro productId at actual renewal —
      // that is the correct moment to update provider_product_id and plan.
      await supabaseAdmin.from('subscriptions')
        .update({
          // provider_product_id intentionally omitted — stays as current Elite SKU
          provider_transaction_id: tx.transactionId,
          last_verified_at:        new Date().toISOString(),
        })
        .eq('original_transaction_id', tx.originalTransactionId);
      return new Response(JSON.stringify({
        ok:          true,
        environment: tx.environment,
        tier:        currentActivePlan,  // return current effective tier, not incoming
        downgradeScheduled: true,
      }), { status: 200, headers: jsonHeaders });
    }
    // END downgrade guard — fall through to normal activation for upgrades / same-tier renewal

    // syncSubscriptionEntitlements now THROWS on user_profiles write failure.
    // If it throws, we return { ok: false } so the client does NOT call
    // finishTransaction and the JWS can be re-submitted on retry.
    // The idempotency row (apple_transactions) is recorded AFTER this succeeds
    // so a retry will re-attempt the full activation, not return a cached ok.
    try {
      await syncSubscriptionEntitlements(supabaseAdmin, {
        userId:                user.id,
        plan:                  subConfig.plan as PlanTier,
        billingCycle:          subConfig.cycle,
        subscriptionStatus:    'active',
        paymentProvider:       'apple',
        currentPeriodEnd:      expiresDate,
        originalTransactionId: tx.originalTransactionId,
        environment:           env,
      });
    } catch (entitlementErr) {
      console.error(`[verify-apple-tx] syncSubscriptionEntitlements failed for user=${user.id.slice(0,8)}:`, String(entitlementErr).slice(0, 200));
      return new Response(JSON.stringify({ ok: false, error: 'Subscription activation failed. Please try again.' }), {
        status: 500, headers: jsonHeaders,
      });
    }

    // Subscription ledger is now written exclusively by syncSubscriptionEntitlements
    // (which receives billingCycle above).  The second upsert here is removed to
    // eliminate the race window where yearly subscriptions briefly showed 'monthly'.
    // provider_product_id and provider_transaction_id are added in the sync call below.
    await supabaseAdmin.from('subscriptions')
      .update({
        provider_product_id:     tx.productId,
        provider_transaction_id: tx.transactionId,
        last_verified_at:        new Date().toISOString(),
      })
      .eq('original_transaction_id', tx.originalTransactionId);

    // Record for idempotency AFTER all writes succeed.
    // (UNIQUE transaction_id — duplicate call returns cached success)
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
