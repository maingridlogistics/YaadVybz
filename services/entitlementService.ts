// ─── Vybz Hub Entitlement Service ─────────────────────────────────────────────
//
// Client-side, provider-agnostic entitlement layer.
//
// CORE RULE: This service never asks "does this user have Stripe / Apple / Google?"
//            It only asks "what is this user's current entitlement?"
//
// All entitlement state flows through user_profiles in the Vybz Hub database —
// regardless of which payment provider processed the original transaction.
//
// Supported payment_provider values: stripe | apple | google | admin
// Boost source values:               stripe | apple | google | credit
//
// Cross-device guarantee:
//   A user who subscribes on iOS (Apple) can sign into Android and immediately
//   have all Pro/Elite features unlocked — because Android reads only from
//   user_profiles, not from Apple.

import { supabase } from '../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export type PaymentProvider = 'stripe' | 'apple' | 'google' | 'admin';
export type SubscriptionTierKey = 'free' | 'pro' | 'elite';
export type BoostType = 'three_day' | 'seven_day' | 'until_event_end';

/**
 * Unified entitlement snapshot — the complete picture of what a user is
 * currently entitled to, regardless of which provider they paid through.
 */
export interface EntitlementSnapshot {
  // Subscription
  subscriptionTier: SubscriptionTierKey;
  subscriptionStatus: string;
  currentPeriodEnd: string | null;
  paymentProvider: PaymentProvider | null;  // null if not yet determined

  // Feature flags (all derived from the subscription tier)
  verifiedPromoter: boolean;
  monthlyBoostAllowance: number;
  remainingBoosts: number;
  featuredPriority: number;               // 0=free, 1=pro, 2=elite

  // Provider-specific identifiers (read-only; never used for feature gating)
  stripeCustomerId: string | null;
  appleOriginalTransactionId: string | null;
}

/**
 * Convenience feature-gate helpers derived from EntitlementSnapshot.
 * These are the ONLY booleans that feature screens should check.
 */
export interface EntitlementGates {
  canPostUnlimitedEvents: boolean;     // Pro or Elite
  hasVerifiedBadge: boolean;           // Pro or Elite, active subscription
  hasFreeBoostCredits: boolean;        // remaining_boosts > 0
  hasPrioritySearch: boolean;          // featured_priority >= 1
  hasFeaturedPlacement: boolean;       // featured_priority >= 2  (Elite only)
  hasAdvancedAnalytics: boolean;       // Pro or Elite
  isSubscriptionActive: boolean;       // status in ['active', 'trialing']
  isSubscriptionPastDue: boolean;      // status === 'past_due'
}

// ─── Read entitlement ─────────────────────────────────────────────────────────

/**
 * Read the current entitlement snapshot for the signed-in user.
 * Returns null if the user is not authenticated or their profile is missing.
 *
 * This is the SINGLE place in the client that reads entitlement state from DB.
 * All feature gates should be derived from the returned snapshot.
 */
export async function getEntitlementSnapshot(): Promise<EntitlementSnapshot | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Use an explicit row interface so TypeScript doesn't infer GenericStringError
  // from the untyped SupabaseClient singleton (no generated Database types).
  interface UserProfileEntitlementRow {
    subscription_tier: string | null;
    subscription_status: string | null;
    current_period_end: string | null;
    verified_promoter: boolean | null;
    monthly_boost_allowance: number | null;
    remaining_boosts: number | null;
    featured_priority: number | null;
    stripe_customer_id: string | null;
    apple_original_transaction_id: string | null;
  }

  const { data: rawProfile, error } = await supabase
    .from('user_profiles')
    .select(
      'subscription_tier, subscription_status, current_period_end, ' +
      'verified_promoter, monthly_boost_allowance, remaining_boosts, featured_priority, ' +
      'stripe_customer_id, apple_original_transaction_id'
    )
    .eq('id', user.id)
    .single();

  const profile = rawProfile as UserProfileEntitlementRow | null;

  if (error || !profile) return null;

  // Infer which provider is active based on which ID is set.
  // Admin-granted plans have no provider ID — default to 'admin'.
  let paymentProvider: PaymentProvider | null = null;
  if (profile.apple_original_transaction_id) {
    paymentProvider = 'apple';
  } else if (profile.stripe_customer_id) {
    paymentProvider = 'stripe';
  } else if ((profile.subscription_tier ?? 'free') !== 'free') {
    paymentProvider = 'admin';
  }

  return {
    subscriptionTier:             (profile.subscription_tier   as SubscriptionTierKey) ?? 'free',
    subscriptionStatus:           (profile.subscription_status as string)              ?? 'active',
    currentPeriodEnd:             (profile.current_period_end  as string)              ?? null,
    paymentProvider,
    verifiedPromoter:             (profile.verified_promoter   as boolean)             ?? false,
    monthlyBoostAllowance:        (profile.monthly_boost_allowance as number)          ?? 0,
    remainingBoosts:              (profile.remaining_boosts    as number)              ?? 0,
    featuredPriority:             (profile.featured_priority   as number)              ?? 0,
    stripeCustomerId:             (profile.stripe_customer_id  as string)              ?? null,
    appleOriginalTransactionId:   (profile.apple_original_transaction_id as string)    ?? null,
  };
}

// ─── Feature gate derivation ──────────────────────────────────────────────────

/**
 * Derive the complete set of feature gates from an entitlement snapshot.
 * Screens call this and check boolean flags — never check the tier string directly.
 */
export function deriveEntitlementGates(snap: EntitlementSnapshot): EntitlementGates {
  const isActive  = ['active', 'trialing'].includes(snap.subscriptionStatus);
  const isPastDue = snap.subscriptionStatus === 'past_due';
  const isPaid    = snap.subscriptionTier === 'pro' || snap.subscriptionTier === 'elite';

  return {
    canPostUnlimitedEvents: isPaid && isActive,
    hasVerifiedBadge:       snap.verifiedPromoter && isActive,
    hasFreeBoostCredits:    snap.remainingBoosts > 0,
    hasPrioritySearch:      snap.featuredPriority >= 1 && isActive,
    hasFeaturedPlacement:   snap.featuredPriority >= 2 && isActive,
    hasAdvancedAnalytics:   isPaid && isActive,
    isSubscriptionActive:   isActive,
    isSubscriptionPastDue:  isPastDue,
  };
}

// ─── Convenience: read gates directly ────────────────────────────────────────

/**
 * Convenience wrapper: fetch snapshot + derive gates in one call.
 * Returns null if user is not authenticated.
 */
export async function getEntitlementGates(): Promise<EntitlementGates | null> {
  const snap = await getEntitlementSnapshot();
  if (!snap) return null;
  return deriveEntitlementGates(snap);
}

// ─── Plan metadata (provider-agnostic) ───────────────────────────────────────

export const PLAN_ENTITLEMENTS_CLIENT: Record<SubscriptionTierKey, {
  verifiedPromoter: boolean;
  monthlyBoostAllowance: number;
  featuredPriority: number;
  label: string;
}> = {
  free:  { verifiedPromoter: false, monthlyBoostAllowance: 0, featuredPriority: 0, label: 'Free' },
  pro:   { verifiedPromoter: true,  monthlyBoostAllowance: 1, featuredPriority: 1, label: 'Promoter Pro' },
  elite: { verifiedPromoter: true,  monthlyBoostAllowance: 5, featuredPriority: 2, label: 'Elite' },
};

/**
 * Returns the human-readable name for a subscription tier.
 * Consistent across all payment providers.
 */
export function getSubscriptionLabel(tier: SubscriptionTierKey): string {
  return PLAN_ENTITLEMENTS_CLIENT[tier]?.label ?? 'Free';
}
