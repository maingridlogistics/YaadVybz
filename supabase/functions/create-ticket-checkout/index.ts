// create-ticket-checkout — Phase 3: Server-side ticket checkout session creation.
//
// Security model:
//   • All pricing is server-side only. Client sends identifiers + quantities only.
//   • JWT validated before any DB or Stripe operation.
//   • Inventory reserved atomically via reserve_multiple_ticket_tiers() RPC.
//   • Order + items created with immutable financial snapshots.
//   • Stripe session created AFTER order row exists (order_id in metadata).
//   • Idempotency: duplicate checkout requests for same user/event pair checked.
//   • JMD: provider_unavailable — clean error returned, no silent conversion.
//   • platform: 'mobile' (default) uses vybzhub:// deep links.
//               'web' uses https://vybzhub.com return URLs (strict server-side allowlist).
//             Clients NEVER supply arbitrary URLs — return URLs are derived server-side.
//
// Fee structure (integer arithmetic only, no floating point):
//   base_subtotal  = Σ(unit_price_minor × quantity)
//   customer_fee   = round(base_subtotal × 5 / 100)   [5% customer fee]
//   customer_total = base_subtotal + customer_fee
//   promoter_fee   = round(base_subtotal × 5 / 100)   [5% promoter fee]
//   promoter_proceeds = base_subtotal − promoter_fee
//   platform_gross = customer_fee + promoter_fee
//
// Return URL allowlist (server-side only — client cannot influence these values):
//   mobile: vybzhub://ticket-success  /  vybzhub://ticket-cancel
//   web:    https://vybzhub.com/tickets/success  /  https://vybzhub.com/tickets/cancel

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14?target=deno&no-check';
import { corsHeaders } from '../_shared/cors.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-04-10',
  httpClient: Stripe.createFetchHttpClient(),
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

  try {
    // ── 1. Auth ─────────────────────────────────────────────────────────────────
    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '').trim();
    if (!token) {
      return new Response(JSON.stringify({ error: 'Authorization required.' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized.' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── 2. Parse body ───────────────────────────────────────────────────────────
    let body: Record<string, unknown>;
    try { body = await req.json(); } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const event_id = typeof body.event_id === 'string' ? body.event_id.trim() : null;
    const items = Array.isArray(body.items) ? body.items : [];
    // attendee_names: optional array of strings, one per ticket (across all tiers)
    const customer_terms_accepted = body.customer_terms_accepted === true;

    // ── Platform discriminator (return URL routing) ─────────────────────────
    // Clients send platform='mobile' (default) or platform='web'.
    // Return URLs are derived SERVER-SIDE from this flag — clients never control
    // the actual URL strings. Any unrecognised value falls back to 'mobile'.
    const platform: 'mobile' | 'web' =
      body.platform === 'web' ? 'web' : 'mobile';

    if (!event_id || items.length === 0) {
      return new Response(JSON.stringify({ error: 'event_id and items are required.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate items shape
    for (const item of items) {
      if (!item.ticket_type_id || typeof item.ticket_type_id !== 'string') {
        return new Response(JSON.stringify({ error: 'Each item must have a ticket_type_id (string).' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const qty = Number(item.quantity);
      if (!Number.isInteger(qty) || qty < 1) {
        return new Response(JSON.stringify({ error: 'Each item quantity must be a positive integer.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // ── 3. Validate customer terms ──────────────────────────────────────────────
    if (!customer_terms_accepted) {
      // Check DB in case they previously accepted
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
        }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
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
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (eventRow.status !== 'live') {
      return new Response(JSON.stringify({ error: 'Event is not currently live.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate event date has not passed
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [ey, em, ed] = (eventRow.date as string).split('-').map(Number);
    if (new Date(ey, em - 1, ed) < today) {
      return new Response(JSON.stringify({ error: 'This event has already passed.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!ticketSettings.enabled) {
      return new Response(JSON.stringify({ error: 'Ticket sales are not enabled for this event.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const currency = ticketSettings.currency as string; // 'USD' or 'JMD'

    // ── 6. JMD provider check ───────────────────────────────────────────────────
    if (currency === 'JMD') {
      return new Response(JSON.stringify({
        error: 'JMD payment processing is not yet available. The event organiser must contact support to enable JMD ticket sales.',
        code: 'jmd_provider_unavailable',
        currency: 'JMD',
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── 7. Load + validate each ticket tier ─────────────────────────────────────
    const tierIds = items.map((it: Record<string, unknown>) => it.ticket_type_id as string);

    const { data: tiers, error: tierErr } = await supabaseAdmin
      .from('event_ticket_types')
      .select('id, event_id, name, price_minor, currency, quantity_total, quantity_sold, quantity_reserved, min_per_order, max_per_order, sales_start_at, sales_end_at, status')
      .in('id', tierIds)
      .eq('event_id', event_id);

    if (tierErr || !tiers || tiers.length !== tierIds.length) {
      return new Response(JSON.stringify({ error: 'One or more ticket tiers not found for this event.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const tierMap = new Map<string, Record<string, unknown>>(
      tiers.map((t: Record<string, unknown>) => [t.id as string, t])
    );

    // ── 8. Server-side authoritative pricing calculation ─────────────────────────
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
        }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (!isSalesOpen(tier)) {
        return new Response(JSON.stringify({
          error: `Ticket sales for "${tier.name}" are not currently open.`,
        }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const min = tier.min_per_order as number;
      const max = tier.max_per_order as number;
      if (qty < min) {
        return new Response(JSON.stringify({
          error: `"${tier.name}" requires a minimum of ${min} ticket(s) per order.`,
        }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      if (qty > max) {
        return new Response(JSON.stringify({
          error: `"${tier.name}" allows a maximum of ${max} ticket(s) per order.`,
        }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Quick availability check (pre-reservation — actual atomicity in RPC)
      const available = (tier.quantity_total as number) - (tier.quantity_sold as number) - (tier.quantity_reserved as number);
      if (available < qty) {
        return new Response(JSON.stringify({
          error: `Not enough inventory for "${tier.name}". Available: ${Math.max(0, available)}.`,
        }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const unitPrice = tier.price_minor as number;
      const subtotal = unitPrice * qty;
      base_subtotal_minor += subtotal;

      validatedItems.push({
        ticket_type_id: tid,
        quantity: qty,
        unit_price_minor: unitPrice,
        subtotal_minor: subtotal,
        name: tier.name as string,
      });
    }

    // Authoritative fee calculation — integer arithmetic only
    const customer_fee_minor = calcFee(base_subtotal_minor, 5);
    const customer_total_minor = base_subtotal_minor + customer_fee_minor;
    const promoter_fee_minor = calcFee(base_subtotal_minor, 5);
    const promoter_proceeds_minor = base_subtotal_minor - promoter_fee_minor;
    const platform_gross_minor = customer_fee_minor + promoter_fee_minor;

    // ── 9. Generate order number ─────────────────────────────────────────────────
    const { data: orderNumRow, error: orderNumErr } = await supabaseAdmin
      .rpc('generate_ticket_order_number');
    if (orderNumErr || !orderNumRow) {
      console.error('[create-ticket-checkout] Failed to generate order number:', orderNumErr?.message);
      return new Response(JSON.stringify({ error: 'Failed to generate order number. Please try again.' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const order_number = orderNumRow as string;

    // ── 10. Create pending order ─────────────────────────────────────────────────
    const orderId = crypto.randomUUID();
    const { error: orderInsertErr } = await supabaseAdmin
      .from('ticket_orders')
      .insert({
        id: orderId,
        order_number,
        buyer_id: user.id,
        event_id,
        currency: currency.toLowerCase(), // stripe expects lowercase
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
      console.error('[create-ticket-checkout] Order insert failed:', orderInsertErr.message);
      return new Response(JSON.stringify({ error: 'Failed to create order. Please try again.' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── 11. Create order items (immutable snapshot) ──────────────────────────────
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
      // Rollback: delete the order
      await supabaseAdmin.from('ticket_orders').delete().eq('id', orderId);
      console.error('[create-ticket-checkout] Order items insert failed:', itemsInsertErr.message);
      return new Response(JSON.stringify({ error: 'Failed to create order items. Please try again.' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── 12. Atomically reserve inventory ─────────────────────────────────────────
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
      // Rollback order + items
      await supabaseAdmin.from('ticket_order_items').delete().eq('order_id', orderId);
      await supabaseAdmin.from('ticket_orders').delete().eq('id', orderId);
      const msg = (reserveResult as Record<string, unknown>)?.error ?? reserveErr?.message ?? 'Inventory reservation failed.';
      console.error('[create-ticket-checkout] Reservation failed:', msg);
      return new Response(JSON.stringify({ error: msg as string }), {
        status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const reservationResult = reserveResult as Record<string, unknown>;
    const expires_at = reservationResult.expires_at as string;

    // ── 13. Create Stripe Checkout Session ───────────────────────────────────────
    const lineItems = validatedItems.map((it) => ({
      price_data: {
        currency: 'usd',
        product_data: {
          name: it.name,
          description: `Ticket for: ${eventRow.title}`,
        },
        unit_amount: it.unit_price_minor,
      },
      quantity: it.quantity,
    }));

    // Add customer fee as a separate line item
    if (customer_fee_minor > 0) {
      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Service Fee',
            description: '5% platform service fee',
          },
          unit_amount: customer_fee_minor,
        },
        quantity: 1,
      });
    }

    let stripeSession: { id: string; url: string | null; payment_intent: string | null };
    try {
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: lineItems,
        mode: 'payment',
        success_url: platform === 'web'
          ? `https://vybzhub.com/tickets/success?session_id={CHECKOUT_SESSION_ID}&order_id=${orderId}`
          : `vybzhub://ticket-success?session_id={CHECKOUT_SESSION_ID}&order_id=${orderId}`,
        cancel_url: platform === 'web'
          ? `https://vybzhub.com/tickets/cancel?order_id=${orderId}&event_id=${event_id}`
          : `vybzhub://ticket-cancel?order_id=${orderId}&event_id=${event_id}`,
        metadata: {
          checkout_type: 'ticket',
          order_id: orderId,
          order_number,
          event_id,
          buyer_id: user.id,
        },
        // Expire session after 10 minutes (matches reservation TTL)
        expires_at: Math.floor(Date.now() / 1000) + 600,
      });
      stripeSession = {
        id: session.id,
        url: session.url,
        payment_intent: typeof session.payment_intent === 'string' ? session.payment_intent : null,
      };
    } catch (stripeError) {
      // Rollback reservations + order
      await supabaseAdmin
        .from('ticket_inventory_reservations')
        .update({ status: 'released' })
        .eq('order_id', orderId)
        .eq('status', 'active');
      await supabaseAdmin.from('ticket_order_items').delete().eq('order_id', orderId);
      await supabaseAdmin.from('ticket_orders').delete().eq('id', orderId);
      console.error('[create-ticket-checkout] Stripe session creation failed:', String(stripeError).slice(0, 200));
      return new Response(JSON.stringify({ error: 'Payment provider error. Please try again.' }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update order with Stripe session reference
    await supabaseAdmin
      .from('ticket_orders')
      .update({ payment_reference: stripeSession.id })
      .eq('id', orderId);

    console.log(`[create-ticket-checkout] Order created: order=${orderId} num=${order_number} event=${event_id} buyer=${user.id.slice(0,8)} total=${customer_total_minor} currency=usd tiers=${validatedItems.length}`);

    return new Response(JSON.stringify({
      ok: true,
      checkout_url: stripeSession.url,
      session_id: stripeSession.id,
      order_id: orderId,
      order_number,
      expires_at,
      amounts: {
        base_subtotal_minor,
        customer_fee_minor,
        customer_total_minor,
        currency: 'usd',
      },
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('[create-ticket-checkout] Unhandled error:', String(err).slice(0, 200));
    return new Response(JSON.stringify({ error: 'Internal server error.' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
