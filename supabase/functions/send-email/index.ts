// Vybz Hub — send-email Edge Function
// Sends transactional/notification emails via Postal HTTP API (primary)
// or SMTP relay via denomailer (fallback).
// Also sends Expo push notifications in the same pass for supported types.
//
// Notification types handled:
//   new_event_parish   → email (single user) + push (single user)
//   new_event_promoter → email (all followers) + push (all followers) — via promoterIdForFollowerLookup
//   event_change       → email (single user) + push (single user)
//   event_cancelled    → email (single user) + push (single user)
//   rsvp_reminder      → email only (push handled locally on device via scheduled notification)

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

// Expo Push Service
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

// ─── Email preference → DB column ────────────────────────────────────────────
const EMAIL_PREF_MAP: Record<string, string> = {
  new_event_parish: "email_notif_new_parish",
  new_event_promoter: "email_notif_new_promoter",
  event_change: "email_notif_event_change",
  event_cancelled: "email_notif_event_change",
  rsvp_reminder: "email_notif_event_reminder",
};

// ─── Push preference → DB column (rsvp_reminder intentionally absent) ─────────
const PUSH_PREF_MAP: Record<string, string> = {
  new_event_parish: "push_notif_new_parish",
  new_event_promoter: "push_notif_new_promoter",
  event_change: "push_notif_event_change",
  event_cancelled: "push_notif_event_change",
};

// ─── Push content builder ─────────────────────────────────────────────────────
function getPushContent(
  type: string,
  data: Record<string, any>
): { title: string; body: string } {
  const eventTitle = data.eventTitle ?? "An event";
  const dateLine = [data.date, data.venue ? `at ${data.venue}` : ""]
    .filter(Boolean)
    .join(" ");

  switch (type) {
    case "new_event_parish":
      return {
        title: `New Event in ${data.parish ?? "Jamaica"}`,
        body: dateLine ? `${eventTitle} · ${dateLine}` : eventTitle,
      };
    case "new_event_promoter":
      return {
        title: `${data.promoterName ?? "A promoter"} posted a new event`,
        body: dateLine ? `${eventTitle} · ${dateLine}` : eventTitle,
      };
    case "event_change":
      return {
        title: "Event Updated",
        body: `${eventTitle} has been updated — check the latest details.`,
      };
    case "event_cancelled":
      return {
        title: "Event Cancelled",
        body: `${eventTitle} has been cancelled.`,
      };
    default:
      return { title: "VybzHub", body: "You have a new notification." };
  }
}

// ─── Push sender — ticket fast path + deferred receipt-level cleanup ─────────
// The primary DeviceNotRegistered signal comes from receipts (available 15+ min
// after Expo attempts delivery to FCM/APNs), not from the initial send ticket.
// Tickets catch only synchronous failures (rare). For the authoritative signal,
// receipt IDs are stored in push_receipt_queue and checked by the
// check-push-receipts Edge Function on the next push cycle.
async function sendExpoPushToUserIds(
  userIds: string[],
  title: string,
  body: string,
  eventId: string | undefined,
  supabaseAdmin: ReturnType<typeof createClient>
): Promise<void> {
  if (userIds.length === 0) return;
  try {
    const { data: tokenRows, error } = await supabaseAdmin
      .from("push_tokens")
      .select("id, token")
      .in("user_id", userIds);

    if (error || !tokenRows || tokenRows.length === 0) {
      console.log("[Push] No tokens found for", userIds.length, "user(s)");
      return;
    }

    const messages = tokenRows.map((row: any) => ({
      to: row.token,
      title,
      body,
      data: { eventId: eventId ?? null },
      sound: "default",
      priority: "high",
    }));

    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(messages),
    });

    if (!res.ok) {
      console.warn("[Push] Expo API error:", res.status, await res.text().catch(() => ""));
      return;
    }

    const result = await res.json();
    const tickets: any[] = result.data ?? [];

    // ── Fast path: synchronous DeviceNotRegistered at ticket level ─────────────
    // Expo occasionally returns this in tickets when the token was already known-
    // invalid before delivery was attempted. Catch it here as a quick win, but
    // don't rely on it — the authoritative check is receipt-level (below).
    const immediateInvalidIds: string[] = [];
    const receiptPairs: { receipt_id: string; token_db_id: string }[] = [];

    tickets.forEach((ticket: any, idx: number) => {
      const tokenDbId = tokenRows[idx]?.id;
      if (!tokenDbId) return;
      if (ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered") {
        immediateInvalidIds.push(tokenDbId);
      } else if (ticket.status === "ok" && ticket.id) {
        // Queue for deferred receipt-level check (primary DeviceNotRegistered signal)
        receiptPairs.push({ receipt_id: ticket.id, token_db_id: tokenDbId });
      }
    });

    if (immediateInvalidIds.length > 0) {
      await supabaseAdmin.from("push_tokens").delete().in("id", immediateInvalidIds.filter(Boolean));
      console.log("[Push] Removed", immediateInvalidIds.length, "immediately-invalid token(s) from tickets");
    }

    // ── Deferred path: queue receipt IDs for checking 15+ minutes later ────────
    if (receiptPairs.length > 0) {
      await supabaseAdmin.from("push_receipt_queue").insert(receiptPairs);
      console.log("[Push] Queued", receiptPairs.length, "receipt(s) for deferred check");

      // Trigger check-push-receipts non-blocking — it processes receipts from
      // PREVIOUS batches (>15 min old), not the ones just stored. This means
      // stale tokens from the previous push cycle get cleaned up automatically
      // every time a new push is sent, with no cron or scheduler needed.
      fetch(`${SUPABASE_URL}/functions/v1/check-push-receipts`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          "Content-Type": "application/json",
        },
        body: "{}",
      }).catch(() => {}); // fire-and-forget — never block the response
    }

    const sent = tickets.filter((t: any) => t.status === "ok").length;
    console.log("[Push] Sent", sent, "/", messages.length, "push notification(s)");
  } catch (err) {
    // Never block the caller — push errors are non-fatal
    console.warn("[Push] Send error:", String(err).slice(0, 200));
  }
}

// ─── Email senders ────────────────────────────────────────────────────────────
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

async function sendViaSMTP(
  to: string,
  subject: string,
  html: string,
  text: string
): Promise<void> {
  const { SMTPClient } = await import(
    "https://deno.land/x/denomailer@1.6.0/mod.ts"
  );
  const useSSL = SMTP_PORT === 465;
  const client = new SMTPClient({
    connection: {
      hostname: SMTP_HOST,
      port: SMTP_PORT,
      tls: useSSL,
      auth: { username: SMTP_USER, password: SMTP_PASS },
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
    const { type, data, promoterIdForFollowerLookup, eventIdForRsvpLookup } = await req.json();
    if (!type || !data) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: type, data" }),
        { status: 400, headers: jsonHeaders }
      );
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: jsonHeaders,
      });
    }

    const hasEmailTransport =
      (POSTAL_API_URL && POSTAL_API_KEY) ||
      (SMTP_HOST && SMTP_USER && SMTP_PASS);

    // ── Follower bulk-send mode ───────────────────────────────────────────────
    if (promoterIdForFollowerLookup) {

      // ── Email phase ──
      let emailSent = 0;
      if (hasEmailTransport) {
        const { data: emailFollowers, error: followerError } = await supabaseAdmin
          .from("user_profiles")
          .select("id, email, email_notif_new_promoter")
          .contains("followed_promoters", [promoterIdForFollowerLookup])
          .eq("email_notif_new_promoter", true);

        if (followerError) {
          console.warn("Follower email lookup failed:", followerError.message);
        } else {
          const eligible = (emailFollowers ?? []).filter((f: any) => !!f.email);
          const subject = getEmailSubject(type, data);
          const html = buildEmailHtml(type, data);
          const text = buildEmailText(type, data);

          for (const follower of eligible) {
            try {
              if (POSTAL_API_URL && POSTAL_API_KEY) {
                await sendViaPostal(follower.email!, subject, html, text);
              } else {
                await sendViaSMTP(follower.email!, subject, html, text);
              }
              emailSent++;
              console.log(`Email → ${follower.email} [${type}]`);
            } catch (e) {
              console.warn(`Email failed → ${follower.email}:`, e);
            }
          }
          console.log(`Emails: ${emailSent}/${eligible.length} sent for promoter ${promoterIdForFollowerLookup}`);
        }
      } else {
        console.warn("[Email] No transport configured — skipping follower email notifications.");
      }

      // ── Push phase ──
      const pushPrefCol = PUSH_PREF_MAP[type];
      if (pushPrefCol) {
        const { data: pushFollowers } = await supabaseAdmin
          .from("user_profiles")
          .select("id")
          .contains("followed_promoters", [promoterIdForFollowerLookup])
          .eq(pushPrefCol, true);

        const pushUserIds = (pushFollowers ?? []).map((f: any) => f.id);
        const { title: pushTitle, body: pushBody } = getPushContent(type, data);
        await sendExpoPushToUserIds(
          pushUserIds,
          pushTitle,
          pushBody,
          data.eventId,
          supabaseAdmin
        );
      }

      return new Response(
        JSON.stringify({ success: true, sent: emailSent }),
        { status: 200, headers: jsonHeaders }
      );
    }

    // ── RSVP bulk notification mode (event_change / event_cancelled → all RSVPd users) ──
    if (eventIdForRsvpLookup) {
      // Fetch all users who RSVPd (going or interested) for this event
      const { data: rsvpRows, error: rsvpError } = await supabaseAdmin
        .from("user_rsvps")
        .select("user_id")
        .eq("event_id", eventIdForRsvpLookup)
        .in("status", ["going", "interested"]);

      if (rsvpError) {
        console.warn("[RSVP] user_rsvps lookup failed:", rsvpError.message);
      }

      // Exclude the promoter making the change — they don't need a notification about their own edit
      const rsvpUserIds: string[] = (rsvpRows ?? [])
        .map((r: any) => r.user_id as string)
        .filter((id: string) => id !== user.id);

      console.log(`[RSVP] ${rsvpUserIds.length} RSVP'd user(s) to notify for event ${eventIdForRsvpLookup}`);

      if (rsvpUserIds.length === 0) {
        return new Response(
          JSON.stringify({ success: true, sent: 0, reason: "No RSVP'd users found" }),
          { status: 200, headers: jsonHeaders }
        );
      }

      const emailPrefCol = EMAIL_PREF_MAP[type];
      const pushPrefCol = PUSH_PREF_MAP[type];

      // Build column list for profile query
      const selectCols = ["id", "email"];
      if (emailPrefCol) selectCols.push(emailPrefCol);
      if (pushPrefCol && pushPrefCol !== emailPrefCol) selectCols.push(pushPrefCol);

      const { data: profiles } = await supabaseAdmin
        .from("user_profiles")
        .select(selectCols.join(", "))
        .in("id", rsvpUserIds);

      // ── Email RSVP users ──
      let emailSent = 0;
      if (hasEmailTransport && emailPrefCol) {
        const subject = getEmailSubject(type, data);
        const html = buildEmailHtml(type, data);
        const text = buildEmailText(type, data);
        for (const profile of (profiles ?? [])) {
          if (!profile.email) continue;
          if (profile[emailPrefCol] === false) continue;
          try {
            if (POSTAL_API_URL && POSTAL_API_KEY) {
              await sendViaPostal(profile.email, subject, html, text);
            } else {
              await sendViaSMTP(profile.email, subject, html, text);
            }
            emailSent++;
          } catch (e) {
            console.warn(`[RSVP] Email failed → ${profile.email}:`, e);
          }
        }
        console.log(`[RSVP] Emails sent: ${emailSent}/${(profiles ?? []).length}`);
      }

      // ── Push RSVP users ──
      if (pushPrefCol) {
        const pushEligibleIds: string[] = (profiles ?? [])
          .filter((p: any) => p[pushPrefCol] !== false)
          .map((p: any) => p.id as string);
        console.log(`[RSVP] Push eligible: ${pushEligibleIds.length} user(s)`);
        const { title: pushTitle, body: pushBody } = getPushContent(type, data);
        await sendExpoPushToUserIds(
          pushEligibleIds,
          pushTitle,
          pushBody,
          data.eventId,
          supabaseAdmin
        );
      }

      return new Response(
        JSON.stringify({ success: true, sent: emailSent, pushEligible: rsvpUserIds.length }),
        { status: 200, headers: jsonHeaders }
      );
    }

    // ── Single-recipient mode ─────────────────────────────────────────────────
    if (!user.email) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: jsonHeaders,
      });
    }

    // ── Email ──
    const emailPrefKey = EMAIL_PREF_MAP[type];
    let skipEmail = false;
    if (emailPrefKey) {
      const { data: profile } = await supabaseAdmin
        .from("user_profiles")
        .select(emailPrefKey)
        .eq("id", user.id)
        .single();
      if (profile && profile[emailPrefKey] === false) {
        skipEmail = true;
        console.log(`Email skipped: user ${user.id} opted out of ${type}`);
      }
    }

    if (!skipEmail) {
      const to = user.email;
      const subject = getEmailSubject(type, data);
      const html = buildEmailHtml(type, data);
      const text = buildEmailText(type, data);

      if (POSTAL_API_URL && POSTAL_API_KEY) {
        await sendViaPostal(to, subject, html, text);
        console.log(`Email sent via Postal → ${to} [${type}]`);
      } else if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
        await sendViaSMTP(to, subject, html, text);
        console.log(`Email sent via SMTP → ${to} [${type}]`);
      } else {
        console.warn("[Email] No transport configured.");
      }
    }

    // ── Push ──
    const pushPrefKey = PUSH_PREF_MAP[type];
    if (pushPrefKey) {
      let skipPush = false;
      const { data: pushProfile } = await supabaseAdmin
        .from("user_profiles")
        .select(pushPrefKey)
        .eq("id", user.id)
        .single();
      if (pushProfile && pushProfile[pushPrefKey] === false) {
        skipPush = true;
        console.log(`Push skipped: user ${user.id} opted out of push for ${type}`);
      }
      if (!skipPush) {
        const { title: pushTitle, body: pushBody } = getPushContent(type, data);
        await sendExpoPushToUserIds(
          [user.id],
          pushTitle,
          pushBody,
          data.eventId,
          supabaseAdmin
        );
      }
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
