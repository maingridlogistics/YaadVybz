// Vybz Hub — send-email Edge Function
// Sends transactional/notification emails via Postal HTTP API (primary)
// or SMTP relay via denomailer (fallback).
//
// Required secrets (add in Supabase Dashboard → Edge Functions → Secrets):
//   POSTAL_API_URL   — e.g. https://postal.vybzhub.com   (use this OR SMTP)
//   POSTAL_API_KEY   — Postal server API key
//   SMTP_HOST        — SMTP hostname (e.g. postal.vybzhub.com)
//   SMTP_PORT        — 587 (STARTTLS) or 465 (SSL)
//   SMTP_USER        — SMTP username
//   SMTP_PASS        — SMTP password
//   EMAIL_FROM       — From address  e.g. notifications@vybzhub.com
//   EMAIL_FROM_NAME  — From name     e.g. VybzHub
//
// Also configure the SAME SMTP credentials in:
//   Supabase Dashboard → Authentication → SMTP Settings
// so that Supabase sends signup verification and password-reset emails
// through your Postal/Mailcow server too.

import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import {
  buildEmailHtml,
  buildEmailText,
  getEmailSubject,
} from "../_shared/emailTemplates.ts";

// ─── Env ──────────────────────────────────────────────────────────────────────
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const POSTAL_API_URL = Deno.env.get("POSTAL_API_URL") ?? "";
const POSTAL_API_KEY = Deno.env.get("POSTAL_API_KEY") ?? "";
const SMTP_HOST = Deno.env.get("SMTP_HOST") ?? "";
const SMTP_PORT = parseInt(Deno.env.get("SMTP_PORT") ?? "587");
const SMTP_USER = Deno.env.get("SMTP_USER") ?? "";
const SMTP_PASS = Deno.env.get("SMTP_PASS") ?? "";
const EMAIL_FROM = Deno.env.get("EMAIL_FROM") ?? "notifications@vybzhub.com";
const EMAIL_FROM_NAME = Deno.env.get("EMAIL_FROM_NAME") ?? "Vybz Hub";

// ─── Email preference → DB column ────────────────────────────────────────────
const PREF_MAP: Record<string, string> = {
  new_event_parish: "email_notif_new_parish",
  new_event_promoter: "email_notif_new_promoter",
  event_change: "email_notif_event_change",
  event_cancelled: "email_notif_event_change",
  rsvp_reminder: "email_notif_event_reminder",
};

// ─── Send via Postal HTTP API ─────────────────────────────────────────────────
async function sendViaPostal(
  to: string,
  subject: string,
  html: string,
  text: string
): Promise<void> {
  const res = await fetch(`${POSTAL_API_URL}/api/v1/send/message`, {
    method: "POST",
    headers: {
      "X-Server-API-Key": POSTAL_API_KEY,
      "Content-Type": "application/json",
    },
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
    throw new Error(`Postal API: ${res.status} — ${body}`);
  }
}

// ─── Send via SMTP (denomailer) ───────────────────────────────────────────────
async function sendViaSMTP(
  to: string,
  subject: string,
  html: string,
  text: string
): Promise<void> {
  // Dynamic import so the module is only loaded when needed
  const { SMTPClient } = await import(
    "https://deno.land/x/denomailer@1.6.0/mod.ts"
  );

  const useSSL = SMTP_PORT === 465;

  const client = new SMTPClient({
    connection: {
      hostname: SMTP_HOST,
      port: SMTP_PORT,
      tls: useSSL,
      auth: {
        username: SMTP_USER,
        password: SMTP_PASS,
      },
    },
  });

  try {
    await client.send({
      from: `${EMAIL_FROM_NAME} <${EMAIL_FROM}>`,
      to,
      subject,
      content: text,
      html,
    });
  } finally {
    await client.close();
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  try {
    // Parse request
    // promoterIdForFollowerLookup: when present, skip JWT-recipient path and instead
    // send new_event_promoter emails to all opted-in followers of that promoter.
    const { type, data, promoterIdForFollowerLookup } = await req.json();
    if (!type || !data) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: type, data" }),
        { status: 400, headers: jsonHeaders }
      );
    }

    // Authenticate the calling user — required in both modes to prevent abuse.
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: jsonHeaders,
      });
    }

    // ── Follower bulk-send mode ───────────────────────────────────────────────
    // When promoterIdForFollowerLookup is provided, the caller is a promoter who
    // just posted a live event. We use the service role to look up every user who
    // follows them and has opted in to new_event_promoter emails, then send to
    // each one individually. The JWT holder is only used for auth — recipients
    // are resolved server-side so client-side RLS on user_profiles is bypassed.
    if (promoterIdForFollowerLookup) {
      const { data: followers, error: followerError } = await supabaseAdmin
        .from("user_profiles")
        .select("id, email, email_notif_new_promoter")
        .contains("followed_promoters", [promoterIdForFollowerLookup])
        .eq("email_notif_new_promoter", true);

      if (followerError) {
        console.warn("Follower lookup failed:", followerError.message);
        return new Response(
          JSON.stringify({ skipped: true, reason: "Follower lookup failed" }),
          { status: 200, headers: jsonHeaders }
        );
      }

      const eligible = (followers ?? []).filter((f) => !!f.email);

      if (eligible.length === 0) {
        console.log(`No opted-in followers found for promoter ${promoterIdForFollowerLookup}`);
        return new Response(JSON.stringify({ success: true, sent: 0 }), {
          status: 200,
          headers: jsonHeaders,
        });
      }

      const hasTransport =
        (POSTAL_API_URL && POSTAL_API_KEY) ||
        (SMTP_HOST && SMTP_USER && SMTP_PASS);

      if (!hasTransport) {
        console.warn("No email transport configured — skipping follower notifications.");
        return new Response(
          JSON.stringify({ skipped: true, reason: "No email transport configured" }),
          { status: 200, headers: jsonHeaders }
        );
      }

      const subject = getEmailSubject(type, data);
      const html = buildEmailHtml(type, data);
      const text = buildEmailText(type, data);

      let sent = 0;
      for (const follower of eligible) {
        try {
          if (POSTAL_API_URL && POSTAL_API_KEY) {
            await sendViaPostal(follower.email!, subject, html, text);
          } else {
            await sendViaSMTP(follower.email!, subject, html, text);
          }
          sent++;
          console.log(`Follower email → ${follower.email} [new_event_promoter]`);
        } catch (e) {
          console.warn(`Failed to send to ${follower.email}:`, e);
        }
      }

      console.log(
        `Follower notifications: ${sent}/${eligible.length} sent for promoter ${promoterIdForFollowerLookup}`
      );
      return new Response(JSON.stringify({ success: true, sent }), {
        status: 200,
        headers: jsonHeaders,
      });
    }

    // ── Single-recipient mode (all other email types) ─────────────────────────
    if (!user.email) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: jsonHeaders,
      });
    }

    // Check user email notification preferences
    const prefKey = PREF_MAP[type];
    if (prefKey) {
      const { data: profile } = await supabaseAdmin
        .from("user_profiles")
        .select(prefKey)
        .eq("id", user.id)
        .single();

      if (profile && profile[prefKey] === false) {
        console.log(`Email skipped: user ${user.id} opted out of ${type}`);
        return new Response(
          JSON.stringify({ skipped: true, reason: "User opted out" }),
          { status: 200, headers: jsonHeaders }
        );
      }
    }

    // Build email content
    const to = user.email;
    const subject = getEmailSubject(type, data);
    const html = buildEmailHtml(type, data);
    const text = buildEmailText(type, data);

    // Send email — prefer Postal HTTP API, fall back to SMTP
    if (POSTAL_API_URL && POSTAL_API_KEY) {
      await sendViaPostal(to, subject, html, text);
      console.log(`Email sent via Postal API → ${to} [${type}]`);
    } else if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
      await sendViaSMTP(to, subject, html, text);
      console.log(`Email sent via SMTP → ${to} [${type}]`);
    } else {
      console.warn("No email transport configured. Set POSTAL_API_* or SMTP_* secrets.");
      return new Response(
        JSON.stringify({
          skipped: true,
          reason: "No email transport configured",
        }),
        { status: 200, headers: jsonHeaders }
      );
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: jsonHeaders,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("send-email error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
});
