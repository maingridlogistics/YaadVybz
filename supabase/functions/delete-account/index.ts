// delete-account edge function v2
//
// Admin approval mode: body = { request_id: string }
//   — Verifies caller is admin (user_profiles.roles contains 'admin')
//   — Deletes the target user from Supabase Auth (cascades to all related data)
//   — Marks the deletion request as 'approved'
//
// Submissions are handled client-side via Supabase insert into
// account_deletion_requests (RLS enforced). This function is only
// called by admins to approve pending requests.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

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

    const body = await req.json().catch(() => ({}));
    const requestId = body?.request_id as string | undefined;

    if (!requestId) {
      return new Response(
        JSON.stringify({ error: 'request_id is required. Account deletion requests are submitted via the app.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── Admin Approval ────────────────────────────────────────────────────────

    // Verify caller is an admin
    const { data: profile } = await supabaseAdmin
      .from('user_profiles')
      .select('roles')
      .eq('id', user.id)
      .single();

    if (!profile?.roles?.includes('admin')) {
      return new Response(
        JSON.stringify({ error: 'Admin access required to approve deletion requests' }),
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

    console.log(`[delete-account] Admin ${user.id} approving deletion of user ${delRequest.user_id}`);

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
        status: 'approved',
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
