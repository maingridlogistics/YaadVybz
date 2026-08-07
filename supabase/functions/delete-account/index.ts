// delete-account edge function v3
//
// Supports two actions (default: 'approve'):
//
// Approval: body = { request_id: string, action?: 'approve' }
//   — Verifies caller is admin
//   — Sends approval email to user before deletion
//   — Deletes the target user from Supabase Auth (cascades to all related data)
//   — Marks the deletion request as 'approved'
//
// Rejection: body = { request_id: string, action: 'reject', rejection_reason?: string }
//   — Verifies caller is admin
//   — Marks the deletion request as 'rejected' with optional reason
//   — Sends rejection email to user
//   — Account remains active

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { buildEmailHtml, buildEmailText, getEmailSubject } from '../_shared/emailTemplates.ts';

// ─── Email transport env ───────────────────────────────────────────────────────
const POSTAL_API_URL  = Deno.env.get('POSTAL_API_URL')  ?? '';
const POSTAL_API_KEY  = Deno.env.get('POSTAL_API_KEY')  ?? '';
const SMTP_HOST       = Deno.env.get('SMTP_HOST')       ?? '';
const SMTP_PORT       = parseInt(Deno.env.get('SMTP_PORT') ?? '587');
const SMTP_USER       = Deno.env.get('SMTP_USER')       ?? '';
const SMTP_PASS       = Deno.env.get('SMTP_PASS')       ?? '';
const EMAIL_FROM      = Deno.env.get('EMAIL_FROM')      ?? 'notifications@vybzhub.com';
const EMAIL_FROM_NAME = Deno.env.get('EMAIL_FROM_NAME') ?? 'Vybz Hub';

/**
 * Send a transactional email via Postal (primary) or SMTP denomailer (fallback).
 * Never throws — failures are logged and silently skipped.
 */
async function sendAccountEmail(
  to: string,
  type: string,
  data: Record<string, any>,
): Promise<void> {
  try {
    const subject = getEmailSubject(type, data);
    const html    = buildEmailHtml(type, data);
    const text    = buildEmailText(type, data);

    if (POSTAL_API_URL && POSTAL_API_KEY) {
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
        console.warn(`[delete-account] Postal failed (${res.status}): ${body.slice(0, 200)}`);
      } else {
        console.log(`[delete-account] Email sent via Postal → ${to} [${type}]`);
      }
      return;
    }

    if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
      const { SMTPClient } = await import('https://deno.land/x/denomailer@1.6.0/mod.ts');
      const useSSL = SMTP_PORT === 465;
      const client = new SMTPClient({
        connection: { hostname: SMTP_HOST, port: SMTP_PORT, tls: useSSL, auth: { username: SMTP_USER, password: SMTP_PASS } },
      });
      try {
        await client.send({ from: `${EMAIL_FROM_NAME} <${EMAIL_FROM}>`, to, subject, content: text, html });
        console.log(`[delete-account] Email sent via SMTP → ${to} [${type}]`);
      } finally {
        await client.close();
      }
      return;
    }

    console.warn('[delete-account] No email transport configured — skipping notification email');
  } catch (err) {
    console.warn('[delete-account] Email send error:', String(err).slice(0, 200));
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing Authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const token = authHeader.replace('Bearer ', '');

    // Verify caller's identity
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Service-role client for privileged operations
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const body          = await req.json().catch(() => ({}));
    const requestId     = body?.request_id as string | undefined;
    const action        = (body?.action as string | undefined) ?? 'approve';
    const rejectionReason = body?.rejection_reason as string | undefined;

    if (!requestId) {
      return new Response(
        JSON.stringify({ error: 'request_id is required. Account deletion requests are submitted via the app.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Verify caller is an admin
    const { data: profile } = await supabaseAdmin
      .from('user_profiles')
      .select('roles')
      .eq('id', user.id)
      .single();

    if (!profile?.roles?.includes('admin')) {
      return new Response(
        JSON.stringify({ error: 'Admin access required to manage deletion requests' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Fetch the deletion request
    const { data: delRequest, error: reqError } = await supabaseAdmin
      .from('account_deletion_requests')
      .select('*')
      .eq('id', requestId)
      .single();

    if (reqError || !delRequest) {
      return new Response(
        JSON.stringify({ error: 'Deletion request not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (delRequest.status !== 'pending') {
      return new Response(
        JSON.stringify({ error: `Request is already ${delRequest.status}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── Rejection path ─────────────────────────────────────────────────────────
    if (action === 'reject') {
      console.log(`[delete-account] Admin ${user.id} rejecting deletion request ${requestId} for user ${delRequest.user_id}`);

      // Try updating with rejection_reason; fall back without it if column is missing
      const fullUpdate: Record<string, any> = {
        status:      'rejected',
        reviewed_at: new Date().toISOString(),
        reviewed_by: user.id,
        ...(rejectionReason ? { rejection_reason: rejectionReason } : {}),
      };

      const { error: updateErr } = await supabaseAdmin
        .from('account_deletion_requests')
        .update(fullUpdate)
        .eq('id', requestId);

      if (updateErr) {
        // Retry without rejection_reason (SQL migration may be pending)
        const { error: retryErr } = await supabaseAdmin
          .from('account_deletion_requests')
          .update({
            status:      'rejected',
            reviewed_at: new Date().toISOString(),
            reviewed_by: user.id,
          })
          .eq('id', requestId);

        if (retryErr) {
          console.error('[delete-account] Status update failed:', retryErr.message);
          return new Response(
            JSON.stringify({ error: `Failed to update request: ${retryErr.message}` }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          );
        }
        console.warn('[delete-account] rejection_reason column missing — apply DB migration to enable storage');
      }

      // Send rejection email to user (account remains active)
      if (delRequest.user_email) {
        await sendAccountEmail(delRequest.user_email, 'account_deletion_rejected', {
          userName: delRequest.user_name ?? undefined,
          rejectionReason: rejectionReason ?? undefined,
        });
      }

      console.log(`[delete-account] Rejection complete: request=${requestId} user=${delRequest.user_id}`);
      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── Approval path ──────────────────────────────────────────────────────────
    console.log(`[delete-account] Admin ${user.id} approving deletion of user ${delRequest.user_id}`);

    // Send approval email BEFORE deleting (user_email in delRequest is still available)
    if (delRequest.user_email) {
      await sendAccountEmail(delRequest.user_email, 'account_deletion_approved', {
        userName: delRequest.user_name ?? undefined,
      });
    }

    // Delete the user from Supabase Auth.
    // All related data (user_profiles, events, rsvps, follows, etc.) is removed
    // automatically via ON DELETE CASCADE foreign-key constraints.
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(delRequest.user_id);
    if (deleteError) {
      console.error(`[delete-account] Delete failed for ${delRequest.user_id}:`, deleteError.message);
      return new Response(
        JSON.stringify({ error: `Failed to delete account: ${deleteError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Mark request as approved
    await supabaseAdmin
      .from('account_deletion_requests')
      .update({
        status:      'approved',
        reviewed_at: new Date().toISOString(),
        reviewed_by: user.id,
      })
      .eq('id', requestId);

    console.log(`[delete-account] Successfully deleted user ${delRequest.user_id} (request ${requestId})`);
    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err: any) {
    console.error('[delete-account] Unexpected error:', err);
    return new Response(
      JSON.stringify({ error: err.message ?? 'Unexpected server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
