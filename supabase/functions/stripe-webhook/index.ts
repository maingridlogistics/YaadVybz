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
import Stripe from 'https://esm.sh/stripe@14?target=deno&no-check';
import { sendPushToUserIds } from '../_shared/push.ts';
import { syncSubscriptionEntitlements, PLAN_ENTITLEMENTS } from '../_shared/entitlements.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-04-10',
  httpClient: Stripe.createFetchHttpClient(),
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
    stripeEvent = await stripe.webhooks.constructEventAsync(rawBody, sig, webhookSecret);
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
    // Handles BOTH boost payments (mode=payment) and new subscriptions (mode=subscription).
    // ══════════════════════════════════════════════════════════════════════════
    if (stripeEvent.type === 'checkout.session.completed') {
      const session = stripeEvent.data.object as Stripe.Checkout.Session;

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

      const now = new Date();
      let boostExpiresAt: string | null = null;
      if (boost_type === 'three_day') {
        boostExpiresAt = new Date(now.getTime() + 72 * 60 * 60 * 1000).toISOString();
      } else if (boost_type === 'seven_day') {
        boostExpiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
      }

      const { error: boostUpdateError } = await supabaseAdmin
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

      if (boostUpdateError) {
        console.error(`[stripe-webhook] Boost activate failed: ${boostUpdateError.message}`);
        return new Response('Internal Server Error', { status: 500 });
      }

      await supabaseAdmin
        .from('boost_purchases')
        .update({
          status:                'completed',
          stripe_payment_intent: paymentIntent,
          stripe_customer_id:    boostCustomerId,
          amount:                session.amount_total ?? 0,
          currency:              session.currency ?? 'usd',
          completed_at:          now.toISOString(),
        })
        .eq('id', purchase_id);

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
      const { data: subRow } = await supabaseAdmin
        .from('subscriptions')
        .select('user_id, plan, monthly_boost_allowance')
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

    // All other event types: acknowledge silently.

  } catch (err) {
    console.error(`[stripe-webhook] Error processing ${stripeEvent.type}:`, String(err).slice(0, 200));
    return new Response('Internal Server Error', { status: 500 });
  }

  return new Response('OK', { status: 200 });
});
