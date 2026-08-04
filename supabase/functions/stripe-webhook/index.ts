// stripe-webhook — server-to-server Stripe event receiver.
//
// Security model:
//   • Raw body is read FIRST; Stripe-Signature is verified before any processing.
//   • Service-role key used for all DB operations (bypasses RLS safely server-side).
//   • Boost activation happens ONLY after payment_status === 'paid' is confirmed.
//   • Processing is idempotent — duplicate Stripe deliveries are detected and skipped.
//   • Refund handling matches the exact payment intent; a newer active boost is
//     never disturbed by a refund on an older purchase for the same event.
//   • No Stripe secrets, keys, full payment details, or PII are logged.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14?target=deno&no-check';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-04-10',
  httpClient: Stripe.createFetchHttpClient(),
});

serve(async (req: Request) => {
  // Stripe webhooks are server-to-server POST — no CORS preflight needed.
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  // ── 1. Read raw body BEFORE any JSON parsing ─────────────────────────────────
  //    Stripe signature verification requires the exact bytes Stripe sent.
  //    Any transformation (json(), text() after json(), etc.) will break the HMAC.
  const rawBody = await req.text();
  const sig         = req.headers.get('stripe-signature') ?? '';
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';

  if (!sig || !webhookSecret) {
    return new Response('Webhook configuration error', { status: 500 });
  }

  // ── 2. Verify Stripe-Signature against the unmodified raw body ───────────────
  let stripeEvent: Stripe.Event;
  try {
    stripeEvent = await stripe.webhooks.constructEventAsync(rawBody, sig, webhookSecret);
  } catch {
    // Signature mismatch — replay attack or misconfiguration. Return 400 so
    // Stripe does NOT retry (retrying would never succeed with an invalid sig).
    return new Response(JSON.stringify({ error: 'Webhook signature verification failed' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  // ── 3. Service-role admin client — all DB operations bypass RLS ──────────────
  //    This client must never be returned to or constructed by the mobile client.
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  try {

    // ────────────────────────────────────────────────────────────────────────────
    // checkout.session.completed — payment confirmed; activate boost.
    // ────────────────────────────────────────────────────────────────────────────
    if (stripeEvent.type === 'checkout.session.completed') {
      const session = stripeEvent.data.object as Stripe.Checkout.Session;

      // Only proceed when Stripe confirms the charge was actually captured.
      if (session.payment_status !== 'paid') {
        console.log('[stripe-webhook] checkout.session.completed: payment not yet captured — acknowledged');
        return new Response('OK', { status: 200 });
      }

      const meta = session.metadata ?? {};
      const { purchase_id, event_id, boost_type, promoter_id } = meta;

      // Required metadata missing — non-boost session or pre-update legacy session.
      // Acknowledge so Stripe stops retrying; no action needed.
      if (!purchase_id || !event_id || !boost_type || !promoter_id) {
        console.log('[stripe-webhook] checkout.session.completed: metadata incomplete — acknowledged without action');
        return new Response('OK', { status: 200 });
      }

      // ── Idempotency check ────────────────────────────────────────────────────
      //    Stripe may deliver the same event multiple times (at-least-once).
      //    If the purchase row is already 'completed', the boost was already
      //    activated on a previous delivery — return 200 immediately.
      const { data: existingPurchase } = await supabaseAdmin
        .from('boost_purchases')
        .select('id, status')
        .eq('id', purchase_id)
        .maybeSingle();

      if (existingPurchase?.status === 'completed') {
        console.log(`[stripe-webhook] duplicate delivery purchase=${purchase_id} — acknowledged`);
        return new Response('OK', { status: 200 });
      }

      const paymentIntent = typeof session.payment_intent === 'string'
        ? session.payment_intent : null;
      const customerId = typeof session.customer === 'string'
        ? session.customer : null;

      // ── Calculate boost expiry ──────────────────────────────────────────────
      const now = new Date();
      let boostExpiresAt: string | null = null;
      if (boost_type === 'three_day') {
        boostExpiresAt = new Date(now.getTime() + 72 * 60 * 60 * 1000).toISOString();
      } else if (boost_type === 'seven_day') {
        boostExpiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
      }
      // until_event_end: boostExpiresAt remains null — expiry is governed by event date.

      // ── Activate boost on the event record ─────────────────────────────────
      const { error: updateError } = await supabaseAdmin
        .from('events')
        .update({
          boosted:                true,
          boost_type,
          boost_status:           'active',
          boost_started_at:       now.toISOString(),
          boost_expires_at:       boostExpiresAt,
          boost_payment_intent:   paymentIntent,
          boost_checkout_session: session.id,
          boost_amount:           session.amount_total ?? 0,
          boost_currency:         session.currency ?? 'usd',
        })
        .eq('id', event_id);

      if (updateError) {
        // Return 500 — Stripe will retry, which is correct for a transient DB error.
        console.error(`[stripe-webhook] Failed to activate boost: ${updateError.message}`);
        return new Response('Internal Server Error', { status: 500 });
      }

      // ── Mark the purchase record 'completed' ────────────────────────────────
      //    Updates the pending row created by create-boost-checkout.
      const { error: purchaseError } = await supabaseAdmin
        .from('boost_purchases')
        .update({
          status:                'completed',
          stripe_payment_intent: paymentIntent,
          stripe_customer_id:    customerId,
          amount:                session.amount_total ?? 0,
          currency:              session.currency ?? 'usd',
          completed_at:          now.toISOString(),
        })
        .eq('id', purchase_id);

      if (purchaseError) {
        // Boost is active; purchase record failure is non-critical but must be logged
        // so it can be reconciled manually if needed.
        console.error(`[stripe-webhook] Purchase record update failed: ${purchaseError.message}`);
      }

      // Minimal log — purchase ID and event ID only; no keys or payment data.
      console.log(
        `[stripe-webhook] Boost activated: purchase=${purchase_id} event=${event_id} type=${boost_type} expires=${boostExpiresAt ?? 'with-event'}`
      );
    }

    // ────────────────────────────────────────────────────────────────────────────
    // charge.refunded — refund issued.
    // Rule: only expire the event's boost if the refunded purchase is the CURRENT
    // active session. A newer active boost must not be disturbed.
    // ────────────────────────────────────────────────────────────────────────────
    else if (stripeEvent.type === 'charge.refunded') {
      const charge = stripeEvent.data.object as Stripe.Charge;
      const paymentIntentId = typeof charge.payment_intent === 'string'
        ? charge.payment_intent : null;

      if (!paymentIntentId) {
        console.log('[stripe-webhook] charge.refunded: no payment_intent on charge — acknowledged');
        return new Response('OK', { status: 200 });
      }

      // Find the exact purchase record matching this payment intent.
      const { data: purchase } = await supabaseAdmin
        .from('boost_purchases')
        .select('id, event_id, status, stripe_checkout_session')
        .eq('stripe_payment_intent', paymentIntentId)
        .maybeSingle();

      if (!purchase) {
        console.log('[stripe-webhook] charge.refunded: no matching purchase record — acknowledged');
        return new Response('OK', { status: 200 });
      }

      // Idempotency: already processed this refund.
      if (purchase.status === 'refunded') {
        console.log(`[stripe-webhook] charge.refunded: purchase already refunded — acknowledged`);
        return new Response('OK', { status: 200 });
      }

      // Mark the purchase as refunded.
      await supabaseAdmin
        .from('boost_purchases')
        .update({ status: 'refunded' })
        .eq('id', purchase.id);

      // Check whether this refunded purchase's session matches the event's CURRENT
      // active boost session. If a newer purchase (different session) is now active,
      // leave the event's boost status completely untouched.
      const { data: eventRow } = await supabaseAdmin
        .from('events')
        .select('id, boost_checkout_session, boost_status')
        .eq('id', purchase.event_id)
        .maybeSingle();

      const isCurrentSession =
        eventRow?.boost_checkout_session === purchase.stripe_checkout_session &&
        eventRow?.boost_status === 'active';

      if (isCurrentSession) {
        await supabaseAdmin
          .from('events')
          .update({ boosted: false, boost_status: 'refunded' })
          .eq('id', purchase.event_id);
        console.log(`[stripe-webhook] Boost expired after refund: event=${purchase.event_id}`);
      } else {
        // Refund matched an older purchase; a newer active boost is in place — preserve it.
        console.log(`[stripe-webhook] Older purchase refunded — active boost preserved: event=${purchase.event_id}`);
      }
    }

    // All other Stripe event types: acknowledge silently.

  } catch {
    console.error(`[stripe-webhook] Unhandled error processing event type: ${stripeEvent.type}`);
    return new Response('Internal Server Error', { status: 500 });
  }

  return new Response('OK', { status: 200 });
});
