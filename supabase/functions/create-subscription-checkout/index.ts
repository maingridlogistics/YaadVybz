// create-subscription-checkout — creates a Stripe Checkout session (mode: subscription).
//
// Security model:
//   • JWT validated before any Stripe call — no anonymous checkout creation.
//   • Plan → price ID mapping is server-side only; client sends plan name, never price IDs.
//   • Stripe customer created/looked-up here and persisted to user_profiles.
//   • If an active subscription already exists, redirect_to_portal is returned so
//     the client opens Customer Portal for upgrade/downgrade instead.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14?target=deno&no-check';
import { corsHeaders } from '../_shared/cors.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-04-10',
  httpClient: Stripe.createFetchHttpClient(),
});

// Server-side price ID resolution — never trust client-supplied prices.
// Keys must be set in Supabase Edge Function secrets:
//   STRIPE_PRICE_PRO_MONTHLY, STRIPE_PRICE_PRO_YEARLY,
//   STRIPE_PRICE_ELITE_MONTHLY, STRIPE_PRICE_ELITE_YEARLY
function resolvePriceId(plan: string, cycle: string): string {
  const key = `STRIPE_PRICE_${plan.toUpperCase()}_${cycle.toUpperCase()}`;
  return Deno.env.get(key) ?? '';
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

  try {
    // ── 1. Authenticate ──────────────────────────────────────────────────────
    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '').trim();
    if (!token) {
      return new Response(JSON.stringify({ error: 'Authorization required' }), { status: 401, headers: jsonHeaders });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: jsonHeaders });
    }

    // ── 2. Parse and validate body ───────────────────────────────────────────
    let body: Record<string, unknown>;
    try { body = await req.json(); } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: jsonHeaders });
    }

    // ── 2a. iOS purchase gate — defensive server-side check ──────────────────
    // iOS digital purchases are disabled for App Store version 1.0.
    // Re-enable only after Apple In-App Purchase is implemented or the flow is
    // otherwise confirmed App Store compliant.
    const clientPlatform = typeof body.platform === 'string' ? body.platform.toLowerCase() : '';
    if (clientPlatform === 'ios') {
      console.warn(`[sub-checkout] iOS purchase attempt rejected for user ${user.id.slice(0, 8)}`);
      return new Response(
        JSON.stringify({ error: 'Subscription purchases are not available on iOS in this version.' }),
        { status: 403, headers: jsonHeaders }
      );
    }

    const plan = typeof body.plan === 'string' ? body.plan.toLowerCase() : '';
    const cycle = body.billing_cycle === 'yearly' ? 'yearly' : 'monthly';

    if (!['pro', 'elite'].includes(plan)) {
      return new Response(JSON.stringify({ error: 'plan must be "pro" or "elite"' }), { status: 400, headers: jsonHeaders });
    }

    const priceId = resolvePriceId(plan, cycle);
    if (!priceId) {
      const key = `STRIPE_PRICE_${plan.toUpperCase()}_${cycle.toUpperCase()}`;
      console.error(`[sub-checkout] Secret not set: ${key}`);
      return new Response(
        JSON.stringify({ error: 'Subscription pricing is not configured. Please contact support.' }),
        { status: 503, headers: jsonHeaders }
      );
    }

    // ── 3. Get or create Stripe customer ─────────────────────────────────────
    const { data: profile } = await supabaseAdmin
      .from('user_profiles')
      .select('stripe_customer_id, email, name')
      .eq('id', user.id)
      .single();

    let customerId: string = profile?.stripe_customer_id ?? '';

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? profile?.email ?? '',
        name: profile?.name ?? '',
        metadata: { user_id: user.id },
      });
      customerId = customer.id;
      await supabaseAdmin
        .from('user_profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', user.id);
      console.log(`[sub-checkout] Stripe customer created for user ${user.id.slice(0, 8)}`);
    }

    // ── 4. Check for existing active subscription ─────────────────────────────
    // If one exists, client should use Customer Portal for plan changes.
    const { data: existingSub } = await supabaseAdmin
      .from('subscriptions')
      .select('stripe_subscription_id, status, plan')
      .eq('user_id', user.id)
      .in('status', ['active', 'trialing', 'past_due'])
      .maybeSingle();

    if (existingSub?.stripe_subscription_id) {
      console.log(`[sub-checkout] User ${user.id.slice(0,8)} has active sub — redirect to portal`);
      return new Response(
        JSON.stringify({ redirect_to_portal: true }),
        { status: 200, headers: jsonHeaders }
      );
    }

    // ── 5. Create Stripe Checkout session ─────────────────────────────────────
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: 'vybzhub://subscription-success?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'vybzhub://subscription-cancel',
      allow_promotion_codes: true,
      metadata: {
        user_id: user.id,
        plan,
        billing_cycle: cycle,
      },
      subscription_data: {
        metadata: {
          user_id: user.id,
          plan,
          billing_cycle: cycle,
        },
      },
    });

    console.log(`[sub-checkout] session=${session.id} user=${user.id.slice(0,8)} plan=${plan} cycle=${cycle}`);
    return new Response(
      JSON.stringify({ url: session.url, session_id: session.id }),
      { status: 200, headers: jsonHeaders }
    );

  } catch (err) {
    console.error('[sub-checkout] Unhandled error:', String(err).slice(0, 200));
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: jsonHeaders });
  }
});
