// supabase/functions/passkit-webservice/index.ts
// Implements the Apple PassKit Web Service protocol.
// https://developer.apple.com/documentation/walletpasses/building_a_pass
//
// Endpoints handled:
//   POST /v1/devices/:deviceId/registrations/:passTypeId/:serial   — register device
//   DELETE /v1/devices/:deviceId/registrations/:passTypeId/:serial — unregister device
//   GET  /v1/devices/:deviceId/registrations/:passTypeId           — list updated passes
//   GET  /v1/passes/:passTypeId/:serial                            — get latest pass
//   POST /v1/log                                                    — error log
//   POST /notify/:serial                                            — internal: trigger APNs push
//
// Authentication for Apple→server calls uses the authenticationToken embedded in
// the pass JSON, sent by Apple as "Authorization: ApplePass <token>".
//
// The /notify/:serial endpoint is for internal use only (called by backend processes
// when a ticket is checked in to push an update to all registered devices).

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

// ─── APNs JWT helper ──────────────────────────────────────────────────────────
// Builds a short-lived ES256 JWT for APNs authentication.

async function buildApnsJwt(
  teamId: string,
  keyId: string,
  p8Base64: string,
): Promise<string> {
  const header = { alg: 'ES256', kid: keyId };
  const payload = { iss: teamId, iat: Math.floor(Date.now() / 1000) };

  const encode = (obj: object) =>
    btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const headerB64 = encode(header);
  const payloadB64 = encode(payload);
  const sigInput = `${headerB64}.${payloadB64}`;

  // Decode the P8 (PKCS#8 EC private key) from base64
  const rawP8 = p8Base64.replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');
  const keyBytes = Uint8Array.from(atob(rawP8), (c) => c.charCodeAt(0));

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
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  return `${sigInput}.${sigB64}`;
}

// ─── Send APNs push for a pass update ────────────────────────────────────────
async function sendApnsPush(
  pushToken: string,
  passTypeId: string,
  teamId: string,
  keyId: string,
  p8Base64: string,
): Promise<void> {
  const jwt = await buildApnsJwt(teamId, keyId, p8Base64);
  const url = `https://api.push.apple.com/3/device/${pushToken}`;

  // Pass-update pushes use an empty body with topic = passTypeId
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      'apns-topic': passTypeId,
      'apns-push-type': 'background',
      'Content-Type': 'application/json',
    },
    body: '{}',
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    console.error(`[passkit-webservice] APNs push failed: ${resp.status} ${body}`);
  } else {
    console.log(`[passkit-webservice] APNs push sent to token …${pushToken.slice(-8)}`);
  }
}

// ─── Route matcher ────────────────────────────────────────────────────────────
interface RouteMatch {
  deviceId?: string;
  passTypeId?: string;
  serial?: string;
  action: 'register' | 'unregister' | 'list_updated' | 'get_pass' | 'log' | 'notify' | 'unknown';
}

function matchRoute(method: string, path: string): RouteMatch {
  // Strip function prefix /passkit-webservice or /functions/v1/passkit-webservice
  const clean = path.replace(/^\/functions\/v1\/passkit-webservice/, '').replace(/^\/passkit-webservice/, '') || '/';

  // POST /v1/log
  if (method === 'POST' && /^\/v1\/log\/?$/.test(clean)) {
    return { action: 'log' };
  }
  // POST /notify/:serial  (internal)
  const notifyM = clean.match(/^\/notify\/([^/]+)\/?$/);
  if (method === 'POST' && notifyM) {
    return { action: 'notify', serial: notifyM[1] };
  }
  // POST /v1/devices/:deviceId/registrations/:passTypeId/:serial
  const regM = clean.match(/^\/v1\/devices\/([^/]+)\/registrations\/([^/]+)\/([^/]+)\/?$/);
  if (regM) {
    if (method === 'POST') return { action: 'register', deviceId: regM[1], passTypeId: regM[2], serial: regM[3] };
    if (method === 'DELETE') return { action: 'unregister', deviceId: regM[1], passTypeId: regM[2], serial: regM[3] };
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

// ─── Verify Apple authenticationToken ────────────────────────────────────────
// Apple sends: Authorization: ApplePass <token>
async function verifyPassAuth(
  authHeader: string | null,
  serial: string,
  admin: ReturnType<typeof createClient>,
): Promise<boolean> {
  if (!authHeader) return false;
  const token = authHeader.replace(/^ApplePass\s+/i, '').trim();
  if (!token) return false;

  const { data } = await admin
    .from('wallet_pass_tokens')
    .select('ticket_id')
    .eq('ticket_id', serial)
    .eq('authentication_token', token)
    .maybeSingle();

  return !!data;
}

// ─── Handler ──────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  if (method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const passTypeId = Deno.env.get('PASSKIT_PASS_TYPE_IDENTIFIER') ?? '';
  const teamId = Deno.env.get('PASSKIT_TEAM_ID') ?? '';
  const apnsKeyId = Deno.env.get('APNS_KEY_ID') ?? '';
  const apnsKeyB64 = Deno.env.get('APNS_AUTH_KEY_BASE64') ?? '';

  const admin = createClient(supabaseUrl, serviceKey);
  const route = matchRoute(method, path);

  console.log(`[passkit-webservice] ${method} ${path} → action=${route.action}`);

  try {
    // ── POST /v1/log ─────────────────────────────────────────────────────────
    if (route.action === 'log') {
      const body = await req.json().catch(() => ({}));
      console.log('[passkit-webservice] Apple PassKit log:', JSON.stringify(body));
      return new Response(null, { status: 200, headers: corsHeaders });
    }

    // ── POST /notify/:serial (internal — trigger push to all registered devices) ──
    if (route.action === 'notify') {
      // Internal calls should supply service-role key
      const internalAuth = req.headers.get('Authorization') ?? '';
      if (!internalAuth.includes(serviceKey.slice(0, 10))) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const serial = route.serial!;
      const { data: registrations } = await admin
        .from('wallet_pass_registrations')
        .select('push_token')
        .eq('serial_number', serial);

      if (!registrations || registrations.length === 0) {
        return new Response(JSON.stringify({ ok: true, pushed: 0 }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      let pushed = 0;
      for (const reg of registrations) {
        try {
          await sendApnsPush(reg.push_token, passTypeId, teamId, apnsKeyId, apnsKeyB64);
          pushed++;
        } catch (e) {
          console.error('[passkit-webservice] Push error:', e);
        }
      }

      return new Response(JSON.stringify({ ok: true, pushed }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── POST /v1/devices/:deviceId/registrations/:passTypeId/:serial ─────────
    if (route.action === 'register') {
      const { deviceId, serial } = route;
      const authHeader = req.headers.get('Authorization');

      const isValid = await verifyPassAuth(authHeader, serial!, admin);
      if (!isValid) {
        return new Response(null, { status: 401, headers: corsHeaders });
      }

      const body = await req.json().catch(() => ({})) as { pushToken?: string };
      const pushToken = body.pushToken ?? '';
      if (!pushToken) {
        return new Response(null, { status: 400, headers: corsHeaders });
      }

      const authToken = (req.headers.get('Authorization') ?? '').replace(/^ApplePass\s+/i, '').trim();

      const { error } = await admin.from('wallet_pass_registrations').upsert({
        ticket_id: serial!,
        serial_number: serial!,
        device_library_identifier: deviceId!,
        push_token: pushToken,
        pass_type_identifier: passTypeId,
        authentication_token: authToken,
      }, { onConflict: 'device_library_identifier,serial_number' });

      if (error) {
        console.error('[passkit-webservice] Registration upsert error:', error.message);
        return new Response(null, { status: 500, headers: corsHeaders });
      }

      console.log(`[passkit-webservice] Device registered: serial=${serial!.slice(0, 8)} device=…${deviceId!.slice(-8)}`);
      return new Response(null, { status: 201, headers: corsHeaders });
    }

    // ── DELETE /v1/devices/:deviceId/registrations/:passTypeId/:serial ───────
    if (route.action === 'unregister') {
      const { deviceId, serial } = route;
      const authHeader = req.headers.get('Authorization');

      const isValid = await verifyPassAuth(authHeader, serial!, admin);
      if (!isValid) {
        return new Response(null, { status: 401, headers: corsHeaders });
      }

      await admin.from('wallet_pass_registrations')
        .delete()
        .eq('serial_number', serial!)
        .eq('device_library_identifier', deviceId!);

      console.log(`[passkit-webservice] Device unregistered: serial=${serial!.slice(0, 8)}`);
      return new Response(null, { status: 200, headers: corsHeaders });
    }

    // ── GET /v1/devices/:deviceId/registrations/:passTypeId ──────────────────
    // Returns serials of passes updated since passesUpdatedSince
    if (route.action === 'list_updated') {
      const { deviceId } = route;
      const since = url.searchParams.get('passesUpdatedSince');

      const query = admin
        .from('wallet_pass_registrations')
        .select('serial_number, ticket_id')
        .eq('device_library_identifier', deviceId!);

      const { data: regs } = await query;
      if (!regs || regs.length === 0) {
        return new Response(null, { status: 204, headers: corsHeaders });
      }

      const serials = regs.map((r: any) => r.serial_number);

      // If since is provided, filter to tickets with checked_in_at after that time
      // (these are the "updated" passes — ticket became used)
      let updated = serials;
      if (since) {
        const sinceDate = new Date(parseInt(since) * 1000).toISOString();
        const { data: changedTickets } = await admin
          .from('tickets')
          .select('id')
          .in('id', serials)
          .gt('updated_at', sinceDate);
        updated = (changedTickets ?? []).map((t: any) => t.id);
      }

      if (updated.length === 0) {
        return new Response(null, { status: 204, headers: corsHeaders });
      }

      const lastUpdated = Math.floor(Date.now() / 1000).toString();
      return new Response(
        JSON.stringify({ serialNumbers: updated, lastUpdated }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── GET /v1/passes/:passTypeId/:serial ────────────────────────────────────
    // Apple fetches the latest pass bundle — regenerate on-demand
    if (route.action === 'get_pass') {
      const { serial } = route;
      const authHeader = req.headers.get('Authorization');

      const isValid = await verifyPassAuth(authHeader, serial!, admin);
      if (!isValid) {
        return new Response(null, { status: 401, headers: corsHeaders });
      }

      // Re-generate by calling generate-wallet-pass internally
      // We use the service-role JWT so the internal call bypasses user auth
      const genUrl = `${supabaseUrl}/functions/v1/generate-wallet-pass`;

      // Build a service-role bearer for internal call
      const internalResp = await fetch(genUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
          // Signal that this is a service-role internal call
          'x-internal-call': '1',
        },
        body: JSON.stringify({ ticket_id: serial, _internal: true }),
      });

      if (!internalResp.ok) {
        console.error('[passkit-webservice] Failed to regenerate pass for serial', serial);
        return new Response(null, { status: 500, headers: corsHeaders });
      }

      const passBuffer = await internalResp.arrayBuffer();
      const etag = `"${Math.floor(Date.now() / 1000)}"`;

      return new Response(passBuffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.apple.pkpass',
          'Last-Modified': new Date().toUTCString(),
          'ETag': etag,
          ...corsHeaders,
        },
      });
    }

    // ── Unknown route ─────────────────────────────────────────────────────────
    console.warn(`[passkit-webservice] Unhandled route: ${method} ${path}`);
    return new Response(null, { status: 404, headers: corsHeaders });
  } catch (err) {
    console.error('[passkit-webservice] Unhandled error:', err);
    return new Response(null, { status: 500, headers: corsHeaders });
  }
});
