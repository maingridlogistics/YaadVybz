// _shared/entitlements.ts — Unified Cross-Platform Entitlement Sync
//
// This module is the single source of truth for writing subscription and Boost
// entitlements into the Vybz Hub database.  It is intentionally provider-agnostic:
// Stripe, Apple, Google, and Admin all call syncSubscriptionEntitlements() and
// activateBoostEntitlement() with identical signatures.  The payment_provider field
// records WHERE the money came from; everything downstream reads only the entitlement
// fields on user_profiles.
//
// CORE RULE: A payment provider determines who processed the payment.
//            Vybz Hub determines what the user is entitled to.
//
// Supported payment_provider values:
//   stripe | apple | google | admin
//
// Supported boost source values (boost_purchases.payment_provider):
//   stripe | apple | google | credit

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export type PaymentProvider = 'stripe' | 'apple' | 'google' | 'admin';
export type BoostProvider   = 'stripe' | 'apple' | 'google' | 'credit';
export type PlanTier        = 'free' | 'pro' | 'elite';
export type BoostType       = 'three_day' | 'seven_day' | 'until_event_end';
export type BoostEnvironment = 'production' | 'sandbox';

// ─── Plan entitlement map ─────────────────────────────────────────────────────
// This is the definitive source for what each plan unlocks.
// UPDATE THIS TABLE when plan features change — all providers inherit the change.
export const PLAN_ENTITLEMENTS: Record<PlanTier, {
  verified_promoter: boolean;
  monthly_boost_allowance: number;
  featured_priority: number;
}> = {
  free:  { verified_promoter: false, monthly_boost_allowance: 0, featured_priority: 0 },
  pro:   { verified_promoter: true,  monthly_boost_allowance: 1, featured_priority: 1 },
  elite: { verified_promoter: true,  monthly_boost_allowance: 5, featured_priority: 2 },
};

// ─── Subscription sync ────────────────────────────────────────────────────────

export interface SyncSubscriptionOptions {
  userId: string;
  plan: PlanTier;
  subscriptionStatus: string;
  paymentProvider: PaymentProvider;
  currentPeriodEnd: string | null;
  // Provider-specific IDs (null when not applicable)
  stripeCustomerId?: string | null;
  originalTransactionId?: string | null; // Apple / Google
  // Pass to override remaining_boosts (e.g. on initial purchase or cycle reset)
  overrideRemainingBoosts?: number;
  // Pass to update auto-renew state (Apple/Google)
  autoRenewStatus?: boolean | null;
  environment?: BoostEnvironment;
}

/**
 * Write subscription entitlements to user_profiles and sync promoter_tier to
 * all events posted by this user.
 *
 * Called by:
 *   - stripe-webhook    (payment_provider = 'stripe')
 *   - apple-iap-notifications (payment_provider = 'apple')
 *   - google-iap-notifications (payment_provider = 'google')  [future]
 *   - admin panel       (payment_provider = 'admin')
 *
 * Idempotent: writing the same values twice has no side effects.
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
    verified_promoter:       entitlements.verified_promoter,
    monthly_boost_allowance: entitlements.monthly_boost_allowance,
    featured_priority:       entitlements.featured_priority,
    current_period_end:      currentPeriodEnd,
  };

  // Provider-specific ID writes (only when provided)
  if (stripeCustomerId)           profileUpdate.stripe_customer_id                = stripeCustomerId;
  if (originalTransactionId)      profileUpdate.apple_original_transaction_id     = originalTransactionId;
  if (overrideRemainingBoosts !== undefined) profileUpdate.remaining_boosts       = overrideRemainingBoosts;

  const { error: profileErr } = await supabaseAdmin
    .from('user_profiles')
    .update(profileUpdate)
    .eq('id', userId);

  if (profileErr) {
    console.error(`[entitlements] user_profiles update failed (provider=${paymentProvider}):`, profileErr.message);
  }

  // Upsert subscriptions table row for the provider
  // Uses original_transaction_id as the conflict key for Apple/Google;
  // stripe_subscription_id conflict is handled by the caller for Stripe.
  if (originalTransactionId && (paymentProvider === 'apple' || paymentProvider === 'google')) {
    const subRow: Record<string, unknown> = {
      user_id:                  userId,
      plan:                     effectivePlan,
      billing_cycle:            'monthly', // overridden by caller if yearly
      status:                   subscriptionStatus,
      current_period_end:       currentPeriodEnd,
      payment_provider:         paymentProvider,
      original_transaction_id:  originalTransactionId,
      last_verified_at:         new Date().toISOString(),
    };
    if (autoRenewStatus !== undefined) subRow.auto_renew_status = autoRenewStatus;
    if (environment)                   subRow.environment       = environment;

    const { error: subErr } = await supabaseAdmin
      .from('subscriptions')
      .upsert(subRow, { onConflict: 'original_transaction_id' });

    if (subErr) {
      console.warn(`[entitlements] subscriptions upsert failed (provider=${paymentProvider}):`, subErr.message);
    }
  }

  // Sync promoter_tier to all events by this user (used for search priority display).
  const { error: eventsErr } = await supabaseAdmin
    .from('events')
    .update({ promoter_tier: effectivePlan })
    .eq('promoter_id', userId);

  if (eventsErr) {
    console.warn(`[entitlements] events promoter_tier sync failed:`, eventsErr.message);
  }

  console.log(`[entitlements] Sync complete: user=${userId.slice(0,8)} plan=${effectivePlan} status=${subscriptionStatus} provider=${paymentProvider}`);
}

// ─── Subscription downgrade helpers ──────────────────────────────────────────

/** Downgrade a user to free tier (used on cancellation, expiry, revocation). */
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

/** Reset remaining_boosts to monthly allowance at the start of a new billing period. */
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
    update.current_period_end = newPeriodEnd;
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
  // Required for paid boosts (stripe / apple / google)
  purchaseId?: string;
  transactionId?: string;       // Apple IAP transactionId
  amount?: number;              // cents
  currency?: string;
  checkoutSession?: string;     // Stripe session ID
  paymentIntent?: string;       // Stripe payment intent ID
  environment?: BoostEnvironment;
}

/**
 * Activate a boost on an event and record the purchase in boost_purchases.
 * Called by stripe-webhook (checkout.session.completed mode=payment),
 * verify-apple-transaction (Phase 3), and the credit flow (useBoostCredit).
 *
 * Returns the boost_expires_at ISO string, or null for until_event_end.
 */
export async function activateBoostEntitlement(
  supabaseAdmin: ReturnType<typeof createClient>,
  opts: ActivateBoostOptions,
): Promise<{ ok: boolean; boostExpiresAt: string | null; error?: string }> {
  const {
    eventId,
    promoterId,
    boostType,
    paymentProvider,
    purchaseId,
    transactionId,
    amount,
    currency,
    checkoutSession,
    paymentIntent,
    environment,
  } = opts;

  const now = new Date();
  let boostExpiresAt: string | null = null;

  if (boostType === 'three_day') {
    boostExpiresAt = new Date(now.getTime() + 72 * 60 * 60 * 1000).toISOString();
  } else if (boostType === 'seven_day') {
    boostExpiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  }
  // until_event_end: boostExpiresAt remains null; expiry is determined by event date

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
    console.error(`[entitlements] activateBoost events update failed:`, evtErr.message);
    return { ok: false, boostExpiresAt: null, error: evtErr.message };
  }

  // Record in boost_purchases (skip for credit boosts that have no purchase row yet)
  if (purchaseId || transactionId) {
    const purchaseUpdate: Record<string, unknown> = {
      status:           'completed',
      payment_provider: paymentProvider,
      completed_at:     now.toISOString(),
    };
    if (amount !== undefined)  purchaseUpdate.amount             = amount;
    if (currency)              purchaseUpdate.currency           = currency;
    if (checkoutSession)       purchaseUpdate.stripe_checkout_session = checkoutSession;
    if (paymentIntent)         purchaseUpdate.stripe_payment_intent   = paymentIntent;
    if (transactionId)         purchaseUpdate.apple_transaction_id    = transactionId;
    if (environment)           purchaseUpdate.environment             = environment;

    if (purchaseId) {
      await supabaseAdmin
        .from('boost_purchases')
        .update(purchaseUpdate)
        .eq('id', purchaseId);
    } else if (transactionId) {
      // Apple / Google: insert a new purchase row
      const insertRow: Record<string, unknown> = {
        event_id:         eventId,
        promoter_id:      promoterId,
        boost_type:       boostType,
        amount:           amount ?? 0,
        currency:         currency ?? 'usd',
        status:           'completed',
        payment_provider: paymentProvider,
        apple_transaction_id: transactionId,
        environment:      environment ?? 'production',
        completed_at:     now.toISOString(),
        stripe_checkout_session: `${paymentProvider}_${transactionId}`, // satisfies NOT NULL
      };
      await supabaseAdmin.from('boost_purchases').insert(insertRow);
    }
  }

  console.log(`[entitlements] Boost activated: event=${eventId} type=${boostType} provider=${paymentProvider} expires=${boostExpiresAt ?? 'event-end'}`);
  return { ok: true, boostExpiresAt };
}

// ─── Idempotency helper ───────────────────────────────────────────────────────

/**
 * Check whether an Apple transaction has already been processed.
 * Returns the existing processed_action if found, or null if the transaction is new.
 */
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

/**
 * Record an Apple transaction as processed (idempotency write).
 * Call AFTER the entitlement or boost has been successfully activated.
 */
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
    console.warn(`[entitlements] recordAppleTransaction insert failed:`, error.message);
  }
}
