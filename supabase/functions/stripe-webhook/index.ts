// stripe-webhook — server-to-server Stripe event receiver.
//
// Security model:
//   • Raw body verified against Stripe-Signature BEFORE any processing.
//   • Service-role key for all DB operations (bypasses RLS safely).
//   • Idempotent — duplicate Stripe deliveries are detected and skipped.
//   • No Stripe secrets, keys, payment details, or PII are logged.
//
// TICKET WEBHOOK IDEMPOTENCY MODEL:
//   The ticket_payment_events row is inserted AFTER successful finalization
//   (not before). This allows Stripe to safely retry a webhook that previously
//   failed due to a transient backend error (e.g. constraint violation) without
//   permanently blocking the retry path. finalize_ticket_order is idempotent —
//   if the order is already paid it returns ok=false safely, at which point we
//   insert the idempotency record to suppress future retries.
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

        // Idempotency: check ticket_payment_events table BEFORE doing any work.
        // NOTE: We only INSERT the idempotency record AFTER finalization succeeds
        // (or after confirming the order is already paid). This ensures a transient
        // backend failure (e.g. DB constraint violation) does NOT permanently block
        // Stripe from retrying webhook delivery.
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

        if (session.payment_status !== 'paid') {
          console.log(`[stripe-webhook] Ticket checkout not paid (${session.payment_status}) — order=${orderId}`);
          // Record non-paid events immediately so retries are suppressed
          await supabaseAdmin.from('ticket_payment_events').insert({
            order_id: orderId,
            event_id: eventId ?? null,
            provider: 'stripe',
            webhook_event_type: stripeEvent.type,
            webhook_event_id: webhookEventId,
            payment_intent_id: typeof session.payment_intent === 'string' ? session.payment_intent : null,
            amount_minor: session.amount_total ?? 0,
            currency: session.currency ?? 'usd',
            status: session.payment_status ?? 'unpaid',
            raw_payload: null,
          });
          await supabaseAdmin
            .from('ticket_orders')
            .update({ payment_status: 'failed' })
            .eq('id', orderId)
            .eq('payment_status', 'pending');
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
            // Normalize to uppercase — canonical DB format is 'USD'/'JMD'.
            // Stripe always returns lowercase currency strings.
            p_provider_currency: (session.currency ?? 'usd').toUpperCase(),
          });

        if (finalizeErr) {
          // Genuine DB/RPC error — do NOT record idempotency so Stripe can retry
          const msg = finalizeErr.message ?? 'Finalization failed';
          console.error(`[stripe-webhook] Ticket finalization DB error: order=${orderId} msg=${String(msg).slice(0,200)} — NOT recording event, Stripe may retry`);
          return new Response('Internal Server Error', { status: 500 });
        }

        const finalizeOk = (finalizeResult as Record<string, unknown>)?.ok as boolean;
        const finalizeCode = (finalizeResult as Record<string, unknown>)?.code as string ?? '';

        if (!finalizeOk) {
          const msg = (finalizeResult as Record<string, unknown>)?.error ?? 'Finalization returned ok=false';
          if (finalizeCode === 'already_paid' || finalizeCode === 'duplicate') {
            // Order was already finalized (e.g. by the payment_intent.succeeded path).
            // Record idempotency now to suppress future retries of this webhook event.
            await supabaseAdmin.from('ticket_payment_events').insert({
              order_id: orderId,
              event_id: eventId ?? null,
              provider: 'stripe',
              webhook_event_type: stripeEvent.type,
              webhook_event_id: webhookEventId,
              payment_intent_id: paymentIntentId || null,
              amount_minor: session.amount_total ?? 0,
              currency: session.currency ?? 'usd',
              status: 'already_paid',
              raw_payload: null,
            }).then(() => {}, () => {});
            console.log(`[stripe-webhook] Order already paid: order=${orderId} — idempotency recorded`);
          } else {
            // Business logic rejection (e.g. amount mismatch, currency mismatch).
            // Record to suppress retries — these won't self-heal on retry.
            await supabaseAdmin.from('ticket_payment_events').insert({
              order_id: orderId,
              event_id: eventId ?? null,
              provider: 'stripe',
              webhook_event_type: stripeEvent.type,
              webhook_event_id: webhookEventId,
              payment_intent_id: paymentIntentId || null,
              amount_minor: session.amount_total ?? 0,
              currency: session.currency ?? 'usd',
              status: 'finalize_rejected',
              raw_payload: null,
            }).then(() => {}, () => {});
            console.error(`[stripe-webhook] Ticket finalization rejected: order=${orderId} code=${finalizeCode} msg=${String(msg).slice(0,200)}`);
          }
          return new Response('OK', { status: 200 });
        }

        // ── Finalization succeeded — record idempotency NOW ─────────────────
        await supabaseAdmin.from('ticket_payment_events').insert({
          order_id: orderId,
          event_id: eventId ?? null,
          provider: 'stripe',
          webhook_event_type: stripeEvent.type,
          webhook_event_id: webhookEventId,
          payment_intent_id: paymentIntentId || null,
          amount_minor: session.amount_total ?? 0,
          currency: session.currency ?? 'usd',
          status: 'paid',
          raw_payload: null,
        }).then(() => {}, () => {}); // non-fatal if this fails — duplicate key on retry is harmless

        const ticketsIssued = (finalizeResult as Record<string, unknown>)?.tickets_issued as number ?? 0;
        const orderNumber = (finalizeResult as Record<string, unknown>)?.order_number as string ?? '';
        console.log(`[stripe-webhook] Ticket order finalized: order=${orderId} num=${orderNumber} tickets=${ticketsIssued} buyer=${buyerId?.slice(0,8)}`);

        // Post-fulfillment side-effects — all gated on ticketsIssued > 0 so a
        // second webhook hitting an already-finalized order (ok=false) never
        // sends duplicate notifications (finalize returns ok=false → we return early above).
        if (buyerId && ticketsIssued > 0) {
          const notifBody = `Your ${ticketsIssued} ticket${ticketsIssued !== 1 ? 's' : ''} for order #${orderNumber} are ready. Open My Tickets to view your QR code.`;

          // 1. In-app notification
          const { error: notifErr } = await supabaseAdmin
            .from('notifications')
            .insert({
              user_id: buyerId,
              type: 'ticket_purchase_confirmed',
              title: 'Tickets Confirmed!',
              body: notifBody,
              event_id: eventId ?? null,
              read: false,
            });
          if (notifErr) {
            console.warn('[stripe-webhook] ticket notification insert failed:', notifErr.message);
          }

          // 2. Push notification (fire-and-forget)
          void sendTicketConfirmedPush(supabaseAdmin, buyerId, ticketsIssued, orderNumber, eventId).catch(() => {});

          // 3. Confirmation email (idempotent via notifications sentinel, fire-and-forget)
          void sendTicketConfirmedEmail(supabaseAdmin, orderId, buyerId, orderNumber, ticketsIssued, eventId).catch(() => {});

          // 4. Low-inventory check for the promoter (threshold-crossing, fire-and-forget)
          if (eventId) {
            void checkAndNotifyLowInventory(supabaseAdmin, eventId).catch(() => {});
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

        const stripeSub = await stripe.subscriptions.retrieve(stripeSubId);
        const priceId = (stripeSub.items.data[0]?.price?.id ?? '') as string;
        const plan = getPlanFromPriceId(priceId);
        const billingCycle = getBillingCycleFromPriceId(priceId);
        const status = stripeSub.status;
        const periodStart = new Date((stripeSub.current_period_start as number) * 1000).toISOString();
        const periodEnd = new Date((stripeSub.current_period_end as number) * 1000).toISOString();
        const cancelAtPeriodEnd = stripeSub.cancel_at_period_end;
        const entitlements = PLAN_ENTITLEMENTS[plan] ?? PLAN_ENTITLEMENTS.free;

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
    // customer.subscription.updated
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
    // customer.subscription.deleted
    // ══════════════════════════════════════════════════════════════════════════
    else if (stripeEvent.type === 'customer.subscription.deleted') {
      const subscription = stripeEvent.data.object as Stripe.Subscription;
      const userId = await resolveUserId(supabaseAdmin, subscription);
      if (!userId) {
        console.warn('[stripe-webhook] subscription.deleted: could not resolve user_id');
        return new Response('OK', { status: 200 });
      }

      const customerId = typeof subscription.customer === 'string' ? subscription.customer : null;

      await supabaseAdmin
        .from('subscriptions')
        .update({ status: 'canceled' })
        .eq('stripe_subscription_id', subscription.id);

      await syncStripeEntitlements(supabaseAdmin, userId, 'free', 'canceled', customerId, null, 0);
      console.log(`[stripe-webhook] Subscription deleted — user ${userId.slice(0,8)} downgraded to free`);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // invoice.payment_succeeded — renewal: reset boost credits
    // ══════════════════════════════════════════════════════════════════════════
    else if (stripeEvent.type === 'invoice.payment_succeeded') {
      const invoice = stripeEvent.data.object as Stripe.Invoice;

      if ((invoice as any).billing_reason !== 'subscription_cycle') {
        return new Response('OK', { status: 200 });
      }

      const stripeSubId = typeof (invoice as any).subscription === 'string'
        ? (invoice as any).subscription : null;
      if (!stripeSubId) return new Response('OK', { status: 200 });

      const { data: subRow } = await supabaseAdmin
        .from('subscriptions')
        .select('user_id, plan')
        .eq('stripe_subscription_id', stripeSubId)
        .maybeSingle();

      if (!subRow?.user_id) return new Response('OK', { status: 200 });

      const { data: profileRow } = await supabaseAdmin
        .from('user_profiles')
        .select('monthly_boost_allowance')
        .eq('id', subRow.user_id)
        .single();

      const allowance = profileRow?.monthly_boost_allowance ?? 0;

      await supabaseAdmin
        .from('user_profiles')
        .update({ remaining_boosts: allowance })
        .eq('id', subRow.user_id);

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
    // invoice.payment_failed
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
    // payment_intent.succeeded — native PaymentSheet ticket fulfillment.
    //
    // PRIMARY path for mobile PaymentSheet purchases.
    // Hosted Checkout path (checkout.session.completed) is primary for web.
    // Both converge on the same finalize_ticket_order RPC.
    //
    // CROSS-PATH IDEMPOTENCY:
    // For hosted checkout, Stripe fires BOTH checkout.session.completed AND
    // payment_intent.succeeded. Each webhook_event_id is unique so both pass the
    // ticket_payment_events check. Protection comes from finalize_ticket_order
    // being idempotent — if already paid it returns ok=false, preventing any
    // side-effects (notifications, email, inventory check) from running twice.
    // ══════════════════════════════════════════════════════════════════════════
    else if (stripeEvent.type === 'payment_intent.succeeded') {
      const pi = stripeEvent.data.object as Stripe.PaymentIntent;

      // Only process PaymentIntents that belong to native ticket checkout.
      if (pi.metadata?.checkout_type !== 'ticket') {
        return new Response('OK', { status: 200 });
      }

      const orderId  = pi.metadata?.order_id;
      const buyerId  = pi.metadata?.buyer_id;
      const eventId  = pi.metadata?.event_id;

      if (!orderId) {
        console.warn('[stripe-webhook] payment_intent.succeeded ticket: missing order_id in metadata');
        return new Response('OK', { status: 200 });
      }

      // Idempotency: check BEFORE doing any work.
      // The idempotency record is inserted AFTER successful finalization so that
      // transient failures (e.g. DB constraint violations) allow Stripe to retry.
      const webhookEventId = stripeEvent.id;
      const { data: existingPiEvent } = await supabaseAdmin
        .from('ticket_payment_events')
        .select('id')
        .eq('webhook_event_id', webhookEventId)
        .maybeSingle();

      if (existingPiEvent) {
        console.log(`[stripe-webhook] Duplicate payment_intent.succeeded ${webhookEventId} — acknowledged`);
        return new Response('OK', { status: 200 });
      }

      const { data: piFinalize, error: piFinalizeErr } = await supabaseAdmin
        .rpc('finalize_ticket_order', {
          p_order_id: orderId,
          p_payment_reference: pi.id,
          p_provider_amount_minor: pi.amount_received ?? pi.amount,
          p_provider_currency: (pi.currency ?? 'usd').toUpperCase(),
        });

      if (piFinalizeErr) {
        // Genuine DB/RPC error — do NOT record idempotency so Stripe can retry
        const msg = piFinalizeErr.message ?? 'Finalization failed';
        console.error(`[stripe-webhook] PI ticket finalization DB error: order=${orderId} msg=${String(msg).slice(0, 200)} — NOT recording event, Stripe may retry`);
        return new Response('Internal Server Error', { status: 500 });
      }

      const piFinalizeOk = (piFinalize as Record<string, unknown>)?.ok as boolean;
      const piFinalizeCode = (piFinalize as Record<string, unknown>)?.code as string ?? '';

      if (!piFinalizeOk) {
        const msg = (piFinalize as Record<string, unknown>)?.error ?? 'ok=false';
        // Record idempotency to suppress retries — order is either already paid
        // (handled by checkout.session path) or rejected for a permanent reason.
        await supabaseAdmin.from('ticket_payment_events').insert({
          order_id: orderId,
          event_id: eventId ?? null,
          provider: 'stripe',
          webhook_event_type: stripeEvent.type,
          webhook_event_id: webhookEventId,
          payment_intent_id: pi.id,
          amount_minor: pi.amount_received ?? pi.amount,
          currency: pi.currency ?? 'usd',
          status: piFinalizeCode === 'already_paid' || piFinalizeCode === 'duplicate' ? 'already_paid' : 'finalize_rejected',
          raw_payload: null,
        }).then(() => {}, () => {});
        console.log(`[stripe-webhook] PI ticket finalize ok=false: order=${orderId} code=${piFinalizeCode} msg=${String(msg).slice(0, 200)} — idempotency recorded`);
        return new Response('OK', { status: 200 });
      }

      // ── Finalization succeeded — record idempotency NOW ─────────────────────
      await supabaseAdmin.from('ticket_payment_events').insert({
        order_id: orderId,
        event_id: eventId ?? null,
        provider: 'stripe',
        webhook_event_type: stripeEvent.type,
        webhook_event_id: webhookEventId,
        payment_intent_id: pi.id,
        amount_minor: pi.amount_received ?? pi.amount,
        currency: pi.currency ?? 'usd',
        status: 'succeeded',
        raw_payload: null,
      }).then(() => {}, () => {}); // non-fatal — duplicate key on retry is harmless

      const ticketsIssued = (piFinalize as Record<string, unknown>)?.tickets_issued as number ?? 0;
      const orderNumber   = (piFinalize as Record<string, unknown>)?.order_number as string ?? '';
      console.log(`[stripe-webhook] PI ticket order finalized: order=${orderId} num=${orderNumber} tickets=${ticketsIssued} buyer=${buyerId?.slice(0, 8)}`);

      // ticketsIssued > 0 guarantees finalize was a NEW completion (not a replay)
      if (buyerId && ticketsIssued > 0) {
        // 1. In-app notification
        await supabaseAdmin.from('notifications').insert({
          user_id: buyerId,
          type: 'ticket_purchase_confirmed',
          title: 'Tickets Confirmed!',
          body: `Your ${ticketsIssued} ticket${ticketsIssued !== 1 ? 's' : ''} for order #${orderNumber} are ready. Open My Tickets to view your QR code.`,
          event_id: eventId ?? null,
          read: false,
        }).then(({ error: nErr }) => {
          if (nErr) console.warn('[stripe-webhook] PI ticket notification insert failed:', nErr.message);
        });

        // 2. Push notification (fire-and-forget)
        void sendTicketConfirmedPush(supabaseAdmin, buyerId, ticketsIssued, orderNumber, eventId).catch(() => {});

        // 3. Confirmation email (idempotent via notifications sentinel, fire-and-forget)
        void sendTicketConfirmedEmail(supabaseAdmin, orderId, buyerId, orderNumber, ticketsIssued, eventId).catch(() => {});

        // 4. Low-inventory check (threshold-crossing, fire-and-forget)
        if (eventId) {
          void checkAndNotifyLowInventory(supabaseAdmin, eventId).catch(() => {});
        }
      }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // payment_intent.payment_failed
    // ══════════════════════════════════════════════════════════════════════════
    else if (stripeEvent.type === 'payment_intent.payment_failed') {
      const pi = stripeEvent.data.object as Stripe.PaymentIntent;
      const { data: orderRow } = await supabaseAdmin
        .from('ticket_orders')
        .select('id, buyer_id, event_id')
        .eq('payment_reference', pi.id)
        .eq('payment_status', 'pending')
        .maybeSingle();

      if (orderRow) {
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
    // payment_intent.canceled
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
    // charge.refunded
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
    // charge.dispute.created
    // ══════════════════════════════════════════════════════════════════════════
    else if (stripeEvent.type === 'charge.dispute.created') {
      const dispute = stripeEvent.data.object as Stripe.Dispute;
      const chargeId = typeof dispute.charge === 'string' ? dispute.charge : null;
      if (!chargeId) return new Response('OK', { status: 200 });

      const paymentIntentId = typeof dispute.payment_intent === 'string' ? dispute.payment_intent : null;

      const { data: existingDispute } = await supabaseAdmin
        .from('payment_disputes')
        .select('id')
        .eq('provider_dispute_id', dispute.id)
        .maybeSingle();

      if (existingDispute) {
        console.log(`[stripe-webhook] Duplicate dispute event ${dispute.id} — acknowledged`);
        return new Response('OK', { status: 200 });
      }

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

      const { data: eventRow } = await supabaseAdmin
        .from('events')
        .select('id, promoter_id')
        .eq('id', orderRow.event_id as string)
        .maybeSingle();

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
    // charge.dispute.updated
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
    // checkout.session.expired
    // ══════════════════════════════════════════════════════════════════════════
    else if (stripeEvent.type === 'checkout.session.expired') {
      const session = stripeEvent.data.object as Stripe.Checkout.Session;
      const orderId = session.metadata?.order_id;

      if (orderId) {
        const { error: releaseErr } = await supabaseAdmin
          .from('ticket_inventory_reservations')
          .update({ status: 'released' })
          .eq('order_id', orderId)
          .eq('status', 'active');

        if (releaseErr) {
          console.warn(`[stripe-webhook] session.expired: reservation release failed for order=${orderId}:`, releaseErr.message);
        }

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

// ── Helper: send push notification to ticket buyer ─────────────────────────────
async function sendTicketConfirmedPush(
  supabaseAdmin: ReturnType<typeof createClient>,
  buyerId: string,
  ticketsIssued: number,
  orderNumber: string,
  eventId: string | undefined,
): Promise<void> {
  const title = 'Tickets Confirmed!';
  const body = `Your ${ticketsIssued} ticket${ticketsIssued !== 1 ? 's' : ''} for order #${orderNumber} are ready. Open My Tickets to view your QR code.`;

  const { data: tokenRows } = await supabaseAdmin
    .from('push_tokens')
    .select('id, token, token_type')
    .eq('user_id', buyerId);

  if (!tokenRows || tokenRows.length === 0) return;

  const expoTokens = tokenRows.filter((r: any) => r.token_type !== 'fcm');
  const fcmTokens  = tokenRows.filter((r: any) => r.token_type === 'fcm');

  // Expo (iOS) push
  if (expoTokens.length > 0) {
    const messages = expoTokens.map((row: any) => ({
      to: row.token,
      title,
      body,
      data: { eventId: eventId ?? '', type: 'ticket_purchase_confirmed', server_persisted: '1' },
      sound: 'default',
      priority: 'high',
    }));
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages),
    }).catch((e: unknown) => console.warn('[stripe-webhook] Expo push error:', String(e).slice(0, 100)));
    console.log(`[stripe-webhook] Ticket push sent (Expo) to buyer ${buyerId.slice(0, 8)}`);
  }

  // FCM (Android) — in-app notification suffices; FCM OAuth2 is handled by send-email function.
  // For ticket confirmations the in-app notification + Expo path covers all cases.
  if (fcmTokens.length > 0) {
    console.log(`[stripe-webhook] FCM push for buyer ${buyerId.slice(0, 8)} — covered by in-app notification on next foreground`);
  }
}

// ── Helper: send ticket purchase confirmation email (idempotent) ──────────────
//
// Idempotency: guarded by a 'ticket_confirmation_email_sent' sentinel row in
// the notifications table (body = orderId). Webhook retries and dual-path
// (checkout.session + payment_intent) both check this before sending.
//
// Email failure is non-fatal — ticket issuance is not rolled back.
// Purchaser email is resolved from user_profiles (authoritative) with fallback
// to ticket_orders.buyer_email. If neither exists, sending is skipped safely.
async function sendTicketConfirmedEmail(
  supabaseAdmin: ReturnType<typeof createClient>,
  orderId: string,
  buyerId: string,
  orderNumber: string,
  ticketsIssued: number,
  eventId: string | undefined,
): Promise<void> {
  // Idempotency check — prevent duplicate sends on webhook retry or dual-path firing
  const { data: existingEmailNotif } = await supabaseAdmin
    .from('notifications')
    .select('id')
    .eq('user_id', buyerId)
    .eq('type', 'ticket_confirmation_email_sent')
    .eq('body', orderId)
    .maybeSingle();

  if (existingEmailNotif) {
    console.log(`[stripe-webhook] Confirmation email already sent for order ${orderId} — skipping`);
    return;
  }

  const [orderRes, itemsRes, buyerRes, eventRes] = await Promise.all([
    supabaseAdmin
      .from('ticket_orders')
      .select('buyer_email, buyer_name, currency, base_subtotal_minor, customer_fee_minor, customer_total_minor')
      .eq('id', orderId)
      .maybeSingle(),
    supabaseAdmin
      .from('ticket_order_items')
      .select('ticket_type_name_snap, quantity, unit_price_minor_snap, currency')
      .eq('order_id', orderId),
    supabaseAdmin
      .from('user_profiles')
      .select('email, name')
      .eq('id', buyerId)
      .maybeSingle(),
    eventId ? supabaseAdmin
      .from('events')
      .select('title, date, start_time, venue, parish')
      .eq('id', eventId)
      .maybeSingle() : Promise.resolve({ data: null }),
  ]);

  // Authoritative email: user_profiles.email (verified), fallback to order buyer_email
  const buyerEmail = (buyerRes.data as any)?.email ?? (orderRes.data as any)?.buyer_email ?? null;
  if (!buyerEmail) {
    console.warn(`[stripe-webhook] No buyer email for order ${orderId} — skipping confirmation email, ticket unaffected`);
    return;
  }

  const order = orderRes.data as Record<string, any> | null;
  const ev = (eventRes as any)?.data as Record<string, any> | null;
  const currency = (order?.currency ?? 'USD') as string;

  function fmtMinor(minor: number, cur: string): string {
    const amt = minor / 100;
    if (cur.toUpperCase() === 'JMD') return `J$${amt.toFixed(2)}`;
    return `$${amt.toFixed(2)} USD`;
  }

  const items = ((itemsRes.data ?? []) as Array<Record<string, any>>).map((it) => ({
    name: it.ticket_type_name_snap as string,
    qty: it.quantity as number,
    unitPrice: fmtMinor(it.unit_price_minor_snap as number, currency),
  }));

  const emailData = {
    userName: (buyerRes.data as any)?.name ?? (orderRes.data as any)?.buyer_name ?? undefined,
    eventTitle: ev?.title ?? 'Event',
    date: ev?.date ?? '',
    startTime: ev?.start_time ?? '',
    venue: ev?.venue ?? '',
    parish: ev?.parish ?? '',
    orderNumber,
    ticketsIssued,
    items,
    feeAmount: fmtMinor(order?.customer_fee_minor ?? 0, currency),
    totalAmount: fmtMinor(order?.customer_total_minor ?? 0, currency),
    currency: currency.toUpperCase(),
    eventId: eventId ?? '',
  };

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  // Attempt direct Postal delivery (server-to-server; bypasses send-email auth requirement)
  const postalUrl = Deno.env.get('POSTAL_API_URL') ?? '';
  const postalKey = Deno.env.get('POSTAL_API_KEY') ?? '';
  const emailFrom = Deno.env.get('EMAIL_FROM') ?? 'notifications@vybzhub.com';
  const emailFromName = Deno.env.get('EMAIL_FROM_NAME') ?? 'Vybz Hub';

  let emailSent = false;

  if (postalUrl && postalKey) {
    const subject = `Your Vybz Hub Tickets Are Confirmed — ${emailData.eventTitle}`;
    const itemLines = emailData.items.map((it) => `  ${it.qty}x ${it.name}: ${it.unitPrice}`).join('\n');
    const textBody = [
      `Hi ${emailData.userName ?? 'there'},`,
      '',
      `Your tickets are confirmed for ${emailData.eventTitle}!`,
      '',
      `Date: ${emailData.date}`,
      `Time: ${emailData.startTime}`,
      `Venue: ${emailData.venue}${emailData.parish ? ', ' + emailData.parish : ''}`,
      '',
      'ORDER SUMMARY:',
      itemLines,
      `Service Fee: ${emailData.feeAmount}`,
      `Total Paid: ${emailData.totalAmount} ${emailData.currency}`,
      `Order #: ${emailData.orderNumber}`,
      '',
      'Open the Vybz Hub app and go to My Tickets to view your QR code.',
      'Present the QR code at the event entrance for entry.',
      '',
      'Need help? Email info@vybzhub.com',
    ].join('\n');

    const postalRes = await fetch(`${postalUrl}/api/v1/send/message`, {
      method: 'POST',
      headers: { 'X-Server-API-Key': postalKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: [buyerEmail],
        from: `${emailFromName} <${emailFrom}>`,
        subject,
        plain_body: textBody,
      }),
    }).catch(() => null);

    if (postalRes?.ok) {
      emailSent = true;
      console.log(`[stripe-webhook] Confirmation email sent via Postal for order ${orderId} to ${buyerEmail.slice(0,4)}***`);
    } else {
      console.warn(`[stripe-webhook] Postal email failed for order ${orderId}: ${postalRes?.status ?? 'network error'}`);
    }
  }

  // Fallback: delegate to send-email Edge Function (handles SMTP)
  if (!emailSent) {
    const efRes = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'ticket_purchase_confirmed', data: emailData }),
    }).catch(() => null);

    if (efRes?.ok) {
      emailSent = true;
      console.log(`[stripe-webhook] Confirmation email delegated to send-email for order ${orderId}`);
    } else {
      console.warn(`[stripe-webhook] send-email fallback failed for order ${orderId} — ticket unaffected`);
      // Do not mark as sent — allows a future retry to attempt delivery again
      return;
    }
  }

  if (emailSent) {
    // Mark as sent — idempotency sentinel (read=true so it never appears in notification list)
    await supabaseAdmin.from('notifications').insert({
      user_id: buyerId,
      type: 'ticket_confirmation_email_sent',
      title: 'Ticket confirmation email sent',
      body: orderId,
      event_id: eventId ?? null,
      read: true,
    }).catch(() => {});
  }
}

// ── Helper: threshold-crossing low inventory notifier ─────────────────────────
//
// DEDUPLICATION: Threshold-crossing based — NOT time-window based.
//
// Durable state is stored in admin_settings (service role bypasses RLS):
//   Key:   low_inv_state_event_{eventId}
//   Value: { event_notified: boolean; tiers: Record<tierId, boolean> }
//
// Per scope (event-wide + each tier):
//   remaining > 10%  →  arm=true  (reset: ready to fire on next crossing)
//   remaining ≤ 10% + arm=true   →  send notification, arm=false
//   remaining ≤ 10% + arm=false  →  already notified, skip
//   no state row yet             →  treat as arm=true (first run)
//
// Example (100 tickets):
//   sold→89 remaining=11 (>10%) → arm=true
//   sold→90 remaining=10 (≤10%) → ALERT, arm=false
//   sold→91 remaining=9         → skip
//   refund→ remaining=20 (>10%) → arm=true (next sale at 18 will alert again)
async function checkAndNotifyLowInventory(
  supabaseAdmin: ReturnType<typeof createClient>,
  eventId: string,
): Promise<void> {
  const { data: ev } = await supabaseAdmin
    .from('events')
    .select('id, title, promoter_id')
    .eq('id', eventId)
    .maybeSingle();

  if (!ev?.promoter_id) return;

  const promoterId = ev.promoter_id as string;
  const eventTitle = ev.title as string;

  const { data: tiers } = await supabaseAdmin
    .from('event_ticket_types')
    .select('id, name, quantity_total, quantity_sold, quantity_reserved, status')
    .eq('event_id', eventId)
    .eq('status', 'active');

  if (!tiers || tiers.length === 0) return;

  // Load durable crossing state
  const stateKey = `low_inv_state_event_${eventId}`;
  const { data: stateRow } = await supabaseAdmin
    .from('admin_settings')
    .select('value')
    .eq('key', stateKey)
    .maybeSingle();

  const state: { event_notified: boolean; tiers: Record<string, boolean> } = {
    // absent = first run → treat as armed (event_notified=false means armed/ready-to-fire)
    event_notified: (stateRow?.value as any)?.event_notified === true,
    tiers: (stateRow?.value as any)?.tiers ?? {},
  };
  let stateChanged = false;

  // ── Event-wide ─────────────────────────────────────────────────────────────
  const totalInventory = tiers.reduce((s: number, t: any) => s + (t.quantity_total as number), 0);
  const totalRemaining = tiers.reduce((s: number, t: any) =>
    s + Math.max(0, (t.quantity_total as number) - (t.quantity_sold as number) - (t.quantity_reserved as number)), 0);

  if (totalInventory > 0) {
    const pct = totalRemaining / totalInventory;

    if (pct > 0.10) {
      // Above threshold → arm for next crossing
      if (state.event_notified !== false) {
        state.event_notified = false;
        stateChanged = true;
        console.log(`[stripe-webhook] Event inventory above threshold (${Math.round(pct * 100)}%) — armed: event=${eventId.slice(0, 8)}`);
      }
    } else {
      // At or below threshold → fire only if armed
      if (!state.event_notified) {
        const notifTitle = 'Low Ticket Inventory';
        const notifBody = `"${eventTitle}" has only ${totalRemaining} ticket${totalRemaining !== 1 ? 's' : ''} remaining (${Math.round(pct * 100)}% of total). Consider taking action soon.`;

        await supabaseAdmin.from('notifications').insert({
          user_id: promoterId,
          type: 'ticket_inventory_low',
          title: notifTitle,
          body: notifBody,
          event_id: eventId,
          read: false,
        });

        await sendPushToUserIds(
          [promoterId],
          notifTitle,
          notifBody,
          eventId,
          'ticket_inventory_low',
          supabaseAdmin,
          true,
        );

        state.event_notified = true; // disarm — no repeat until inventory recovers above 10%
        stateChanged = true;
        console.log(`[stripe-webhook] Low inventory alert: promoter=${promoterId.slice(0, 8)} event=${eventId.slice(0, 8)} remaining=${totalRemaining}/${totalInventory} (${Math.round(pct * 100)}%)`);
      } else {
        console.log(`[stripe-webhook] Low inventory already notified — skipping until recovery: event=${eventId.slice(0, 8)}`);
      }
    }
  }

  // ── Per-tier ───────────────────────────────────────────────────────────────
  for (const tier of tiers) {
    const t = tier as Record<string, any>;
    const tierId = t.id as string;
    const tierTotal = t.quantity_total as number;
    const tierRemaining = Math.max(0, tierTotal - (t.quantity_sold as number) - (t.quantity_reserved as number));
    const tierName = t.name as string;
    if (tierTotal <= 0) continue;
    const tierPct = tierRemaining / tierTotal;

    if (tierPct > 0.10) {
      // Above threshold → arm for next crossing
      if (state.tiers[tierId] !== false) {
        state.tiers[tierId] = false;
        stateChanged = true;
      }
    } else {
      // At or below threshold → fire only if armed
      if (!state.tiers[tierId]) {
        const tierNotifTitle = 'Ticket Tier Running Low';
        const tierNotifBody = `"${tierName}" tickets for "${eventTitle}" are down to ${tierRemaining} remaining (${Math.round(tierPct * 100)}% of tier total).`;

        await supabaseAdmin.from('notifications').insert({
          user_id: promoterId,
          type: 'ticket_inventory_low',
          title: tierNotifTitle,
          body: tierNotifBody,
          event_id: eventId,
          read: false,
        });

        await sendPushToUserIds(
          [promoterId],
          tierNotifTitle,
          tierNotifBody,
          eventId,
          'ticket_inventory_low',
          supabaseAdmin,
          true,
        );

        state.tiers[tierId] = true; // disarm for this tier
        stateChanged = true;
        console.log(`[stripe-webhook] Low inventory tier alert: promoter=${promoterId.slice(0, 8)} tier="${tierName}" ${tierRemaining}/${tierTotal}`);
      }
    }
  }

  // Persist state changes durably so they survive across webhook invocations
  if (stateChanged) {
    await supabaseAdmin
      .from('admin_settings')
      .upsert({
        key: stateKey,
        value: state,
        updated_by: null,
        updated_at: new Date().toISOString(),
      })
      .catch((e: any) => console.warn('[stripe-webhook] Failed to persist low-inv state:', String(e).slice(0, 100)));
  }
}
