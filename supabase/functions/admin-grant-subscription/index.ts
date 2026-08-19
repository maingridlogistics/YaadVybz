
// admin-grant-subscription — Server-side admin Pro grant.
//
// Actions:
//   grant:       Grant admin Pro access to a user (sets admin_pro_granted=true)
//   revoke:      Revoke admin-granted Pro (sets admin_pro_granted=false; respects lifetime_pro_owned)
//   grant_boost: Add complimentary boost credits to a user

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import {
  syncSubscriptionEntitlements,
  downgradeToFree,
  PLAN_ENTITLEMENTS,
} from '../_shared/entitlements.ts';

const VALID_TIERS = ['pro'] as const;
type Tier = typeof VALID_TIERS[number];

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

  // ── 1. Authenticate ──────────────────────────────────────────────────────────
  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '').trim();
  if (!token) {
    return new Response(JSON.stringify({ ok: false, error: 'Authorization required' }), { status: 401, headers: jsonHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !user) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), { status: 401, headers: jsonHeaders });
  }

  // ── 2. Verify admin role server-side ─────────────────────────────────────────
  const { data: adminProfile } = await supabaseAdmin
    .from('user_profiles')
    .select('roles')
    .eq('id', user.id)
    .single();

  const isAdmin = Array.isArray(adminProfile?.roles) && (adminProfile.roles as string[]).includes('admin');
  if (!isAdmin) {
    console.warn(`[admin-grant-subscription] Non-admin access attempt by user=${user.id.slice(0,8)}`);
    return new Response(JSON.stringify({ ok: false, error: 'Administrator access required' }), { status: 403, headers: jsonHeaders });
  }

  // ── 3. Parse body ────────────────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON body' }), { status: 400, headers: jsonHeaders });
  }

  const action       = typeof body.action === 'string' ? body.action : 'grant';
  const targetUserId = typeof body.userId === 'string' ? body.userId.trim() : '';

  if (!targetUserId) {
    return new Response(JSON.stringify({ ok: false, error: 'userId is required' }), { status: 400, headers: jsonHeaders });
  }

  // ── 4. Verify target user exists ─────────────────────────────────────────────
  const { data: targetProfile, error: targetErr } = await supabaseAdmin
    .from('user_profiles')
    .select('id, name, email, subscription_tier')
    .eq('id', targetUserId)
    .single();

  if (targetErr || !targetProfile) {
    return new Response(JSON.stringify({ ok: false, error: 'Target user not found' }), { status: 404, headers: jsonHeaders });
  }

  // ── GRANT ────────────────────────────────────────────────────────────────────
  if (action === 'grant') {
    // Only Pro exists — ignore any legacy 'elite' tier sent from old clients
    const entitlements = PLAN_ENTITLEMENTS['pro'];

    // Use admin_grant_pro RPC (SECURITY DEFINER) to set admin_pro_granted=true
    const { data: rpcData, error: rpcErr } = await supabaseAdmin.rpc('admin_grant_pro', {
      p_user_id: targetUserId,
      p_grant:   true,
    });
    if (rpcErr) throw new Error(rpcErr.message);
    const rpcResult = rpcData as { ok: boolean; error?: string } | null;
    if (!rpcResult?.ok) {
      return new Response(JSON.stringify({ ok: false, error: rpcResult?.error ?? 'Failed to grant Pro' }), { status: 400, headers: jsonHeaders });
    }

    // Record in subscriptions ledger for analytics
    await supabaseAdmin.from('subscriptions').insert({
      user_id:            targetUserId,
      plan:               'pro',
      billing_cycle:      'monthly',
      status:             'active',
      current_period_end: '2099-12-31T23:59:59Z',
      payment_provider:   'admin',
      environment:        'production',
      last_verified_at:   new Date().toISOString(),
    }).then(() => {}).catch((e: any) => {
      console.warn('[admin-grant-subscription] ledger insert warning:', e.message);
    });

    console.log(`[admin-grant-subscription] GRANT Pro: admin=${user.id.slice(0,8)} → user=${targetUserId.slice(0,8)}`);
    return new Response(JSON.stringify({ ok: true, tier: 'pro', userId: targetUserId }), { status: 200, headers: jsonHeaders });
  }

  // ── REVOKE ───────────────────────────────────────────────────────────────────
  if (action === 'revoke') {
    // Use admin_grant_pro RPC with p_grant=false
    // This respects lifetime_pro_owned — user stays Pro if they purchased it
    const { data: rpcData, error: rpcErr } = await supabaseAdmin.rpc('admin_grant_pro', {
      p_user_id: targetUserId,
      p_grant:   false,
    });
    if (rpcErr) throw new Error(rpcErr.message);

    // Mark admin subscription ledger rows as revoked
    await supabaseAdmin.from('subscriptions')
      .update({ status: 'revoked', revoked_at: new Date().toISOString() })
      .eq('user_id', targetUserId)
      .eq('payment_provider', 'admin')
      .eq('status', 'active');

    const result = rpcData as { ok: boolean; effective_tier?: string } | null;
    console.log(`[admin-grant-subscription] REVOKE: admin=${user.id.slice(0,8)} → user=${targetUserId.slice(0,8)} effective_tier=${result?.effective_tier}`);
    return new Response(JSON.stringify({ ok: true, action: 'revoked', userId: targetUserId, effectiveTier: result?.effective_tier }), { status: 200, headers: jsonHeaders });
  }

  // ── GRANT_BOOST ──────────────────────────────────────────────────────────────
  if (action === 'grant_boost') {
    const credits = typeof body.credits === 'number' ? Math.max(1, Math.min(100, body.credits)) : 1;

    // Read current balance then add (admin grants are infrequent, so race conditions acceptable)
    const { data: currentProfile } = await supabaseAdmin
      .from('user_profiles')
      .select('remaining_boosts')
      .eq('id', targetUserId)
      .single();
    const current = (currentProfile?.remaining_boosts as number) ?? 0;

    await supabaseAdmin.from('user_profiles')
      .update({ remaining_boosts: current + credits })
      .eq('id', targetUserId);

    console.log(`[admin-grant-subscription] GRANT_BOOST: admin=${user.id.slice(0,8)} → user=${targetUserId.slice(0,8)} credits=${credits}`);
    return new Response(JSON.stringify({ ok: true, action: 'grant_boost', credits, newBalance: current + credits, userId: targetUserId }), { status: 200, headers: jsonHeaders });
  }

  return new Response(JSON.stringify({ ok: false, error: `Unknown action: ${action}. Valid: grant, revoke, grant_boost` }), { status: 400, headers: jsonHeaders });
});
