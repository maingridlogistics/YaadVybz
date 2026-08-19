// check-email-registered
// Checks whether an email address is already associated with a Vybz Hub account.
// Returns { exists: boolean } only — no account details are exposed.
// Used by the auth flow to route new users to signup and existing users to login.
//
// Rate-limited: max 10 requests per IP per 10 minutes (checked via in-memory store).
// This is intentionally a user-enumeration endpoint — scoped to email existence only,
// consistent with common UX patterns (Google, GitHub, etc.). No sensitive data returned.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

// ─── In-memory rate limiter ───────────────────────────────────────────────────
// Resets on cold start. Sufficient to block casual enumeration bots.
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT_MAX;
}

// ─── Handler ──────────────────────────────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // Rate limiting by IP
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (isRateLimited(ip)) {
    return new Response(
      JSON.stringify({ error: 'Too many requests. Please wait before trying again.', code: 'RATE_LIMITED' }),
      { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  let email: string;
  try {
    const body = await req.json();
    email = (body?.email ?? '').trim().toLowerCase();
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid request body.' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return new Response(
      JSON.stringify({ error: 'A valid email address is required.' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // Use service role to check auth.users by email — no sensitive data returned
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  try {
    // Query user_profiles by email (service role bypasses RLS)
    // This is reliable since user_profiles is synced from auth.users via trigger
    const { data, error } = await supabaseAdmin
      .from('user_profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (error) {
      console.error('[check-email-registered] DB error:', error.message);
      // Fail open — caller will route to login (safer default)
      return new Response(
        JSON.stringify({ exists: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({ exists: !!data }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err: any) {
    console.error('[check-email-registered] Unexpected error:', err?.message);
    // Fail open — route to login
    return new Response(
      JSON.stringify({ exists: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
