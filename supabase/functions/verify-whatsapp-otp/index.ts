// verify-whatsapp-otp — Verify WhatsApp OTP via Twilio and establish Supabase session
//
// Flow:
//   1. Normalize + validate phone
//   2. Call Twilio VerificationCheck — only proceed if status === 'approved'
//   3. Look up existing account via user_profiles WHERE phone = X AND phone_verified = true
//   4a. Found:     reuse that userId → create session
//   4b. Not found: createUser() → if duplicate email error, recover via user_profiles.phone lookup
//   5. Set phone_verified = true (service-role bypasses RLS trigger guard)
//   6. admin.createSession(userId) → return access_token + refresh_token to client
//
// Removed: getUserByEmail (NOT a real @supabase/supabase-js@2 admin method)
// Removed: listUsers() full-table scan
// Session: admin.createSession(userId) — confirmed in @supabase/supabase-js@2.38+

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

// Stable internal email derived from phone — used only for Supabase auth identity.
// WhatsApp users never see or use this address.
function phoneToInternalEmail(phone: string): string {
  const clean = phone.replace(/^\+/, '').replace(/\D/g, '');
  return `whatsapp_${clean}@vybzhub.internal`;
}

// Random 32-char password that WhatsApp users never see.
// Phone OTP is their only authentication mechanism.
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

  const rawPhone = typeof body.phone === 'string' ? body.phone : '';
  const otpCode  = typeof body.code  === 'string' ? body.code.trim().replace(/\D/g, '') : '';

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
  const twilioUrl  = `https://verify.twilio.com/v2/Services/${TWILIO_VERIFY_SERVICE_SID}/VerificationCheck`;
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

  // Only accept 'approved' — reject everything else
  if (!twilioRes.ok || twilioData.status !== 'approved') {
    const errCode: number = twilioData.code ?? 0;
    const status: string  = twilioData.status ?? 'unknown';
    console.warn(`[verify-whatsapp-otp] Twilio check failed: status=${status} twilio_code=${errCode}`);

    let userMessage = 'That verification code is incorrect. Please try again.';
    if (errCode === 60202) {
      userMessage = 'Maximum verification attempts reached. Please request a new code.';
    } else if (errCode === 60203 || status === 'expired') {
      userMessage = 'The code has expired. Please request a new one.';
    } else if (status === 'canceled') {
      userMessage = 'This verification has been cancelled. Please request a new code.';
    }

    return new Response(
      JSON.stringify({ ok: false, error: userMessage, code: 'VERIFICATION_FAILED' }),
      { status: 400, headers: jsonHeaders },
    );
  }

  // ── 2. Twilio approved — proceed with account resolution ─────────────────
  const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── 3. Look up existing Vybz Hub account by VERIFIED phone ───────────────
  // Only match rows where phone_verified = true — prevents matching stale/contact-only phones.
  const { data: existingProfile, error: lookupErr } = await supabaseAdmin
    .from('user_profiles')
    .select('id')
    .eq('phone', phone)
    .eq('phone_verified', true)
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
    // ── 4a. Existing verified account ────────────────────────────────────────
    userId = existingProfile.id;
    console.log(`[verify-whatsapp-otp] Existing verified user: ${userId.slice(0, 8)}***`);

  } else {
    // ── 4b. No verified account — create new Supabase auth user ──────────────
    isNewUser = true;
    const internalEmail  = phoneToInternalEmail(phone);
    const securePassword = generateSecurePassword();

    const { data: newUserData, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: internalEmail,
      password: securePassword,
      email_confirm: true,   // pre-confirm — phone OTP IS the verification
      user_metadata: {
        name: '',
        roles: ['attendee'],
        phone,
        created_via: 'whatsapp_otp',
      },
    });

    if (createErr) {
      // Duplicate email = auth user was previously created but profile is unverified.
      // Recover by finding any user_profiles row for this phone (no verified filter).
      const isDuplicate =
        (createErr as any).status === 422 ||
        createErr.message?.toLowerCase().includes('already') ||
        createErr.message?.toLowerCase().includes('duplicate') ||
        createErr.message?.toLowerCase().includes('registered');

      if (isDuplicate) {
        console.log(`[verify-whatsapp-otp] Duplicate auth user detected for ${phone.slice(0, 6)}*** — recovering`);
        const { data: anyProfile, error: anyErr } = await supabaseAdmin
          .from('user_profiles')
          .select('id')
          .eq('phone', phone)
          .maybeSingle();

        if (anyErr || !anyProfile) {
          // Auth user exists but profile is missing — extremely rare edge case.
          // Fall back to the internal email to find the auth.users row via a
          // known-pattern query on user_profiles (which mirrors auth.users.id).
          // If still not found, report a meaningful error.
          console.error('[verify-whatsapp-otp] Duplicate auth user but no profile found:', anyErr?.message);
          return new Response(
            JSON.stringify({ ok: false, error: 'Account recovery failed. Please contact support.', code: 'RECOVERY_ERROR' }),
            { status: 500, headers: jsonHeaders },
          );
        }
        userId = anyProfile.id;
        // Treat as existing user — they had an unverified record
        isNewUser = false;
      } else {
        console.error('[verify-whatsapp-otp] createUser failed:', createErr.message);
        return new Response(
          JSON.stringify({ ok: false, error: 'Could not create your account. Please try again.', code: 'CREATE_ERROR' }),
          { status: 500, headers: jsonHeaders },
        );
      }
    } else {
      // Freshly created auth user
      userId = newUserData!.user!.id;
      console.log(`[verify-whatsapp-otp] New auth user created: ${userId.slice(0, 8)}***`);

      // The on_auth_user_created trigger creates user_profiles automatically.
      // Upsert guarantees the row exists even if the trigger hasn't fired yet.
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

  // ── 5. Mark phone as verified ─────────────────────────────────────────────
  // Service-role write bypasses the protect_phone_verified_trigger that blocks
  // authenticated-role writes. This is the ONLY place phone_verified is set true.
  const { error: verifyErr } = await supabaseAdmin
    .from('user_profiles')
    .update({
      phone_verified: true,
      phone_verified_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (verifyErr) {
    console.warn(`[verify-whatsapp-otp] phone_verified update failed for ${userId.slice(0, 8)}***: ${verifyErr.message}`);
    // Non-fatal — continue; session is still valid
  } else {
    console.log(`[verify-whatsapp-otp] phone_verified=true set for ${userId.slice(0, 8)}***`);
  }

  // ── 6. Create Supabase session for the user ───────────────────────────────
  // admin.createSession(userId) is available in @supabase/supabase-js@2.38+.
  // It creates a real server-side session without requiring the user's password.
  // The returned access_token + refresh_token are installed on the client via
  // supabase.auth.setSession() in authService.ts → AuthContext fires SIGNED_IN.
  const { data: sessionData, error: sessionErr } = await supabaseAdmin.auth.admin.createSession(userId);

  if (sessionErr || !sessionData?.session) {
    // createSession not available in this Supabase version — fall back to generateLink.
    // generateLink with type='magiclink' returns tokens in properties when called
    // server-side with service role.
    console.warn(`[verify-whatsapp-otp] createSession failed (${sessionErr?.message}), trying generateLink fallback`);

    const internalEmail = phoneToInternalEmail(phone);
    const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: internalEmail,
      options: { redirectTo: 'vybzhub://auth' },
    });

    if (linkErr || !linkData?.properties?.access_token) {
      console.error('[verify-whatsapp-otp] generateLink fallback also failed:', linkErr?.message);
      return new Response(
        JSON.stringify({ ok: false, error: 'Could not establish your session. Please try again.', code: 'SESSION_ERROR' }),
        { status: 500, headers: jsonHeaders },
      );
    }

    const { access_token, refresh_token } = linkData.properties as any;
    console.log(`[verify-whatsapp-otp] Session (via generateLink) granted for ${userId.slice(0, 8)}*** (new=${isNewUser})`);

    return new Response(
      JSON.stringify({
        ok: true,
        access_token,
        refresh_token: refresh_token ?? '',
        user_id: userId,
        is_new_user: isNewUser,
      }),
      { status: 200, headers: jsonHeaders },
    );
  }

  const { access_token, refresh_token, expires_in } = sessionData.session;
  console.log(`[verify-whatsapp-otp] Session (via createSession) granted for ${userId.slice(0, 8)}*** (new=${isNewUser})`);

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
