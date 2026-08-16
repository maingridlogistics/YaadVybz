
// ─── Vybz Hub Subscription Service ───────────────────────────────────────────
// Client-side wrapper around subscription Edge Functions.
// All entitlement decisions come from the DB after webhook confirmation —
// this service only creates Stripe sessions and fetches subscription state.

import { supabase } from '../lib/supabase';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { Platform } from 'react-native';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SubStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid';
export type BillingCycle = 'monthly' | 'yearly';
export type SubscriptionPlanKey = 'free' | 'pro' | 'elite';

export interface Subscription {
  id: string;
  userId: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  stripePriceId?: string;
  plan: SubscriptionPlanKey;
  billingCycle: BillingCycle;
  status: SubStatus;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd: boolean;
  paymentProvider: 'stripe' | 'apple' | 'google' | 'admin';
  createdAt: string;
  updatedAt: string;
}

// ─── Helper ──────────────────────────────────────────────────────────────────

async function invokeSafe(
  functionName: string,
  body: Record<string, unknown>
): Promise<{ data: Record<string, unknown> | null; error: string | null }> {
  const { data, error } = await supabase.functions.invoke(functionName, { body });
  if (error) {
    let detail = error.message;
    if (error instanceof FunctionsHttpError) {
      try {
        const statusCode = (error as any).context?.status ?? 500;
        const text = await (error as any).context?.text?.();
        detail = `[${statusCode}] ${text || error.message}`;
      } catch {}
    }
    return { data: null, error: detail };
  }
  return { data: data as Record<string, unknown>, error: null };
}

// ─── Checkout ─────────────────────────────────────────────────────────────────

/**
 * Create a Stripe Checkout session for a new subscription.
 *
 * Returns:
 *   - url: the Stripe Checkout URL to open in a browser
 *   - redirectToPortal: true if the user already has an active subscription and
 *     should manage it through the Customer Portal instead
 *   - error: error message if the request failed
 */
export async function createSubscriptionCheckout(
  plan: 'pro' | 'elite',
  billingCycle: BillingCycle
): Promise<{ url: string | null; redirectToPortal: boolean; error: string | null }> {
  const { data, error } = await invokeSafe('create-subscription-checkout', {
    plan,
    billing_cycle: billingCycle,
    platform: Platform.OS, // server-side iOS gate defense-in-depth
  });

  if (error) return { url: null, redirectToPortal: false, error };

  return {
    url: (data?.url as string) ?? null,
    redirectToPortal: (data?.redirect_to_portal as boolean) ?? false,
    error: null,
  };
}

// ─── Customer Portal ──────────────────────────────────────────────────────────

/**
 * Create a Stripe Customer Portal session URL.
 * Opens the portal where subscribers can upgrade, downgrade, cancel, or update
 * payment methods.  All changes sync back via webhook.
 */
export async function createCustomerPortalSession(): Promise<{
  url: string | null;
  error: string | null;
}> {
  const { data, error } = await invokeSafe('customer-portal', {});
  if (error) return { url: null, error };
  return { url: (data?.url as string) ?? null, error: null };
}

// ─── Fetch Subscription ───────────────────────────────────────────────────────

/**
 * Fetch the user's most recent subscription record from the DB.
 * Returns null for free-plan users who have never subscribed.
 */
export async function fetchSubscription(): Promise<Subscription | null> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  return {
    id: data.id as string,
    userId: data.user_id as string,
    stripeCustomerId: (data.stripe_customer_id as string) ?? undefined,
    stripeSubscriptionId: (data.stripe_subscription_id as string) ?? undefined,
    stripePriceId: (data.stripe_price_id as string) ?? undefined,
    plan: (data.plan as SubscriptionPlanKey) ?? 'free',
    billingCycle: (data.billing_cycle as BillingCycle) ?? 'monthly',
    status: (data.status as SubStatus) ?? 'active',
    currentPeriodStart: (data.current_period_start as string) ?? undefined,
    currentPeriodEnd: (data.current_period_end as string) ?? undefined,
    cancelAtPeriodEnd: (data.cancel_at_period_end as boolean) ?? false,
    paymentProvider: ((data.payment_provider as string) ?? 'stripe') as Subscription['paymentProvider'],
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string,
  };
}

// ─── Cross-Provider Eligibility ─────────────────────────────────────────────

/**
 * Ask the backend whether the current Vybz Hub account is eligible to purchase
 * a new subscription with the given payment provider.
 *
 * Returns the authoritative cross-platform subscription state including which
 * provider is currently billing the user and whether a new purchase is blocked.
 * The UI MUST call this before showing any subscribe/upgrade CTA.
 */
export interface SubscriptionEligibilityResponse {
  eligible: boolean;
  eligibility: string;
  reason: string;
  hasActivePaidSubscription: boolean;
  activeSubscription: {
    plan: 'pro' | 'elite';
    status: string;
    paymentProvider: 'stripe' | 'apple' | 'google' | 'admin';
    providerLabel: string;
    providerIcon: string;
    billingCycle: 'monthly' | 'yearly';
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    autoRenewStatus: boolean | null;
    isSameProvider: boolean;
    isBillingRetry: boolean;
  } | null;
}

// ISSUE-015/016 FIX: Use standard POST body invocation instead of 'GET as any'.
export async function checkSubscriptionEligibility(
  provider: 'apple' | 'google' | 'stripe',
): Promise<{ data: SubscriptionEligibilityResponse | null; error: string | null }> {
  const { data, error } = await supabase.functions.invoke('check-subscription-eligibility', {
    body: { provider },
  });

  if (error) {
    let detail = error.message;
    if (error instanceof FunctionsHttpError) {
      try {
        const text = await (error as any).context?.text?.();
        detail = text || error.message;
      } catch {}
    }
    return { data: null, error: detail };
  }

  return { data: data as SubscriptionEligibilityResponse, error: null };
}

// ─── Post Quota Check (UX pre-check, non-consuming) ─────────────────────────

/**
 * Check the user's current post quota WITHOUT consuming any allowance.
 * Used for fast UX feedback before attempting event/business creation.
 * The DB trigger (enforce_event_publish_entitlement / enforce_business_submit_entitlement)
 * is the authoritative atomic enforcement — this is advisory only.
 */
export async function checkPostQuota(): Promise<{
  ok: boolean;
  plan?: string;
  canPost?: boolean;
  postsUsed?: number;
  postsAllowed?: number;
  postsRemaining?: number;
  enforced?: boolean;
  error?: string;
}> {
  const { data, error } = await supabase.rpc('check_post_quota');
  if (error) return { ok: false, error: error.message ?? 'Failed to check post quota.' };
  const result = data as {
    ok: boolean;
    plan?: string;
    can_post?: boolean;
    posts_used?: number;
    posts_allowed?: number;
    posts_remaining?: number;
    enforced?: boolean;
    error?: string;
  } | null;
  if (!result?.ok) return { ok: false, error: result?.error ?? 'Post quota check failed.' };
  return {
    ok: true,
    plan: result.plan,
    canPost: result.can_post ?? true,
    postsUsed: result.posts_used,
    postsAllowed: result.posts_allowed,
    postsRemaining: result.posts_remaining,
    enforced: result.enforced ?? false,
  };
}

// ─── Post Allowance ─────────────────────────────────────────────────────────

/**
 * Consume one post from the user's billing-cycle allowance.
 * Idempotent: same target_id never consumes twice.
 * Free users: recorded for analytics, never blocked.
 * Pro users: up to 3 per verified billing period.
 * Elite users: up to 6 per verified billing period.
 * FAIL CLOSED: paid users with unverified billing period are blocked.
 */
export async function consumePostAllowance(
  targetType: 'event' | 'business',
  targetId: string,
): Promise<{ ok: boolean; idempotent?: boolean; postsUsed?: number; postsAllowed?: number; plan?: string; enforced?: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('consume_post_allowance', {
    p_target_type: targetType,
    p_target_id:   targetId,
  });
  if (error) {
    return { ok: false, error: error.message ?? 'Failed to record post allowance.' };
  }
  const result = data as {
    ok: boolean;
    idempotent?: boolean;
    posts_used?: number;
    posts_allowed?: number;
    plan?: string;
    enforced?: boolean;
    error?: string;
  } | null;
  if (!result?.ok) {
    return { ok: false, error: result?.error ?? 'Post allowance check failed.' };
  }
  return {
    ok: true,
    idempotent: result.idempotent ?? false,
    postsUsed: result.posts_used,
    postsAllowed: result.posts_allowed,
    plan: result.plan,
    enforced: result.enforced,
  };
}

// ─── Boost Credits ────────────────────────────────────────────────────────────

/**
 * Decrement remaining_boosts and activate a Business Boost (server-side, atomic).
 *
 * Delegates to the `use-boost-credit` Edge Function with targetType='business'.
 * Business boosts create an active business_promotions record (placement='boost').
 * Credit cost: 3-Day = 1 credit, 7-Day = 2 credits.
 */
export async function useBusinessBoostCredit(
  businessId: string,
  boostType: 'three_day' | 'seven_day',
  idempotencyKey?: string,
): Promise<{ ok: boolean; idempotent?: boolean; boostExpiresAt?: string | null; remainingBoosts?: number; remainingCredits?: number; promotionId?: string | null; error?: string }> {
  const { data, error } = await invokeSafe('use-boost-credit', {
    businessId,
    boostType,
    targetType: 'business',
    idempotencyKey: idempotencyKey ?? null,
  });
  if (error) return { ok: false, error };
  return {
    ok: true,
    idempotent: (data?.idempotent as boolean | undefined) ?? false,
    boostExpiresAt: (data?.boostExpiresAt as string | null) ?? null,
    remainingBoosts: (data?.remainingBoosts as number | undefined) ?? undefined,
    remainingCredits: (data?.remainingCredits as number | undefined) ?? undefined,
    promotionId: (data?.promotionId as string | null) ?? null,
  };
}

/**
 * Delegates to the `use-boost-credit` Edge Function which:
 *   - Verifies event ownership server-side
 *   - Atomically decrements remaining_boosts (race-condition-safe)
 *   - Activates the boost on the event
 *   - Records the redemption in boost_purchases with payment_provider='credit'
 *   - Refunds the credit if boost activation fails (compensating transaction)
 *
 * Returns error if the user has no remaining credits or does not own the event.
 */
export async function useBoostCredit(
  eventId: string,
  boostType: 'three_day' | 'seven_day' | 'until_event_end',
  idempotencyKey?: string,
): Promise<{ ok: boolean; idempotent?: boolean; boostExpiresAt?: string | null; remainingBoosts?: number; remainingCredits?: number; error?: string }> {
  // until_event_end cannot be redeemed via subscription credits — must be purchased
  if (boostType === 'until_event_end') {
    return { ok: false, error: 'Until Event Ends is a separately purchased Boost and cannot be redeemed with included subscription credits' };
  }
  const { data, error } = await invokeSafe('use-boost-credit', {
    eventId,
    boostType,
    targetType: 'event',
    idempotencyKey: idempotencyKey ?? null,
  });
  if (error) return { ok: false, error };
  return {
    ok: true,
    idempotent: (data?.idempotent as boolean | undefined) ?? false,
    boostExpiresAt: (data?.boostExpiresAt as string | null) ?? null,
    remainingBoosts: (data?.remainingBoosts as number | undefined) ?? undefined,
    remainingCredits: (data?.remainingCredits as number | undefined) ?? undefined,
  };
}
