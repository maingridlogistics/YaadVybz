// verify-whatsapp-otp — Verify WhatsApp OTP via Twilio and establish Supabase session
//
// Flow:
//   1. Normalize + validate phone
//   2. Call Twilio VerificationCheck — only proceed if status === 'approved'
//   3. Look up existing account via user_profiles WHERE phone = X AND phone_verified = true
//   4a. Found:     reuse that userId → create session
//   4b. Not found: createUser() → if duplicate email error, recover via user_profiles.phone lookup
//   5. Set phone_verified = true (service-role bypasses RLS trigger guard)
//   6. Create Supabase session:
//      Primary:   supabaseAdmin.auth.admin.createSession(userId)
//      Fallback:  Direct GoTrue REST POST /auth/v1/admin/users/{id}/sessions
//      (generateLink fallback removed — its properties object does NOT contain tokens in v2)

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

function phoneToInternalEmail(phone: string): string {
  const clean = phone.replace(/^\+/, '').replace(/\D/g, '');
  return `whatsapp_${clean}@vybzhub.internal`;
}

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
    return new Response(JSON.stringify({ ok: false, error: 'Invalid request.', code: 'BAD_REQUEST' }), { status: 400, headers: jsonHeaders });
  }

  const rawPhone = typeof body.phone === 'string' ? body.phone : '';
  const otpCode  = typeof body.code  === 'string' ? body.code.trim().replace(/\D/g, '') : '';
  const phone    = normalizePhone(rawPhone);

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

  console.log(`[verify-whatsapp-otp] STEP 1: Checking Twilio OTP for ${phone.slice(0, 5)}***`);

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

  const twilioStatus = twilioData.status ?? 'unknown';
  const twilioErrCode = twilioData.code ?? 0;

  if (!twilioRes.ok || twilioStatus !== 'approved') {
    console.warn(`[verify-whatsapp-otp] Twilio check FAILED: http=${twilioRes.status} status=${twilioStatus} code=${twilioErrCode}`);

    let userMessage = 'That verification code is incorrect. Please try again.';
    if (twilioErrCode === 60202) {
      userMessage = 'Maximum verification attempts reached. Please request a new code.';
    } else if (twilioErrCode === 60203 || twilioStatus === 'expired') {
      userMessage = 'The code has expired. Please request a new one.';
    } else if (twilioStatus === 'canceled') {
      userMessage = 'This verification has been cancelled. Please request a new code.';
    }

    return new Response(
      JSON.stringify({ ok: false, error: userMessage, code: 'VERIFICATION_FAILED' }),
      { status: 400, headers: jsonHeaders },
    );
  }

  console.log(`[verify-whatsapp-otp] STEP 1 OK: Twilio approved for ${phone.slice(0, 5)}***`);

  // ── 2. Init admin client ──────────────────────────────────────────────────
  const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── 3. Look up existing Vybz Hub account by VERIFIED phone ───────────────
  console.log(`[verify-whatsapp-otp] STEP 3: Looking up verified profile for ${phone.slice(0, 5)}***`);

  const { data: existingProfile, error: lookupErr } = await supabaseAdmin
    .from('user_profiles')
    .select('id')
    .eq('phone', phone)
    .eq('phone_verified', true)
    .maybeSingle();

  if (lookupErr) {
    console.error('[verify-whatsapp-otp] STEP 3 FAILED: Profile lookup error:', lookupErr.message);
    return new Response(
      JSON.stringify({ ok: false, error: 'Verification failed. Please try again.', code: 'DB_LOOKUP_ERROR' }),
      { status: 500, headers: jsonHeaders },
    );
  }

  let userId: string;
  let isNewUser = false;

  if (existingProfile) {
    userId = existingProfile.id;
    console.log(`[verify-whatsapp-otp] STEP 3 OK: Existing verified user ${userId.slice(0, 8)}***`);
  } else {
    // ── 4. No verified account — create new Supabase auth user ───────────────
    isNewUser = true;
    const internalEmail  = phoneToInternalEmail(phone);
    const securePassword = generateSecurePassword();

    console.log(`[verify-whatsapp-otp] STEP 4: Creating new auth user for ${phone.slice(0, 5)}***`);

    const { data: newUserData, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: internalEmail,
      password: securePassword,
      email_confirm: true,
      user_metadata: {
        name: '',
        roles: ['attendee'],
        phone,
        created_via: 'whatsapp_otp',
      },
    });

    if (createErr) {
      const isDuplicate =
        (createErr as any).status === 422 ||
        createErr.message?.toLowerCase().includes('already') ||
        createErr.message?.toLowerCase().includes('duplicate') ||
        createErr.message?.toLowerCase().includes('registered');

      if (isDuplicate) {
        console.log(`[verify-whatsapp-otp] STEP 4: Duplicate auth user — recovering from user_profiles`);
        const { data: anyProfile, error: anyErr } = await supabaseAdmin
          .from('user_profiles')
          .select('id')
          .eq('phone', phone)
          .maybeSingle();

        if (anyErr || !anyProfile) {
          console.error('[verify-whatsapp-otp] STEP 4 FAILED: Duplicate user but no profile found:', anyErr?.message);
          return new Response(
            JSON.stringify({ ok: false, error: 'Account recovery failed. Please contact support.', code: 'RECOVERY_ERROR' }),
            { status: 500, headers: jsonHeaders },
          );
        }
        userId = anyProfile.id;
        isNewUser = false;
        console.log(`[verify-whatsapp-otp] STEP 4 OK: Recovered existing user ${userId.slice(0, 8)}***`);
      } else {
        console.error('[verify-whatsapp-otp] STEP 4 FAILED: createUser error:', createErr.message);
        return new Response(
          JSON.stringify({ ok: false, error: 'Could not create your account. Please try again.', code: 'CREATE_ERROR' }),
          { status: 500, headers: jsonHeaders },
        );
      }
    } else {
      userId = newUserData!.user!.id;
      console.log(`[verify-whatsapp-otp] STEP 4 OK: New auth user ${userId.slice(0, 8)}*** created`);

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
  console.log(`[verify-whatsapp-otp] STEP 5: Setting phone_verified=true for ${userId.slice(0, 8)}***`);

  const { error: verifyErr } = await supabaseAdmin
    .from('user_profiles')
    .update({
      phone_verified: true,
      phone_verified_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (verifyErr) {
    // Non-fatal — log and continue; session is still valid
    console.warn(`[verify-whatsapp-otp] STEP 5 WARN: phone_verified update failed: ${verifyErr.message}`);
  } else {
    console.log(`[verify-whatsapp-otp] STEP 5 OK: phone_verified=true for ${userId.slice(0, 8)}***`);
  }

  // ── 6. Create Supabase session ────────────────────────────────────────────
  // Primary: admin.createSession() — available in @supabase/supabase-js@2.38+
  // Fallback: Direct GoTrue REST API POST /auth/v1/admin/users/{id}/sessions
  //   (generateLink is NOT used — its properties object does not contain tokens in v2)

  console.log(`[verify-whatsapp-otp] STEP 6: Creating session for ${userId.slice(0, 8)}***`);

  // ── 6a. Try admin.createSession ───────────────────────────────────────────
  try {
    const { data: sessionData, error: sessionErr } = await supabaseAdmin.auth.admin.createSession(userId);

    if (!sessionErr && sessionData?.session?.access_token) {
      const { access_token, refresh_token, expires_in } = sessionData.session;
      console.log(`[verify-whatsapp-otp] STEP 6 OK: Session via admin.createSession for ${userId.slice(0, 8)}*** (new=${isNewUser})`);

      return new Response(
        JSON.stringify({
          ok: true,
          access_token,
          refresh_token: refresh_token ?? '',
          expires_in,
          user_id: userId,
          is_new_user: isNewUser,
        }),
        { status: 200, headers: jsonHeaders },
      );
    }

    console.warn(`[verify-whatsapp-otp] STEP 6a: admin.createSession failed: ${sessionErr?.message ?? 'no session returned'} — trying GoTrue REST fallback`);
  } catch (err: any) {
    console.warn(`[verify-whatsapp-otp] STEP 6a: admin.createSession threw: ${err?.message} — trying GoTrue REST fallback`);
  }

  // ── 6b. Fallback: Direct GoTrue REST API ─────────────────────────────────
  // Calls the same endpoint admin.createSession() uses internally.
  // Works regardless of supabase-js version pinned in the edge function.
  try {
    console.log(`[verify-whatsapp-otp] STEP 6b: Calling GoTrue REST /auth/v1/admin/users/${userId.slice(0, 8)}.../sessions`);

    const grantResp = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}/sessions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        apikey: SERVICE_ROLE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    const grantText = await grantResp.text();
    console.log(`[verify-whatsapp-otp] STEP 6b: GoTrue REST http=${grantResp.status} body_len=${grantText.length}`);

    if (grantResp.ok) {
      let grantData: any = {};
      try { grantData = JSON.parse(grantText); } catch {}

      if (grantData.access_token) {
        console.log(`[verify-whatsapp-otp] STEP 6 OK: Session via GoTrue REST for ${userId.slice(0, 8)}*** (new=${isNewUser})`);

        return new Response(
          JSON.stringify({
            ok: true,
            access_token: grantData.access_token,
            refresh_token: grantData.refresh_token ?? '',
            expires_in: grantData.expires_in,
            user_id: userId,
            is_new_user: isNewUser,
          }),
          { status: 200, headers: jsonHeaders },
        );
      }

      console.error(`[verify-whatsapp-otp] STEP 6b: GoTrue REST 200 but no access_token in response. Body: ${grantText.slice(0, 200)}`);
    } else {
      console.error(`[verify-whatsapp-otp] STEP 6b: GoTrue REST failed http=${grantResp.status} body=${grantText.slice(0, 200)}`);
    }
  } catch (err: any) {
    console.error(`[verify-whatsapp-otp] STEP 6b: GoTrue REST threw: ${err?.message}`);
  }

  // ── 6c. Both mechanisms failed ────────────────────────────────────────────
  console.error(`[verify-whatsapp-otp] STEP 6 FAILED: All session creation mechanisms exhausted for ${userId.slice(0, 8)}***`);

  return new Response(
    JSON.stringify({
      ok: false,
      error: 'Could not establish your session. Please try again.',
      code: 'SESSION_CREATE_FAILED',
    }),
    { status: 500, headers: jsonHeaders },
  );
});
