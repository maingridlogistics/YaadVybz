// ─── Vybz Hub Entitlement Service ─────────────────────────────────────────────
//
// Client-side, provider-agnostic entitlement layer.
//
// CORE RULE: This service never asks "does this user have Stripe / Apple / Google?"
//            It only asks "what is this user's current entitlement?"
//
// PREMIUM ACCESS RULE (canonical):
//   hasPremiumAccess = lifetime_pro_owned === true OR admin_elite === true
//
//   Pro and Elite have IDENTICAL feature access. The only difference is
//   acquisition: Pro = $49.99 one-time purchase, Elite = admin-granted.
//   There are NO Elite-only features unless explicitly added later.
//
// Display tier (for badges/labels only — NOT for feature gating):
//   admin_elite → 'elite'
//   lifetime_pro_owned → 'pro'
//   else → 'free'
//
// All entitlement state flows through user_profiles in the Vybz Hub database —
// regardless of which payment provider processed the original transaction.
//
// Supported payment_provider values: stripe | apple | google | admin
// Boost source values:               stripe | apple | google | credit
//
// Cross-device guarantee:
//   A user who buys Pro on iOS can sign into Android and immediately
//   have all premium features unlocked — because Android reads only from
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
  // Canonical lifetime entitlement booleans (source of truth for feature gates)
  lifetimeProOwned: boolean;
  adminElite: boolean;
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
 *
 * hasPremiumAccess is the canonical gate for ALL premium features.
 * Pro and Elite are identical in capability — check hasPremiumAccess, NOT tier.
 */
export interface EntitlementGates {
  /** True when user has any premium access: lifetime_pro_owned OR admin_elite */
  hasPremiumAccess: boolean;
  canPostUnlimitedEvents: boolean;     // hasPremiumAccess
  canSellTickets: boolean;             // hasPremiumAccess only
  hasVerifiedBadge: boolean;           // hasPremiumAccess
  hasFreeBoostCredits: boolean;        // remaining_boosts > 0
  hasPrioritySearch: boolean;          // hasPremiumAccess (featured_priority >= 1)
  hasFeaturedPlacement: boolean;       // hasPremiumAccess (featured_priority >= 1)
  hasAdvancedAnalytics: boolean;       // hasPremiumAccess
  /** Legacy compat — true for lifetime ownership (no renewal concept) */
  isSubscriptionActive: boolean;
  isSubscriptionPastDue: boolean;
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
    lifetime_pro_owned: boolean | null;
    admin_elite: boolean | null;
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
      'lifetime_pro_owned, admin_elite, ' +
      'subscription_tier, subscription_status, current_period_end, ' +
      'verified_promoter, monthly_boost_allowance, remaining_boosts, featured_priority, ' +
      'stripe_customer_id, apple_original_transaction_id'
    )
    .eq('id', user.id)
    .single();

  const profile = rawProfile as UserProfileEntitlementRow | null;

  if (error || !profile) return null;

  // Determine active provider from the subscriptions ledger (most recent active row)
  // rather than from column presence, which can be stale after a provider switch.
  let paymentProvider: PaymentProvider | null = null;
  try {
    const { data: subRow } = await supabase
      .from('subscriptions')
      .select('payment_provider, status, current_period_end')
      .eq('user_id', user.id)
      .in('status', ['active', 'trialing', 'past_due'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (subRow?.payment_provider) {
      paymentProvider = subRow.payment_provider as PaymentProvider;
    } else if ((profile.subscription_tier ?? 'free') !== 'free') {
      // No active ledger row but profile says paid — admin grant or legacy row
      paymentProvider = 'admin';
    }
  } catch {
    // Fallback: best-effort column inference when subscriptions query fails
    if (profile.apple_original_transaction_id) paymentProvider = 'apple';
    else if (profile.stripe_customer_id) paymentProvider = 'stripe';
    else if ((profile.subscription_tier ?? 'free') !== 'free') paymentProvider = 'admin';
  }

  return {
    lifetimeProOwned:             (profile.lifetime_pro_owned  as boolean)             ?? false,
    adminElite:                   (profile.admin_elite         as boolean)             ?? false,
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
  // CANONICAL PREMIUM ACCESS RULE — use boolean fields, not subscription_tier string.
  // lifetime_pro_owned OR admin_elite → full premium access.
  // No subscription status check — lifetime ownership never expires.
  // Admin users get full premium access regardless of subscription state
  const isAdmin = (snap as any).roles?.includes?.('admin') === true;
  const hasPremiumAccess =
    snap.lifetimeProOwned === true ||
    snap.adminElite === true ||
    isAdmin ||
    snap.subscriptionTier === 'pro' ||   // fallback for any legacy/admin-set rows
    snap.subscriptionTier === 'elite';

  // Legacy compat fields — lifetime ownership is always 'active'
  const isActive  = hasPremiumAccess;
  const isPastDue = false; // no subscription billing, no past-due concept

  return {
    hasPremiumAccess,
    canPostUnlimitedEvents: hasPremiumAccess,
    canSellTickets:         hasPremiumAccess,
    hasVerifiedBadge:       hasPremiumAccess && snap.verifiedPromoter,
    hasFreeBoostCredits:    snap.remainingBoosts > 0,
    hasPrioritySearch:      hasPremiumAccess && snap.featuredPriority >= 1,
    hasFeaturedPlacement:   hasPremiumAccess && snap.featuredPriority >= 1,
    hasAdvancedAnalytics:   hasPremiumAccess,
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

/**
 * Canonical check used by UI components.
 * Pass the UserProfile object from useAuth().
 * hasPremiumAccess = lifetime_pro_owned OR admin_elite.
 * Pro and Elite are IDENTICAL in features — use this, not tier comparison.
 */
export function userHasPremiumAccess(user: { lifetimeProOwned?: boolean; adminElite?: boolean; subscriptionTier?: string; roles?: string[] } | null | undefined): boolean {
  if (!user) return false;
  // Admins have full access to everything — no subscription required
  if (user.roles?.includes('admin')) return true;
  // Primary: server-authoritative boolean columns
  if (user.lifetimeProOwned === true || user.adminElite === true) return true;
  // Fallback: subscriptionTier for any legacy/admin-set rows
  return user.subscriptionTier === 'pro' || user.subscriptionTier === 'elite';
}

export const PLAN_ENTITLEMENTS_CLIENT: Record<SubscriptionTierKey, {
  verifiedPromoter: boolean;
  monthlyBoostAllowance: number;
  featuredPriority: number;
  label: string;
  /** Maximum simultaneously ACTIVE posts (Events + Businesses combined) */
  activePostLimit: number;
}> = {
  free:  { verifiedPromoter: false, monthlyBoostAllowance: 0,  featuredPriority: 0, label: 'Free',  activePostLimit: 3  },
  pro:   { verifiedPromoter: true,  monthlyBoostAllowance: 10, featuredPriority: 1, label: 'Pro',   activePostLimit: 10 },
  elite: { verifiedPromoter: true,  monthlyBoostAllowance: 10, featuredPriority: 2, label: 'Elite', activePostLimit: 10 },
};

/**
 * Returns the human-readable name for a subscription tier.
 * Consistent across all payment providers.
 */
export function getSubscriptionLabel(tier: SubscriptionTierKey): string {
  return PLAN_ENTITLEMENTS_CLIENT[tier]?.label ?? 'Free';
}

/**
 * Returns boost credit cost for a given boost type.
 * 3-Day = 1 credit, 7-Day = 2 credits.
 * until_event_end is NOT redeemable via subscription credits — returns null.
 */
export function boostCreditCost(boostType: BoostType): number | null {
  if (boostType === 'seven_day') return 2;
  if (boostType === 'three_day') return 1;
  // until_event_end: must be separately purchased — never via subscription credits
  return null;
}
