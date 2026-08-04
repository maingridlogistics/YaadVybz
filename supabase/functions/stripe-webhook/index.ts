// stripe-webhook — receives Stripe events server-to-server.
// Verifies the webhook signature with STRIPE_WEBHOOK_SECRET, then activates
// the boost on the event record and writes the purchase history row.
// This is the ONLY source of truth for payment confirmation — the client
// never activates a boost directly.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14?target=deno&no-check';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-04-10',
  httpClient: Stripe.createFetchHttpClient(),
});

serve(async (req) => {
  // Stripe webhooks are server-to-server POST — no CORS headers needed.
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // Read raw body for signature verification BEFORE parsing JSON
  const body = await req.text();
  const sig  = req.headers.get('stripe-signature') ?? '';
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret);
  } catch (err) {
    console.error('[stripe-webhook] Signature verification failed:', String(err));
    return new Response(JSON.stringify({ error: 'Invalid signature' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  console.log(`[stripe-webhook] Received: ${event.type}`);

  // Use service role for all DB operations — bypasses RLS safely server-side
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;

    // Only process paid sessions
    if (session.payment_status !== 'paid') {
      console.log('[stripe-webhook] Session not yet paid — skipping');
      return new Response('OK', { status: 200 });
    }

    const metadata = session.metadata ?? {};
    const { event_id, boost_type, promoter_id, is_upgrade, previous_boost_started_at } = metadata;

    if (!event_id || !boost_type || !promoter_id) {
      console.warn('[stripe-webhook] Missing metadata in session', session.id);
      return new Response('OK', { status: 200 });
    }

    const now = new Date();

    // ── Calculate boost expiry ─────────────────────────────────────────────────
    let boostExpiresAt: string | null = null;
    if (boost_type === 'three_day') {
      boostExpiresAt = new Date(now.getTime() + 72 * 60 * 60 * 1000).toISOString();
    } else if (boost_type === 'seven_day') {
      boostExpiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    }
    // until_event_end: boostExpiresAt stays null — expiry is managed by event date

    // For upgrades, preserve the original boost start time for analytics
    const boostStartedAt = (is_upgrade === 'true' && previous_boost_started_at)
      ? previous_boost_started_at
      : now.toISOString();

    // ── Update event row ───────────────────────────────────────────────────────
    const { error: updateError } = await supabaseAdmin
      .from('events')
      .update({
        boosted:               true,
        boost_type,
        boost_status:          'active',
        boost_started_at:      boostStartedAt,
        boost_expires_at:      boostExpiresAt,
        boost_payment_intent:  typeof session.payment_intent === 'string' ? session.payment_intent : null,
        boost_checkout_session: session.id,
        boost_amount:          session.amount_total ?? 0,
        boost_currency:        session.currency ?? 'usd',
      })
      .eq('id', event_id);

    if (updateError) {
      console.error('[stripe-webhook] Failed to update event:', updateError.message);
    } else {
      console.log(`[stripe-webhook] Boost activated: event=${event_id} type=${boost_type} expires=${boostExpiresAt ?? 'with-event'}`);
    }

    // ── Insert purchase record ─────────────────────────────────────────────────
    const { error: purchaseError } = await supabaseAdmin
      .from('boost_purchases')
      .insert({
        event_id,
        promoter_id,
        stripe_payment_intent:  typeof session.payment_intent === 'string' ? session.payment_intent : null,
        stripe_checkout_session: session.id,
        stripe_customer_id:     typeof session.customer === 'string' ? session.customer : null,
        boost_type,
        amount:                 session.amount_total ?? 0,
        currency:               session.currency ?? 'usd',
        status:                 'completed',
        completed_at:           now.toISOString(),
      });

    if (purchaseError) {
      console.error('[stripe-webhook] Failed to record purchase:', purchaseError.message);
    }
  }

  return new Response('OK', { status: 200 });
});
