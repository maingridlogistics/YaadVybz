// check-subscription-eligibility — Cross-platform subscription ownership query.
//
// The app calls this BEFORE showing any purchase UI.  The response tells the
// client whether the user already has an active paid subscription, which
// provider is billing them, and whether they are eligible to purchase a new
// subscription on the current platform.
//
// This prevents:
//   • Double billing  (Apple active → Android shows Google subscribe button)
//   • Duplicate entitlements  (Stripe active → iOS shows Apple subscribe button)
//   • Confusing UX  (paid user on wrong platform sees upgrade CTA instead of status)
//
// REQUEST:  GET  /functions/v1/check-subscription-eligibility
//   Auth:   Bearer <supabase_access_token>
//   Query:  ?provider=apple|google|stripe   (the platform making the request)
//
// RESPONSE: EligibilityResponse (see type below)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import {
  checkSubscriptionEligibility,
  providerLabel,
  providerIcon,
} from '../_shared/subscriptionGuard.ts';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

  // ── 1. Authenticate ──────────────────────────────────────────────────────────
  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '').trim();
  if (!token) {
    return new Response(JSON.stringify({ error: 'Authorization required' }), {
      status: 401, headers: jsonHeaders,
    });
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: jsonHeaders,
    });
  }

  // ── 2. Parse provider parameter ──────────────────────────────────────────────
  const url = new URL(req.url);
  const rawProvider = url.searchParams.get('provider') ??
    // Also accept POST body for compatibility
    (req.method === 'POST' ? (await req.json().catch(() => ({}))).provider : null);

  const validProviders = ['apple', 'google', 'stripe'] as const;
  const requestedProvider = validProviders.includes(rawProvider as any)
    ? (rawProvider as 'apple' | 'google' | 'stripe')
    : 'stripe';

  // ── 3. Check eligibility ─────────────────────────────────────────────────────
  try {
    const result = await checkSubscriptionEligibility(supabaseAdmin, user.id, requestedProvider);

    const response: {
      eligible: boolean;
      eligibility: string;
      reason: string;
      hasActivePaidSubscription: boolean;
      activeSubscription: null | {
        plan: string;
        status: string;
        paymentProvider: string;
        providerLabel: string;
        providerIcon: string;
        billingCycle: string;
        currentPeriodEnd: string | null;
        cancelAtPeriodEnd: boolean;
        autoRenewStatus: boolean | null;
        isSameProvider: boolean;
        isBillingRetry: boolean;
      };
    } = {
      eligible: result.eligible,
      eligibility: result.eligibility,
      reason: result.reason,
      hasActivePaidSubscription: result.activeSubscription !== null,
      activeSubscription: result.activeSubscription
        ? {
            plan:                result.activeSubscription.plan,
            status:              result.activeSubscription.status,
            paymentProvider:     result.activeSubscription.paymentProvider,
            providerLabel:       providerLabel(result.activeSubscription.paymentProvider),
            providerIcon:        providerIcon(result.activeSubscription.paymentProvider),
            billingCycle:        result.activeSubscription.billingCycle,
            currentPeriodEnd:    result.activeSubscription.currentPeriodEnd,
            cancelAtPeriodEnd:   result.activeSubscription.cancelAtPeriodEnd,
            autoRenewStatus:     result.activeSubscription.autoRenewStatus,
            isSameProvider:      result.activeSubscription.paymentProvider === requestedProvider,
            isBillingRetry:      ['past_due'].includes(result.activeSubscription.status),
          }
        : null,
    };

    console.log(
      `[check-eligibility] user=${user.id.slice(0,8)} provider=${requestedProvider} eligible=${result.eligible} reason=${result.eligibility}`,
    );

    return new Response(JSON.stringify(response), { status: 200, headers: jsonHeaders });
  } catch (err) {
    console.error('[check-eligibility] Error:', String(err).slice(0, 200));
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: jsonHeaders,
    });
  }
});
