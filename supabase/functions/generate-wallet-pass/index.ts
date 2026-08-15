// supabase/functions/generate-wallet-pass/index.ts
// Generates a signed Apple Wallet .pkpass bundle for a customer ticket.
//
// Security model:
//   - Caller must supply a valid JWT (Authorization: Bearer <token>)
//   - The ticket must be owned by the authenticated user (owner_user_id = auth.uid())
//   - secure_token is embedded in the QR barcode field only — never logged
//   - All signing is performed server-side; no secrets reach the client
//
// Pass update flow:
//   - An authenticationToken is stored in wallet_pass_tokens on first generation
//     (upsert — re-generation re-uses the same token so existing devices stay linked)
//   - webServiceURL points to the passkit-webservice Edge Function
//   - Apple devices register via POST /v1/devices/…/registrations/…
//   - When checked_in_at changes, passkit-webservice sends an APNs push so
//     device fetches the updated pass (TICKET USED state)

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
// @ts-ignore — node-forge has no Deno-native types but works via npm specifier
import forge from 'npm:node-forge@1.3.1';
// @ts-ignore
import JSZip from 'npm:jszip@3.10.1';

// ─── WWDR G4 Intermediate Certificate (publicly available) ───────────────────
// Apple Worldwide Developer Relations Certification Authority — G4
// Expires: 2030-10-30. Download: https://www.apple.com/certificateauthority/
const WWDR_PEM = `-----BEGIN CERTIFICATE-----
MIIEUTCCAzmgAwIBAgIQfK9pCiW3Of57m0R6wXjF6DANBgkqhkiG9w0BAQsFADCB
lzELMAkGA1UEBhMCVVMxEzARBgNVBAoMCkFwcGxlIEluYy4xLTArBgNVBAsMJEFw
cGxlIFdvcmxkd2lkZSBEZXZlbG9wZXIgUmVsYXRpb25zMUQwQgYDVQQDDDtBcHBs
ZSBXb3JsZHdpZGUgRGV2ZWxvcGVyIFJlbGF0aW9ucyBDZXJ0aWZpY2F0aW9uIEF1
dGhvcml0eTAeFw0yMjAzMTcyMzIxMTJaFw0zMDAzMTMyMzIxMTFaMGYxCzAJBgNV
BAYTAlVTMRMwEQYDVQQKDApBcHBsZSBJbmMuMS0wKwYDVQQLDCRBcHBsZSBXb3Js
ZHdpZGUgRGV2ZWxvcGVyIFJlbGF0aW9uczETMBEGA1UEAwwKQXBwbGUgV1dEUjCC
ASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBAMovHlrT6w3AH6AKV1J4DWAO
3V1LCkCAp1lKfNFl1XjFx3gBqf6EizFmVYdQzEP0U3bXH2k1Vj0l3JZl8tP0Y2P
GqM8qWrTkfJT3KS8kX8j9XflUMQ/L3qbqb3M1Q3XEQP0Z4MKNuqfJq8r/BPLIF
WFBF1B9Y8e7Gxr8E/GqP9Ld7QVGZ5Md8k3W1kDnNQVMHHQqVuMKqYFRoWXH3PN
7/O3D6/hNWM7QoEpZ6+c0KOX7R5Nk5F7JzmW6tWv9YVJfz4PJsZk3XGPv3f5/d5
+R3FZo8M9fLR+qHp8VqA/cO3V/X2U7Cxf9KnQ0o7cQUCAwEAAaOByTCBxjAPBgNV
HRMBAf8EBTADAQH/MB8GA1UdIwQYMBaAFIgnFwmpthhgi+zruvZh+9YNfxwOMEYG
A1UdIAQ/MD0wOwYJKoZIhvdjZAUBMC4wLAYIKwYBBQUHAgEWIGh0dHBzOi8vd3d3
LmFwcGxlLmNvbS9hcHBsZWNhLzA7BgNVHR8ENDAyMDCgLqAshipodHRwczovL2Ny
bC5hcHBsZS5jb20vd3dkcmcxL2NybC5jcmwwHQYDVR0OBBYEFBHbSaXhTHPOoIIG
+kQ0XLwcUi4NMA4GA1UdDwEB/wQEAwIBBjANBgkqhkiG9w0BAQsFAAOCAQEAaO+W
4pVfnPB9dGqrL7yVP4r9bP9K2EQYtTKLanKKBJVLw+jjRfJLKi+JLKZ+5H7kqvU
E7H0vFBhBdFJ/WkSr5Wk/9XGPeE1OzXpV1E7yYlxGbR5QfPrFqFJH1M0w3cPlH7
cE3E1OvFHkpd+5f1vKf5iJCR2cFhaBqzWYCnJJLNGJQ9XSFmD3EFfqCsWg==
-----END CERTIFICATE-----`;

// ─── Minimal 1×1 transparent PNG (placeholder icon) ──────────────────────────
// Replace with real 87×87, 58×58 branded PNGs for production.
const ICON_1X_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const ICON_2X_B64 = ICON_1X_B64; // same placeholder for retina
const ICON_3X_B64 = ICON_1X_B64;

// ─── Utility: SHA1 hex via WebCrypto ─────────────────────────────────────────
async function sha1Hex(data: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-1', data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ─── Utility: random hex token ────────────────────────────────────────────────
function randomHex(bytes = 32): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ─── Pass JSON builder ────────────────────────────────────────────────────────
interface PassData {
  ticketId: string;
  serialNumber: string;
  authToken: string;
  passTypeId: string;
  teamId: string;
  webServiceUrl: string;
  eventTitle: string;
  eventDate: string;
  eventStartTime: string;
  eventVenue: string;
  eventParish: string;
  ticketTypeName: string;
  attendeeName: string;
  secureToken: string;
  checkedInAt: string | null;
  orderNumber: string;
}

function buildPassJson(p: PassData): string {
  // Format event date for display
  let displayDate = p.eventDate;
  try {
    const [y, m, d] = p.eventDate.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    displayDate = dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    if (p.eventStartTime) {
      const [hh, mm] = p.eventStartTime.split(':');
      const t = new Date(y, m - 1, d, parseInt(hh), parseInt(mm));
      displayDate += ` · ${t.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
    }
  } catch { /* keep raw */ }

  const isUsed = p.checkedInAt != null;

  const pass: Record<string, unknown> = {
    formatVersion: 1,
    passTypeIdentifier: p.passTypeId,
    serialNumber: p.serialNumber,
    teamIdentifier: p.teamId,
    webServiceURL: p.webServiceUrl,
    authenticationToken: p.authToken,
    organizationName: 'Vybz Hub',
    description: `${p.eventTitle} — ${p.ticketTypeName}`,
    logoText: 'Vybz Hub',
    // Gold on dark — matches app brand
    foregroundColor: isUsed ? 'rgb(0,200,83)' : 'rgb(10,10,10)',
    backgroundColor: isUsed ? 'rgb(30,30,30)' : 'rgb(255,215,0)',
    labelColor: isUsed ? 'rgb(120,120,120)' : 'rgb(80,60,0)',
    voided: isUsed,
    eventTicket: {
      primaryFields: [
        {
          key: 'event',
          label: 'EVENT',
          value: p.eventTitle,
        },
      ],
      secondaryFields: [
        {
          key: 'tier',
          label: 'TICKET TYPE',
          value: p.ticketTypeName,
        },
        {
          key: 'date',
          label: 'DATE',
          value: displayDate,
        },
      ],
      auxiliaryFields: [
        {
          key: 'attendee',
          label: 'ATTENDEE',
          value: p.attendeeName || 'General Admission',
        },
        {
          key: 'venue',
          label: 'VENUE',
          value: `${p.eventVenue}${p.eventParish ? `, ${p.eventParish}` : ''}`,
        },
      ],
      backFields: [
        {
          key: 'order',
          label: 'Order Number',
          value: p.orderNumber,
        },
        {
          key: 'ticket_id',
          label: 'Ticket ID',
          value: p.ticketId.slice(0, 8).toUpperCase(),
        },
        {
          key: 'terms',
          label: 'Terms & Conditions',
          value: 'All tickets are non-refundable. QR code is valid for one scan only. Keep your ticket private.',
        },
        ...(isUsed && p.checkedInAt ? [{
          key: 'checkin',
          label: 'Checked In',
          value: (() => {
            try {
              return new Date(p.checkedInAt!).toLocaleString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric',
                hour: 'numeric', minute: '2-digit',
              });
            } catch { return p.checkedInAt!; }
          })(),
        }] : []),
      ],
    },
    barcodes: [
      {
        message: p.secureToken,
        format: 'PKBarcodeFormatQR',
        messageEncoding: 'iso-8859-1',
        altText: p.ticketId.slice(0, 8).toUpperCase(),
      },
    ],
  };

  return JSON.stringify(pass);
}

// ─── PKCS#7 signing via node-forge ────────────────────────────────────────────
function signManifest(
  manifestJson: string,
  p12Base64: string,
  p12Password: string,
): Uint8Array {
  // Decode P12
  const p12Der = forge.util.decode64(p12Base64);
  const p12Asn1 = forge.asn1.fromDer(p12Der);
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, p12Password);

  // Extract private key and certificate chain
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });

  const certBagItems = certBags[forge.pki.oids.certBag] ?? [];
  const keyBagItems = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag] ?? [];

  if (certBagItems.length === 0) throw new Error('No certificates found in P12');
  if (keyBagItems.length === 0) throw new Error('No private key found in P12');

  const signerCert = certBagItems[0].cert!;
  const privateKey = keyBagItems[0].key!;

  // Parse WWDR certificate
  const wwdrCert = forge.pki.certificateFromPem(WWDR_PEM);

  // Create PKCS#7 signed data (detached)
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(manifestJson);
  p7.addCertificate(wwdrCert);
  p7.addCertificate(signerCert);
  p7.addSigner({
    key: privateKey,
    certificate: signerCert,
    digestAlgorithm: forge.pki.oids.sha1,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date() },
    ],
  });
  p7.sign({ detached: true });

  const derStr = forge.asn1.toDer(p7.toAsn1()).getBytes();
  const bytes = new Uint8Array(derStr.length);
  for (let i = 0; i < derStr.length; i++) bytes[i] = derStr.charCodeAt(i);
  return bytes;
}

// ─── Handler ──────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace('Bearer ', '');

    if (!token) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { ticket_id, _internal } = body;
    if (!ticket_id) {
      return new Response(JSON.stringify({ error: 'ticket_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Service client for cross-table reads
    const admin = createClient(supabaseUrl, serviceKey);

    // Internal calls (from passkit-webservice GET /v1/passes/…) use service-role key
    // and skip user-ownership check — authenticationToken was already verified by caller.
    let ticket: Record<string, unknown> | null = null;
    let ticketErr: Error | null = null;

    if (_internal && token === serviceKey) {
      const res = await admin
        .from('tickets')
        .select('id, order_id, event_id, ticket_type_id, attendee_name, secure_token, status, checked_in_at, owner_user_id')
        .eq('id', ticket_id)
        .maybeSingle();
      ticket = res.data as typeof ticket;
      ticketErr = res.error as Error | null;
    } else {
      // Verify caller identity via JWT
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const { data: { user }, error: userErr } = await userClient.auth.getUser();
      if (userErr || !user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      // Validate ticket ownership
      const res = await admin
        .from('tickets')
        .select('id, order_id, event_id, ticket_type_id, attendee_name, secure_token, status, checked_in_at, owner_user_id')
        .eq('id', ticket_id)
        .eq('owner_user_id', user.id)
        .maybeSingle();
      ticket = res.data as typeof ticket;
      ticketErr = res.error as Error | null;
    }

    if (ticketErr || !ticket) {
      return new Response(JSON.stringify({ error: 'Ticket not found or access denied' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch event and ticket type in parallel
    const [evRes, tyRes, orRes] = await Promise.all([
      admin.from('events').select('title, date, start_time, venue, parish').eq('id', ticket.event_id).maybeSingle(),
      admin.from('event_ticket_types').select('name').eq('id', ticket.ticket_type_id).maybeSingle(),
      admin.from('ticket_orders').select('order_number').eq('id', ticket.order_id).maybeSingle(),
    ]);

    const event = evRes.data;
    const ticketType = tyRes.data;
    const order = orRes.data;

    if (!event) {
      return new Response(JSON.stringify({ error: 'Event data not available' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Load secrets
    const p12Base64 = Deno.env.get('PASSKIT_CERT_P12_BASE64') ?? '';
    const p12Password = Deno.env.get('PASSKIT_P12_PASSWORD') ?? '';
    const teamId = Deno.env.get('PASSKIT_TEAM_ID') ?? '';
    const passTypeId = Deno.env.get('PASSKIT_PASS_TYPE_IDENTIFIER') ?? '';

    if (!p12Base64 || !teamId || !passTypeId) {
      console.error('[generate-wallet-pass] Missing required PassKit secrets');
      return new Response(JSON.stringify({ error: 'Apple Wallet is not configured for this environment' }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const webServiceUrl = `${supabaseUrl}/functions/v1/passkit-webservice`;

    // Upsert authentication token (stable across re-generations)
    let authToken: string;
    const { data: existingToken } = await admin
      .from('wallet_pass_tokens')
      .select('authentication_token')
      .eq('ticket_id', ticket_id)
      .maybeSingle();

    if (existingToken?.authentication_token) {
      authToken = existingToken.authentication_token;
    } else {
      authToken = randomHex(32);
      await admin.from('wallet_pass_tokens').upsert({
        ticket_id: ticket_id,
        authentication_token: authToken,
        issued_at: new Date().toISOString(),
      });
    }

    // Build pass.json
    const passJson = buildPassJson({
      ticketId: ticket.id,
      serialNumber: ticket.id,
      authToken,
      passTypeId,
      teamId,
      webServiceUrl,
      eventTitle: event.title ?? '',
      eventDate: event.date ?? '',
      eventStartTime: event.start_time ?? '',
      eventVenue: event.venue ?? '',
      eventParish: event.parish ?? '',
      ticketTypeName: ticketType?.name ?? 'General Admission',
      attendeeName: ticket.attendee_name ?? '',
      secureToken: ticket.secure_token,
      checkedInAt: ticket.checked_in_at,
      orderNumber: order?.order_number ?? '',
    });

    // Build file set for .pkpass
    const passJsonBytes = new TextEncoder().encode(passJson);
    const icon1x = Uint8Array.from(atob(ICON_1X_B64), (c) => c.charCodeAt(0));
    const icon2x = Uint8Array.from(atob(ICON_2X_B64), (c) => c.charCodeAt(0));
    const icon3x = Uint8Array.from(atob(ICON_3X_B64), (c) => c.charCodeAt(0));

    // Build manifest (SHA-1 of each file)
    const manifest: Record<string, string> = {
      'pass.json': await sha1Hex(passJsonBytes),
      'icon.png': await sha1Hex(icon1x),
      'icon@2x.png': await sha1Hex(icon2x),
      'icon@3x.png': await sha1Hex(icon3x),
    };
    const manifestJson = JSON.stringify(manifest);
    const manifestBytes = new TextEncoder().encode(manifestJson);

    // Sign manifest
    let signatureBytes: Uint8Array;
    try {
      signatureBytes = signManifest(manifestJson, p12Base64, p12Password);
    } catch (signErr) {
      console.error('[generate-wallet-pass] Signing failed:', signErr);
      return new Response(JSON.stringify({ error: 'Pass signing failed. Check certificate configuration.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Assemble .pkpass ZIP
    const zip = new JSZip();
    zip.file('pass.json', passJsonBytes);
    zip.file('manifest.json', manifestBytes);
    zip.file('signature', signatureBytes);
    zip.file('icon.png', icon1x);
    zip.file('icon@2x.png', icon2x);
    zip.file('icon@3x.png', icon3x);

    const pkpassBuffer = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });

    console.log(`[generate-wallet-pass] Generated pass for ticket ${ticket_id.slice(0, 8)}`);

    return new Response(pkpassBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.apple.pkpass',
        'Content-Disposition': `attachment; filename="vybzhub-ticket.pkpass"`,
        'Cache-Control': 'no-store',
        ...corsHeaders,
      },
    });
  } catch (err) {
    console.error('[generate-wallet-pass] Unhandled error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
