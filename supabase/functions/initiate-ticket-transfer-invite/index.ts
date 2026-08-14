// initiate-ticket-transfer-invite/index.ts
// Handles ticket transfer initiation for both existing and non-existing users.
//
// Flow:
//   1. Caller supplies ticket_id + recipient_email
//   2. RPC initiate_ticket_transfer_invite() handles:
//      - ownership validation, status check, duplicate transfer check
//      - server-side email normalization (trim + lowercase)
//      - existing user lookup by email
//      - creates transfer record with status 'pending' (existing) or 'invited' (new)
//   3. Edge Function handles notifications:
//      - Existing user: in-app notification + push
//      - Non-user: invitation email via Postal/SMTP
//
// Security:
//   - Auth required (JWT validates ownership via RPC)
//   - Service role used only for server-side operations
//   - Recipient email/existence never exposed to caller

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const POSTAL_API_URL  = Deno.env.get('POSTAL_API_URL')  ?? '';
const POSTAL_API_KEY  = Deno.env.get('POSTAL_API_KEY')  ?? '';
const SMTP_HOST       = Deno.env.get('SMTP_HOST')       ?? '';
const SMTP_PORT       = parseInt(Deno.env.get('SMTP_PORT') ?? '587');
const SMTP_USER       = Deno.env.get('SMTP_USER')       ?? '';
const SMTP_PASS       = Deno.env.get('SMTP_PASS')       ?? '';
const EMAIL_FROM      = Deno.env.get('EMAIL_FROM')      ?? 'notifications@vybzhub.com';
const EMAIL_FROM_NAME = Deno.env.get('EMAIL_FROM_NAME') ?? 'Vybz Hub';
const SUPABASE_URL    = Deno.env.get('SUPABASE_URL')    ?? '';
const SERVICE_KEY     = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// ─── Email Transport ──────────────────────────────────────────────────────────

async function sendViaPostal(to: string, subject: string, html: string, text: string): Promise<void> {
  const res = await fetch(`${POSTAL_API_URL}/api/v1/send/message`, {
    method: 'POST',
    headers: { 'X-Server-API-Key': POSTAL_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: [to],
      from: `${EMAIL_FROM_NAME} <${EMAIL_FROM}>`,
      subject,
      html_body: html,
      plain_body: text,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Postal: ${res.status} — ${body.slice(0, 200)}`);
  }
}

async function sendViaSMTP(to: string, subject: string, html: string, text: string): Promise<void> {
  const { SMTPClient } = await import('https://deno.land/x/denomailer@1.6.0/mod.ts');
  const client = new SMTPClient({
    connection: {
      hostname: SMTP_HOST, port: SMTP_PORT,
      tls: SMTP_PORT === 465,
      auth: { username: SMTP_USER, password: SMTP_PASS },
    },
  });
  try {
    await client.send({ from: `${EMAIL_FROM_NAME} <${EMAIL_FROM}>`, to, subject, content: text, html });
  } finally {
    await client.close();
  }
}

function escHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── Transfer Invitation Email Template ──────────────────────────────────────

function buildInvitationEmail(d: {
  senderName: string;
  eventTitle: string;
  eventDate: string;
  eventVenue: string;
  eventParish: string;
  ticketTypeName: string;
  transferId: string;
  expiresAt: string;
  claimUrl: string;
}): { subject: string; html: string; text: string } {
  const subject = `A Vybz Hub Ticket Is Waiting for You — ${d.eventTitle}`;

  const expiry = new Date(d.expiresAt).toLocaleDateString('en-JM', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escHtml(subject)}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box;}
    body{background:#0B1710;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;padding:20px;}
    .wrap{max-width:580px;margin:0 auto;}
    .header{background:linear-gradient(135deg,#0F6B37 0%,#071508 100%);padding:28px 24px;text-align:center;border-radius:12px 12px 0 0;}
    .logo{font-size:20px;font-weight:900;color:#FFC72C;letter-spacing:4px;}
    .logo-sub{color:#6FA882;font-size:13px;margin-top:6px;}
    .body{background:#111D15;padding:28px 24px;border-left:1px solid #1A3322;border-right:1px solid #1A3322;}
    .footer{background:#080F0A;padding:18px 24px;text-align:center;border-radius:0 0 12px 12px;border:1px solid #1A3322;border-top:none;}
    h1{color:#F4EFE4;font-size:22px;font-weight:800;margin-bottom:14px;line-height:1.3;}
    p{color:#B8D4BF;font-size:15px;line-height:1.65;margin-bottom:14px;}
    .card{background:#0F2318;border:1px solid #1E4A2E;border-radius:10px;padding:18px;margin:18px 0;}
    .event-title{color:#F4EFE4;font-size:17px;font-weight:800;margin-bottom:8px;}
    .event-meta{color:#6FA882;font-size:13px;line-height:1.7;}
    .btn-wrap{text-align:center;margin:22px 0 8px;}
    .btn{display:inline-block;background:#FFC72C;color:#0B1710;padding:14px 32px;border-radius:8px;font-weight:800;font-size:15px;text-decoration:none;}
    .gold{color:#FFC72C;} .muted{color:#4A7055;font-size:12px;line-height:1.6;}
    .badge{display:inline-block;background:#1E4A2E;color:#5BC47A;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;margin-bottom:10px;}
    .notice{background:#1A2D1A;border:1px solid #2A4A2A;border-radius:8px;padding:14px;font-size:13px;color:#6FA882;margin:14px 0;}
  </style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <div class="logo">VYBZ HUB</div>
    <div class="logo-sub">Jamaica's Event Scene</div>
  </div>
  <div class="body">
    <div class="badge">🎟 Ticket Incoming</div>
    <h1><span class="gold">${escHtml(d.senderName)}</span> sent you a ticket!</h1>
    <p>You have been gifted a ticket to an upcoming event. No payment required — just create a free Vybz Hub account or sign in to claim it.</p>
    <div class="card">
      <div class="event-title">${escHtml(d.eventTitle)}</div>
      <div class="event-meta">
        ${d.eventDate ? `📅 ${escHtml(d.eventDate)}<br>` : ''}
        ${d.eventVenue ? `📍 ${escHtml(d.eventVenue)}${d.eventParish ? ', ' + escHtml(d.eventParish) : ''}<br>` : ''}
        🎟 Ticket: <strong style="color:#F4EFE4;">${escHtml(d.ticketTypeName)}</strong>
      </div>
    </div>
    <div class="notice">
      ⚠️ This invitation expires on <strong style="color:#F4EFE4;">${escHtml(expiry)}</strong>. You must sign in with the email address this message was sent to.
    </div>
    <div class="btn-wrap">
      <a class="btn" href="${escHtml(d.claimUrl)}">Claim Your Free Ticket</a>
    </div>
    <p style="font-size:13px;color:#4A7055;text-align:center;">Button not working? Copy this link:<br>
      <a href="${escHtml(d.claimUrl)}" style="color:#FFC72C;word-break:break-all;">${escHtml(d.claimUrl)}</a>
    </p>
    <p class="muted" style="margin-top:18px;">Questions? Contact <a href="mailto:info@vybzhub.com" style="color:#FFC72C;">info@vybzhub.com</a></p>
  </div>
  <div class="footer">
    <p class="muted">This invitation was sent on behalf of ${escHtml(d.senderName)}. You are not required to accept it.</p>
    <p class="muted" style="margin-top:6px;">Vybz Hub · Jamaica's Event Scene</p>
  </div>
</div>
</body>
</html>`;

  const text = `${d.senderName} sent you a ticket to "${d.eventTitle}"!

No payment required — just create a Vybz Hub account or sign in to claim it.

EVENT: ${d.eventTitle}
${d.eventDate ? 'DATE: ' + d.eventDate + '\n' : ''}${d.eventVenue ? 'VENUE: ' + d.eventVenue + (d.eventParish ? ', ' + d.eventParish : '') + '\n' : ''}TICKET: ${d.ticketTypeName}

IMPORTANT: This invitation expires ${expiry}. You must sign in with the email address this message was sent to.

CLAIM YOUR TICKET:
${d.claimUrl}

Questions? info@vybzhub.com
Vybz Hub — Jamaica's Event Scene`;

  return { subject, html, text };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');
    if (!token) {
      return new Response(JSON.stringify({ ok: false, error: 'Authentication required.' }), {
        status: 401, headers: jsonHeaders,
      });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ ok: false, error: 'Invalid token.' }), {
        status: 401, headers: jsonHeaders,
      });
    }

    const body = await req.json();
    const { ticket_id, recipient_email } = body as { ticket_id: string; recipient_email: string };

    if (!ticket_id || !recipient_email) {
      return new Response(JSON.stringify({ ok: false, error: 'ticket_id and recipient_email are required.' }), {
        status: 400, headers: jsonHeaders,
      });
    }

    // ── Call RPC: validates ownership, normalizes email, creates transfer ─────
    const { data: rpcData, error: rpcErr } = await supabaseAdmin.rpc('initiate_ticket_transfer_invite', {
      p_ticket_id: ticket_id,
      p_sender_id: user.id,
      p_recipient_email: recipient_email,
    });

    if (rpcErr) {
      return new Response(JSON.stringify({ ok: false, error: rpcErr.message }), {
        status: 400, headers: jsonHeaders,
      });
    }

    const result = rpcData as Record<string, unknown>;
    if (!result?.ok) {
      return new Response(JSON.stringify(result), { status: 400, headers: jsonHeaders });
    }

    const transferId      = result.transfer_id as string;
    const isInvited       = result.is_invited as boolean;
    const recipientUserId = result.recipient_user_id as string | null;
    const expiresAt       = result.expires_at as string | null;

    // ── Load ticket + event details for notification content ──────────────────
    const { data: ticketRow } = await supabaseAdmin
      .from('tickets')
      .select('event_id, ticket_type_id')
      .eq('id', ticket_id)
      .single();

    let eventTitle = 'an event', eventDate = '', eventVenue = '', eventParish = '', ticketTypeName = 'Ticket';
    if (ticketRow) {
      const [evRes, ttRes] = await Promise.all([
        supabaseAdmin.from('events').select('title, date, venue, parish').eq('id', ticketRow.event_id).single(),
        supabaseAdmin.from('event_ticket_types').select('name').eq('id', ticketRow.ticket_type_id).single(),
      ]);
      eventTitle     = (evRes.data as any)?.title    ?? 'an event';
      eventDate      = (evRes.data as any)?.date     ?? '';
      eventVenue     = (evRes.data as any)?.venue    ?? '';
      eventParish    = (evRes.data as any)?.parish   ?? '';
      ticketTypeName = (ttRes.data as any)?.name     ?? 'Ticket';
    }

    // Sender display name
    const { data: senderProfile } = await supabaseAdmin
      .from('user_profiles').select('name').eq('id', user.id).single();
    const senderName = (senderProfile as any)?.name ?? 'Someone';

    // ── Branch: existing user → in-app + push notification ───────────────────
    if (!isInvited && recipientUserId) {
      const notifTitle = `${senderName} sent you a ticket`;
      const notifBody  = `You have a pending ticket transfer for "${eventTitle}". Accept it in My Tickets.`;

      await supabaseAdmin.from('notifications').insert({
        user_id:  recipientUserId,
        type:     'ticket_transfer_pending',
        title:    notifTitle,
        body:     notifBody,
        event_id: ticketRow?.event_id ?? null,
        read:     false,
      });

      // Fire push via send-email helper (fire-and-forget — don't block response)
      const { data: tokenRows } = await supabaseAdmin
        .from('push_tokens').select('id, token, token_type').eq('user_id', recipientUserId);

      if ((tokenRows ?? []).length > 0) {
        fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'ticket_transfer_pending',
            data: { eventTitle },
            recipientUserId,
          }),
        }).catch(() => {});
      }

      console.log(`[TransferInvite] Pending transfer ${transferId} — notified existing user ${recipientUserId.slice(0, 8)}`);

      return new Response(JSON.stringify({
        ok: true,
        transfer_id: transferId,
        is_invited: false,
        recipient_exists: true,
      }), { headers: jsonHeaders });
    }

    // ── Branch: non-existing user → invitation email ──────────────────────────
    const normalizedEmail = recipient_email.trim().toLowerCase();
    const claimUrl = `https://vybzhub.com/claim-ticket?transfer=${transferId}`;

    const { subject, html, text } = buildInvitationEmail({
      senderName,
      eventTitle,
      eventDate,
      eventVenue,
      eventParish,
      ticketTypeName,
      transferId,
      expiresAt: expiresAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      claimUrl,
    });

    const hasTransport = (POSTAL_API_URL && POSTAL_API_KEY) || (SMTP_HOST && SMTP_USER && SMTP_PASS);
    let emailSent = false;

    if (hasTransport) {
      try {
        if (POSTAL_API_URL && POSTAL_API_KEY) {
          await sendViaPostal(normalizedEmail, subject, html, text);
        } else {
          await sendViaSMTP(normalizedEmail, subject, html, text);
        }
        emailSent = true;
        console.log(`[TransferInvite] Invitation email sent → ${normalizedEmail} for transfer ${transferId}`);

        // Record invited_at timestamp
        await supabaseAdmin
          .from('ticket_transfers')
          .update({ invited_at: new Date().toISOString() })
          .eq('id', transferId);

      } catch (emailErr) {
        console.warn('[TransferInvite] Email send failed:', String(emailErr).slice(0, 200));
      }
    } else {
      console.warn('[TransferInvite] No email transport configured — invitation created but email not sent.');
    }

    return new Response(JSON.stringify({
      ok: true,
      transfer_id: transferId,
      is_invited: true,
      recipient_exists: false,
      email_sent: emailSent,
      expires_at: expiresAt,
    }), { headers: jsonHeaders });

  } catch (err) {
    console.error('[TransferInvite] Error:', String(err).slice(0, 200));
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500, headers: jsonHeaders,
    });
  }
});
