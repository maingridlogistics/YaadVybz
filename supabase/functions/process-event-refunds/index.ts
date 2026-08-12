// process-event-refunds/index.ts — Phase 6
// Server-side execution of pending refunds for a cancelled event.
// Only callable by admin. Processes ticket_refunds with status='refund_pending'.
// Uses server-side Stripe API — client never controls refund amounts or IDs.
// Idempotent: already-processed refunds are skipped.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14?target=deno&no-check';
import { corsHeaders } from '../_shared/cors.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-04-10',
  httpClient: Stripe.createFetchHttpClient(),
});

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  try {
    // ── Auth: admin only ──────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');
    if (!token) {
      return new Response(JSON.stringify({ ok: false, error: 'Authentication required.' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: { user }, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !user) {
      return new Response(JSON.stringify({ ok: false, error: 'Invalid token.' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check admin role
    const { data: profile } = await supabaseAdmin
      .from('user_profiles')
      .select('roles')
      .eq('id', user.id)
      .single();
    if (!(profile?.roles ?? []).includes('admin')) {
      return new Response(JSON.stringify({ ok: false, error: 'Admin authorization required.' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { event_id } = await req.json();
    if (!event_id) {
      return new Response(JSON.stringify({ ok: false, error: 'event_id is required.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Fetch pending refunds for this event ──────────────────────────────────
    const { data: refunds, error: refundErr } = await supabaseAdmin
      .from('ticket_refunds')
      .select('id, order_id, amount_minor, currency, status, refund_reason')
      .eq('status', 'refund_pending')
      .limit(100);

    if (refundErr) throw new Error(refundErr.message);

    // Filter to this event only (join via orders)
    const orderIds = (refunds ?? []).map((r: any) => r.order_id);
    if (orderIds.length === 0) {
      return new Response(JSON.stringify({ ok: true, processed: 0, message: 'No pending refunds.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: orders } = await supabaseAdmin
      .from('ticket_orders')
      .select('id, event_id, buyer_id, payment_reference, currency, customer_total_minor')
      .eq('event_id', event_id)
      .in('id', orderIds);

    const targetOrderIds = new Set((orders ?? []).map((o: any) => o.id));
    const orderMap = new Map((orders ?? []).map((o: any) => [o.id, o]));

    const eventRefunds = (refunds ?? []).filter((r: any) => targetOrderIds.has(r.order_id));

    let processed = 0;
    let failed = 0;

    for (const refund of eventRefunds) {
      const order = orderMap.get(refund.order_id);
      if (!order?.payment_reference) {
        // No payment reference — cannot refund via Stripe
        await supabaseAdmin
          .from('ticket_refunds')
          .update({ status: 'failed', notes: 'No Stripe payment reference on order.' })
          .eq('id', refund.id);
        failed++;
        continue;
      }

      try {
        // Get the payment intent to find the charge
        const pi = await stripe.paymentIntents.retrieve(order.payment_reference);
        const latestCharge = typeof pi.latest_charge === 'string' ? pi.latest_charge : null;
        if (!latestCharge) {
          await supabaseAdmin.from('ticket_refunds')
            .update({ status: 'failed', notes: 'No charge found on payment intent.' })
            .eq('id', refund.id);
          failed++;
          continue;
        }

        // Execute refund — server-side only, exact amount from our records
        const stripeRefund = await stripe.refunds.create({
          charge: latestCharge,
          amount: refund.amount_minor, // exact minor units from our immutable snapshot
          reason: 'fraudulent', // closest Stripe reason for event cancellation
          metadata: { refund_id: refund.id, event_id, reason: refund.refund_reason.slice(0, 255) },
        });

        // Mark refund record as completed
        await supabaseAdmin.from('ticket_refunds').update({
          status: 'refunded',
          provider_refund_ref: stripeRefund.id,
          processed_at: new Date().toISOString(),
        }).eq('id', refund.id);

        // Mark order as refunded
        await supabaseAdmin.from('ticket_orders')
          .update({ refunded_at: new Date().toISOString(), payment_status: 'refunded' })
          .eq('id', refund.order_id);

        // Notify buyer
        if (order.buyer_id) {
          await supabaseAdmin.from('notifications').insert({
            user_id: order.buyer_id,
            type: 'refund_completed',
            title: 'Refund Processed',
            body: `Your refund of ${(refund.amount_minor / 100).toFixed(2)} ${refund.currency.toUpperCase()} has been issued. Please allow 5–10 business days for it to appear on your statement.`,
            event_id,
            read: false,
          });
        }

        processed++;
        console.log(`[process-event-refunds] Refunded: refund=${refund.id} stripe=${stripeRefund.id} amount=${refund.amount_minor}`);

      } catch (stripeErr: any) {
        await supabaseAdmin.from('ticket_refunds').update({
          status: 'failed',
          notes: `Stripe: ${String(stripeErr.message ?? stripeErr).slice(0, 255)}`,
        }).eq('id', refund.id);
        console.error(`[process-event-refunds] Refund failed for ${refund.id}:`, String(stripeErr).slice(0, 200));
        failed++;
      }
    }

    return new Response(JSON.stringify({ ok: true, processed, failed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[process-event-refunds] Error:', String(err).slice(0, 200));
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
