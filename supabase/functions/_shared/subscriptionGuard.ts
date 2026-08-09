// _shared/subscriptionGuard.ts — Cross-provider subscription ownership guard.
//
// CORE RULE (Phase 6):
//   A Vybz Hub subscription belongs to the ACCOUNT, not the device or payment
//   provider.  Before any payment provider activates a new paid subscription,
//   this module checks whether the user already has an active entitlement from
//   another provider.
//
// Status ladder (most → least entitled):
//   active | trialing    → fully entitled; BLOCK new provider purchase
//   past_due             → in billing retry; BLOCK new provider purchase
//   grace_period         → Apple grace period active; BLOCK new provider purchase
//   canceled | expired   → entitled through current_period_end only (check date)
//   revoked | refunded   → no entitlement; ALLOW new provider purchase
//
// Called by:
//   create-subscription-checkout  (Stripe server-side guard)
//   verify-apple-transaction      (Apple server-side guard)
//   check-subscription-eligibility (client-facing eligibility endpoint)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export type SubscriptionEligibility =
  | 'eligible'                  // No active paid subscription — purchase allowed
  | 'active_same_provider'      // Same provider — use portal/App Store to manage
  | 'active_other_provider'     // Different provider with active entitlement — block
  | 'grace_same_provider'       // Same provider in grace/retry — use portal to manage
  | 'grace_other_provider'      // Different provider in grace/retry — still entitled, block
  | 'expired_eligible'          // Previous subscription expired — eligible for new provider
  | 'admin_granted'             // Admin-granted entitlement — don't auto-bill over it
  | 'inconsistent_entitlement'; // Profile shows paid tier but no matching ledger row — fail closed

export interface ActiveSubscriptionSummary {
  id: string;
  plan: 'pro' | 'elite';
  status: string;
  paymentProvider: 'stripe' | 'apple' | 'google' | 'admin';
  billingCycle: 'monthly' | 'yearly';
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  autoRenewStatus: boolean | null;
  originalTransactionId: string | null;
  stripeSubscriptionId: string | null;
  createdAt: string;
}

export interface EligibilityResult {
  eligible: boolean;
  eligibility: SubscriptionEligibility;
  activeSubscription: ActiveSubscriptionSummary | null;
  /** Human-readable explanation for the UI */
  reason: string;
}

// Statuses that still grant entitlement (billing issues but access preserved).
const ENTITLEMENT_GRANTING_STATUSES = ['active', 'trialing', 'past_due'];

// Statuses that mean "in billing retry / grace period" — still entitled but
// blocking so we don't create a double-billing situation.
const BILLING_RETRY_STATUSES = ['past_due'];

/**
 * Determine whether a user may purchase a new subscription with the given
 * payment provider.
 *
 * @param supabaseAdmin   Service-role Supabase client
 * @param userId          Vybz Hub user ID
 * @param requestedProvider The provider attempting to create the new subscription
 */
export async function checkSubscriptionEligibility(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
  requestedProvider: 'stripe' | 'apple' | 'google',
): Promise<EligibilityResult> {

  // ── 1. Query the subscriptions ledger for any entitlement-granting rows ─────
  // We look at both the subscriptions table (source of truth for provider details)
  // and cross-reference user_profiles.subscription_tier (the authoritative
  // entitlement field written by all webhook handlers).
  const { data: rows } = await supabaseAdmin
    .from('subscriptions')
    .select(
      'id, plan, status, payment_provider, billing_cycle, current_period_end, ' +
      'cancel_at_period_end, auto_renew_status, original_transaction_id, ' +
      'stripe_subscription_id, created_at'
    )
    .eq('user_id', userId)
    .in('plan', ['pro', 'elite'])
    .order('created_at', { ascending: false });

  // ── 2. Also check user_profiles as the authoritative entitlement source ──────
  const { data: profile } = await supabaseAdmin
    .from('user_profiles')
    .select('subscription_tier, subscription_status, current_period_end')
    .eq('id', userId)
    .single();

  const profileTier = profile?.subscription_tier ?? 'free';
  const profileStatus = profile?.subscription_status ?? 'inactive';

  // Free plan at the profile level — definitely eligible regardless of ledger
  if (profileTier === 'free' && !['active', 'trialing', 'past_due'].includes(profileStatus)) {
    return {
      eligible: true,
      eligibility: 'eligible',
      activeSubscription: null,
      reason: 'No active subscription — purchase allowed.',
    };
  }

  // ── 3. Find the most recent subscription row that grants entitlement ─────────
  const activeSub = (rows ?? []).find((r) => {
    const status = r.status as string;

    // Actively granting statuses
    if (ENTITLEMENT_GRANTING_STATUSES.includes(status)) return true;

    // Canceled/expired but current_period_end is in the future
    // (user still has access until the period ends)
    if (['canceled', 'expired'].includes(status) && r.current_period_end) {
      const end = new Date(r.current_period_end as string);
      if (end > new Date()) return true;
    }

    return false;
  });

  if (!activeSub) {
    // ISSUE-007 FIX: Fail CLOSED on inconsistent state.
    // If user_profiles says active paid tier but there is no matching subscription
    // ledger row, this is an inconsistent billing state — do NOT allow a new purchase.
    // This prevents double-billing while the user contacts support.
    if (['active', 'trialing', 'past_due'].includes(profileStatus) && profileTier !== 'free') {
      console.warn(
        `[subscriptionGuard] INCONSISTENCY: Profile has active ${profileTier}/${profileStatus} ` +
        `but no matching subscription ledger row for user=${userId.slice(0,8)} — failing closed`
      );
      return {
        eligible: false,
        eligibility: 'inconsistent_entitlement',
        activeSubscription: null,
        reason: 'We found an issue with your current subscription status. Please contact support before starting another subscription.',
      };
    }

    return {
      eligible: true,
      eligibility: 'eligible',
      activeSubscription: null,
      reason: 'No active subscription — purchase allowed.',
    };
  }

  // ── 4. We have an active subscription — determine eligibility ────────────────
  const summary: ActiveSubscriptionSummary = {
    id:                    activeSub.id as string,
    plan:                  activeSub.plan as 'pro' | 'elite',
    status:                activeSub.status as string,
    paymentProvider:       (activeSub.payment_provider as 'stripe' | 'apple' | 'google' | 'admin') ?? 'stripe',
    billingCycle:          (activeSub.billing_cycle as 'monthly' | 'yearly') ?? 'monthly',
    currentPeriodEnd:      (activeSub.current_period_end as string) ?? null,
    cancelAtPeriodEnd:     (activeSub.cancel_at_period_end as boolean) ?? false,
    autoRenewStatus:       (activeSub.auto_renew_status as boolean) ?? null,
    originalTransactionId: (activeSub.original_transaction_id as string) ?? null,
    stripeSubscriptionId:  (activeSub.stripe_subscription_id as string) ?? null,
    createdAt:             activeSub.created_at as string,
  };

  const isSameProvider = summary.paymentProvider === requestedProvider;
  const isAdminGranted = summary.paymentProvider === 'admin';
  const isBillingRetry = BILLING_RETRY_STATUSES.includes(summary.status);

  // Admin-granted entitlement — don't auto-bill over it
  if (isAdminGranted) {
    return {
      eligible: false,
      eligibility: 'admin_granted',
      activeSubscription: summary,
      reason: 'Your subscription was granted by an administrator. Contact support to change your plan.',
    };
  }

  const planName = summary.plan === 'elite' ? 'Elite' : 'Promoter Pro';
  const providerName = providerLabel(summary.paymentProvider);
  const periodEndStr = summary.currentPeriodEnd
    ? new Date(summary.currentPeriodEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  // Same provider — user should manage via portal/App Store
  if (isSameProvider) {
    if (isBillingRetry) {
      return {
        eligible: false,
        eligibility: 'grace_same_provider',
        activeSubscription: summary,
        reason: `Your ${planName} payment is being retried. Please update your payment method${summary.paymentProvider === 'apple' ? ' in App Store Settings' : ' via the billing portal'}.`,
      };
    }
    return {
      eligible: false,
      eligibility: 'active_same_provider',
      activeSubscription: summary,
      reason: `You already have an active ${planName} subscription billed through ${providerName}.`,
    };
  }

  // Different provider — active or in grace period
  if (isBillingRetry) {
    return {
      eligible: false,
      eligibility: 'grace_other_provider',
      activeSubscription: summary,
      reason: `Your ${planName} (${providerName}) is in a billing retry period. Your access remains active. If ${providerName} billing fails permanently, you will be able to resubscribe here.${periodEndStr ? ` Access secured through ${periodEndStr}.` : ''}`,
    };
  }

  return {
    eligible: false,
    eligibility: 'active_other_provider',
    activeSubscription: summary,
    reason: `Your ${planName} subscription is active and billed through ${providerName}.${periodEndStr ? ` Access through ${periodEndStr}.` : ''} ${isSameProvider ? '' : 'You do not need to purchase again — your access is already active on this device.'}`,
  };
}

/** Human-readable provider label for UI messages */
export function providerLabel(provider: string): string {
  switch (provider) {
    case 'apple':  return 'Apple App Store';
    case 'google': return 'Google Play';
    case 'stripe': return 'Stripe (Web)';
    case 'admin':  return 'Administrator';
    default:       return provider;
  }
}

/** Provider icon name (MaterialIcons) for UI display */
export function providerIcon(provider: string): string {
  switch (provider) {
    case 'apple':  return 'apple';
    case 'google': return 'android';
    case 'stripe': return 'credit-card';
    case 'admin':  return 'admin-panel-settings';
    default:       return 'payment';
  }
}
