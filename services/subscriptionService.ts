// ─── Vybz Hub Subscription Service ───────────────────────────────────────────
// Client-side wrapper around subscription Edge Functions.
// All entitlement decisions come from the DB after webhook confirmation —
// this service only creates Stripe sessions and fetches subscription state.

import { supabase } from '../lib/supabase';
import { FunctionsHttpError } from '@supabase/supabase-js';

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
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string,
  };
}

// ─── Boost Credits ────────────────────────────────────────────────────────────

/**
 * Decrement remaining_boosts by 1 and activate a boost on an event.
 * This is the "use a free boost credit" flow for Pro/Elite subscribers.
 * Returns error if the user has no remaining credits.
 */
export async function useBoostCredit(
  eventId: string,
  boostType: 'three_day' | 'seven_day' | 'until_event_end'
): Promise<{ ok: boolean; error?: string }> {
  try {
    // Verify remaining boosts and get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: 'Not signed in' };

    const { data: profile, error: profileErr } = await supabase
      .from('user_profiles')
      .select('remaining_boosts')
      .eq('id', user.id)
      .single();

    if (profileErr || !profile) return { ok: false, error: 'Could not check boost credits' };

    const remaining = (profile.remaining_boosts as number) ?? 0;
    if (remaining <= 0) return { ok: false, error: 'No boost credits remaining this month' };

    // Decrement boost credit and activate boost atomically via RPC-style update
    const now = new Date();
    let boostExpiresAt: string | null = null;
    if (boostType === 'three_day') {
      boostExpiresAt = new Date(now.getTime() + 72 * 60 * 60 * 1000).toISOString();
    } else if (boostType === 'seven_day') {
      boostExpiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    }

    // Decrement remaining_boosts
    const { error: decrementErr } = await supabase
      .from('user_profiles')
      .update({ remaining_boosts: remaining - 1 })
      .eq('id', user.id)
      .eq('remaining_boosts', remaining); // optimistic concurrency

    if (decrementErr) return { ok: false, error: 'Could not use boost credit. Please try again.' };

    // Activate boost on the event
    const { error: boostErr } = await supabase
      .from('events')
      .update({
        boosted:          true,
        boost_type:       boostType,
        boost_status:     'active',
        boost_started_at: now.toISOString(),
        boost_expires_at: boostExpiresAt,
      })
      .eq('id', eventId)
      .eq('promoter_id', user.id); // ownership check

    if (boostErr) {
      // Refund the credit on boost activation failure
      await supabase
        .from('user_profiles')
        .update({ remaining_boosts: remaining })
        .eq('id', user.id);
      return { ok: false, error: 'Could not activate boost. Credit refunded.' };
    }

    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Unexpected error' };
  }
}
