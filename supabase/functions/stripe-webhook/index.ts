// stripe-webhook — server-to-server Stripe event receiver.
//
// Security model:
//   • Raw body verified against Stripe-Signature BEFORE any processing.
//   • Service-role key for all DB operations (bypasses RLS safely).
//   • Idempotent — duplicate Stripe deliveries are detected and skipped.
//   • No Stripe secrets, keys, payment details, or PII are logged.
//
// Handled events:
//
//   BOOST (one-time payment):
//     checkout.session.completed  (mode=payment)  — activate boost
//     checkout.session.expired                    — release inventory + cancel pending ticket order
//     charge.refunded                              — expire boost if it's the active one
//
//   SUBSCRIPTION (recurring):
//     checkout.session.completed  (mode=subscription) — initial subscription activation
//     customer.subscription.updated                   — plan change / status change
//     customer.subscription.deleted                   — cancellation → downgrade to free
//     invoice.payment_succeeded   (billing_reason=subscription_cycle) — reset boost credits
//     invoice.payment_failed                          — mark past_due

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'npm:stripe@14';
import { sendPushToUserIds } from '../_shared/push.ts';
import { syncSubscriptionEntitlements, activateBoostEntitlement, PLAN_ENTITLEMENTS, type BoostType } from '../_shared/entitlements.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-04-10',
});

// Resolve plan name from a Stripe price ID (server-side only).
function getPlanFromPriceId(priceId: string): 'pro' | 'elite' | 'free' {
  const map: Record<string, 'pro' | 'elite'> = {
    [Deno.env.get('STRIPE_PRICE_PRO_MONTHLY')    ?? '__unset_pro_m__']:    'pro',
    [Deno.env.get('STRIPE_PRICE_PRO_YEARLY')     ?? '__unset_pro_y__']:    'pro',
    [Deno.env.get('STRIPE_PRICE_ELITE_MONTHLY')  ?? '__unset_elite_m__']:  'elite',
    [Deno.env.get('STRIPE_PRICE_ELITE_YEARLY')   ?? '__unset_elite_y__']:  'elite',
  };
  return map[priceId] ?? 'free';
}

function getBillingCycleFromPriceId(priceId: string): 'monthly' | 'yearly' {
  const yearlyPrices = new Set([
    Deno.env.get('STRIPE_PRICE_PRO_YEARLY')   ?? '',
    Deno.env.get('STRIPE_PRICE_ELITE_YEARLY') ?? '',
  ]);
  return yearlyPrices.has(priceId) ? 'yearly' : 'monthly';
}

// Thin Stripe-specific wrapper around the shared syncSubscriptionEntitlements.
async function syncStripeEntitlements(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
  plan: 'free' | 'pro' | 'elite',
  subscriptionStatus: string,
  stripeCustomerId: string | null,
  currentPeriodEnd: string | null,
  overrideRemainingBoosts?: number,
): Promise<void> {
  await syncSubscriptionEntitlements(supabaseAdmin, {
    userId,
    plan,
    subscriptionStatus,
    paymentProvider: 'stripe',
    currentPeriodEnd,
    stripeCustomerId,
    overrideRemainingBoosts,
  });
}

// Resolve user_id from subscription metadata or subscriptions table fallback.
async function resolveUserId(
  supabaseAdmin: ReturnType<typeof createClient>,
  subscription: Stripe.Subscription,
): Promise<string | null> {
  const fromMeta = subscription.metadata?.user_id;
  if (fromMeta) return fromMeta;

  // Fallback: look up from our subscriptions table
  const { data } = await supabaseAdmin
    .from('subscriptions')
    .select('user_id')
    .eq('stripe_subscription_id', subscription.id)
    .maybeSingle();
  return data?.user_id ?? null;
}

serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  // ── 1. Verify Stripe signature ──────────────────────────────────────────────
  const rawBody = await req.text();
  const sig = req.headers.get('stripe-signature') ?? '';
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';

  if (!sig || !webhookSecret) {
    return new Response('Webhook configuration error', { status: 500 });
  }

  let stripeEvent: Stripe.Event;
  try {
    stripeEvent = await stripe.webhooks.constructEventAsync(
      rawBody, sig, webhookSecret,
      undefined,
      Stripe.createSubtleCryptoProvider(),
    );
  } catch {
    return new Response(JSON.stringify({ error: 'Webhook signature verification failed' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  // ── 2. Service-role client ──────────────────────────────────────────────────
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  try {

    // ══════════════════════════════════════════════════════════════════════════
    // checkout.session.completed
    // Handles: boost payments (mode=payment, no checkout_type)
    //          new subscriptions (mode=subscription)
    //          ticket purchases (mode=payment, metadata.checkout_type='ticket')
    // ══════════════════════════════════════════════════════════════════════════
    if (stripeEvent.type === 'checkout.session.completed') {
      const session = stripeEvent.data.object as Stripe.Checkout.Session;

      // ── Ticket payment mode ────────────────────────────────────────────────
      if (session.metadata?.checkout_type === 'ticket') {
        const orderId = session.metadata?.order_id;
        const buyerId = session.metadata?.buyer_id;
        const eventId = session.metadata?.event_id;

        if (!orderId) {
          console.warn('[stripe-webhook] ticket checkout missing order_id in metadata');
          return new Response('OK', { status: 200 });
        }

        // Idempotency: check ticket_payment_events table
        const webhookEventId = stripeEvent.id;
        const { data: existingEvent } = await supabaseAdmin
          .from('ticket_payment_events')
          .select('id')
          .eq('webhook_event_id', webhookEventId)
          .maybeSingle();

        if (existingEvent) {
          console.log(`[stripe-webhook] Duplicate ticket webhook ${webhookEventId} — acknowledged`);
          return new Response('OK', { status: 200 });
        }

        // Record the webhook event for idempotency
        await supabaseAdmin.from('ticket_payment_events').insert({
          order_id: orderId,
          event_id: eventId ?? null,
          provider: 'stripe',
          webhook_event_type: stripeEvent.type,
          webhook_event_id: webhookEventId,
          payment_intent_id: typeof session.payment_intent === 'string' ? session.payment_intent : null,
          amount_minor: session.amount_total ?? 0,
          currency: session.currency ?? 'usd',
          status: session.payment_status ?? 'paid',
          raw_payload: null, // don't store full payload
        });

        if (session.payment_status !== 'paid') {
          console.log(`[stripe-webhook] Ticket checkout not paid (${session.payment_status}) — order=${orderId}`);
          // Mark order as failed
          await supabaseAdmin
            .from('ticket_orders')
            .update({ payment_status: 'failed' })
            .eq('id', orderId)
            .eq('payment_status', 'pending');
          // Release reservations
          await supabaseAdmin
            .from('ticket_inventory_reservations')
            .update({ status: 'released' })
            .eq('order_id', orderId)
            .eq('status', 'active');
          return new Response('OK', { status: 200 });
        }

        // Finalize order: atomic RPC (verifies amount, currency, reservations, creates tickets)
        const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : '';
        const { data: finalizeResult, error: finalizeErr } = await supabaseAdmin
          .rpc('finalize_ticket_order', {
            p_order_id: orderId,
            p_payment_reference: paymentIntentId,
            p_provider_amount_minor: session.amount_total ?? 0,
            // Normalize to uppercase so it matches the canonical DB value ('USD'/'JMD').
            // Stripe always returns lowercase currency strings.
            p_provider_currency: (session.currency ?? 'usd').toUpperCase(),
          });

        if (finalizeErr || !(finalizeResult as Record<string, unknown>)?.ok) {
          const code = (finalizeResult as Record<string, unknown>)?.code ?? 'unknown';
          const msg = (finalizeResult as Record<string, unknown>)?.error ?? finalizeErr?.message ?? 'Finalization failed';
          console.error(`[stripe-webhook] Ticket finalization failed: order=${orderId} code=${code} msg=${String(msg).slice(0,200)}`);
          // Don't return 500 — Stripe will retry. For idempotency table already prevents double-processing.
          return new Response('OK', { status: 200 });
        }

        const ticketsIssued = (finalizeResult as Record<string, unknown>)?.tickets_issued as number ?? 0;
        const orderNumber = (finalizeResult as Record<string, unknown>)?.order_number as string ?? '';
        console.log(`[stripe-webhook] Ticket order finalized: order=${orderId} num=${orderNumber} tickets=${ticketsIssued} buyer=${buyerId?.slice(0,8)}`);

        // Send customer notification
        if (buyerId && ticketsIssued > 0) {
          const { error: notifErr } = await supabaseAdmin
            .from('notifications')
            .insert({
              user_id: buyerId,
              type: 'ticket_purchase_confirmed',
              title: 'Tickets Confirmed!',
              body: `Your ${ticketsIssued} ticket${ticketsIssued !== 1 ? 's' : ''} for order #${orderNumber} are ready. Open My Tickets to view your QR code.`,
              event_id: eventId ?? null,
              read: false,
            });
          if (notifErr) {
            console.warn('[stripe-webhook] ticket notification insert failed:', notifErr.message);
          }
        }

        return new Response('OK', { status: 200 });
      }

      // ── Subscription mode ──────────────────────────────────────────────────
      if (session.mode === 'subscription') {
        const userId = session.metadata?.user_id;
        if (!userId) {
          console.warn('[stripe-webhook] subscription checkout missing user_id in metadata');
          return new Response('OK', { status: 200 });
        }

        const stripeSubId = typeof session.subscription === 'string'
          ? session.subscription : null;
        const customerId = typeof session.customer === 'string'
          ? session.customer : null;

        if (!stripeSubId) {
          console.warn('[stripe-webhook] subscription checkout missing subscription ID');
          return new Response('OK', { status: 200 });
        }

        // Fetch full subscription details from Stripe for accurate period/price data
        const stripeSub = await stripe.subscriptions.retrieve(stripeSubId);
        const priceId = (stripeSub.items.data[0]?.price?.id ?? '') as string;
        const plan = getPlanFromPriceId(priceId);
        const billingCycle = getBillingCycleFromPriceId(priceId);
        const status = stripeSub.status;
        const periodStart = new Date((stripeSub.current_period_start as number) * 1000).toISOString();
        const periodEnd = new Date((stripeSub.current_period_end as number) * 1000).toISOString();
        const cancelAtPeriodEnd = stripeSub.cancel_at_period_end;
        const entitlements = PLAN_ENTITLEMENTS[plan] ?? PLAN_ENTITLEMENTS.free;

        // Upsert subscriptions table
        await supabaseAdmin.from('subscriptions').upsert(
          {
            user_id:                 userId,
            stripe_customer_id:      customerId,
            stripe_subscription_id:  stripeSubId,
            stripe_price_id:         priceId,
            plan,
            billing_cycle:           billingCycle,
            status,
            current_period_start:    periodStart,
            current_period_end:      periodEnd,
            cancel_at_period_end:    cancelAtPeriodEnd,
          },
          { onConflict: 'stripe_subscription_id' }
        );

        // Apply entitlements — new subscriber gets full boost allowance immediately
        await syncStripeEntitlements(
          supabaseAdmin, userId, plan, status, customerId, periodEnd,
          entitlements.monthly_boost_allowance
        );

        console.log(`[stripe-webhook] Subscription activated: user=${userId.slice(0,8)} plan=${plan} cycle=${billingCycle} status=${status}`);
        return new Response('OK', { status: 200 });
      }

      // ── Boost payment mode ─────────────────────────────────────────────────
      if (session.payment_status !== 'paid') {
        console.log('[stripe-webhook] checkout.session.completed: payment not captured — acknowledged');
        return new Response('OK', { status: 200 });
      }

      const meta = session.metadata ?? {};
      const { purchase_id, event_id, boost_type, promoter_id } = meta;

      if (!purchase_id || !event_id || !boost_type || !promoter_id) {
        console.log('[stripe-webhook] boost checkout: metadata incomplete — acknowledged');
        return new Response('OK', { status: 200 });
      }

      // Idempotency
      const { data: existingPurchase } = await supabaseAdmin
        .from('boost_purchases')
        .select('id, status')
        .eq('id', purchase_id)
        .maybeSingle();

      if (existingPurchase?.status === 'completed') {
        console.log(`[stripe-webhook] duplicate boost delivery purchase=${purchase_id} — acknowledged`);
        return new Response('OK', { status: 200 });
      }

      const paymentIntent = typeof session.payment_intent === 'string' ? session.payment_intent : null;
      const boostCustomerId = typeof session.customer === 'string' ? session.customer : null;

      // ISSUE-030 FIX: Use shared activateBoostEntitlement for consistent
      // boost activation logic across Stripe, Apple, and Google providers.
      const { ok: boostOk, error: boostError } = await activateBoostEntitlement(supabaseAdmin, {
        eventId:         event_id,
        promoterId:      promoter_id,
        boostType:       boost_type as BoostType,
        paymentProvider: 'stripe',
        purchaseId:      purchase_id,
        checkoutSession: session.id,
        paymentIntent:   paymentIntent ?? undefined,
        stripeCustomerId: boostCustomerId ?? undefined,
        amount:          session.amount_total ?? 0,
        currency:        session.currency ?? 'usd',
      });

      if (!boostOk) {
        console.error(`[stripe-webhook] Boost activate failed: ${boostError}`);
        return new Response('Internal Server Error', { status: 500 });
      }

      console.log(`[stripe-webhook] Boost activated: purchase=${purchase_id} event=${event_id} type=${boost_type}`);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // customer.subscription.updated — plan change, cancellation toggle, status change
    // ══════════════════════════════════════════════════════════════════════════
    else if (stripeEvent.type === 'customer.subscription.updated') {
      const subscription = stripeEvent.data.object as Stripe.Subscription;
      const userId = await resolveUserId(supabaseAdmin, subscription);
      if (!userId) {
        console.warn('[stripe-webhook] subscription.updated: could not resolve user_id');
        return new Response('OK', { status: 200 });
      }

      const priceId = (subscription.items.data[0]?.price?.id ?? '') as string;
      const plan = getPlanFromPriceId(priceId);
      const billingCycle = getBillingCycleFromPriceId(priceId);
      const status = subscription.status;
      const customerId = typeof subscription.customer === 'string' ? subscription.customer : null;
      const periodEnd = new Date((subscription.current_period_end as number) * 1000).toISOString();
      const periodStart = new Date((subscription.current_period_start as number) * 1000).toISOString();
      const cancelAtPeriodEnd = subscription.cancel_at_period_end;

      // Upsert subscriptions table
      await supabaseAdmin.from('subscriptions').upsert(
        {
          user_id:                 userId,
          stripe_customer_id:      customerId,
          stripe_subscription_id:  subscription.id,
          stripe_price_id:         priceId,
          plan,
          billing_cycle:           billingCycle,
          status,
          current_period_start:    periodStart,
          current_period_end:      periodEnd,
          cancel_at_period_end:    cancelAtPeriodEnd,
        },
        { onConflict: 'stripe_subscription_id' }
      );

      await syncStripeEntitlements(supabaseAdmin, userId, plan, status, customerId, periodEnd);
      console.log(`[stripe-webhook] Subscription updated: user=${userId.slice(0,8)} plan=${plan} status=${status} cancel_at_end=${cancelAtPeriodEnd}`);

      // In-app notification when cancel_at_period_end just flipped to true
      // (user or app cancelled, subscription will end at period boundary).
      // previous_attributes contains only the fields that changed in this event.
      const prevCancelAtEnd = (stripeEvent.data as any).previous_attributes?.cancel_at_period_end;
      if (cancelAtPeriodEnd === true && prevCancelAtEnd === false) {
        const periodEndFmt = new Date((subscription.current_period_end as number) * 1000)
          .toLocaleDateString('en-JM', { month: 'short', day: 'numeric', year: 'numeric' });
        const { error: cancelNotifErr } = await supabaseAdmin
          .from('notifications')
          .insert({
            user_id: userId,
            type:    'subscription_cancellation_scheduled',
            title:   'Subscription Set to Cancel',
            body:    `Your subscription will end on ${periodEndFmt}. Reactivate any time before then to keep your promoter access.`,
            read:    false,
          });
        if (cancelNotifErr) {
          console.warn('[stripe-webhook] cancellation_scheduled notification insert failed:', cancelNotifErr.message);
        } else {
          console.log(`[stripe-webhook] Cancellation scheduled notification sent to user ${userId.slice(0,8)} (ends ${periodEndFmt})`);
          // Push notification — server_persisted=true because DB row already exists
          void sendPushToUserIds(
            [userId],
            'Subscription Set to Cancel',
            `Your subscription will end on ${periodEndFmt}. Reactivate any time before then to keep access.`,
            undefined,
            'subscription_cancellation_scheduled',
            supabaseAdmin,
            true,
          ).catch(() => {});
        }
      }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // customer.subscription.deleted — subscription ended; downgrade to free
    // ══════════════════════════════════════════════════════════════════════════
    else if (stripeEvent.type === 'customer.subscription.deleted') {
      const subscription = stripeEvent.data.object as Stripe.Subscription;
      const userId = await resolveUserId(supabaseAdmin, subscription);
      if (!userId) {
        console.warn('[stripe-webhook] subscription.deleted: could not resolve user_id');
        return new Response('OK', { status: 200 });
      }

      const customerId = typeof subscription.customer === 'string' ? subscription.customer : null;

      // Update subscriptions table to canceled
      await supabaseAdmin
        .from('subscriptions')
        .update({ status: 'canceled' })
        .eq('stripe_subscription_id', subscription.id);

      // Downgrade entitlements to free
      await syncStripeEntitlements(supabaseAdmin, userId, 'free', 'canceled', customerId, null, 0);
      console.log(`[stripe-webhook] Subscription deleted — user ${userId.slice(0,8)} downgraded to free`);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // invoice.payment_succeeded — renewal: reset boost credits for the new period
    // ══════════════════════════════════════════════════════════════════════════
    else if (stripeEvent.type === 'invoice.payment_succeeded') {
      const invoice = stripeEvent.data.object as Stripe.Invoice;

      // Only reset on billing cycle renewals, not the initial payment
      // (initial payment handled in checkout.session.completed above)
      if ((invoice as any).billing_reason !== 'subscription_cycle') {
        return new Response('OK', { status: 200 });
      }

      const stripeSubId = typeof (invoice as any).subscription === 'string'
        ? (invoice as any).subscription : null;
      if (!stripeSubId) return new Response('OK', { status: 200 });

      // Look up subscription to get user and plan
      // ISSUE-015 FIX: Removed non-existent subscriptions.monthly_boost_allowance column.
      // Boost allowance is fetched from user_profiles.monthly_boost_allowance below.
      const { data: subRow } = await supabaseAdmin
        .from('subscriptions')
        .select('user_id, plan')
        .eq('stripe_subscription_id', stripeSubId)
        .maybeSingle();

      if (!subRow?.user_id) return new Response('OK', { status: 200 });

      // Get current boost allowance from user_profiles (source of truth for allowance)
      const { data: profileRow } = await supabaseAdmin
        .from('user_profiles')
        .select('monthly_boost_allowance')
        .eq('id', subRow.user_id)
        .single();

      const allowance = profileRow?.monthly_boost_allowance ?? 0;

      // Reset remaining_boosts to monthly allowance for the new billing period
      await supabaseAdmin
        .from('user_profiles')
        .update({ remaining_boosts: allowance })
        .eq('id', subRow.user_id);

      // Update period_end in subscriptions table
      const periodEnd = (invoice as any).period_end
        ? new Date(((invoice as any).period_end as number) * 1000).toISOString()
        : null;
      if (periodEnd) {
        await supabaseAdmin
          .from('subscriptions')
          .update({ current_period_end: periodEnd, status: 'active' })
          .eq('stripe_subscription_id', stripeSubId);
        await supabaseAdmin
          .from('user_profiles')
          .update({ current_period_end: periodEnd, subscription_status: 'active' })
          .eq('id', subRow.user_id);
      }

      console.log(`[stripe-webhook] Billing cycle renewal — user ${subRow.user_id.slice(0,8)} boosts reset to ${allowance}`);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // invoice.payment_failed — update status; Stripe will retry, entitlements
    // are not revoked immediately (Stripe has grace period retry logic).
    // ══════════════════════════════════════════════════════════════════════════
    else if (stripeEvent.type === 'invoice.payment_failed') {
      const invoice = stripeEvent.data.object as Stripe.Invoice;
      const stripeSubId = typeof (invoice as any).subscription === 'string'
        ? (invoice as any).subscription : null;
      if (!stripeSubId) return new Response('OK', { status: 200 });

      const { data: subRow } = await supabaseAdmin
        .from('subscriptions')
        .select('user_id')
        .eq('stripe_subscription_id', stripeSubId)
        .maybeSingle();

      if (subRow?.user_id) {
        await supabaseAdmin
          .from('subscriptions')
          .update({ status: 'past_due' })
          .eq('stripe_subscription_id', stripeSubId);

        await supabaseAdmin
          .from('user_profiles')
          .update({ subscription_status: 'past_due' })
          .eq('id', subRow.user_id);

        console.log(`[stripe-webhook] Payment failed — user ${subRow.user_id.slice(0,8)} marked past_due`);

        // In-app notification: payment failure — critical, always send
        const { error: paymentNotifErr } = await supabaseAdmin
          .from('notifications')
          .insert({
            user_id: subRow.user_id,
            type:    'payment_failed',
            title:   'Payment Failed',
            body:    'Your subscription payment could not be processed. Please update your payment method to keep your promoter access.',
            read:    false,
          });
        if (paymentNotifErr) {
          console.warn('[stripe-webhook] payment_failed notification insert failed:', paymentNotifErr.message);
        } else {
          console.log(`[stripe-webhook] payment_failed in-app notification sent to user ${subRow.user_id.slice(0,8)}`);
          // Push notification — server_persisted=true because DB row already exists
          void sendPushToUserIds(
            [subRow.user_id],
            'Payment Failed',
            'Your subscription payment could not be processed. Please update your payment method.',
            undefined,
            'payment_failed',
            supabaseAdmin,
            true,
          ).catch(() => {});
        }
      }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // payment_intent.payment_failed — handle failed ticket payments
    // ══════════════════════════════════════════════════════════════════════════
    else if (stripeEvent.type === 'payment_intent.payment_failed') {
      const pi = stripeEvent.data.object as Stripe.PaymentIntent;
      // Check if this PaymentIntent belongs to a ticket order
      const { data: orderRow } = await supabaseAdmin
        .from('ticket_orders')
        .select('id, buyer_id, event_id')
        .eq('payment_reference', pi.id)
        .eq('payment_status', 'pending')
        .maybeSingle();

      if (orderRow) {
        // Mark order failed and release reservations
        await supabaseAdmin
          .from('ticket_orders')
          .update({ payment_status: 'failed' })
          .eq('id', orderRow.id);
        await supabaseAdmin
          .from('ticket_inventory_reservations')
          .update({ status: 'released' })
          .eq('order_id', orderRow.id)
          .eq('status', 'active');
        console.log(`[stripe-webhook] Ticket payment failed: order=${orderRow.id}`);
      }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // payment_intent.canceled — cancel pending ticket orders
    // ══════════════════════════════════════════════════════════════════════════
    else if (stripeEvent.type === 'payment_intent.canceled') {
      const pi = stripeEvent.data.object as Stripe.PaymentIntent;
      const { data: orderRow } = await supabaseAdmin
        .from('ticket_orders')
        .select('id')
        .eq('payment_reference', pi.id)
        .eq('payment_status', 'pending')
        .maybeSingle();

      if (orderRow) {
        await supabaseAdmin
          .from('ticket_orders')
          .update({ payment_status: 'failed', voided_at: new Date().toISOString() })
          .eq('id', orderRow.id);
        await supabaseAdmin
          .from('ticket_inventory_reservations')
          .update({ status: 'released' })
          .eq('order_id', orderRow.id)
          .eq('status', 'active');
        console.log(`[stripe-webhook] Ticket PaymentIntent canceled: order=${orderRow.id}`);
      }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // charge.refunded — expire boost if it matches the active checkout session
    // ══════════════════════════════════════════════════════════════════════════
    else if (stripeEvent.type === 'charge.refunded') {
      const charge = stripeEvent.data.object as Stripe.Charge;
      const paymentIntentId = typeof charge.payment_intent === 'string'
        ? charge.payment_intent : null;

      if (!paymentIntentId) return new Response('OK', { status: 200 });

      const { data: purchase } = await supabaseAdmin
        .from('boost_purchases')
        .select('id, event_id, status, stripe_checkout_session')
        .eq('stripe_payment_intent', paymentIntentId)
        .maybeSingle();

      if (!purchase) return new Response('OK', { status: 200 });
      if (purchase.status === 'refunded') return new Response('OK', { status: 200 });

      await supabaseAdmin
        .from('boost_purchases')
        .update({ status: 'refunded' })
        .eq('id', purchase.id);

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
        console.log(`[stripe-webhook] Older purchase refunded — active boost preserved: event=${purchase.event_id}`);
      }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // charge.dispute.created — record chargeback/dispute, place hold if needed
    // ══════════════════════════════════════════════════════════════════════════
    else if (stripeEvent.type === 'charge.dispute.created') {
      const dispute = stripeEvent.data.object as Stripe.Dispute;
      const chargeId = typeof dispute.charge === 'string' ? dispute.charge : null;
      if (!chargeId) return new Response('OK', { status: 200 });

      // Find the associated ticket order via payment_reference (payment intent ID)
      // Stripe dispute.payment_intent is the PI linked to the charge
      const paymentIntentId = typeof dispute.payment_intent === 'string' ? dispute.payment_intent : null;

      // Idempotency: check if dispute already recorded
      const { data: existingDispute } = await supabaseAdmin
        .from('payment_disputes')
        .select('id')
        .eq('provider_dispute_id', dispute.id)
        .maybeSingle();

      if (existingDispute) {
        console.log(`[stripe-webhook] Duplicate dispute event ${dispute.id} — acknowledged`);
        return new Response('OK', { status: 200 });
      }

      // Find the ticket order
      let orderRow: Record<string, unknown> | null = null;
      if (paymentIntentId) {
        const { data } = await supabaseAdmin
          .from('ticket_orders')
          .select('id, event_id, buyer_id')
          .eq('payment_reference', paymentIntentId)
          .maybeSingle();
        orderRow = data;
      }

      if (!orderRow) {
        console.log(`[stripe-webhook] Dispute ${dispute.id} — no matching ticket order found`);
        return new Response('OK', { status: 200 });
      }

      // Get event promoter
      const { data: eventRow } = await supabaseAdmin
        .from('events')
        .select('id, promoter_id')
        .eq('id', orderRow.event_id as string)
        .maybeSingle();

      // Record the dispute
      const evidenceDue = dispute.evidence_details?.due_by
        ? new Date((dispute.evidence_details.due_by as number) * 1000).toISOString()
        : null;

      await supabaseAdmin.from('payment_disputes').insert({
        order_id: orderRow.id,
        event_id: orderRow.event_id ?? null,
        promoter_id: eventRow?.promoter_id ?? null,
        provider: 'stripe',
        provider_dispute_id: dispute.id,
        amount_minor: dispute.amount,
        currency: dispute.currency,
        status: 'open',
        reason: dispute.reason ?? null,
        evidence_due_at: evidenceDue,
        financial_liability: dispute.amount,
        metadata: { charge_id: chargeId, payment_intent: paymentIntentId },
      });

      // Create promoter liability record for the chargeback amount
      if (eventRow?.promoter_id) {
        await supabaseAdmin.from('promoter_liabilities').insert({
          promoter_id: eventRow.promoter_id,
          event_id: orderRow.event_id ?? null,
          order_id: orderRow.id,
          currency: dispute.currency,
          amount_minor: dispute.amount,
          liability_type: 'chargeback_cost',
          status: 'open',
          description: `Stripe chargeback: dispute ${dispute.id}, reason: ${dispute.reason ?? 'unknown'}`,
          created_by: null,
        });

        // Notify promoter
        await supabaseAdmin.from('notifications').insert({
          user_id: eventRow.promoter_id,
          type: 'payment_dispute',
          title: 'Payment Dispute Filed',
          body: `A chargeback dispute has been filed for an order on your event. Evidence due by: ${evidenceDue ? new Date(evidenceDue).toLocaleDateString() : 'check Stripe dashboard'}. Your payout balance may be affected.`,
          event_id: orderRow.event_id ?? null,
          read: false,
        });
      }

      console.log(`[stripe-webhook] Dispute recorded: ${dispute.id} amount=${dispute.amount} reason=${dispute.reason}`);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // charge.dispute.updated — sync dispute status changes
    // ══════════════════════════════════════════════════════════════════════════
    else if (stripeEvent.type === 'charge.dispute.updated') {
      const dispute = stripeEvent.data.object as Stripe.Dispute;
      const statusMap: Record<string, string> = {
        needs_response: 'open',
        under_review: 'under_review',
        charge_refunded: 'reversed',
        won: 'won',
        lost: 'lost',
        warning_needs_response: 'open',
        warning_under_review: 'under_review',
        warning_closed: 'accepted',
      };
      const newStatus = statusMap[dispute.status] ?? dispute.status;
      const isResolved = ['won','lost','reversed','accepted'].includes(newStatus);

      await supabaseAdmin
        .from('payment_disputes')
        .update({ status: newStatus, resolved_at: isResolved ? new Date().toISOString() : null })
        .eq('provider_dispute_id', dispute.id);

      // If promoter won, waive the associated chargeback liability.
      // Look up our dispute record to get the order_id (promoter_liabilities has
      // no metadata column — match by order_id + liability_type instead).
      if (newStatus === 'won') {
        const { data: disputeRow } = await supabaseAdmin
          .from('payment_disputes')
          .select('order_id')
          .eq('provider_dispute_id', dispute.id)
          .maybeSingle();

        if (disputeRow?.order_id) {
          await supabaseAdmin
            .from('promoter_liabilities')
            .update({ status: 'waived', waive_reason: 'Dispute won — chargeback reversed by provider' })
            .eq('order_id', disputeRow.order_id)
            .eq('liability_type', 'chargeback_cost')
            .in('status', ['open', 'partially_recovered']);
        }
      }
      console.log(`[stripe-webhook] Dispute updated: ${dispute.id} status=${newStatus}`);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // checkout.session.expired — Stripe session timed out without payment.
    // Release inventory reservations and mark the pending order as failed.
    // This is the primary cleanup path for abandoned ticket checkouts.
    // Non-ticket sessions (boost, subscription) have no pending order — safe to
    // attempt the cleanup query; it will simply match 0 rows.
    // ══════════════════════════════════════════════════════════════════════════
    else if (stripeEvent.type === 'checkout.session.expired') {
      const session = stripeEvent.data.object as Stripe.Checkout.Session;
      const orderId = session.metadata?.order_id;

      if (orderId) {
        // Release any active inventory reservations for this order
        const { error: releaseErr } = await supabaseAdmin
          .from('ticket_inventory_reservations')
          .update({ status: 'released' })
          .eq('order_id', orderId)
          .eq('status', 'active');

        if (releaseErr) {
          console.warn(`[stripe-webhook] session.expired: reservation release failed for order=${orderId}:`, releaseErr.message);
        }

        // Mark the pending order as failed — do NOT touch paid/refunded orders
        const { error: orderErr } = await supabaseAdmin
          .from('ticket_orders')
          .update({ payment_status: 'failed' })
          .eq('id', orderId)
          .eq('payment_status', 'pending');

        if (orderErr) {
          console.warn(`[stripe-webhook] session.expired: order update failed for order=${orderId}:`, orderErr.message);
        }

        console.log(`[stripe-webhook] Checkout session expired — order=${orderId} marked failed, reservations released`);
      } else {
        // Non-ticket session (boost/subscription) — no pending order to clean up
        console.log(`[stripe-webhook] Checkout session expired (no ticket order): session=${session.id}`);
      }
    }

    // All other event types: acknowledge silently.

  } catch (err) {
    console.error(`[stripe-webhook] Error processing ${stripeEvent.type}:`, String(err).slice(0, 200));
    return new Response('Internal Server Error', { status: 500 });
  }

  return new Response('OK', { status: 200 });
});
