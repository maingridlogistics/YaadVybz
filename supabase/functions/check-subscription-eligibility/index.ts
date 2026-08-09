// check-subscription-eligibility — Cross-platform subscription ownership query.
//
// ISSUE-015/016 FIX:
//   - Accepts provider from POST body (primary client path, no 'GET as any' hack)
//   - Validates provider strictly; returns 400 for unknown values instead of
//     silently defaulting to 'stripe' (which would give wrong results for Apple/Google)
//   - Exposes 'inconsistent_entitlement' from subscriptionGuard in response

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

  // ── 2. Parse provider ────────────────────────────────────────────────────────
  // ISSUE-015/016 FIX: Accept from POST body (primary client path via functions.invoke)
  // or query string (legacy GET path). Validate strictly — never silently default.
  const url = new URL(req.url);
  let bodyProvider: string | null = null;
  if (req.method === 'POST') {
    try {
      const parsed = await req.json() as { provider?: string };
      bodyProvider = parsed.provider ?? null;
    } catch { /* noop — empty body */ }
  }
  const rawProvider: string | null = url.searchParams.get('provider') ?? bodyProvider;

  const validProviders = ['apple', 'google', 'stripe'] as const;
  if (!rawProvider || !(validProviders as readonly string[]).includes(rawProvider)) {
    return new Response(
      JSON.stringify({ error: `provider must be one of: ${validProviders.join(', ')}. Got: "${rawProvider ?? 'missing'}"` }),
      { status: 400, headers: jsonHeaders },
    );
  }
  const requestedProvider = rawProvider as 'apple' | 'google' | 'stripe';

  // ── 3. Check eligibility ─────────────────────────────────────────────────────
  try {
    const result = await checkSubscriptionEligibility(supabaseAdmin, user.id, requestedProvider);

    const response = {
      eligible:                  result.eligible,
      eligibility:               result.eligibility,
      reason:                    result.reason,
      hasActivePaidSubscription: result.activeSubscription !== null,
      activeSubscription:        result.activeSubscription
        ? {
            plan:             result.activeSubscription.plan,
            status:           result.activeSubscription.status,
            paymentProvider:  result.activeSubscription.paymentProvider,
            providerLabel:    providerLabel(result.activeSubscription.paymentProvider),
            providerIcon:     providerIcon(result.activeSubscription.paymentProvider),
            billingCycle:     result.activeSubscription.billingCycle,
            currentPeriodEnd: result.activeSubscription.currentPeriodEnd,
            cancelAtPeriodEnd:result.activeSubscription.cancelAtPeriodEnd,
            autoRenewStatus:  result.activeSubscription.autoRenewStatus,
            isSameProvider:   result.activeSubscription.paymentProvider === requestedProvider,
            isBillingRetry:   ['past_due'].includes(result.activeSubscription.status),
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
