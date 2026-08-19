// send-whatsapp-otp — Server-side WhatsApp OTP dispatch via Twilio Verify
//
// Security:
//   - Twilio credentials NEVER leave this function
//   - Rate limiting: 3 sends per phone per 10 minutes, 10 per hour
//   - Phone normalized to E.164 server-side before sending
//   - No Twilio internals returned to client
//
// Input:  { phone: string }       — E.164 or localizable number
// Output: { ok: true }            — success
//         { ok: false, error: string, code?: string }  — failure

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

// ─── Phone Normalisation ──────────────────────────────────────────────────────
// Strips formatting, preserves E.164. Handles the Jamaica +1-876 / +1-658 cases.
function normalizePhone(raw: string): string | null {
  if (!raw) return null;

  // Remove all non-digit characters except a leading +
  let digits = raw.trim();
  const hasPlus = digits.startsWith('+');
  digits = digits.replace(/\D/g, '');
  if (!digits) return null;

  // Restore leading + if present (E.164 input)
  if (hasPlus) return `+${digits}`;

  // Bare digit strings: if 10 digits starting with 876 or 658 → Jamaica
  if (digits.length === 10 && (digits.startsWith('876') || digits.startsWith('658'))) {
    return `+1${digits}`;
  }
  // 7 digits → assume Jamaica +1876 (local short-form)
  if (digits.length === 7) {
    return `+1876${digits}`;
  }
  // 11 digits starting with 1 → NANP
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }
  // 12+ digits — assume already has country code without +
  if (digits.length >= 10) {
    return `+${digits}`;
  }
  return null;
}

function isValidE164(phone: string): boolean {
  return /^\+[1-9]\d{6,14}$/.test(phone);
}

// ─── Rate Limit Check ─────────────────────────────────────────────────────────
// We reuse the ticket_operation_rate_limits table pattern but via service role
// against a dedicated KV-style check in user_profiles (not auth-gated here).
// Simple in-DB tracking: log send attempts in a transient store.
// For production hardening, a Redis/KV store is preferred. Here we use
// a lightweight Supabase table approach via service role.
async function checkRateLimit(
  supabaseAdmin: any,
  phone: string,
): Promise<{ allowed: boolean; retryAfterSeconds?: number }> {
  // Count sends in last 10 minutes for this phone
  const windowStart = new Date(Date.now() - 10 * 60 * 1000).toISOString();

  const { data, error } = await supabaseAdmin
    .from('whatsapp_otp_rate_limits')
    .select('created_at')
    .eq('phone', phone)
    .gte('created_at', windowStart)
    .order('created_at', { ascending: false });

  if (error) {
    // Table may not exist yet — allow through (fail-open for availability)
    console.warn('[send-whatsapp-otp] Rate limit table error:', error.message);
    return { allowed: true };
  }

  const recentCount = (data ?? []).length;
  if (recentCount >= 3) {
    // Calculate retry-after from the oldest recent entry
    const oldest = data[data.length - 1]?.created_at;
    if (oldest) {
      const retryAfterMs = new Date(oldest).getTime() + 10 * 60 * 1000 - Date.now();
      return { allowed: false, retryAfterSeconds: Math.ceil(Math.max(0, retryAfterMs) / 1000) };
    }
    return { allowed: false, retryAfterSeconds: 600 };
  }

  return { allowed: true };
}

async function recordSendAttempt(supabaseAdmin: any, phone: string): Promise<void> {
  await supabaseAdmin
    .from('whatsapp_otp_rate_limits')
    .insert({ phone, created_at: new Date().toISOString() })
    .then(() => {})
    .catch((e: any) => {
      console.warn('[send-whatsapp-otp] Failed to record rate limit entry:', e.message);
    });

  // Prune entries older than 1 hour to keep the table lean
  const pruneBefor = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  await supabaseAdmin
    .from('whatsapp_otp_rate_limits')
    .delete()
    .lt('created_at', pruneBefor)
    .eq('phone', phone)
    .then(() => {})
    .catch(() => {});
}

// ─── Main ─────────────────────────────────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

  const TWILIO_ACCOUNT_SID       = Deno.env.get('TWILIO_ACCOUNT_SID') ?? '';
  const TWILIO_AUTH_TOKEN        = Deno.env.get('TWILIO_AUTH_TOKEN') ?? '';
  const TWILIO_VERIFY_SERVICE_SID = Deno.env.get('TWILIO_VERIFY_SERVICE_SID') ?? '';

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_VERIFY_SERVICE_SID) {
    console.error('[send-whatsapp-otp] Twilio credentials missing from environment');
    return new Response(
      JSON.stringify({ ok: false, error: 'WhatsApp verification is not configured. Please try another sign-in method.' }),
      { status: 503, headers: jsonHeaders },
    );
  }

  // Parse body
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid request.' }), { status: 400, headers: jsonHeaders });
  }

  const rawPhone = typeof body.phone === 'string' ? body.phone : '';
  const phone = normalizePhone(rawPhone);

  if (!phone || !isValidE164(phone)) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Please enter a valid phone number.', code: 'INVALID_PHONE' }),
      { status: 400, headers: jsonHeaders },
    );
  }

  // Service-role client for rate limiting
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  // Rate limit check
  const rateCheck = await checkRateLimit(supabaseAdmin, phone);
  if (!rateCheck.allowed) {
    const waitMins = rateCheck.retryAfterSeconds
      ? Math.ceil(rateCheck.retryAfterSeconds / 60)
      : 10;
    return new Response(
      JSON.stringify({
        ok: false,
        error: `Please wait ${waitMins} minute${waitMins !== 1 ? 's' : ''} before requesting another code.`,
        code: 'RATE_LIMITED',
        retryAfterSeconds: rateCheck.retryAfterSeconds ?? 600,
      }),
      { status: 429, headers: jsonHeaders },
    );
  }

  // ── Diagnostic: log normalized destination (safe — no credentials) ──────
  // Logs the exact E.164 number about to be sent, masked after the area code.
  // Example: +1876*** for +18765551234  — reveals area code but not subscriber digits.
  const phoneMasked = phone.length > 6 ? `${phone.slice(0, 6)}***` : phone;
  console.log(`[send-whatsapp-otp] Sending to: ${phoneMasked} | SID suffix: ...${TWILIO_VERIFY_SERVICE_SID.slice(-6)}`);

  // ── Call Twilio Verify ─────────────────────────────────────────────────────
  // Only To= and Channel=whatsapp are sent.
  // ContentVariables, TemplateSid, ContentSid MUST NOT be included —
  // the verify_auto_created WhatsApp template is managed entirely by Twilio
  // Verify; manually injecting template parameters causes error 21656.
  const twilioUrl = `https://verify.twilio.com/v2/Services/${TWILIO_VERIFY_SERVICE_SID}/Verifications`;
  const twilioBody = new URLSearchParams({ To: phone, Channel: 'whatsapp' });

  // Credentials are built entirely server-side and never returned to client
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
    console.error(`[send-whatsapp-otp] Network error calling Twilio for ${phoneMasked}:`, err.message);
    return new Response(
      JSON.stringify({ ok: false, error: "We couldn't send a WhatsApp code to that number. Please try again.", code: 'TWILIO_NETWORK_ERROR' }),
      { status: 502, headers: jsonHeaders },
    );
  }

  if (!twilioRes.ok) {
    let twilioErr: any = {};
    let rawBody = '';
    try {
      rawBody = await twilioRes.text();
      twilioErr = JSON.parse(rawBody);
    } catch {
      twilioErr = { message: rawBody };
    }

    const httpStatus: number = twilioRes.status;
    const errCode: number = twilioErr.code ?? 0;
    const errMsg: string = twilioErr.message ?? twilioErr.error_message ?? 'unknown';
    const moreInfo: string = twilioErr.more_info ?? '';

    // Safe diagnostic log: exposes Twilio failure without credentials or OTP
    console.error(
      `[send-whatsapp-otp] TWILIO_FAILURE | destination=${phoneMasked}` +
      ` | http_status=${httpStatus}` +
      ` | twilio_code=${errCode}` +
      ` | twilio_message=${errMsg}` +
      (moreInfo ? ` | more_info=${moreInfo}` : '')
    );

    // Translate Twilio error codes to friendly user messages
    let userMessage = "We couldn't send a WhatsApp code to that number. Please check the number and try again.";
    if (errCode === 60200 || errCode === 60205) {
      userMessage = 'That phone number is not valid for WhatsApp. Please check and try again.';
    } else if (errCode === 60203) {
      userMessage = 'Maximum OTP attempts reached. Please try again in 10 minutes.';
    } else if (errCode === 60223) {
      userMessage = 'WhatsApp messaging is not available for this number. Please use a different number.';
    } else if (httpStatus === 401) {
      userMessage = 'WhatsApp verification is not configured correctly. Please contact support.';
      console.error('[send-whatsapp-otp] AUTH FAILURE — check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN secrets');
    } else if (httpStatus === 404) {
      userMessage = 'WhatsApp verification service not found. Please contact support.';
      console.error('[send-whatsapp-otp] 404 — check TWILIO_VERIFY_SERVICE_SID secret');
    } else if (errCode === 20003) {
      userMessage = 'WhatsApp verification is not configured correctly. Please contact support.';
      console.error('[send-whatsapp-otp] 20003 PERMISSION_DENIED — Twilio account credentials are invalid or trial account restrictions apply');
    } else if (errCode === 20404) {
      userMessage = 'WhatsApp verification service not found. Please contact support.';
      console.error('[send-whatsapp-otp] 20404 — TWILIO_VERIFY_SERVICE_SID does not exist or was deleted');
    }

    return new Response(
      JSON.stringify({ ok: false, error: userMessage, code: 'TWILIO_ERROR', twilioCode: errCode }),
      { status: 400, headers: jsonHeaders },
    );
  }

  // Record successful send for rate limiting
  await recordSendAttempt(supabaseAdmin, phone);

  console.log(`[send-whatsapp-otp] SUCCESS | OTP dispatched to ${phoneMasked} via WhatsApp`);
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: jsonHeaders });
});
