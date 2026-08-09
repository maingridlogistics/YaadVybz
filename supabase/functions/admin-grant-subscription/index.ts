// admin-grant-subscription — Server-side admin subscription grant.
//
// ISSUE-008 FIX: Replaces the previous client-side direct user_profiles.update()
//   with a server-side Edge Function that:
//     1. Verifies admin role server-side (cannot be bypassed by client)
//     2. Calls shared syncSubscriptionEntitlements() (same path as Stripe/Apple/Google)
//     3. Creates a proper subscriptions ledger row with payment_provider='admin'
//
// Actions:
//   grant:       Grant a lifetime plan to a user
//   revoke:      Revoke an admin-granted plan (return to free tier)
//   grant_boost: Add complimentary boost credits to a user

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import {
  syncSubscriptionEntitlements,
  downgradeToFree,
  PLAN_ENTITLEMENTS,
} from '../_shared/entitlements.ts';

const VALID_TIERS = ['pro', 'elite'] as const;
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
    const tier = typeof body.tier === 'string' ? body.tier.toLowerCase() : '';
    if (!(VALID_TIERS as readonly string[]).includes(tier)) {
      return new Response(JSON.stringify({ ok: false, error: 'tier must be "pro" or "elite"' }), { status: 400, headers: jsonHeaders });
    }

    const tierKey = tier as Tier;
    const lifetimeExpiry = '2099-12-31T23:59:59Z';
    const entitlements = PLAN_ENTITLEMENTS[tierKey];

    // Write entitlements via shared function (same path as Stripe/Apple/Google)
    await syncSubscriptionEntitlements(supabaseAdmin, {
      userId:                  targetUserId,
      plan:                    tierKey,
      subscriptionStatus:      'active',
      paymentProvider:         'admin',
      currentPeriodEnd:        lifetimeExpiry,
      overrideRemainingBoosts: entitlements.monthly_boost_allowance,
    });

    // Record in subscriptions ledger for analytics
    await supabaseAdmin.from('subscriptions').insert({
      user_id:            targetUserId,
      plan:               tierKey,
      billing_cycle:      'monthly',
      status:             'active',
      current_period_end: lifetimeExpiry,
      payment_provider:   'admin',
      environment:        'production',
      last_verified_at:   new Date().toISOString(),
    }).then(() => {}).catch((e: any) => {
      // Non-fatal: entitlements already written to user_profiles
      console.warn('[admin-grant-subscription] ledger insert warning:', e.message);
    });

    console.log(`[admin-grant-subscription] GRANT: admin=${user.id.slice(0,8)} → user=${targetUserId.slice(0,8)} tier=${tierKey}`);
    return new Response(JSON.stringify({ ok: true, tier: tierKey, userId: targetUserId }), { status: 200, headers: jsonHeaders });
  }

  // ── REVOKE ───────────────────────────────────────────────────────────────────
  if (action === 'revoke') {
    await downgradeToFree(supabaseAdmin, targetUserId, 'admin', 'revoked');
    await supabaseAdmin.from('subscriptions')
      .update({ status: 'revoked', revoked_at: new Date().toISOString() })
      .eq('user_id', targetUserId)
      .eq('payment_provider', 'admin')
      .eq('status', 'active');

    console.log(`[admin-grant-subscription] REVOKE: admin=${user.id.slice(0,8)} → user=${targetUserId.slice(0,8)}`);
    return new Response(JSON.stringify({ ok: true, action: 'revoked', userId: targetUserId }), { status: 200, headers: jsonHeaders });
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
