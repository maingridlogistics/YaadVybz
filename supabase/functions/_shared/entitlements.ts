// _shared/entitlements.ts — Unified Cross-Platform Entitlement Sync
//
// SECURITY FIX (ISSUE-005, ISSUE-012):
//   Provider-specific identifiers are now routed to the correct columns:
//     apple → apple_original_transaction_id (user_profiles)
//     google → google_purchase_token (user_profiles)
//     stripe → stripe_customer_id (user_profiles)
//
// SCHEMA FIX (ISSUE-011):
//   stripe_checkout_session is no longer written for non-Stripe boosts.
//   The column is now nullable; no placeholder values are inserted.
//
// Supported payment_provider values:  stripe | apple | google | admin
// Supported boost provider values:    stripe | apple | google | credit

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export type PaymentProvider = 'stripe' | 'apple' | 'google' | 'admin';
export type BoostProvider   = 'stripe' | 'apple' | 'google' | 'credit';
export type PlanTier        = 'free' | 'pro' | 'elite';
export type BoostType       = 'three_day' | 'seven_day' | 'until_event_end';
export type BoostEnvironment = 'production' | 'sandbox';

// ─── Plan entitlement map ─────────────────────────────────────────────────────
// Boost credit costs: 3-Day = 1 credit, 7-Day = 2 credits
// SECURITY NOTE: until_event_end is a SEPARATELY PURCHASED boost only.
// It CANNOT be redeemed via subscription credits. The value 0 documents
// this intent — any path that reaches use_boost_credit_atomic with
// until_event_end will be rejected by the RPC before this table is consulted.
export const BOOST_CREDIT_COSTS: Record<BoostType, number> = {
  three_day:       1,
  seven_day:       2,
  until_event_end: 0,  // purchase-only — never via subscription credits
};

// Posts: active simultaneous limit (Events + Businesses combined)
export const PLAN_ACTIVE_POST_LIMIT: Record<PlanTier, number> = {
  free:  3,   // 3 simultaneous active posts
  pro:   10,  // 10 simultaneous active posts (lifetime Pro model)
  elite: 10,  // 10 simultaneous active posts (admin-granted Elite)
};

// Legacy alias kept for any existing callers
export const PLAN_POST_ALLOWANCE = PLAN_ACTIVE_POST_LIMIT;

export const PLAN_ENTITLEMENTS: Record<PlanTier, {
  monthly_boost_allowance: number;
  featured_priority: number;
  posts_per_cycle: number;
}> = {
  free:  { monthly_boost_allowance: 0,  featured_priority: 0, posts_per_cycle: 3  },
  pro:   { monthly_boost_allowance: 10, featured_priority: 1, posts_per_cycle: 10 }, // 10x3-day credits/month
  elite: { monthly_boost_allowance: 10, featured_priority: 2, posts_per_cycle: 10 },
};
// SECURITY NOTE: verified_promoter is intentionally NOT in PLAN_ENTITLEMENTS.
// Subscribing to Pro or Elite does NOT automatically verify a user's identity.
// Profile verification is a separate admin process controlled exclusively by:
//   admin_set_verified_promoter() SECURITY DEFINER RPC.
// Subscription entitlement (billing) and identity verification are distinct concepts.
// Subscription cancellation does NOT revoke previously-granted profile verification.

// ─── Subscription sync ────────────────────────────────────────────────────────

export interface SyncSubscriptionOptions {
  userId: string;
  plan: PlanTier;
  subscriptionStatus: string;
  paymentProvider: PaymentProvider;
  currentPeriodEnd: string | null;
  // Billing cycle — 'monthly' | 'yearly'.  Required when creating a new subscription
  // row; ignored for status-only updates (e.g. renewals that already have a row).
  billingCycle?: 'monthly' | 'yearly';
  // Stripe-specific
  stripeCustomerId?: string | null;
  // Apple: Apple originalTransactionId  |  Google: purchase token
  // Routed to the correct provider column based on paymentProvider.
  originalTransactionId?: string | null;
  // Override remaining_boosts (e.g. on initial purchase or cycle reset)
  overrideRemainingBoosts?: number;
  // Apple/Google auto-renew state
  autoRenewStatus?: boolean | null;
  environment?: BoostEnvironment;
}

/**
 * Write subscription entitlements to user_profiles and sync promoter_tier to
 * all events posted by this user.
 *
 * Provider-specific column routing (ISSUE-005 fix):
 *   apple  → apple_original_transaction_id
 *   google → google_purchase_token
 *   stripe → stripe_customer_id (separate field)
 */
// ─── Lifetime Pro activation ─────────────────────────────────────────────────

/**
 * Permanently activate lifetime Pro for a user.
 * Sets lifetime_pro_owned = true and computes effective tier:
 *   admin_elite overrides → 'elite', else → 'pro'
 * THROWS if the user_profiles write fails.
 */
export async function activateLifetimePro(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
): Promise<void> {
  // Read admin_elite to compute effective tier without clobbering it
  const { data: profileRow } = await supabaseAdmin
    .from('user_profiles')
    .select('admin_elite')
    .eq('id', userId)
    .maybeSingle();

  const adminElite = (profileRow?.admin_elite as boolean) ?? false;
  const effectiveTier: PlanTier = adminElite ? 'elite' : 'pro';
  const entitlements = PLAN_ENTITLEMENTS[effectiveTier];

  const { error } = await supabaseAdmin
    .from('user_profiles')
    .update({
      lifetime_pro_owned:      true,
      subscription_tier:       effectiveTier,
      monthly_boost_allowance: entitlements.monthly_boost_allowance,
      featured_priority:       entitlements.featured_priority,
    })
    .eq('id', userId);

  if (error) {
    console.error('[entitlements] activateLifetimePro user_profiles update FAILED:', error.message);
    throw new Error(`Lifetime Pro activation failed: ${error.message}`);
  }

  // Sync promoter_tier on all events
  const { error: evtErr } = await supabaseAdmin
    .from('events')
    .update({ promoter_tier: effectiveTier })
    .eq('promoter_id', userId);

  if (evtErr) {
    console.warn('[entitlements] activateLifetimePro events sync failed:', evtErr.message);
  }

  console.log(`[entitlements] Lifetime Pro activated: user=${userId.slice(0,8)} effective_tier=${effectiveTier}`);
}

/**
 * Write subscription entitlements to user_profiles and sync promoter_tier to
 * all events posted by this user.
 *
 * THROWS if the user_profiles write fails — this is the authoritative entitlement
 * record. Callers (verify-apple-transaction, verify-google-purchase, stripe-webhook)
 * must treat a thrown error as a verification failure and return { ok: false }.
 * The apple_transactions / subscriptions idempotency rows are NOT written on
 * failure, so a retry with the same JWS will re-attempt the full flow.
 */
export async function syncSubscriptionEntitlements(
  supabaseAdmin: ReturnType<typeof createClient>,
  opts: SyncSubscriptionOptions,
): Promise<void> {
  const {
    userId,
    plan,
    subscriptionStatus,
    paymentProvider,
    currentPeriodEnd,
    billingCycle,
    stripeCustomerId,
    originalTransactionId,
    overrideRemainingBoosts,
    autoRenewStatus,
    environment,
  } = opts;

  const isActiveStatus = ['active', 'trialing'].includes(subscriptionStatus);
  const effectivePlan  = isActiveStatus ? plan : 'free';
  const entitlements   = PLAN_ENTITLEMENTS[effectivePlan];

  const profileUpdate: Record<string, unknown> = {
    subscription_tier:       effectivePlan,
    subscription_status:     subscriptionStatus,
    // verified_promoter is NOT set here — subscribing does not auto-verify identity.
    // Only admin_set_verified_promoter() SECURITY DEFINER RPC may change this field.
    monthly_boost_allowance: entitlements.monthly_boost_allowance,
    featured_priority:       entitlements.featured_priority,
    current_period_end:      currentPeriodEnd,
  };

  // ── Provider-specific identifier routing ──────────────────────────────────
  if (stripeCustomerId) {
    profileUpdate.stripe_customer_id = stripeCustomerId;
  }
  // Apple: originalTransactionId → apple_original_transaction_id
  if (originalTransactionId && paymentProvider === 'apple') {
    profileUpdate.apple_original_transaction_id = originalTransactionId;
  }
  // Google: purchaseToken passed as originalTransactionId → google_purchase_token
  if (originalTransactionId && paymentProvider === 'google') {
    profileUpdate.google_purchase_token = originalTransactionId;
  }
  if (overrideRemainingBoosts !== undefined) {
    profileUpdate.remaining_boosts = overrideRemainingBoosts;
  }

  const { error: profileErr } = await supabaseAdmin
    .from('user_profiles')
    .update(profileUpdate)
    .eq('id', userId);

  if (profileErr) {
    // CRITICAL: throw so the caller (verify-apple-transaction etc.) returns
    // { ok: false } instead of { ok: true } with stale/missing entitlement data.
    // This prevents the inconsistent_entitlement state where the subscriptions
    // table has an active row but user_profiles.subscription_tier is still 'free'.
    console.error(`[entitlements] user_profiles update FAILED (provider=${paymentProvider}):`, profileErr.message);
    throw new Error(`Entitlement write failed: ${profileErr.message}`);
  }

  // Upsert subscriptions ledger row for Apple/Google
  if (originalTransactionId && (paymentProvider === 'apple' || paymentProvider === 'google')) {
    const subRow: Record<string, unknown> = {
      user_id:                  userId,
      plan:                     effectivePlan,
      // Use caller-supplied billingCycle; fall back to 'monthly' only when
      // no value is provided (e.g. status-only ASSN V2 notifications where
      // the cycle is already correct in the existing DB row).
      billing_cycle:            billingCycle ?? 'monthly',
      status:                   subscriptionStatus,
      current_period_end:       currentPeriodEnd,
      payment_provider:         paymentProvider,
      original_transaction_id:  originalTransactionId,
      last_verified_at:         new Date().toISOString(),
    };
    if (paymentProvider === 'google') {
      subRow.provider_purchase_token = originalTransactionId;
    }
    if (autoRenewStatus !== undefined) subRow.auto_renew_status = autoRenewStatus;
    if (environment)                   subRow.environment       = environment;

    const { error: subErr } = await supabaseAdmin
      .from('subscriptions')
      .upsert(subRow, { onConflict: 'original_transaction_id' });

    if (subErr) {
      console.warn(`[entitlements] subscriptions upsert failed (provider=${paymentProvider}):`, subErr.message);
    }
  }

  // Sync promoter_tier to all events by this user
  const { error: eventsErr } = await supabaseAdmin
    .from('events')
    .update({ promoter_tier: effectivePlan })
    .eq('promoter_id', userId);

  if (eventsErr) {
    console.warn('[entitlements] events promoter_tier sync failed:', eventsErr.message);
  }

  console.log(`[entitlements] Sync complete: user=${userId.slice(0,8)} plan=${effectivePlan} status=${subscriptionStatus} provider=${paymentProvider}`);
}

// ─── Subscription downgrade helpers ──────────────────────────────────────────

export async function downgradeToFree(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
  paymentProvider: PaymentProvider,
  reason: 'canceled' | 'expired' | 'revoked' | 'refunded',
): Promise<void> {
  await syncSubscriptionEntitlements(supabaseAdmin, {
    userId,
    plan: 'free',
    subscriptionStatus: reason,
    paymentProvider,
    currentPeriodEnd: null,
    overrideRemainingBoosts: 0,
  });
}

export async function resetBoostCredits(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
  newPeriodEnd: string | null,
): Promise<void> {
  const { data: profile } = await supabaseAdmin
    .from('user_profiles')
    .select('monthly_boost_allowance')
    .eq('id', userId)
    .single();

  const allowance = (profile?.monthly_boost_allowance as number) ?? 0;

  const update: Record<string, unknown> = { remaining_boosts: allowance };
  if (newPeriodEnd) {
    update.current_period_end  = newPeriodEnd;
    update.subscription_status = 'active';
  }

  const { error } = await supabaseAdmin
    .from('user_profiles')
    .update(update)
    .eq('id', userId);

  if (error) {
    console.warn(`[entitlements] resetBoostCredits failed for user ${userId.slice(0,8)}:`, error.message);
  } else {
    console.log(`[entitlements] Boost credits reset to ${allowance} for user ${userId.slice(0,8)}`);
  }
}

// ─── Boost activation ─────────────────────────────────────────────────────────

export interface ActivateBoostOptions {
  eventId: string;
  promoterId: string;
  boostType: BoostType;
  paymentProvider: BoostProvider;
  // Stripe: update existing pending purchase row
  purchaseId?: string;
  // Apple/Google: create a new purchase row using transactionId
  transactionId?: string;       // Apple: transaction ID  |  Google: order ID
  purchaseToken?: string;       // Google: purchase token (for idempotency)
  amount?: number;              // cents
  currency?: string;
  // Stripe-specific fields
  checkoutSession?: string;
  paymentIntent?: string;
  stripeCustomerId?: string;
  environment?: BoostEnvironment;
}

/**
 * Activate a boost on an event and record the purchase in boost_purchases.
 *
 * Provider routing (ISSUE-012 fix):
 *   apple  → apple_transaction_id column
 *   google → provider_transaction_id column (Google order ID)
 *   stripe → stripe_checkout_session / stripe_payment_intent columns
 *   credit → no transaction ID columns needed
 *
 * stripe_checkout_session is no longer written for non-Stripe boosts (ISSUE-011).
 */
export async function activateBoostEntitlement(
  supabaseAdmin: ReturnType<typeof createClient>,
  opts: ActivateBoostOptions,
): Promise<{ ok: boolean; boostExpiresAt: string | null; error?: string }> {
  const {
    eventId, promoterId, boostType, paymentProvider,
    purchaseId, transactionId, purchaseToken,
    amount, currency, checkoutSession, paymentIntent, stripeCustomerId,
    environment,
  } = opts;

  const now = new Date();
  let boostExpiresAt: string | null = null;

  if (boostType === 'three_day') {
    boostExpiresAt = new Date(now.getTime() + 72 * 60 * 60 * 1000).toISOString();
  } else if (boostType === 'seven_day') {
    boostExpiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  }

  // Update events table
  const eventUpdate: Record<string, unknown> = {
    boosted:          true,
    boost_type:       boostType,
    boost_status:     'active',
    boost_started_at: now.toISOString(),
    boost_expires_at: boostExpiresAt,
  };
  if (checkoutSession) eventUpdate.boost_checkout_session = checkoutSession;
  if (paymentIntent)   eventUpdate.boost_payment_intent   = paymentIntent;
  if (amount !== undefined) eventUpdate.boost_amount      = amount;
  if (currency)        eventUpdate.boost_currency          = currency;

  const { error: evtErr } = await supabaseAdmin
    .from('events')
    .update(eventUpdate)
    .eq('id', eventId);

  if (evtErr) {
    console.error('[entitlements] activateBoost events update failed:', evtErr.message);
    return { ok: false, boostExpiresAt: null, error: evtErr.message };
  }

  // Record in boost_purchases
  if (purchaseId || transactionId) {
    // Provider-specific columns — only set the ones that apply
    const purchaseUpdate: Record<string, unknown> = {
      status:           'completed',
      payment_provider: paymentProvider,
      completed_at:     now.toISOString(),
    };
    if (amount !== undefined)  purchaseUpdate.amount = amount;
    if (currency)              purchaseUpdate.currency = currency;
    if (environment)           purchaseUpdate.environment = environment;

    // Stripe-specific columns
    if (checkoutSession)   purchaseUpdate.stripe_checkout_session = checkoutSession;
    if (paymentIntent)     purchaseUpdate.stripe_payment_intent   = paymentIntent;
    if (stripeCustomerId)  purchaseUpdate.stripe_customer_id      = stripeCustomerId;

    // Provider-specific transaction identifiers
    if (transactionId && paymentProvider === 'apple') {
      purchaseUpdate.apple_transaction_id = transactionId;
    }
    if (transactionId && paymentProvider === 'google') {
      // Google order ID → provider_transaction_id
      purchaseUpdate.provider_transaction_id = transactionId;
    }

    if (purchaseId) {
      // Stripe: update the pre-created pending row
      await supabaseAdmin
        .from('boost_purchases')
        .update(purchaseUpdate)
        .eq('id', purchaseId);
    } else if (transactionId) {
      // Apple / Google: insert a new completed row
      // stripe_checkout_session is nullable — not set for non-Stripe boosts (ISSUE-011 fix)
      const insertRow: Record<string, unknown> = {
        event_id:         eventId,
        promoter_id:      promoterId,
        boost_type:       boostType,
        amount:           amount ?? 0,
        currency:         currency ?? 'usd',
        status:           'completed',
        payment_provider: paymentProvider,
        environment:      environment ?? 'production',
        completed_at:     now.toISOString(),
        ...purchaseUpdate,
      };
      // Google: also write purchase token for idempotency / refund lookups
      if (purchaseToken && paymentProvider === 'google') {
        insertRow.provider_purchase_token = purchaseToken;
      }
      await supabaseAdmin.from('boost_purchases').insert(insertRow);
    }
  }

  console.log(`[entitlements] Boost activated: event=${eventId} type=${boostType} provider=${paymentProvider} expires=${boostExpiresAt ?? 'event-end'}`);
  return { ok: true, boostExpiresAt };
}

// ─── Apple transaction idempotency helpers ────────────────────────────────────

export async function checkAppleTransactionIdempotency(
  supabaseAdmin: ReturnType<typeof createClient>,
  transactionId: string,
  processedAction?: string,
): Promise<string | null> {
  const query = supabaseAdmin
    .from('apple_transactions')
    .select('processed_action')
    .eq('transaction_id', transactionId);

  if (processedAction) {
    query.eq('processed_action', processedAction);
  }

  const { data } = await query.maybeSingle();
  return data?.processed_action ?? null;
}

export async function recordAppleTransaction(
  supabaseAdmin: ReturnType<typeof createClient>,
  params: {
    transactionId: string;
    originalTransactionId: string;
    productId: string;
    purchaseType: 'auto_renewable_subscription' | 'consumable';
    userId: string | null;
    eventId: string | null;
    environment: string;
    processedAction: string;
    rawSignedPayload?: string;
  },
): Promise<void> {
  const { error } = await supabaseAdmin.from('apple_transactions').insert({
    transaction_id:           params.transactionId,
    original_transaction_id:  params.originalTransactionId,
    product_id:               params.productId,
    purchase_type:            params.purchaseType,
    user_id:                  params.userId,
    event_id:                 params.eventId,
    environment:              params.environment,
    processed_action:         params.processedAction,
    raw_signed_payload:       params.rawSignedPayload ?? null,
  });

  if (error && !error.message.includes('duplicate')) {
    console.warn('[entitlements] recordAppleTransaction insert failed:', error.message);
  }
}
