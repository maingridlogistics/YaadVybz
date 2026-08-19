// verify-whatsapp-otp — Verify WhatsApp OTP via Twilio and establish Supabase session
//
// Flow:
//   1. Normalize + validate phone
//   2. Call Twilio VerificationCheck — only proceed if status === 'approved'
//   3. Look up existing Supabase user by normalized phone (user_profiles.phone)
//   4a. Found: generate a magic-link / OTP session for that user
//   4b. Not found: create new Supabase auth user + profile with phone, then session
//   5. Return session tokens to client
//
// Security:
//   - Twilio credentials NEVER returned to client
//   - Phone uniqueness enforced server-side
//   - Session generated via service-role admin.createUser / admin.generateLink
//   - OTP code never logged

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

// ─── Phone Normalisation (must match send-whatsapp-otp exactly) ───────────────
function normalizePhone(raw: string): string | null {
  if (!raw) return null;
  let digits = raw.trim();
  const hasPlus = digits.startsWith('+');
  digits = digits.replace(/\D/g, '');
  if (!digits) return null;
  if (hasPlus) return `+${digits}`;
  if (digits.length === 10 && (digits.startsWith('876') || digits.startsWith('658'))) {
    return `+1${digits}`;
  }
  if (digits.length === 7) return `+1876${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.length >= 10) return `+${digits}`;
  return null;
}

function isValidE164(phone: string): boolean {
  return /^\+[1-9]\d{6,14}$/.test(phone);
}

// ─── Generate a random email-style address for phone-only users ───────────────
// Phone-only WhatsApp users need an internal email for Supabase auth.
// We generate a stable internal address from the phone number.
function phoneToInternalEmail(phone: string): string {
  // Remove + and replace with underscore to make it a valid local part
  const clean = phone.replace(/^\+/, '').replace(/\D/g, '');
  return `whatsapp_${clean}@vybzhub.internal`;
}

// ─── Generate a secure random password for phone-only accounts ───────────────
// Phone users never see or use this password; only WhatsApp OTP is their auth method.
function generateSecurePassword(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => chars[b % chars.length]).join('');
}

// ─── Main ─────────────────────────────────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

  const TWILIO_ACCOUNT_SID        = Deno.env.get('TWILIO_ACCOUNT_SID') ?? '';
  const TWILIO_AUTH_TOKEN         = Deno.env.get('TWILIO_AUTH_TOKEN') ?? '';
  const TWILIO_VERIFY_SERVICE_SID = Deno.env.get('TWILIO_VERIFY_SERVICE_SID') ?? '';
  const SUPABASE_URL              = Deno.env.get('SUPABASE_URL') ?? '';
  const SERVICE_ROLE_KEY          = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_VERIFY_SERVICE_SID) {
    return new Response(
      JSON.stringify({ ok: false, error: 'WhatsApp verification is not configured.', code: 'NOT_CONFIGURED' }),
      { status: 503, headers: jsonHeaders },
    );
  }

  // Parse body
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid request.' }), { status: 400, headers: jsonHeaders });
  }

  const rawPhone  = typeof body.phone === 'string' ? body.phone : '';
  const otpCode   = typeof body.code  === 'string' ? body.code.trim().replace(/\D/g, '') : '';

  const phone = normalizePhone(rawPhone);

  if (!phone || !isValidE164(phone)) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Please enter a valid phone number.', code: 'INVALID_PHONE' }),
      { status: 400, headers: jsonHeaders },
    );
  }

  if (!otpCode || otpCode.length < 4 || otpCode.length > 10) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Please enter a valid verification code.', code: 'INVALID_CODE' }),
      { status: 400, headers: jsonHeaders },
    );
  }

  // ── 1. Verify OTP with Twilio ─────────────────────────────────────────────
  const twilioUrl = `https://verify.twilio.com/v2/Services/${TWILIO_VERIFY_SERVICE_SID}/VerificationCheck`;
  const twilioBody = new URLSearchParams({ To: phone, Code: otpCode });
  const credentials = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);

  let twilioRes: Response;
  try {
    twilioRes = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: twilioBody.toString(),
    });
  } catch (err: any) {
    console.error('[verify-whatsapp-otp] Network error calling Twilio:', err.message);
    return new Response(
      JSON.stringify({ ok: false, error: 'Verification failed. Please try again.', code: 'NETWORK_ERROR' }),
      { status: 502, headers: jsonHeaders },
    );
  }

  let twilioData: any = {};
  try { twilioData = await twilioRes.json(); } catch {}

  // Only accept 'approved' status
  if (!twilioRes.ok || twilioData.status !== 'approved') {
    const errCode: number = twilioData.code ?? 0;
    console.warn(`[verify-whatsapp-otp] Twilio verification failed: status=${twilioData.status} code=${errCode}`);

    let userMessage = 'That verification code is incorrect. Please try again.';
    if (errCode === 60202) {
      userMessage = 'Maximum verification attempts reached. Please request a new code.';
    } else if (errCode === 60203 || twilioData.status === 'expired') {
      userMessage = 'The code has expired. Please request a new one.';
    } else if (twilioData.status === 'canceled') {
      userMessage = 'This verification has been cancelled. Please request a new code.';
    }

    return new Response(
      JSON.stringify({ ok: false, error: userMessage, code: 'VERIFICATION_FAILED' }),
      { status: 400, headers: jsonHeaders },
    );
  }

  // ── 2. Twilio approved — proceed with Supabase session ───────────────────
  const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── 3. Look up existing Vybz Hub account by verified phone ───────────────
  // Search in user_profiles (normalised E.164 stored there)
  const { data: existingProfile, error: lookupErr } = await supabaseAdmin
    .from('user_profiles')
    .select('id, email, phone')
    .eq('phone', phone)
    .maybeSingle();

  if (lookupErr) {
    console.error('[verify-whatsapp-otp] Profile lookup error:', lookupErr.message);
    return new Response(
      JSON.stringify({ ok: false, error: 'Verification failed. Please try again.', code: 'DB_ERROR' }),
      { status: 500, headers: jsonHeaders },
    );
  }

  let userId: string;
  let isNewUser = false;

  if (existingProfile) {
    // ── 4a. Existing account — sign them in ─────────────────────────────────
    userId = existingProfile.id;
    console.log(`[verify-whatsapp-otp] Existing user found: ${userId.slice(0, 8)}***`);
  } else {
    // ── 4b. No existing account — create new Supabase user + profile ────────
    isNewUser = true;
    const internalEmail = phoneToInternalEmail(phone);
    const securePassword = generateSecurePassword();

    // Check if internal email already exists (edge case: prior failed registration)
    const { data: emailCheck } = await supabaseAdmin.auth.admin.listUsers();
    const existingByEmail = (emailCheck?.users ?? []).find(
      (u: any) => u.email === internalEmail
    );

    if (existingByEmail) {
      // Orphaned auth record without profile — reuse it
      userId = existingByEmail.id;
      console.log(`[verify-whatsapp-otp] Recovered orphaned auth user: ${userId.slice(0, 8)}***`);

      // Ensure user_profiles row exists
      await supabaseAdmin.from('user_profiles').upsert({
        id: userId,
        email: internalEmail,
        phone,
        name: '',
        roles: ['attendee'],
      }, { onConflict: 'id' });
    } else {
      // Create brand-new auth user
      const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email: internalEmail,
        password: securePassword,
        email_confirm: true,  // pre-confirm since phone OTP is the verification
        phone,
        phone_confirm: true,
        user_metadata: {
          name: '',
          roles: ['attendee'],
          phone,
          created_via: 'whatsapp_otp',
        },
      });

      if (createErr || !newUser?.user) {
        console.error('[verify-whatsapp-otp] User creation failed:', createErr?.message);
        return new Response(
          JSON.stringify({ ok: false, error: 'Could not create your account. Please try again.', code: 'CREATE_ERROR' }),
          { status: 500, headers: jsonHeaders },
        );
      }

      userId = newUser.user.id;
      console.log(`[verify-whatsapp-otp] New user created: ${userId.slice(0, 8)}***`);

      // The on_auth_user_created trigger should create user_profiles.
      // Upsert to guarantee it even if trigger hasn't fired yet.
      await supabaseAdmin.from('user_profiles').upsert({
        id: userId,
        email: internalEmail,
        phone,
        name: '',
        roles: ['attendee'],
        joined_at: new Date().toISOString(),
      }, { onConflict: 'id' });
    }
  }

  // ── 5. Generate a session for the user ───────────────────────────────────
  // admin.createSession is the safest approach — creates a real Supabase session
  // without exposing credentials.
  const { data: sessionData, error: sessionErr } = await supabaseAdmin.auth.admin.createSession(userId);

  if (sessionErr || !sessionData?.session) {
    console.error('[verify-whatsapp-otp] Session creation failed:', sessionErr?.message);
    return new Response(
      JSON.stringify({ ok: false, error: 'Could not establish your session. Please try again.', code: 'SESSION_ERROR' }),
      { status: 500, headers: jsonHeaders },
    );
  }

  const { access_token, refresh_token, expires_in } = sessionData.session;

  console.log(`[verify-whatsapp-otp] Session granted for user ${userId.slice(0, 8)}*** (new=${isNewUser})`);

  return new Response(
    JSON.stringify({
      ok: true,
      access_token,
      refresh_token,
      expires_in,
      user_id: userId,
      is_new_user: isNewUser,
    }),
    { status: 200, headers: jsonHeaders },
  );
});
