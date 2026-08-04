
// Vybz Hub — send-email Edge Function
// Sends transactional/notification emails via Postal HTTP API (primary)
// or SMTP relay via denomailer (fallback).
// Also sends push notifications in the same pass for supported types:
//
//   Android (token_type='fcm'):  direct FCM HTTP v1 API with OAuth2 + in-memory
//                                 token caching; synchronous stale-token cleanup.
//   iOS    (token_type='expo'):  Expo push service with deferred receipt checking
//                                 via push_receipt_queue / check-push-receipts.
//
// Notification modes:
//   parishForNewEvent           → all users matching home_parish / preferred_parishes
//   promoterIdForFollowerLookup → all followers of a promoter
//   eventIdForRsvpLookup        → all users who RSVPd to an event
//   (none)                      → single-recipient (currently authenticated user)
//
// Required secret for Android push: FCM_SERVICE_ACCOUNT_JSON
//   Add via Supabase dashboard → Project Settings → Edge Functions → Secrets.
//   Value = contents of your Firebase service account JSON file.
//   If absent, FCM sends are skipped with a warning; everything else still works.

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

// Expo Push Service — used only for iOS (token_type='expo') tokens
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

// ─── FCM Direct Send — OAuth2 access token cache ──────────────────────────────
// Module-level state persists across warm invocations within the same Edge
// Function instance. On cold start: one exchange. On burst (100+ sends in one
// warm call): still one exchange. Token is reused until 5 min before expiry.
let _fcmToken: string | null = null;
let _fcmExpiry: number = 0;
let _fcmProjectId: string | null = null;

/**
 * Parse and validate the FCM service account JSON secret.
 * Logs field presence only — never logs actual values, private key, or JWT.
 * Returns null if the secret is absent, invalid JSON, or missing required fields.
 */
function parseFcmServiceAccount(): {
  projectId: string;
  clientEmail: string;
  privateKey: string;
} | null {
  const saJson = Deno.env.get("FCM_SERVICE_ACCOUNT_JSON");
  if (!saJson) {
    console.warn("[FCM] FCM_SERVICE_ACCOUNT_JSON not configured — Android push disabled");
    return null;
  }

  let sa: any;
  try {
    sa = JSON.parse(saJson);
  } catch (err) {
    console.warn("[FCM] JSON.parse failed on FCM_SERVICE_ACCOUNT_JSON:", String(err).slice(0, 80));
    return null;
  }

  // Validate all three required fields exist before attempting OAuth2 exchange
  const required = ["project_id", "client_email", "private_key"] as const;
  const missing = required.filter((k) => !sa[k]);
  if (missing.length > 0) {
    console.warn("[FCM] Service account JSON missing required fields:", missing.join(", "));
    return null;
  }

  // Log presence and key length only — values are never logged
  console.log(
    `[FCM] Secret validated — project_id: ✓  client_email: ✓  private_key: ✓ (${
      (sa.private_key as string).length
    } chars)`
  );
  return {
    projectId: sa.project_id as string,
    clientEmail: sa.client_email as string,
    privateKey: sa.private_key as string,
  };
}

/**
 * Exchange the Firebase service account key for a short-lived OAuth2 access
 * token using Deno's native Web Crypto API (no extra libraries required).
 * Returns null if FCM_SERVICE_ACCOUNT_JSON is not configured or invalid.
 */
async function getFcmAccessToken(): Promise<{ token: string; projectId: string } | null> {
  const now = Date.now();
  // Return cached token if still valid with 5-minute buffer
  if (_fcmToken && _fcmProjectId && _fcmExpiry - now > 5 * 60 * 1000) {
    return { token: _fcmToken, projectId: _fcmProjectId };
  }

  const sa = parseFcmServiceAccount();
  if (!sa) return null;

  try {
    _fcmProjectId = sa.projectId;

    const iat = Math.floor(now / 1000);
    const exp = iat + 3600;

    // Base64url encode helper (no padding, URL-safe chars)
    const b64url = (obj: object) =>
      btoa(JSON.stringify(obj))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

    const jwtHeader = b64url({ alg: "RS256", typ: "JWT" });
    // JWT payload uses client_email as issuer — value never logged
    const jwtPayload = b64url({
      iss: sa.clientEmail,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat,
      exp,
    });
    const signingInput = `${jwtHeader}.${jwtPayload}`;

    // Import PKCS8 private key for RS256 signing — key value never logged
    const pemBody = sa.privateKey
      .replace("-----BEGIN PRIVATE KEY-----", "")
      .replace("-----END PRIVATE KEY-----", "")
      .replace(/\s/g, "");
    const binaryKey = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

    const cryptoKey = await crypto.subtle.importKey(
      "pkcs8",
      binaryKey.buffer,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const sig = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      cryptoKey,
      new TextEncoder().encode(signingInput)
    );

    const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    const jwt = `${signingInput}.${sigB64}`;

    // Exchange JWT assertion for Google OAuth2 access token
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.warn("[FCM] OAuth2 exchange failed:", tokenRes.status, errText.slice(0, 200));
      return null;
    }

    const td = await tokenRes.json();
    _fcmToken = td.access_token as string;
    _fcmExpiry = now + (td.expires_in ?? 3600) * 1000;
    console.log("[FCM] OAuth2 token exchanged — valid for", td.expires_in ?? 3600, "s");
    return { token: _fcmToken, projectId: _fcmProjectId };
  } catch (err) {
    console.warn("[FCM] Token generation error:", String(err).slice(0, 200));
    return null;
  }
}

// ─── FCM result type — returned per-recipient for testing visibility ──────────
interface FcmSendResult {
  tokenId: string;       // push_tokens.id first 8 chars — never the token value
  status: "sent" | "stale" | "error" | "auth_error" | "server_error" | "rate_limited" | "payload_error";
  httpStatus: number;
  fcmMessageName?: string; // e.g. "projects/xxx/messages/yyy" — safe to log/return
  errorCode?: string;      // sanitized FCM error code, never token or key values
  tokenRemoved: boolean;
}

/**
 * Send directly to raw FCM registration tokens via FCM HTTP v1 API.
 *
 * Stale-token detection is CONSERVATIVE — a token row is only deleted when FCM
 * returns a confirmed token-specific failure:
 *   • HTTP 404 + errorCode UNREGISTERED  → token definitively invalid, remove
 *   • HTTP 404 + status   NOT_FOUND      → same signal, remove
 *
 * Tokens are NOT removed for:
 *   • HTTP 400 INVALID_ARGUMENT — likely a payload / field-format issue, not a
 *     stale token; removing would silently lose a valid registration
 *   • HTTP 401 / 403            — OAuth2 credential issue, not a user token
 *   • HTTP 429                  — rate limited, retry later
 *   • HTTP 5xx                  — transient FCM server error
 *   • Network timeouts          — transient
 *   • Permission denied on device — OS-level, does not invalidate FCM token
 *
 * Returns a per-recipient result array for test-time visibility in Edge Function
 * response body. Sends are parallelised with Promise.all for burst efficiency.
 */
async function sendFcmDirectToTokens(
  rows: Array<{ id: string; token: string }>,
  title: string,
  body: string,
  eventId: string | undefined,
  notifType: string,
  supabaseAdmin: ReturnType<typeof createClient>
): Promise<FcmSendResult[]> {
  if (rows.length === 0) return [];

  const creds = await getFcmAccessToken();
  if (!creds) return [];

  const fcmUrl = `https://fcm.googleapis.com/v1/projects/${creds.projectId}/messages:send`;
  const staleIds: string[] = [];
  const results: FcmSendResult[] = [];

  await Promise.all(
    rows.map(async (row) => {
      const tokenId = row.id.slice(0, 8);
      try {
        const res = await fetch(fcmUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${creds.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: {
              token: row.token,
              notification: { title, body },
              // FCM data payload must contain only string values
              data: { eventId: eventId ?? "", type: notifType },
              android: {
                priority: "high",
                notification: { channel_id: "vybzhub", sound: "default" },
              },
            },
          }),
        });

        if (res.ok) {
          const resJson = await res.json().catch(() => ({}));
          const msgName = (resJson?.name ?? "") as string;
          // Delivery evidence — message name is safe; no token or key values logged
          console.log("[FCM] Delivered:", msgName);
          results.push({
            tokenId,
            status: "sent",
            httpStatus: res.status,
            fcmMessageName: msgName,
            tokenRemoved: false,
          });
          return;
        }

        const errData = await res.json().catch(() => ({}));
        const fcmStatus = (errData?.error?.status ?? "") as string;
        const errorCode = (errData?.error?.details?.[0]?.errorCode ?? fcmStatus) as string;
        const httpStatus = res.status;

        // ── Conservative stale-token detection ────────────────────────────────
        // Only remove when FCM gives a confirmed token-specific failure.
        // HTTP 404 alone is NOT sufficient — must also confirm the error is
        // UNREGISTERED or NOT_FOUND, ruling out auth and route 404s.
        const isTokenSpecificFailure =
          httpStatus === 404 &&
          (errorCode === "UNREGISTERED" || fcmStatus === "NOT_FOUND");

        if (isTokenSpecificFailure) {
          staleIds.push(row.id);
          console.log(`[FCM] Stale token (${tokenId}): HTTP ${httpStatus} ${errorCode} — will remove`);
          results.push({
            tokenId,
            status: "stale",
            httpStatus,
            errorCode,
            tokenRemoved: true,
          });
          return;
        }

        // Classify non-stale failures without logging sensitive details
        let failStatus: FcmSendResult["status"] = "error";
        if (httpStatus === 401 || httpStatus === 403) failStatus = "auth_error";
        else if (httpStatus === 429)                  failStatus = "rate_limited";
        else if (httpStatus >= 500)                   failStatus = "server_error";
        else if (httpStatus === 400)                  failStatus = "payload_error";

        console.warn(
          `[FCM] Send failed (token ${tokenId}): HTTP ${httpStatus} ${errorCode} — NOT removing token`
        );
        results.push({
          tokenId,
          status: failStatus,
          httpStatus,
          errorCode,
          tokenRemoved: false,
        });
      } catch (err) {
        console.warn("[FCM] Request error (token %s):", tokenId, String(err).slice(0, 100));
        results.push({
          tokenId,
          status: "error",
          httpStatus: 0,
          errorCode: "NETWORK_ERROR",
          tokenRemoved: false,
        });
      }
    })
  );

  // Delete confirmed-stale tokens immediately — no deferred cleanup step needed
  if (staleIds.length > 0) {
    await supabaseAdmin.from("push_tokens").delete().in("id", staleIds);
    console.log("[FCM] Removed", staleIds.length, "stale FCM token(s)");
  }
  const sent = results.filter((r) => r.status === "sent").length;
  console.log("[FCM] Sent", sent, "/", rows.length, "direct FCM notification(s)");
  return results;
}

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

// ─── Unified push sender — routes by token_type ───────────────────────────────
// FCM tokens (Android) → direct FCM HTTP v1 path, synchronous cleanup.
// Expo tokens (iOS)    → Expo push service, deferred receipt checking.
// The check-push-receipts / push_receipt_queue system only ever processes
// expo-type tokens; FCM tokens never enter that queue.
// Returns the per-recipient FCM result array for test-time visibility.
async function sendPushToUserIds(
  userIds: string[],
  title: string,
  body: string,
  eventId: string | undefined,
  notifType: string,
  supabaseAdmin: ReturnType<typeof createClient>
): Promise<FcmSendResult[]> {
  if (userIds.length === 0) return [];
  try {
    const { data: tokenRows, error } = await supabaseAdmin
      .from("push_tokens")
      .select("id, token, token_type")
      .in("user_id", userIds);

    if (error || !tokenRows || tokenRows.length === 0) {
      console.log("[Push] No tokens found for", userIds.length, "user(s)");
      return [];
    }

    // Split by token type
    const fcmRows  = tokenRows.filter((r: any) => r.token_type === "fcm");
    const expoRows = tokenRows.filter((r: any) => r.token_type !== "fcm");

    // ── Direct FCM path (Android) ──────────────────────────────────────────────
    let fcmResults: FcmSendResult[] = [];
    if (fcmRows.length > 0) {
      fcmResults = await sendFcmDirectToTokens(fcmRows, title, body, eventId, notifType, supabaseAdmin);
    }

    // ── Expo-routed path (iOS and any legacy expo tokens) ─────────────────────
    if (expoRows.length > 0) {
      const messages = expoRows.map((row: any) => ({
        to: row.token,
        title,
        body,
        // type included so addNotificationReceivedListener on client can
        // identify server-sent pushes and add them to the in-app list
        data: { eventId: eventId ?? null, type: notifType },
        sound: "default",
        priority: "high",
      }));

      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(messages),
      });

      if (!res.ok) {
        console.warn("[Expo Push] API error:", res.status, await res.text().catch(() => ""));
        return fcmResults;
      }

      const result = await res.json();
      const tickets: any[] = result.data ?? [];

      // ── Fast path: ticket-level DeviceNotRegistered ─────────────────────────
      const immediateInvalidIds: string[] = [];
      const receiptPairs: { receipt_id: string; token_db_id: string }[] = [];

      tickets.forEach((ticket: any, idx: number) => {
        const tokenDbId = expoRows[idx]?.id;
        if (!tokenDbId) return;
        if (ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered") {
          immediateInvalidIds.push(tokenDbId);
        } else if (ticket.status === "ok" && ticket.id) {
          receiptPairs.push({ receipt_id: ticket.id, token_db_id: tokenDbId });
        }
      });

      if (immediateInvalidIds.length > 0) {
        await supabaseAdmin.from("push_tokens").delete().in("id", immediateInvalidIds.filter(Boolean));
        console.log("[Expo Push] Removed", immediateInvalidIds.length, "immediately-invalid token(s)");
      }

      // ── Deferred path: queue receipt IDs for checking 15+ minutes later ────
      if (receiptPairs.length > 0) {
        await supabaseAdmin.from("push_receipt_queue").insert(receiptPairs);
        console.log("[Expo Push] Queued", receiptPairs.length, "receipt(s) for deferred check");

        fetch(`${SUPABASE_URL}/functions/v1/check-push-receipts`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
            "Content-Type": "application/json",
          },
          body: "{}",
        }).catch(() => {}); // fire-and-forget
      }

      const sent = tickets.filter((t: any) => t.status === "ok").length;
      console.log("[Expo Push] Sent", sent, "/", messages.length, "via Expo service");
    }

    return fcmResults;
  } catch (err) {
    console.warn("[Push] Send error:", String(err).slice(0, 200));
    return [];
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

// ─── SMTP connection probe ──────────────────────────────────────────────────────
// Performs a live TCP → 220 banner → EHLO → STARTTLS → AUTH LOGIN sequence
// against the configured SMTP server.  No email is sent; the connection is
// closed with QUIT after AUTH completes (or the failing phase is recorded).
//
// Motivation: Supabase Auth applies a hard 10-second deadline when it connects
// to the custom SMTP server for password-recovery emails.  If any phase of the
// SMTP handshake stalls beyond that limit the request returns 504
// "context deadline exceeded".  This probe lets admins measure per-phase
// latency before users encounter intermittent failures.
//
// Per-phase timing returned:
//   tcpMs    — TCP (or TLS) connection establishment
//   bannerMs — time from connect until SMTP 220 greeting received
//   ehloMs   — EHLO round-trip (may span multiple continuation lines)
//   tlsMs    — STARTTLS + TLS handshake + second EHLO (port 587 only)
//   authMs   — AUTH LOGIN exchange: challenge → username → challenge → password → 235

async function readSmtpResp(conn: any): Promise<string> {
  const buf = new Uint8Array(4096);
  let accum = '';
  while (true) {
    const n: number | null = await conn.read(buf);
    if (n === null || n === 0) break;
    accum += new TextDecoder().decode(buf.subarray(0, n));
    // Only inspect for completion when all buffered data ends with CRLF
    // (guards against partial-line reads triggering an early break)
    if (!accum.endsWith('\r\n')) continue; // Fix: Changed ' \n' to '\r\n' for proper CRLF
    const lines = accum.split('\r\n').filter(Boolean); // Fix: Changed ' \n' to '\r\n'
    const last = lines[lines.length - 1] ?? '';
    // Final SMTP line: "XYZ <space> text"  (not dash — which is continuation)
    if (last.length >= 4 && last[3] === ' ') break;
  }
  return accum;
}

interface SmtpProbeResult {
  ok: boolean;
  totalMs: number;
  phase: string;
  phases: {
    tcpMs: number;
    bannerMs: number;
    ehloMs: number;
    tlsMs: number | null;
    authMs: number | null;
  };
  error?: string;
}

async function probeSmtpHandshake(): Promise<SmtpProbeResult> {
  const t0 = performance.now();
  let phase = 'init';
  let tcpMs = -1, bannerMs = -1, ehloMs = -1;
  let tlsMs: number | null = null;
  let authMs: number | null = null;
  let conn: any = null;

  try {
    const useImplicitTls = SMTP_PORT === 465;
    const useStartTls = !useImplicitTls;

    // ── TCP / TLS connect ────────────────────────────────────────────────────
    const tTcp = performance.now();
    if (useImplicitTls) {
      conn = await Deno.connectTls({ hostname: SMTP_HOST, port: SMTP_PORT });
    } else {
      conn = await Deno.connect({ hostname: SMTP_HOST, port: SMTP_PORT });
    }
    tcpMs = Math.round(performance.now() - tTcp);
    phase = 'tcp';

    const enc = new TextEncoder();
    const write = (s: string) => conn.write(enc.encode(s + '\r\n')); // Fix: Changed ' \n' to '\r\n'
    const read = () => readSmtpResp(conn);

    // ── 220 banner ───────────────────────────────────────────────────────────
    const tBanner = performance.now();
    const banner = await read();
    bannerMs = Math.round(performance.now() - tBanner);
    phase = 'banner';
    if (!banner.startsWith('220'))
      throw new Error(`Unexpected banner: ${banner.slice(0, 80).trim()}`);

    // ── EHLO ─────────────────────────────────────────────────────────────────
    const tEhlo = performance.now();
    await write('EHLO vybzhub-probe');
    const ehloResp = await read();
    ehloMs = Math.round(performance.now() - tEhlo);
    phase = 'ehlo';
    if (!ehloResp.startsWith('250'))
      throw new Error(`EHLO rejected: ${ehloResp.slice(0, 80).trim()}`);

    // ── STARTTLS (port 587 only) ─────────────────────────────────────────────
    if (useStartTls) {
      const tTls = performance.now();
      await write('STARTTLS');
      const tlsResp = await read();
      if (!tlsResp.startsWith('220'))
        throw new Error(`STARTTLS rejected: ${tlsResp.slice(0, 80).trim()}`);
      // Upgrade the TCP connection to TLS (RFC 3207)
      conn = await Deno.startTls(conn, { hostname: SMTP_HOST });
      // Re-issue EHLO after TLS upgrade as required by RFC 3207
      await write('EHLO vybzhub-probe');
      await read(); // discard second EHLO response
      tlsMs = Math.round(performance.now() - tTls);
      phase = 'tls';
    }

    // ── AUTH LOGIN ───────────────────────────────────────────────────────────
    // Credentials are base64-encoded for the SMTP AUTH exchange but are
    // NEVER logged — only the phase timings and response codes are recorded.
    const tAuth = performance.now();
    await write('AUTH LOGIN');
    const ch1 = await read();
    if (!ch1.startsWith('334'))
      throw new Error(`AUTH LOGIN rejected: ${ch1.slice(0, 80).trim()}`);

    await write(btoa(SMTP_USER));
    const ch2 = await read();
    if (!ch2.startsWith('334'))
      throw new Error('AUTH: server rejected username');

    await write(btoa(SMTP_PASS));
    const authFinal = await read();
    authMs = Math.round(performance.now() - tAuth);
    phase = 'auth';

    // Graceful disconnect — no email sent
    try { await write('QUIT'); } catch (_) {}

    if (!authFinal.startsWith('235')) {
      return {
        ok: false,
        totalMs: Math.round(performance.now() - t0),
        phase: 'auth',
        phases: { tcpMs, bannerMs, ehloMs, tlsMs, authMs },
        error: `Credentials rejected — ${authFinal.slice(0, 80).trim()}`,
      };
    }

    return {
      ok: true,
      totalMs: Math.round(performance.now() - t0),
      phase: 'complete',
      phases: { tcpMs, bannerMs, ehloMs, tlsMs, authMs },
    };

  } catch (err) {
    return {
      ok: false,
      totalMs: Math.round(performance.now() - t0),
      phase,
      phases: { tcpMs, bannerMs, ehloMs, tlsMs, authMs },
      error: String(err).slice(0, 200),
    };
  } finally {
    try { conn?.close(); } catch (_) {}
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  try {
    const {
      type,
      data,
      promoterIdForFollowerLookup,
      eventIdForRsvpLookup,
      parishForNewEvent,
      testPushOnly,
      testSmtpHandshake,
    } = await req.json();

    if (!testPushOnly && !testSmtpHandshake && (!type || !data)) {
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

    // ── Admin test-push mode ─────────────────────────────────────────────────
    // Sends to current user's registered devices only.
    // Bypasses email delivery and all per-user preference checks.
    // Returns fcmResults (one entry per FCM token) and tokenInfo (id + type)
    // so the admin UI can display raw delivery evidence without log access.
    if (testPushOnly) {
      const pushTitle = "VybzHub Test Push";
      const pushBody = `Admin test · ${new Date().toLocaleTimeString("en-US", { timeZone: "America/Jamaica" })} JM`;
      const fcmResults = await sendPushToUserIds([user.id], pushTitle, pushBody, undefined, "test_push", supabaseAdmin);
      const { data: tokenRows } = await supabaseAdmin
        .from("push_tokens")
        .select("id, token_type")
        .eq("user_id", user.id);
      const tokenInfo = (tokenRows ?? []).map((t: any) => ({
        id: (t.id as string).slice(0, 8),
        token_type: t.token_type as string,
      }));
      console.log(`[TestPush] user ${user.id.slice(0, 8)} — tokens: ${tokenInfo.length}, fcmResults: ${fcmResults.length}`);
      return new Response(
        JSON.stringify({ success: true, fcmResults, tokenInfo }),
        { status: 200, headers: jsonHeaders }
      );
    }

    // ── SMTP handshake probe ─────────────────────────────────────────────────
    // Probes the same SMTP server Supabase Auth uses for password-recovery
    // emails.  Measures per-phase latency so admins can detect if the server
    // response time is approaching the 10-second Auth deadline.
    if (testSmtpHandshake) {
      if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: 'SMTP_HOST, SMTP_USER, or SMTP_PASS secrets are not configured.',
            totalMs: 0,
            phase: 'init',
            phases: { tcpMs: -1, bannerMs: -1, ehloMs: -1, tlsMs: null, authMs: null },
          }),
          { status: 200, headers: jsonHeaders }
        );
      }
      console.log(`[SMTP Probe] Starting → ${SMTP_HOST}:${SMTP_PORT}`);
      const probeResult = await Promise.race([
        probeSmtpHandshake(),
        new Promise<SmtpProbeResult>((resolve) =>
          setTimeout(
            () =>
              resolve({
                ok: false,
                totalMs: 13000,
                phase: 'timeout',
                phases: { tcpMs: -1, bannerMs: -1, ehloMs: -1, tlsMs: null, authMs: null },
                error: 'Probe timed out after 13 seconds — SMTP server not responding',
              }),
            13000
          )
        ),
      ]);
      console.log(`[SMTP Probe] ok=${probeResult.ok} totalMs=${probeResult.totalMs} phase=${probeResult.phase}`);
      return new Response(JSON.stringify(probeResult), { status: 200, headers: jsonHeaders });
    }

    const hasEmailTransport =
      (POSTAL_API_URL && POSTAL_API_KEY) ||
      (SMTP_HOST && SMTP_USER && SMTP_PASS);

    // ── Follower bulk-send mode ───────────────────────────────────────────────
    if (promoterIdForFollowerLookup) {
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
        console.warn("[Email] No transport configured — skipping follower emails.");
      }

      const pushPrefCol = PUSH_PREF_MAP[type];
      let fcmResults: FcmSendResult[] = [];
      if (pushPrefCol) {
        const { data: pushFollowers } = await supabaseAdmin
          .from("user_profiles")
          .select("id")
          .contains("followed_promoters", [promoterIdForFollowerLookup])
          .eq(pushPrefCol, true);
        const pushUserIds = (pushFollowers ?? []).map((f: any) => f.id);
        const { title: pushTitle, body: pushBody } = getPushContent(type, data);
        fcmResults = await sendPushToUserIds(pushUserIds, pushTitle, pushBody, data.eventId, type, supabaseAdmin);
      }

      return new Response(
        JSON.stringify({ success: true, sent: emailSent, fcmResults }),
        { status: 200, headers: jsonHeaders }
      );
    }

    // ── Parish bulk-send mode ─────────────────────────────────────────────────
    // Two separate queries avoid PostgREST OR-syntax escaping issues with
    // parish names containing dots and spaces ("St. Andrew", etc.).
    if (parishForNewEvent) {
      const [homeRes, prefRes] = await Promise.all([
        supabaseAdmin
          .from("user_profiles")
          .select("id, email, email_notif_new_parish, push_notif_new_parish")
          .eq("home_parish", parishForNewEvent)
          .neq("id", user.id),
        supabaseAdmin
          .from("user_profiles")
          .select("id, email, email_notif_new_parish, push_notif_new_parish")
          .contains("preferred_parishes", [parishForNewEvent])
          .neq("id", user.id),
      ]);

      if (homeRes.error) console.warn("[Parish] home_parish query failed:", homeRes.error.message);
      if (prefRes.error) console.warn("[Parish] preferred_parishes query failed:", prefRes.error.message);

      // Deduplicate — a user may appear in both result sets
      const seen = new Set<string>();
      const parishUsers: any[] = [];
      for (const row of [...(homeRes.data ?? []), ...(prefRes.data ?? [])]) {
        if (!seen.has(row.id)) { seen.add(row.id); parishUsers.push(row); }
      }

      console.log(`[Parish] ${parishUsers.length} user(s) interested in "${parishForNewEvent}" (excluding poster)`);

      if (parishUsers.length === 0) {
        return new Response(
          JSON.stringify({ success: true, sent: 0, pushEligible: 0, reason: "No users interested in this parish" }),
          { status: 200, headers: jsonHeaders }
        );
      }

      let emailSent = 0;
      if (hasEmailTransport) {
        const subject = getEmailSubject(type, data);
        const html = buildEmailHtml(type, data);
        const text = buildEmailText(type, data);
        for (const profile of parishUsers) {
          if (!profile.email) continue;
          if (profile.email_notif_new_parish === false) continue;
          try {
            if (POSTAL_API_URL && POSTAL_API_KEY) {
              await sendViaPostal(profile.email, subject, html, text);
            } else {
              await sendViaSMTP(profile.email, subject, html, text);
            }
            emailSent++;
          } catch (e) {
            console.warn(`[Parish] Email failed → ${profile.email}:`, e);
          }
        }
        console.log(`[Parish] Emails sent: ${emailSent}/${parishUsers.length}`);
      } else {
        console.warn("[Email] No transport configured — skipping parish emails.");
      }

      const pushEligibleIds = parishUsers
        .filter((p: any) => p.push_notif_new_parish !== false)
        .map((p: any) => p.id as string);

      console.log(`[Parish] Push eligible: ${pushEligibleIds.length} user(s)`);
      const { title: pushTitle, body: pushBody } = getPushContent(type, data);
      const fcmResults = await sendPushToUserIds(pushEligibleIds, pushTitle, pushBody, data.eventId, type, supabaseAdmin);

      return new Response(
        JSON.stringify({ success: true, sent: emailSent, pushEligible: pushEligibleIds.length, fcmResults }),
        { status: 200, headers: jsonHeaders }
      );
    }

    // ── RSVP bulk notification mode ───────────────────────────────────────────
    if (eventIdForRsvpLookup) {
      const { data: rsvpRows, error: rsvpError } = await supabaseAdmin
        .from("user_rsvps")
        .select("user_id")
        .eq("event_id", eventIdForRsvpLookup)
        .in("status", ["going", "interested"]);

      if (rsvpError) {
        console.warn("[RSVP] user_rsvps lookup failed:", rsvpError.message);
      }

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

      const selectCols = ["id", "email"];
      if (emailPrefCol) selectCols.push(emailPrefCol);
      if (pushPrefCol && pushPrefCol !== emailPrefCol) selectCols.push(pushPrefCol);

      const { data: profiles } = await supabaseAdmin
        .from("user_profiles")
        .select(selectCols.join(", "))
        .in("id", rsvpUserIds);

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

      let fcmResults: FcmSendResult[] = [];
      if (pushPrefCol) {
        const pushEligibleIds: string[] = (profiles ?? [])
          .filter((p: any) => p[pushPrefCol] !== false)
          .map((p: any) => p.id as string);
        console.log(`[RSVP] Push eligible: ${pushEligibleIds.length} user(s)`);
        const { title: pushTitle, body: pushBody } = getPushContent(type, data);
        fcmResults = await sendPushToUserIds(pushEligibleIds, pushTitle, pushBody, data.eventId, type, supabaseAdmin);
      }

      return new Response(
        JSON.stringify({ success: true, sent: emailSent, pushEligible: rsvpUserIds.length, fcmResults }),
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

    let fcmResults: FcmSendResult[] = [];
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
        fcmResults = await sendPushToUserIds([user.id], pushTitle, pushBody, data.eventId, type, supabaseAdmin);
      }
    }

    return new Response(JSON.stringify({ success: true, fcmResults }), {
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
