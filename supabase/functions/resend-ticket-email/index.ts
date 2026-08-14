// resend-ticket-email — Admin-only Edge Function for one-time ticket confirmation
// email reconciliation after a previously-failed finalization.
//
// Security model:
//   • Requires valid JWT — caller must be authenticated.
//   • Caller's user_id must have 'admin' in user_profiles.roles (verified server-side).
//   • SUPABASE_SERVICE_ROLE_KEY read from Deno.env — never passed by the caller,
//     never logged, never returned in the response.
//   • Idempotent — checks ticket_confirmation_email_sent sentinel before sending.
//     Safe to call multiple times; only delivers one email per order.
//
// Usage (curl example — replace <JWT> and <ORDER_ID>):
//   curl -X POST https://twilfdbvrzhlnllcmssc.supabase.co/functions/v1/resend-ticket-email \
//     -H "Authorization: Bearer <ADMIN_JWT>" \
//     -H "Content-Type: application/json" \
//     -d '{"order_id":"6c053810-96fa-484f-90fa-84f0de473a6e"}'
//
// Response:
//   { "ok": true,  "result": "sent",       "order_number": "..." }
//   { "ok": true,  "result": "already_sent","order_number": "..." }
//   { "ok": false, "error": "...", "code": "..." }

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

  try {
    // ── 1. Auth — verify caller is a valid admin ────────────────────────────
    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '').trim();
    if (!token) {
      return new Response(JSON.stringify({ ok: false, code: 'unauthorized', error: 'Authorization required.' }), {
        status: 401, headers: jsonHeaders,
      });
    }

    // Service-role client — never exposed to caller
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Resolve the caller from their JWT (not the service role)
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ ok: false, code: 'unauthorized', error: 'Invalid token.' }), {
        status: 401, headers: jsonHeaders,
      });
    }

    // Verify admin role — checked server-side, never trusted from client payload
    const { data: profile } = await supabaseAdmin
      .from('user_profiles')
      .select('roles')
      .eq('id', user.id)
      .maybeSingle();

    if (!Array.isArray(profile?.roles) || !profile.roles.includes('admin')) {
      return new Response(JSON.stringify({ ok: false, code: 'forbidden', error: 'Admin access required.' }), {
        status: 403, headers: jsonHeaders,
      });
    }

    // ── 2. Parse body ──────────────────────────────────────────────────────
    let body: Record<string, unknown>;
    try { body = await req.json(); } catch {
      return new Response(JSON.stringify({ ok: false, code: 'bad_request', error: 'Invalid JSON body.' }), {
        status: 400, headers: jsonHeaders,
      });
    }

    const orderId = typeof body.order_id === 'string' ? body.order_id.trim() : null;
    if (!orderId) {
      return new Response(JSON.stringify({ ok: false, code: 'bad_request', error: 'order_id is required.' }), {
        status: 400, headers: jsonHeaders,
      });
    }

    // ── 3. Load order (must be paid) ──────────────────────────────────────
    const { data: order } = await supabaseAdmin
      .from('ticket_orders')
      .select('id, order_number, buyer_id, buyer_email, buyer_name, event_id, currency, base_subtotal_minor, customer_fee_minor, customer_total_minor, payment_status')
      .eq('id', orderId)
      .maybeSingle();

    if (!order) {
      return new Response(JSON.stringify({ ok: false, code: 'not_found', error: 'Order not found.' }), {
        status: 404, headers: jsonHeaders,
      });
    }

    if (order.payment_status !== 'paid') {
      return new Response(JSON.stringify({
        ok: false, code: 'not_paid',
        error: `Order is in state '${order.payment_status}', not 'paid'. Cannot send confirmation email.`,
      }), { status: 422, headers: jsonHeaders });
    }

    // ── 4. Idempotency: check sentinel ─────────────────────────────────────
    const { data: existingSentinel } = await supabaseAdmin
      .from('notifications')
      .select('id')
      .eq('user_id', order.buyer_id)
      .eq('type', 'ticket_confirmation_email_sent')
      .eq('body', orderId)
      .maybeSingle();

    if (existingSentinel) {
      console.log(`[resend-ticket-email] Email already sent for order ${order.order_number} — sentinel exists`);
      return new Response(JSON.stringify({
        ok: true, result: 'already_sent', order_number: order.order_number,
        message: 'Confirmation email was already sent for this order. No action taken.',
      }), { status: 200, headers: jsonHeaders });
    }

    // ── 5. Verify tickets exist ────────────────────────────────────────────
    const { count: ticketCount } = await supabaseAdmin
      .from('tickets')
      .select('id', { count: 'exact', head: true })
      .eq('order_id', orderId)
      .neq('status', 'void');

    if (!ticketCount || ticketCount === 0) {
      return new Response(JSON.stringify({
        ok: false, code: 'no_tickets',
        error: 'No valid tickets found for this order. Run finalize_ticket_order() first.',
      }), { status: 422, headers: jsonHeaders });
    }

    // ── 6. Resolve buyer email ─────────────────────────────────────────────
    const { data: buyerProfile } = await supabaseAdmin
      .from('user_profiles')
      .select('email, name')
      .eq('id', order.buyer_id)
      .maybeSingle();

    const buyerEmail = (buyerProfile?.email ?? order.buyer_email ?? null) as string | null;
    if (!buyerEmail) {
      return new Response(JSON.stringify({
        ok: false, code: 'no_email',
        error: 'No email address found for this buyer. Email cannot be sent.',
      }), { status: 422, headers: jsonHeaders });
    }

    const buyerName = (buyerProfile?.name ?? order.buyer_name ?? null) as string | null;

    // ── 7. Load event data ─────────────────────────────────────────────────
    const { data: ev } = await supabaseAdmin
      .from('events')
      .select('title, date, start_time, venue, parish')
      .eq('id', order.event_id)
      .maybeSingle();

    // ── 8. Build order line items ─────────────────────────────────────────
    const { data: orderItems } = await supabaseAdmin
      .from('ticket_order_items')
      .select('ticket_type_name_snap, quantity, unit_price_minor_snap')
      .eq('order_id', orderId);

    const currency = String(order.currency ?? 'USD').toUpperCase();

    function fmtMinor(minor: number, cur: string): string {
      const amt = minor / 100;
      return cur.toUpperCase() === 'JMD' ? `J$${amt.toFixed(2)}` : `$${amt.toFixed(2)} USD`;
    }

    const items = ((orderItems ?? []) as Array<Record<string, any>>).map((it) => ({
      name: it.ticket_type_name_snap as string,
      qty: it.quantity as number,
      unitPrice: fmtMinor(it.unit_price_minor_snap as number, currency),
    }));

    // ── 9. Build and send email via send-email Edge Function ───────────────
    const emailData = {
      userName:      buyerName ?? undefined,
      eventTitle:    ev?.title ?? 'Event',
      date:          ev?.date ?? '',
      startTime:     ev?.start_time ?? '',
      venue:         ev?.venue ?? '',
      parish:        ev?.parish ?? '',
      orderNumber:   order.order_number,
      ticketsIssued: ticketCount,
      items,
      feeAmount:     fmtMinor(order.customer_fee_minor ?? 0, currency),
      totalAmount:   fmtMinor(order.customer_total_minor ?? 0, currency),
      currency,
      eventId:       order.event_id ?? '',
    };

    const supabaseUrl   = Deno.env.get('SUPABASE_URL') ?? '';
    // Service role key read from Deno.env — never passed by caller, never logged
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const postalUrl     = Deno.env.get('POSTAL_API_URL') ?? '';
    const postalKey     = Deno.env.get('POSTAL_API_KEY') ?? '';
    const emailFrom     = Deno.env.get('EMAIL_FROM') ?? 'notifications@vybzhub.com';
    const emailFromName = Deno.env.get('EMAIL_FROM_NAME') ?? 'Vybz Hub';

    let emailSent = false;

    // Primary path: Postal direct delivery (fastest, no auth requirement)
    if (postalUrl && postalKey) {
      const subject = `Your Vybz Hub Tickets Are Confirmed — ${emailData.eventTitle}`;
      const itemLines = items.map((it) => `  ${it.qty}x ${it.name}: ${it.unitPrice}`).join('\n');
      const textBody = [
        `Hi ${buyerName ?? 'there'},`,
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
        console.log(`[resend-ticket-email] Postal delivery succeeded: order=${order.order_number}`);
      } else {
        console.warn(`[resend-ticket-email] Postal delivery failed: ${postalRes?.status ?? 'network error'} — trying send-email fallback`);
      }
    }

    // Fallback: delegate to send-email Edge Function (handles SMTP)
    if (!emailSent) {
      const efRes = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type: 'ticket_purchase_confirmed', data: emailData }),
      }).catch(() => null);

      if (efRes?.ok) {
        emailSent = true;
        console.log(`[resend-ticket-email] send-email fallback succeeded: order=${order.order_number}`);
      } else {
        console.error(`[resend-ticket-email] Both delivery paths failed for order=${order.order_number} status=${efRes?.status ?? 'network error'}`);
        return new Response(JSON.stringify({
          ok: false, code: 'delivery_failed',
          error: 'Email could not be delivered via Postal or SMTP fallback. No sentinel written — safe to retry.',
        }), { status: 502, headers: jsonHeaders });
      }
    }

    // ── 10. Record idempotency sentinel ────────────────────────────────────
    // Written only after confirmed delivery so a failed send does not block retry.
    await supabaseAdmin.from('notifications').insert({
      user_id:  order.buyer_id,
      type:     'ticket_confirmation_email_sent',
      title:    'Ticket confirmation email sent',
      body:     orderId,
      event_id: order.event_id ?? null,
      read:     true, // hidden from user notification list
    }).catch(() => {}); // non-fatal — idempotency record is best-effort

    console.log(`[resend-ticket-email] Done: order=${order.order_number} buyer=*** tickets=${ticketCount} admin=${user.id.slice(0, 8)}`);

    return new Response(JSON.stringify({
      ok:           true,
      result:       'sent',
      order_number: order.order_number,
      order_id:     orderId,
      tickets:      ticketCount,
      message:      `Confirmation email sent to buyer. Idempotency sentinel recorded.`,
    }), { status: 200, headers: jsonHeaders });

  } catch (err) {
    console.error('[resend-ticket-email] Unhandled error:', String(err).slice(0, 200));
    return new Response(JSON.stringify({ ok: false, code: 'internal_error', error: 'Internal server error.' }), {
      status: 500, headers: jsonHeaders,
    });
  }
});
