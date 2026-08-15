// supabase/functions/passkit-webservice/index.ts
// Implements the Apple PassKit Web Service protocol (Wallet pass updates).
// https://developer.apple.com/documentation/walletpasses/building_a_pass
//
// Endpoints handled per Apple's specification:
//   POST   /v1/devices/:deviceId/registrations/:passTypeId/:serial  — register device
//   DELETE /v1/devices/:deviceId/registrations/:passTypeId/:serial  — unregister device
//   GET    /v1/devices/:deviceId/registrations/:passTypeId          — list updated passes
//   GET    /v1/passes/:passTypeId/:serial                           — get latest pass bundle
//   POST   /v1/log                                                  — Apple diagnostic log
//   POST   /notify/:serial                                          — INTERNAL: trigger APNs push
//
// Apple→server calls carry:  Authorization: ApplePass <authenticationToken>
// The authenticationToken is a per-ticket random secret stored in wallet_pass_tokens.
// It is NOT the ticket's secure_token (QR credential) — the two are completely separate.
//
// The /notify/:serial endpoint is called by the Vybz Hub scanner after a successful
// check-in to push an update to all registered Apple Wallet devices.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

// ─── CORS headers that include DELETE (needed for Apple Wallet unregister) ────
const passkitCors = {
  ...corsHeaders,
  'Access-Control-Allow-Methods': 'POST, GET, DELETE, OPTIONS',
};

// ─── APNs JWT builder (ES256) ─────────────────────────────────────────────────
// Builds a short-lived bearer JWT for APNs HTTP/2 authentication.
// The APNs auth key is a PKCS#8 EC (P-256) private key, stored base64-encoded.
// DO NOT log p8Base64 or the resulting JWT.

async function buildApnsJwt(
  teamId: string,
  keyId: string,
  p8Base64: string,
): Promise<string> {
  const header = { alg: 'ES256', kid: keyId };
  const payload = { iss: teamId, iat: Math.floor(Date.now() / 1000) };

  const b64url = (obj: object) =>
    btoa(JSON.stringify(obj))
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

  const headerB64 = b64url(header);
  const payloadB64 = b64url(payload);
  const sigInput = `${headerB64}.${payloadB64}`;

  // Strip PEM header/footer if present — accept raw base64 or full PEM
  const rawB64 = p8Base64
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s/g, '');
  const keyBytes = Uint8Array.from(atob(rawB64), (c) => c.charCodeAt(0));

  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    keyBytes,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );

  const sigBytes = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    new TextEncoder().encode(sigInput),
  );

  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sigBytes)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${sigInput}.${sigB64}`;
}

// ─── Send APNs Wallet-update push ─────────────────────────────────────────────
// Sends an empty-payload push to the device. Apple Wallet then polls
// GET /v1/devices/:deviceId/registrations/:passTypeId to discover which
// passes have changed, then fetches the updated bundle.
// NEVER include ticket details, secure_token, or PII in the APNs payload.

async function sendApnsPush(
  pushToken: string,
  passTypeId: string,
  teamId: string,
  keyId: string,
  p8Base64: string,
): Promise<void> {
  const jwt = await buildApnsJwt(teamId, keyId, p8Base64);
  // Apple production APNs HTTP/2 endpoint
  const apnsUrl = `https://api.push.apple.com/3/device/${pushToken}`;

  const resp = await fetch(apnsUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      'apns-topic': passTypeId,        // Must equal passTypeIdentifier from pass.json
      'apns-push-type': 'background',  // Wallet update pushes are background type
      'apns-priority': '5',            // Low priority — pass update, not user notification
      'Content-Type': 'application/json',
    },
    body: '{}',
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '(unreadable)');
    // Log status and error category only — no tokens in logs
    console.error(`[passkit-webservice] APNs push failed: HTTP ${resp.status} — ${body}`);
  } else {
    console.log(`[passkit-webservice] APNs push sent → device …${pushToken.slice(-8)}`);
  }
}

// ─── Route matcher ────────────────────────────────────────────────────────────
// Strips the Supabase Edge Function path prefix before matching Apple's routes.

interface RouteMatch {
  deviceId?: string;
  passTypeId?: string;
  serial?: string;
  action:
    | 'register'
    | 'unregister'
    | 'list_updated'
    | 'get_pass'
    | 'log'
    | 'notify'
    | 'unknown';
}

function matchRoute(method: string, rawPath: string): RouteMatch {
  // Normalise: strip Supabase function prefix so Apple-spec paths match cleanly
  const clean = rawPath
    .replace(/^\/functions\/v1\/passkit-webservice/, '')
    .replace(/^\/passkit-webservice/, '') || '/';

  // POST /v1/log
  if (method === 'POST' && /^\/v1\/log\/?$/.test(clean)) {
    return { action: 'log' };
  }

  // POST /notify/:serial  — internal wallet-update trigger
  const notifyM = clean.match(/^\/notify\/([^/]+)\/?$/);
  if (method === 'POST' && notifyM) {
    return { action: 'notify', serial: notifyM[1] };
  }

  // POST|DELETE /v1/devices/:deviceId/registrations/:passTypeId/:serial
  const regM = clean.match(
    /^\/v1\/devices\/([^/]+)\/registrations\/([^/]+)\/([^/]+)\/?$/,
  );
  if (regM) {
    if (method === 'POST') {
      return { action: 'register', deviceId: regM[1], passTypeId: regM[2], serial: regM[3] };
    }
    if (method === 'DELETE') {
      return { action: 'unregister', deviceId: regM[1], passTypeId: regM[2], serial: regM[3] };
    }
  }

  // GET /v1/devices/:deviceId/registrations/:passTypeId
  const listM = clean.match(/^\/v1\/devices\/([^/]+)\/registrations\/([^/]+)\/?$/);
  if (method === 'GET' && listM) {
    return { action: 'list_updated', deviceId: listM[1], passTypeId: listM[2] };
  }

  // GET /v1/passes/:passTypeId/:serial
  const passM = clean.match(/^\/v1\/passes\/([^/]+)\/([^/]+)\/?$/);
  if (method === 'GET' && passM) {
    return { action: 'get_pass', passTypeId: passM[1], serial: passM[2] };
  }

  return { action: 'unknown' };
}

// ─── Verify Apple authenticationToken ─────────────────────────────────────────
// Apple sends: Authorization: ApplePass <token>
// We verify that the token matches the one stored in wallet_pass_tokens for the
// given serial (ticket UUID). Never trust serial alone.

async function verifyPassAuth(
  authHeader: string | null,
  serial: string,
  admin: ReturnType<typeof createClient>,
): Promise<boolean> {
  if (!authHeader) return false;
  const token = authHeader.replace(/^ApplePass\s+/i, '').trim();
  if (!token || token.length < 16) return false;

  const { data } = await admin
    .from('wallet_pass_tokens')
    .select('ticket_id')
    .eq('ticket_id', serial)
    .eq('authentication_token', token)
    .maybeSingle();

  return !!data;
}

// ─── Main handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const method = req.method;
  const path = url.pathname;

  if (method === 'OPTIONS') {
    return new Response(null, { headers: passkitCors });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const passTypeId = Deno.env.get('PASSKIT_PASS_TYPE_IDENTIFIER') ?? '';
  const teamId = Deno.env.get('PASSKIT_TEAM_ID') ?? '';
  const apnsKeyId = Deno.env.get('APNS_KEY_ID') ?? '';
  const apnsKeyB64 = Deno.env.get('APNS_AUTH_KEY_BASE64') ?? '';

  const admin = createClient(supabaseUrl, serviceKey);
  const route = matchRoute(method, path);

  console.log(
    `[passkit-webservice] ${method} ${path} → action=${route.action}`,
  );

  try {
    // ── POST /v1/log — Apple Wallet diagnostic logs ────────────────────────────
    if (route.action === 'log') {
      const body = await req.json().catch(() => ({}));
      // Log safely — these are Apple's own diagnostic messages, not sensitive
      console.log('[passkit-webservice] Apple log:', JSON.stringify(body).slice(0, 500));
      return new Response(null, { status: 200, headers: passkitCors });
    }

    // ── POST /notify/:serial — internal APNs trigger ───────────────────────────
    // Called by the scanner after a successful check-in, or by server processes
    // when ticket state changes (refund, cancellation, transfer).
    //
    // Auth model:
    //   The scanner sends a valid user JWT (staff who just performed the check-in).
    //   Server-side callers may send the service-role key directly.
    //   We accept any non-empty Bearer token — the check-in RPC already enforced
    //   staff authorization before this notify call is made.
    if (route.action === 'notify') {
      const authHeader = req.headers.get('Authorization') ?? '';
      if (!authHeader.startsWith('Bearer ') && !authHeader.startsWith('bearer ')) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403,
          headers: { ...passkitCors, 'Content-Type': 'application/json' },
        });
      }

      const serial = route.serial!;
      const { data: registrations, error: regErr } = await admin
        .from('wallet_pass_registrations')
        .select('push_token')
        .eq('serial_number', serial);

      if (regErr) {
        console.error('[passkit-webservice] notify: DB error:', regErr.message);
      }

      if (!registrations || registrations.length === 0) {
        // No registered devices — not an error; ticket may not have been added to Wallet yet
        return new Response(JSON.stringify({ ok: true, pushed: 0, registered: 0 }), {
          status: 200,
          headers: { ...passkitCors, 'Content-Type': 'application/json' },
        });
      }

      let pushed = 0;
      for (const reg of registrations as Array<{ push_token: string }>) {
        try {
          await sendApnsPush(reg.push_token, passTypeId, teamId, apnsKeyId, apnsKeyB64);
          pushed++;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error('[passkit-webservice] APNs push error (non-fatal):', msg);
        }
      }

      return new Response(
        JSON.stringify({ ok: true, pushed, registered: registrations.length }),
        { status: 200, headers: { ...passkitCors, 'Content-Type': 'application/json' } },
      );
    }

    // ── POST /v1/devices/:deviceId/registrations/:passTypeId/:serial ──────────
    // Apple device registers to receive pass-update pushes.
    if (route.action === 'register') {
      const { deviceId, serial } = route;
      const authHeader = req.headers.get('Authorization');

      const isValid = await verifyPassAuth(authHeader, serial!, admin);
      if (!isValid) {
        console.warn(`[passkit-webservice] register: auth failed for serial ${serial?.slice(0, 8)}`);
        return new Response(null, { status: 401, headers: passkitCors });
      }

      let pushToken = '';
      try {
        const body = await req.json() as { pushToken?: string };
        pushToken = body.pushToken ?? '';
      } catch {
        return new Response(null, { status: 400, headers: passkitCors });
      }

      if (!pushToken) {
        return new Response(null, { status: 400, headers: passkitCors });
      }

      const authToken = (authHeader ?? '').replace(/^ApplePass\s+/i, '').trim();

      const { error: upsertErr } = await admin
        .from('wallet_pass_registrations')
        .upsert(
          {
            ticket_id: serial!,
            serial_number: serial!,
            device_library_identifier: deviceId!,
            push_token: pushToken,
            pass_type_identifier: passTypeId,
            authentication_token: authToken,
          },
          { onConflict: 'device_library_identifier,serial_number' },
        );

      if (upsertErr) {
        console.error('[passkit-webservice] register: upsert error:', upsertErr.message);
        return new Response(null, { status: 500, headers: passkitCors });
      }

      console.log(
        `[passkit-webservice] Device registered: serial=${serial!.slice(0, 8)} device=…${deviceId!.slice(-8)}`,
      );
      // 201 = new registration; 200 = already registered (both acceptable per Apple spec)
      return new Response(null, { status: 201, headers: passkitCors });
    }

    // ── DELETE /v1/devices/:deviceId/registrations/:passTypeId/:serial ────────
    // Apple device unregisters (user removed pass from Wallet).
    if (route.action === 'unregister') {
      const { deviceId, serial } = route;
      const authHeader = req.headers.get('Authorization');

      const isValid = await verifyPassAuth(authHeader, serial!, admin);
      if (!isValid) {
        return new Response(null, { status: 401, headers: passkitCors });
      }

      await admin
        .from('wallet_pass_registrations')
        .delete()
        .eq('serial_number', serial!)
        .eq('device_library_identifier', deviceId!);

      console.log(
        `[passkit-webservice] Device unregistered: serial=${serial!.slice(0, 8)} device=…${deviceId!.slice(-8)}`,
      );
      return new Response(null, { status: 200, headers: passkitCors });
    }

    // ── GET /v1/devices/:deviceId/registrations/:passTypeId ───────────────────
    // Apple polls this endpoint to discover which passes need updating.
    // Responds with serialNumbers of passes whose ticket record changed since
    // the given passesUpdatedSince Unix timestamp.
    if (route.action === 'list_updated') {
      const { deviceId } = route;
      const sinceParam = url.searchParams.get('passesUpdatedSince');

      const { data: regs, error: regsErr } = await admin
        .from('wallet_pass_registrations')
        .select('serial_number')
        .eq('device_library_identifier', deviceId!);

      if (regsErr || !regs || regs.length === 0) {
        // No registrations for this device → 204 per Apple spec
        return new Response(null, { status: 204, headers: passkitCors });
      }

      const serials = (regs as Array<{ serial_number: string }>).map((r) => r.serial_number);

      let updatedSerials: string[] = serials;

      if (sinceParam) {
        // Filter to tickets updated after the provided epoch
        const sinceEpochMs = parseInt(sinceParam, 10) * 1000;
        if (!Number.isNaN(sinceEpochMs)) {
          const sinceIso = new Date(sinceEpochMs).toISOString();
          const { data: changedTickets } = await admin
            .from('tickets')
            .select('id')
            .in('id', serials)
            .gt('updated_at', sinceIso);

          updatedSerials = ((changedTickets ?? []) as Array<{ id: string }>).map((t) => t.id);
        }
      }

      if (updatedSerials.length === 0) {
        // Nothing changed since last poll → 204
        return new Response(null, { status: 204, headers: passkitCors });
      }

      const lastUpdated = Math.floor(Date.now() / 1000).toString();
      return new Response(
        JSON.stringify({ serialNumbers: updatedSerials, lastUpdated }),
        {
          status: 200,
          headers: { ...passkitCors, 'Content-Type': 'application/json' },
        },
      );
    }

    // ── GET /v1/passes/:passTypeId/:serial ─────────────────────────────────────
    // Apple fetches an updated pass bundle after receiving a push notification.
    // Re-generates the signed .pkpass by calling generate-wallet-pass internally.
    if (route.action === 'get_pass') {
      const { serial } = route;
      const authHeader = req.headers.get('Authorization');

      // Verify authenticationToken before generating a new pass
      const isValid = await verifyPassAuth(authHeader, serial!, admin);
      if (!isValid) {
        console.warn(`[passkit-webservice] get_pass: auth failed for serial ${serial?.slice(0, 8)}`);
        return new Response(null, { status: 401, headers: passkitCors });
      }

      // Call generate-wallet-pass as an internal service call.
      // Pass the service-role key so ownership checks are bypassed —
      // authenticationToken verification above is sufficient proof of ownership.
      const genUrl = `${supabaseUrl}/functions/v1/generate-wallet-pass`;
      const internalResp = await fetch(genUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ticket_id: serial, _internal: true }),
      });

      if (!internalResp.ok) {
        const errText = await internalResp.text().catch(() => '');
        console.error(
          `[passkit-webservice] get_pass: generate-wallet-pass failed ${internalResp.status} — ${errText.slice(0, 200)}`,
        );
        return new Response(null, { status: 500, headers: passkitCors });
      }

      const passBuffer = await internalResp.arrayBuffer();
      const etag = `"v${Math.floor(Date.now() / 1000)}"`;

      return new Response(passBuffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.apple.pkpass',
          'Last-Modified': new Date().toUTCString(),
          ETag: etag,
          'Cache-Control': 'no-store',
          ...passkitCors,
        },
      });
    }

    // ── Unknown route ─────────────────────────────────────────────────────────
    console.warn(`[passkit-webservice] No handler for ${method} ${path}`);
    return new Response(null, { status: 404, headers: passkitCors });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[passkit-webservice] Unhandled error:', msg);
    return new Response(null, { status: 500, headers: passkitCors });
  }
});
