// supabase/functions/_shared/push.ts
//
// Shared push notification sender for VybzHub Edge Functions.
// Import this module into any Edge Function that needs to send push
// notifications without going through the send-email auth chain.
//
// Supports:
//   Android  (token_type='fcm')  — direct FCM HTTP v1 API with OAuth2
//   iOS      (token_type='expo') — Expo push service + deferred receipt queue
//
// Usage:
//   import { sendPushToUserIds } from '../_shared/push.ts';
//
//   const results = await sendPushToUserIds(
//     ['user-uuid'], 'Title', 'Body', eventId, 'notif_type', supabaseAdmin, true,
//   );

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─── Expo Push URL ────────────────────────────────────────────────────────────
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

// ─── FCM OAuth2 token cache (persists across warm invocations) ────────────────
// Module-level state: one token exchange per warm instance; reused until
// 5 minutes before expiry.
let _fcmToken: string | null = null;
let _fcmExpiry: number = 0;
let _fcmProjectId: string | null = null;

// ─── Public types ─────────────────────────────────────────────────────────────
export interface FcmSendResult {
  tokenId: string;
  status:
    | 'sent'
    | 'stale'
    | 'error'
    | 'auth_error'
    | 'server_error'
    | 'rate_limited'
    | 'payload_error';
  httpStatus: number;
  fcmMessageName?: string;
  errorCode?: string;
  tokenRemoved: boolean;
}

// ─── FCM service account ──────────────────────────────────────────────────────
function parseFcmServiceAccount(): {
  projectId: string;
  clientEmail: string;
  privateKey: string;
} | null {
  const saJson = Deno.env.get('FCM_SERVICE_ACCOUNT_JSON');
  if (!saJson) {
    console.warn('[push] FCM_SERVICE_ACCOUNT_JSON not configured — Android push disabled');
    return null;
  }
  let sa: any;
  try {
    sa = JSON.parse(saJson);
  } catch (err) {
    console.warn('[push] JSON.parse failed on FCM_SERVICE_ACCOUNT_JSON:', String(err).slice(0, 80));
    return null;
  }
  const missing = (['project_id', 'client_email', 'private_key'] as const).filter(
    (k) => !sa[k],
  );
  if (missing.length > 0) {
    console.warn('[push] Service account JSON missing required fields:', missing.join(', '));
    return null;
  }
  return {
    projectId: sa.project_id as string,
    clientEmail: sa.client_email as string,
    privateKey: sa.private_key as string,
  };
}

/**
 * Exchange the Firebase service account for a short-lived OAuth2 access token.
 * Returns null when FCM_SERVICE_ACCOUNT_JSON is absent, invalid, or the
 * exchange fails. Private key and token values are never logged.
 */
async function getFcmAccessToken(): Promise<{ token: string; projectId: string } | null> {
  const now = Date.now();
  if (_fcmToken && _fcmProjectId && _fcmExpiry - now > 5 * 60 * 1000) {
    return { token: _fcmToken, projectId: _fcmProjectId };
  }
  const sa = parseFcmServiceAccount();
  if (!sa) return null;
  try {
    _fcmProjectId = sa.projectId;
    const iat = Math.floor(now / 1000);
    const exp = iat + 3600;
    const b64url = (obj: object) =>
      btoa(JSON.stringify(obj))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
    const jwtHeader  = b64url({ alg: 'RS256', typ: 'JWT' });
    const jwtPayload = b64url({
      iss:   sa.clientEmail,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud:   'https://oauth2.googleapis.com/token',
      iat,
      exp,
    });
    const signingInput = `${jwtHeader}.${jwtPayload}`;
    const pemBody = sa.privateKey
      .replace('-----BEGIN PRIVATE KEY-----', '')
      .replace('-----END PRIVATE KEY-----', '')
      .replace(/\s/g, '');
    const binaryKey = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));
    const cryptoKey = await crypto.subtle.importKey(
      'pkcs8',
      binaryKey.buffer,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const sig = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      cryptoKey,
      new TextEncoder().encode(signingInput),
    );
    const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const jwt = `${signingInput}.${sigB64}`;
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
    });
    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.warn('[push] FCM OAuth2 exchange failed:', tokenRes.status, errText.slice(0, 200));
      return null;
    }
    const td = await tokenRes.json();
    _fcmToken  = td.access_token as string;
    _fcmExpiry = now + (td.expires_in ?? 3600) * 1000;
    console.log('[push] FCM OAuth2 token exchanged — valid for', td.expires_in ?? 3600, 's');
    return { token: _fcmToken, projectId: _fcmProjectId };
  } catch (err) {
    console.warn('[push] FCM token generation error:', String(err).slice(0, 200));
    return null;
  }
}

// ─── FCM direct sender ────────────────────────────────────────────────────────
/**
 * Send directly to FCM registration tokens via FCM HTTP v1 API.
 * Conservative stale-token detection: only removes tokens on confirmed
 * HTTP 404 + UNREGISTERED/NOT_FOUND. Never removes on 400/401/429/5xx.
 */
async function sendFcmDirectToTokens(
  rows: Array<{ id: string; token: string }>,
  title: string,
  body: string,
  eventId: string | undefined,
  notifType: string,
  supabaseAdmin: ReturnType<typeof createClient>,
  serverPersisted?: boolean,
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
          method:  'POST',
          headers: {
            Authorization:  `Bearer ${creds.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: {
              token:        row.token,
              notification: { title, body },
              data: {
                eventId:          eventId ?? '',
                type:             notifType,
                server_persisted: serverPersisted ? '1' : '0',
              },
              android: {
                priority:     'high',
                notification: { channel_id: 'vybzhub', sound: 'default' },
              },
            },
          }),
        });

        if (res.ok) {
          const resJson = await res.json().catch(() => ({}));
          const msgName = (resJson?.name ?? '') as string;
          console.log('[push] FCM Delivered:', msgName);
          results.push({
            tokenId,
            status:          'sent',
            httpStatus:      res.status,
            fcmMessageName:  msgName,
            tokenRemoved:    false,
          });
          return;
        }

        const errData   = await res.json().catch(() => ({}));
        const fcmStatus = (errData?.error?.status ?? '') as string;
        const errorCode = (errData?.error?.details?.[0]?.errorCode ?? fcmStatus) as string;
        const httpStatus = res.status;

        // Conservative: only remove on confirmed token-specific failure
        const isTokenSpecificFailure =
          httpStatus === 404 &&
          (errorCode === 'UNREGISTERED' || fcmStatus === 'NOT_FOUND');

        if (isTokenSpecificFailure) {
          staleIds.push(row.id);
          console.log(`[push] FCM stale token (${tokenId}): HTTP ${httpStatus} ${errorCode} — will remove`);
          results.push({ tokenId, status: 'stale', httpStatus, errorCode, tokenRemoved: true });
          return;
        }

        let failStatus: FcmSendResult['status'] = 'error';
        if (httpStatus === 401 || httpStatus === 403)  failStatus = 'auth_error';
        else if (httpStatus === 429)                   failStatus = 'rate_limited';
        else if (httpStatus >= 500)                    failStatus = 'server_error';
        else if (httpStatus === 400)                   failStatus = 'payload_error';
        console.warn(`[push] FCM send failed (${tokenId}): HTTP ${httpStatus} ${errorCode} — NOT removing`);
        results.push({ tokenId, status: failStatus, httpStatus, errorCode, tokenRemoved: false });
      } catch (err) {
        console.warn('[push] FCM request error:', tokenId, String(err).slice(0, 100));
        results.push({
          tokenId,
          status:     'error',
          httpStatus: 0,
          errorCode:  'NETWORK_ERROR',
          tokenRemoved: false,
        });
      }
    }),
  );

  if (staleIds.length > 0) {
    await supabaseAdmin.from('push_tokens').delete().in('id', staleIds);
    console.log('[push] Removed', staleIds.length, 'stale FCM token(s)');
  }
  const sent = results.filter((r) => r.status === 'sent').length;
  console.log('[push] FCM sent', sent, '/', rows.length, 'notification(s)');
  return results;
}

// ─── Unified push sender ──────────────────────────────────────────────────────
/**
 * Send a push notification to all registered devices for the given user IDs.
 *
 * Routes FCM tokens (Android) through FCM HTTP v1 and Expo tokens (iOS)
 * through the Expo push service. Handles stale-token cleanup and deferred
 * receipt queuing for Expo.
 *
 * This function requires only a service-role Supabase client — it has no
 * dependency on authenticated user JWTs, making it safe to call from any
 * Edge Function that already holds admin/service context.
 *
 * @param userIds        Target user IDs to look up push tokens for
 * @param title          Notification title
 * @param body           Notification body text
 * @param eventId        Optional event UUID for client-side deep-link routing
 * @param notifType      Notification type string (e.g. 'account_deletion_rejected')
 * @param supabaseAdmin  Service-role Supabase client (bypasses RLS)
 * @param serverPersisted  When true, sends server_persisted='1' in data payload so
 *                         the foreground listener reloads from DB instead of adding
 *                         a local duplicate. Set true whenever you insert the in-app
 *                         notification row before calling this function.
 */
export async function sendPushToUserIds(
  userIds: string[],
  title: string,
  body: string,
  eventId: string | undefined,
  notifType: string,
  supabaseAdmin: ReturnType<typeof createClient>,
  serverPersisted?: boolean,
): Promise<FcmSendResult[]> {
  if (userIds.length === 0) return [];

  try {
    const { data: tokenRows, error } = await supabaseAdmin
      .from('push_tokens')
      .select('id, token, token_type')
      .in('user_id', userIds);

    if (error || !tokenRows || tokenRows.length === 0) {
      console.log('[push] No tokens found for', userIds.length, 'user(s)');
      return [];
    }

    const fcmRows  = tokenRows.filter((r: any) => r.token_type === 'fcm');
    const expoRows = tokenRows.filter((r: any) => r.token_type !== 'fcm');

    // ── Android: direct FCM HTTP v1 ───────────────────────────────────────────
    let fcmResults: FcmSendResult[] = [];
    if (fcmRows.length > 0) {
      fcmResults = await sendFcmDirectToTokens(
        fcmRows, title, body, eventId, notifType, supabaseAdmin, serverPersisted,
      );
    }

    // ── iOS: Expo push service + receipt queue ────────────────────────────────
    if (expoRows.length > 0) {
      const messages = expoRows.map((row: any) => ({
        to:       row.token,
        title,
        body,
        data: {
          eventId:          eventId ?? null,
          type:             notifType,
          server_persisted: serverPersisted ? '1' : '0',
        },
        sound:    'default',
        priority: 'high',
      }));

      const res = await fetch(EXPO_PUSH_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body:    JSON.stringify(messages),
      });

      if (!res.ok) {
        console.warn('[push] Expo push API error:', res.status, await res.text().catch(() => ''));
        return fcmResults;
      }

      const result  = await res.json();
      const tickets: any[] = result.data ?? [];

      const immediateInvalidIds: string[] = [];
      const receiptPairs: { receipt_id: string; token_db_id: string }[] = [];

      tickets.forEach((ticket: any, idx: number) => {
        const tokenDbId = expoRows[idx]?.id;
        if (!tokenDbId) return;
        if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
          immediateInvalidIds.push(tokenDbId);
        } else if (ticket.status === 'ok' && ticket.id) {
          receiptPairs.push({ receipt_id: ticket.id, token_db_id: tokenDbId });
        }
      });

      if (immediateInvalidIds.length > 0) {
        await supabaseAdmin
          .from('push_tokens')
          .delete()
          .in('id', immediateInvalidIds.filter(Boolean));
        console.log('[push] Expo: Removed', immediateInvalidIds.length, 'immediately-invalid token(s)');
      }

      if (receiptPairs.length > 0) {
        await supabaseAdmin.from('push_receipt_queue').insert(receiptPairs);
        console.log('[push] Expo: Queued', receiptPairs.length, 'receipt(s) for deferred check');
        // Fire-and-forget: trigger receipt checker
        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
        const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
        fetch(`${supabaseUrl}/functions/v1/check-push-receipts`, {
          method:  'POST',
          headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
          body:    '{}',
        }).catch(() => {});
      }

      const sent = tickets.filter((t: any) => t.status === 'ok').length;
      console.log('[push] Expo: sent', sent, '/', messages.length, 'via Expo service');
    }

    return fcmResults;
  } catch (err) {
    console.warn('[push] sendPushToUserIds error:', String(err).slice(0, 200));
    return [];
  }
}
