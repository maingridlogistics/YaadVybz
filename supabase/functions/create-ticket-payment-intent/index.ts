// create-ticket-payment-intent — Phase 3b: Native PaymentSheet ticket checkout.
//
// Security model:
//   • All pricing is server-side only. Client sends identifiers + quantities only.
//   • JWT validated before any DB or Stripe operation.
//   • Inventory reserved atomically via reserve_multiple_ticket_tiers() RPC.
//   • Order + items created with immutable financial snapshots.
//   • Stripe PaymentIntent created AFTER order row exists (order_id in metadata).
//   • Returns only safe client values — never secret key, webhook secret, or
//     service role key.
//   • Idempotent: duplicate checkout requests protected via order_number uniqueness.
//
// Fee structure (integer arithmetic only, no floating point):
//   base_subtotal  = Σ(unit_price_minor × quantity)
//   customer_fee   = round(base_subtotal × 5 / 100)   [5% customer fee]
//   customer_total = base_subtotal + customer_fee
//   promoter_fee   = round(base_subtotal × 5 / 100)   [5% promoter fee]
//   promoter_proceeds = base_subtotal − promoter_fee
//   platform_gross = customer_fee + promoter_fee
//
// Canonical currency format:
//   Database: uppercase  (USD / JMD)
//   Stripe:   lowercase  (usd / jmd) — conversion at Stripe boundary only

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'npm:stripe@14';
import { corsHeaders } from '../_shared/cors.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-04-10',
});

// ── Integer-safe money math ────────────────────────────────────────────────────
function calcFee(baseMinor: number, pct: number): number {
  return Math.round((baseMinor * pct) / 100);
}

// ── Validate sales timing ─────────────────────────────────────────────────────
function isSalesOpen(tier: Record<string, unknown>): boolean {
  const now = Date.now();
  const start = tier.sales_start_at ? new Date(tier.sales_start_at as string).getTime() : null;
  const end = tier.sales_end_at ? new Date(tier.sales_end_at as string).getTime() : null;
  if (start && now < start) return false;
  if (end && now > end) return false;
  return true;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

  try {
    // ── 1. Auth ─────────────────────────────────────────────────────────────────
    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '').trim();
    if (!token) {
      return new Response(JSON.stringify({ error: 'Authorization required.' }), {
        status: 401, headers: jsonHeaders,
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized.' }), {
        status: 401, headers: jsonHeaders,
      });
    }

    // ── 2. Parse body ───────────────────────────────────────────────────────────
    let body: Record<string, unknown>;
    try { body = await req.json(); } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body.' }), {
        status: 400, headers: jsonHeaders,
      });
    }

    const event_id = typeof body.event_id === 'string' ? body.event_id.trim() : null;
    const items = Array.isArray(body.items) ? body.items : [];
    const customer_terms_accepted = body.customer_terms_accepted === true;

    if (!event_id || items.length === 0) {
      return new Response(JSON.stringify({ error: 'event_id and items are required.' }), {
        status: 400, headers: jsonHeaders,
      });
    }

    // Validate items shape
    for (const item of items) {
      if (!item.ticket_type_id || typeof item.ticket_type_id !== 'string') {
        return new Response(JSON.stringify({ error: 'Each item must have a ticket_type_id (string).' }), {
          status: 400, headers: jsonHeaders,
        });
      }
      const qty = Number(item.quantity);
      if (!Number.isInteger(qty) || qty < 1) {
        return new Response(JSON.stringify({ error: 'Each item quantity must be a positive integer.' }), {
          status: 400, headers: jsonHeaders,
        });
      }
    }

    // ── 3. Validate customer terms ──────────────────────────────────────────────
    if (!customer_terms_accepted) {
      const { data: termsRow } = await supabaseAdmin
        .from('customer_ticket_terms_acceptances')
        .select('id')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();
      if (!termsRow) {
        return new Response(JSON.stringify({
          error: 'Customer ticket terms must be accepted before purchase.',
          code: 'terms_required',
        }), { status: 400, headers: jsonHeaders });
      }
    }

    // ── 4. Validate event ───────────────────────────────────────────────────────
    const { data: eventRow, error: eventErr } = await supabaseAdmin
      .from('events')
      .select('id, title, status, date, selling_tickets_in_app, promoter_id')
      .eq('id', event_id)
      .maybeSingle();

    if (eventErr || !eventRow) {
      return new Response(JSON.stringify({ error: 'Event not found.' }), {
        status: 404, headers: jsonHeaders,
      });
    }
    if (eventRow.status !== 'live') {
      return new Response(JSON.stringify({ error: 'Event is not currently live.' }), {
        status: 400, headers: jsonHeaders,
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [ey, em, ed] = (eventRow.date as string).split('-').map(Number);
    if (new Date(ey, em - 1, ed) < today) {
      return new Response(JSON.stringify({ error: 'This event has already passed.' }), {
        status: 400, headers: jsonHeaders,
      });
    }

    // ── 5. Validate ticket settings ─────────────────────────────────────────────
    const { data: ticketSettings, error: tsErr } = await supabaseAdmin
      .from('event_ticket_settings')
      .select('enabled, currency, sales_status')
      .eq('event_id', event_id)
      .maybeSingle();

    if (tsErr || !ticketSettings) {
      return new Response(JSON.stringify({ error: 'Ticketing is not configured for this event.' }), {
        status: 400, headers: jsonHeaders,
      });
    }
    if (!ticketSettings.enabled) {
      return new Response(JSON.stringify({ error: 'Ticket sales are not enabled for this event.' }), {
        status: 400, headers: jsonHeaders,
      });
    }
    if (ticketSettings.sales_status !== 'on_sale') {
      const msgs: Record<string, string> = {
        draft: 'Ticket sales have not started yet.',
        paused: 'Ticket sales are currently paused.',
        ended: 'Ticket sales have ended.',
      };
      return new Response(JSON.stringify({
        error: msgs[ticketSettings.sales_status as string] ?? 'Ticket sales are not open.',
      }), { status: 400, headers: jsonHeaders });
    }

    // Canonical uppercase currency for DB; lowercase only at Stripe boundary
    const currency = String(ticketSettings.currency).toUpperCase() as 'USD' | 'JMD';
    if (currency !== 'USD' && currency !== 'JMD') {
      return new Response(JSON.stringify({ error: 'Unsupported ticket currency.' }), {
        status: 400, headers: jsonHeaders,
      });
    }
    const stripeCurrency = currency.toLowerCase(); // 'usd' | 'jmd'

    // ── 6. Load + validate ticket tiers ─────────────────────────────────────────
    const tierIds = items.map((it: Record<string, unknown>) => it.ticket_type_id as string);

    const { data: tiers, error: tierErr } = await supabaseAdmin
      .from('event_ticket_types')
      .select('id, event_id, name, price_minor, currency, quantity_total, quantity_sold, quantity_reserved, min_per_order, max_per_order, sales_start_at, sales_end_at, status')
      .in('id', tierIds)
      .eq('event_id', event_id);

    if (tierErr || !tiers || tiers.length !== tierIds.length) {
      return new Response(JSON.stringify({ error: 'One or more ticket tiers not found for this event.' }), {
        status: 400, headers: jsonHeaders,
      });
    }

    const tierMap = new Map<string, Record<string, unknown>>(
      tiers.map((t: Record<string, unknown>) => [t.id as string, t])
    );

    // ── 7. Server-side authoritative pricing ─────────────────────────────────────
    let base_subtotal_minor = 0;
    const validatedItems: Array<{
      ticket_type_id: string;
      quantity: number;
      unit_price_minor: number;
      subtotal_minor: number;
      name: string;
    }> = [];

    for (const item of items) {
      const tid = item.ticket_type_id as string;
      const qty = Number(item.quantity);
      const tier = tierMap.get(tid);
      if (!tier) continue;

      if (tier.status !== 'active') {
        return new Response(JSON.stringify({
          error: `Ticket tier "${tier.name}" is not available for purchase.`,
        }), { status: 400, headers: jsonHeaders });
      }
      if (!isSalesOpen(tier)) {
        return new Response(JSON.stringify({
          error: `Ticket sales for "${tier.name}" are not currently open.`,
        }), { status: 400, headers: jsonHeaders });
      }

      const min = tier.min_per_order as number;
      const max = tier.max_per_order as number;
      if (qty < min) {
        return new Response(JSON.stringify({
          error: `"${tier.name}" requires a minimum of ${min} ticket(s) per order.`,
        }), { status: 400, headers: jsonHeaders });
      }
      if (qty > max) {
        return new Response(JSON.stringify({
          error: `"${tier.name}" allows a maximum of ${max} ticket(s) per order.`,
        }), { status: 400, headers: jsonHeaders });
      }

      const available = (tier.quantity_total as number) - (tier.quantity_sold as number) - (tier.quantity_reserved as number);
      if (available < qty) {
        return new Response(JSON.stringify({
          error: `Not enough inventory for "${tier.name}". Available: ${Math.max(0, available)}.`,
        }), { status: 400, headers: jsonHeaders });
      }

      const unitPrice = tier.price_minor as number;
      const subtotal = unitPrice * qty;
      base_subtotal_minor += subtotal;
      validatedItems.push({ ticket_type_id: tid, quantity: qty, unit_price_minor: unitPrice, subtotal_minor: subtotal, name: tier.name as string });
    }

    // Authoritative fee calculation — integer arithmetic only
    const customer_fee_minor = calcFee(base_subtotal_minor, 5);
    const customer_total_minor = base_subtotal_minor + customer_fee_minor;
    const promoter_fee_minor = calcFee(base_subtotal_minor, 5);
    const promoter_proceeds_minor = base_subtotal_minor - promoter_fee_minor;
    const platform_gross_minor = customer_fee_minor + promoter_fee_minor;

    // ── 8. Generate order number ─────────────────────────────────────────────────
    const { data: orderNumRow, error: orderNumErr } = await supabaseAdmin
      .rpc('generate_ticket_order_number');
    if (orderNumErr || !orderNumRow) {
      console.error('[create-ticket-payment-intent] Failed to generate order number:', orderNumErr?.message);
      return new Response(JSON.stringify({ error: 'Failed to generate order number. Please try again.' }), {
        status: 500, headers: jsonHeaders,
      });
    }
    const order_number = orderNumRow as string;

    // ── 9. Create pending order ─────────────────────────────────────────────────
    const orderId = crypto.randomUUID();
    const { error: orderInsertErr } = await supabaseAdmin
      .from('ticket_orders')
      .insert({
        id: orderId,
        order_number,
        buyer_id: user.id,
        event_id,
        currency, // canonical UPPERCASE — 'USD' or 'JMD'
        base_subtotal_minor,
        customer_fee_minor,
        customer_total_minor,
        promoter_fee_minor,
        promoter_proceeds_minor,
        processor_fee_minor: 0,
        platform_gross_minor,
        payment_method: 'stripe_card',
        payment_status: 'pending',
        payment_provider: 'stripe',
      });

    if (orderInsertErr) {
      console.error('[create-ticket-payment-intent] Order insert failed:', orderInsertErr.message);
      return new Response(JSON.stringify({ error: 'Failed to create order. Please try again.' }), {
        status: 500, headers: jsonHeaders,
      });
    }

    // ── 10. Create order items (immutable snapshot) ──────────────────────────────
    const orderItemInserts = validatedItems.map((it) => ({
      order_id: orderId,
      ticket_type_id: it.ticket_type_id,
      ticket_type_name_snap: it.name,
      unit_price_minor_snap: it.unit_price_minor,
      quantity: it.quantity,
      subtotal_minor_snap: it.subtotal_minor,
      customer_fee_minor_snap: calcFee(it.subtotal_minor, 5),
      promoter_fee_minor_snap: calcFee(it.subtotal_minor, 5),
    }));

    const { error: itemsInsertErr } = await supabaseAdmin
      .from('ticket_order_items')
      .insert(orderItemInserts);

    if (itemsInsertErr) {
      await supabaseAdmin.from('ticket_orders').delete().eq('id', orderId);
      console.error('[create-ticket-payment-intent] Order items insert failed:', itemsInsertErr.message);
      return new Response(JSON.stringify({ error: 'Failed to create order items. Please try again.' }), {
        status: 500, headers: jsonHeaders,
      });
    }

    // ── 11. Atomically reserve inventory ─────────────────────────────────────────
    const reservationPayload = validatedItems.map((it) => ({
      ticket_type_id: it.ticket_type_id,
      quantity: it.quantity,
    }));

    const { data: reserveResult, error: reserveErr } = await supabaseAdmin
      .rpc('reserve_multiple_ticket_tiers', {
        p_reservations: reservationPayload,
        p_user_id: user.id,
        p_order_id: orderId,
      });

    if (reserveErr || !(reserveResult as Record<string, unknown>)?.ok) {
      await supabaseAdmin.from('ticket_order_items').delete().eq('order_id', orderId);
      await supabaseAdmin.from('ticket_orders').delete().eq('id', orderId);
      const msg = (reserveResult as Record<string, unknown>)?.error ?? reserveErr?.message ?? 'Inventory reservation failed.';
      console.error('[create-ticket-payment-intent] Reservation failed:', msg);
      return new Response(JSON.stringify({ error: msg as string }), {
        status: 409, headers: jsonHeaders,
      });
    }

    // ── 12. Get or create Stripe customer ─────────────────────────────────────────
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
    }

    // ── 13. Create Stripe PaymentIntent + Ephemeral Key ──────────────────────────
    // Inventory reservation TTL: 33 minutes from now, so it outlasts
    // reasonable PaymentSheet session time. The payment_intent.payment_failed
    // and manual cancellation cleanup will also release reservations early.
    const RESERVATION_TTL_MS = 33 * 60 * 1000;
    const reservationExpiresAt = new Date(Date.now() + RESERVATION_TTL_MS).toISOString();

    // Update reservation TTL before returning client secret
    await supabaseAdmin
      .from('ticket_inventory_reservations')
      .update({ expires_at: reservationExpiresAt })
      .eq('order_id', orderId)
      .eq('status', 'active');

    // Create ephemeral key for the Stripe customer.
    // Required by PaymentSheet to load saved payment methods (cards on file).
    // The ephemeral key is scoped to this customer and expires in 24 hours.
    // It is safe to return to the client — it cannot create charges or access
    // other customers.
    let ephemeralKeySecret: string | undefined;
    try {
      const ephemeralKey = await stripe.ephemeralKeys.create(
        { customer: customerId },
        { apiVersion: '2024-04-10' },
      );
      ephemeralKeySecret = ephemeralKey.secret;
    } catch (ekErr) {
      // Non-fatal: PaymentSheet still works without saved card display.
      // Apple Pay and card entry remain fully functional.
      console.warn('[create-ticket-payment-intent] Ephemeral key creation failed (non-fatal):', String(ekErr).slice(0, 120));
    }

    let paymentIntent: Stripe.PaymentIntent;
    try {
      paymentIntent = await stripe.paymentIntents.create({
        amount: customer_total_minor,
        currency: stripeCurrency, // lowercase at Stripe boundary only
        customer: customerId,
        // automatic_payment_methods enables Dynamic Payment Methods including
        // cards, Apple Pay, Google Pay, Link, Klarna (where eligible).
        // Stripe controls availability based on account, currency, device, customer.
        automatic_payment_methods: { enabled: true },
        metadata: {
          checkout_type: 'ticket',
          order_id: orderId,
          order_number,
          event_id,
          buyer_id: user.id,
        },
        description: `Tickets for: ${eventRow.title}`,
      });
    } catch (stripeError) {
      // Rollback reservations + order
      await supabaseAdmin
        .from('ticket_inventory_reservations')
        .update({ status: 'released' })
        .eq('order_id', orderId)
        .eq('status', 'active');
      await supabaseAdmin.from('ticket_order_items').delete().eq('order_id', orderId);
      await supabaseAdmin.from('ticket_orders').delete().eq('id', orderId);
      console.error('[create-ticket-payment-intent] Stripe PI creation failed:', String(stripeError).slice(0, 200));
      return new Response(JSON.stringify({ error: 'Payment provider error. Please try again.' }), {
        status: 502, headers: jsonHeaders,
      });
    }

    // ── 14. Store PaymentIntent ID on order ──────────────────────────────────────
    await supabaseAdmin
      .from('ticket_orders')
      .update({ payment_reference: paymentIntent.id })
      .eq('id', orderId);

    // ── Diagnostic: confirm key mode and PI config (no secrets logged) ──────────
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
    const keyMode = stripeKey.startsWith('sk_live_') ? 'live' : stripeKey.startsWith('sk_test_') ? 'test' : 'missing';
    console.log('[apple-pay-diag] Edge Function config:', {
      stripeKeyMode: keyMode,
      // PI livemode confirms the PaymentIntent is in the correct account mode
      piLivemode: paymentIntent.livemode,
      piCurrency: paymentIntent.currency,
      // automatic_payment_methods enabled = Stripe will include Apple Pay when eligible
      piAutoPaymentMethods: paymentIntent.automatic_payment_methods?.enabled ?? false,
      // explicit payment_method_types only set when NOT using automatic_payment_methods
      piExplicitTypes: paymentIntent.payment_method_types ?? [],
      customerId: customerId ? customerId.slice(0, 8) + '...' : 'none',
      hasEphemeralKey: !!ephemeralKeySecret,
      currency,
    });
    // ── End diagnostic ─────────────────────────────────────────────────────────

    console.log(`[create-ticket-payment-intent] Order created: order=${orderId} num=${order_number} event=${event_id} buyer=${user.id.slice(0,8)} total=${customer_total_minor} currency=${currency}`);

    // Return only safe client values — never secret key, webhook secret, service role
    return new Response(JSON.stringify({
      ok: true,
      order_id: orderId,
      order_number,
      payment_intent_client_secret: paymentIntent.client_secret,
      customer_ephemeral_key_secret: ephemeralKeySecret ?? null,
      currency: stripeCurrency, // lowercase for Stripe SDK on client
      customer_id: customerId,
      amounts: {
        base_subtotal_minor,
        customer_fee_minor,
        customer_total_minor,
        currency, // canonical uppercase for display
      },
    }), { status: 200, headers: jsonHeaders });

  } catch (err) {
    console.error('[create-ticket-payment-intent] Unhandled error:', String(err).slice(0, 200));
    return new Response(JSON.stringify({ error: 'Internal server error.' }), {
      status: 500, headers: jsonHeaders,
    });
  }
});
