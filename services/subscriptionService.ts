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
      } catch (_) {}
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

export async function checkSubscriptionEligibility(
  provider: 'apple' | 'google' | 'stripe',
): Promise<{ data: SubscriptionEligibilityResponse | null; error: string | null }> {
  const { data, error } = await supabase.functions.invoke(
    `check-subscription-eligibility?provider=${provider}`,
    { method: 'GET' } as any,
  );

  if (error) {
    let detail = error.message;
    if (error instanceof FunctionsHttpError) {
      try {
        const text = await (error as any).context?.text?.();
        detail = text || error.message;
      } catch (_) {}
    }
    return { data: null, error: detail };
  }

  return { data: data as SubscriptionEligibilityResponse, error: null };
}

// ─── Boost Credits ────────────────────────────────────────────────────────────

/**
 * Decrement remaining_boosts by 1 (server-side, atomic) and activate a boost.
 *
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
  boostType: 'three_day' | 'seven_day' | 'until_event_end'
): Promise<{ ok: boolean; boostExpiresAt?: string | null; remainingBoosts?: number; error?: string }> {
  const { data, error } = await invokeSafe('use-boost-credit', { eventId, boostType });
  if (error) return { ok: false, error };
  return {
    ok: true,
    boostExpiresAt:   (data?.boostExpiresAt  as string  | null)    ?? null,
    remainingBoosts:  (data?.remainingBoosts  as number  | undefined) ?? undefined,
  };
}
