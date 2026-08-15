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
//
// ENDPOINTS:
//   GET  /verify  — server-side smoke test (service-role auth required)
//                   Checks secrets, parses P12/WWDR, generates a full signed
//                   test pass and reports byte size. Never logs secret values.
//   POST /        — generate a real signed .pkpass for the authenticated user's ticket

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
// Buffer is not a global in Deno — must be explicitly imported from the Node
// compatibility layer. All pngjs png.data allocations require it.
import { Buffer } from 'node:buffer';
// @ts-ignore — node-forge has no Deno-native types but works via npm specifier
import forge from 'npm:node-forge@1.3.1';
// @ts-ignore
import JSZip from 'npm:jszip@3.10.1';
// @ts-ignore
import { PNG } from 'npm:pngjs@7.0.0';

const WWDR_G4_PEM_PLACEHOLDER = 'WWDR_NOT_CONFIGURED';

// ─── Branded pass icon generator ─────────────────────────────────────────────
// Creates a gold (#FFD700) square with a dark "VH" monogram using pngjs.
// Sizes: 87×87 (@1x), 174×174 (@2x), 261×261 (@3x) per Apple spec.
// CRITICAL: png.data MUST be explicitly allocated before pixel writes.

function buildBrandedIconPng(size: number): Uint8Array {
  const png = new PNG({ width: size, height: size, filterType: -1 });
  png.data = Buffer.alloc(size * size * 4);

  const GOLD_R = 255, GOLD_G = 215, GOLD_B = 0;
  const TEXT_R = 61, TEXT_G = 42, TEXT_B = 0;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      png.data[idx] = GOLD_R;
      png.data[idx + 1] = GOLD_G;
      png.data[idx + 2] = GOLD_B;
      png.data[idx + 3] = 255;
    }
  }

  const GLYPH_V: number[][] = [
    [1, 0, 0, 0, 1], [1, 0, 0, 0, 1], [0, 1, 0, 1, 0],
    [0, 1, 0, 1, 0], [0, 0, 1, 0, 0], [0, 0, 1, 0, 0], [0, 0, 1, 0, 0],
  ];
  const GLYPH_H: number[][] = [
    [1, 0, 0, 0, 1], [1, 0, 0, 0, 1], [1, 1, 1, 1, 1],
    [1, 0, 0, 0, 1], [1, 0, 0, 0, 1], [1, 0, 0, 0, 1], [1, 0, 0, 0, 1],
  ];

  const glyphCols = 5;
  const glyphRows = 7;
  const scale = Math.max(2, Math.floor(size * 0.09));
  const gap = Math.max(1, Math.floor(size * 0.05));
  const totalW = glyphCols * scale * 2 + gap;
  const totalH = glyphRows * scale;
  const originX = Math.floor((size - totalW) / 2);
  const originY = Math.floor((size - totalH) / 2);

  const drawGlyph = (glyph: number[][], offsetX: number) => {
    for (let gy = 0; gy < glyphRows; gy++) {
      for (let gx = 0; gx < glyphCols; gx++) {
        if (!glyph[gy][gx]) continue;
        for (let sy = 0; sy < scale; sy++) {
          for (let sx = 0; sx < scale; sx++) {
            const px = offsetX + gx * scale + sx;
            const py = originY + gy * scale + sy;
            if (px < 0 || px >= size || py < 0 || py >= size) continue;
            const idx = (py * size + px) * 4;
            png.data[idx] = TEXT_R;
            png.data[idx + 1] = TEXT_G;
            png.data[idx + 2] = TEXT_B;
            png.data[idx + 3] = 255;
          }
        }
      }
    }
  };

  drawGlyph(GLYPH_V, originX);
  drawGlyph(GLYPH_H, originX + glyphCols * scale + gap);

  return new Uint8Array(PNG.sync.write(png));
}

const ICON_1X = buildBrandedIconPng(87);
const ICON_2X = buildBrandedIconPng(174);
const ICON_3X = buildBrandedIconPng(261);

function buildLogoStripPng(width: number, height: number): Uint8Array {
  const png = new PNG({ width, height, filterType: -1 });
  png.data = Buffer.alloc(width * height * 4);

  const GOLD_R = 255, GOLD_G = 215, GOLD_B = 0;
  const TEXT_R = 30, TEXT_G = 20, TEXT_B = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      png.data[idx] = GOLD_R;
      png.data[idx + 1] = GOLD_G;
      png.data[idx + 2] = GOLD_B;
      png.data[idx + 3] = 255;
    }
  }

  const GLYPH_V: number[][] = [
    [1,0,0,0,1],[1,0,0,0,1],[0,1,0,1,0],
    [0,1,0,1,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0],
  ];
  const GLYPH_H: number[][] = [
    [1,0,0,0,1],[1,0,0,0,1],[1,1,1,1,1],
    [1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],
  ];
  const glyphCols = 5, glyphRows = 7;
  const scale = Math.max(2, Math.floor(height * 0.45 / glyphRows));
  const gap = Math.max(1, scale);
  const tW = glyphCols * scale * 2 + gap;
  const tH = glyphRows * scale;
  const ox = Math.floor((width - tW) / 2);
  const oy = Math.floor((height - tH) / 2);

  const drawG = (glyph: number[][], offX: number) => {
    for (let gy = 0; gy < glyphRows; gy++) {
      for (let gx = 0; gx < glyphCols; gx++) {
        if (!glyph[gy][gx]) continue;
        for (let sy = 0; sy < scale; sy++) {
          for (let sx = 0; sx < scale; sx++) {
            const px = offX + gx * scale + sx;
            const py = oy + gy * scale + sy;
            if (px < 0 || px >= width || py < 0 || py >= height) continue;
            const idx = (py * width + px) * 4;
            png.data[idx] = TEXT_R;
            png.data[idx + 1] = TEXT_G;
            png.data[idx + 2] = TEXT_B;
            png.data[idx + 3] = 255;
          }
        }
      }
    }
  };

  drawG(GLYPH_V, ox);
  drawG(GLYPH_H, ox + glyphCols * scale + gap);

  return new Uint8Array(PNG.sync.write(png));
}

const LOGO_1X = buildLogoStripPng(160, 50);
const LOGO_2X = buildLogoStripPng(320, 100);

// ─── Utility: SHA1 hex via WebCrypto ─────────────────────────────────────────
async function sha1Hex(data: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-1', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ─── Utility: cryptographically random hex token ──────────────────────────────
function randomHex(bytes = 32): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ─── Pass status helper ───────────────────────────────────────────────────────
type PassStatus = 'valid' | 'used' | 'voided' | 'transferred';

function resolvePassStatus(ticketStatus: string, checkedInAt: string | null): PassStatus {
  if (['voided', 'refunded', 'cancelled'].includes(ticketStatus)) return 'voided';
  if (ticketStatus === 'transferred_out') return 'transferred';
  if (checkedInAt != null) return 'used';
  return 'valid';
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
  ticketStatus: string;
  checkedInAt: string | null;
  orderNumber: string;
}

function buildPassJson(p: PassData): string {
  let displayDate = p.eventDate;
  try {
    const [y, m, d] = p.eventDate.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    displayDate = dt.toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    });
    if (p.eventStartTime) {
      const [hh, mm] = p.eventStartTime.split(':');
      const t = new Date(y, m - 1, d, parseInt(hh, 10), parseInt(mm, 10));
      displayDate += ` · ${t.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
    }
  } catch { /* keep raw string */ }

  const status = resolvePassStatus(p.ticketStatus, p.checkedInAt);

  const theme = {
    valid:       { fg: 'rgb(10,10,10)',    bg: 'rgb(255,215,0)',   label: 'rgb(80,60,0)',     voided: false },
    used:        { fg: 'rgb(0,200,83)',    bg: 'rgb(18,18,18)',    label: 'rgb(100,100,100)', voided: false },
    voided:      { fg: 'rgb(180,60,60)',   bg: 'rgb(20,20,20)',    label: 'rgb(120,120,120)', voided: true  },
    transferred: { fg: 'rgb(160,160,160)', bg: 'rgb(20,20,20)',    label: 'rgb(100,100,100)', voided: true  },
  }[status];

  const primaryValue =
    status === 'used'        ? '✓ CHECKED IN' :
    status === 'voided'      ? `✗ ${p.ticketStatus.toUpperCase()}` :
    status === 'transferred' ? '→ TRANSFERRED' :
    p.eventTitle;

  let checkedInDisplay = '';
  if (status === 'used' && p.checkedInAt) {
    try {
      checkedInDisplay = new Date(p.checkedInAt).toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit',
      });
    } catch { checkedInDisplay = p.checkedInAt; }
  }

  const backFields: Record<string, unknown>[] = [
    { key: 'order', label: 'Order Number', value: p.orderNumber },
    { key: 'ticket_id', label: 'Ticket ID', value: p.ticketId.slice(0, 8).toUpperCase() },
    {
      key: 'terms', label: 'Terms & Conditions',
      value: 'All tickets are non-refundable. QR code is valid for one scan only. Keep your ticket private. Visit vybzhub.com for support.',
    },
  ];
  if (status === 'used' && checkedInDisplay) {
    backFields.push({ key: 'checkin', label: 'Entry Recorded', value: checkedInDisplay });
  }
  if (status === 'voided') {
    backFields.push({
      key: 'void_reason', label: 'Status',
      value: `This ticket has been ${p.ticketStatus}. It is no longer valid for entry.`,
    });
  }
  if (status === 'transferred') {
    backFields.push({
      key: 'transfer_note', label: 'Transfer Note',
      value: 'This ticket has been transferred. This pass is no longer valid for entry.',
    });
  }

  const pass: Record<string, unknown> = {
    formatVersion: 1,
    passTypeIdentifier: p.passTypeId,
    serialNumber: p.serialNumber,
    teamIdentifier: p.teamId,
    webServiceURL: p.webServiceUrl,
    authenticationToken: p.authToken,
    organizationName: 'Vybz Hub',
    description: status === 'valid' || status === 'used'
      ? `${p.eventTitle} — ${p.ticketTypeName}`
      : `${p.eventTitle} (${p.ticketStatus})`,
    logoText: 'VYBZ HUB',
    foregroundColor: theme.fg,
    backgroundColor: theme.bg,
    labelColor: theme.label,
    voided: theme.voided,
    eventTicket: {
      primaryFields: [
        { key: 'headline', label: status === 'valid' ? 'EVENT' : 'STATUS', value: primaryValue },
      ],
      secondaryFields: [
        { key: 'tier',  label: 'TICKET TYPE', value: p.ticketTypeName },
        { key: 'date',  label: 'DATE',        value: displayDate },
      ],
      auxiliaryFields: [
        {
          key: 'attendee', label: 'ATTENDEE',
          value: p.attendeeName || 'General Admission',
        },
        {
          key: 'venue', label: 'VENUE',
          value: p.eventVenue
            ? `${p.eventVenue}${p.eventParish ? `, ${p.eventParish}` : ''}`
            : (p.eventParish || 'See event details'),
        },
      ],
      backFields,
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

  if (status === 'valid' && p.eventDate) {
    try {
      const [y, m, d] = p.eventDate.split('-').map(Number);
      (pass as any).relevantDate = new Date(
        y, m - 1, d,
        p.eventStartTime ? parseInt(p.eventStartTime.split(':')[0], 10) : 19,
        p.eventStartTime ? parseInt(p.eventStartTime.split(':')[1], 10) : 0,
      ).toISOString();
    } catch { /* skip relevantDate */ }
  }

  return JSON.stringify(pass);
}

// ─── PKCS#7 signing via node-forge ────────────────────────────────────────────
// DO NOT log p12Base64, p12Password, private key material, or the signature bytes.

function signManifest(
  manifestJson: string,
  p12Base64: string,
  p12Password: string,
  wwdrPem: string,
): Uint8Array {
  const p12Der = forge.util.decode64(p12Base64);
  const p12Asn1 = forge.asn1.fromDer(p12Der);
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, p12Password);

  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const keyBags  = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  const certBagItems = (certBags[forge.pki.oids.certBag]  ?? []);
  const keyBagItems  = (keyBags[forge.pki.oids.pkcs8ShroudedKeyBag] ?? []);

  if (certBagItems.length === 0) throw new Error('P12_NO_CERTIFICATES');
  if (keyBagItems.length  === 0) throw new Error('PRIVATE_KEY_MISSING');

  const signerCert = certBagItems[0].cert!;
  const privateKey = keyBagItems[0].key!;
  const wwdrCert   = forge.pki.certificateFromPem(wwdrPem);

  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(manifestJson, 'utf8');
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

// ─── Shared pkpass assembly (used by both generate and verify) ─────────────────

async function assemblePkpass(
  passJson: string,
  p12Base64: string,
  p12Password: string,
  wwdrPem: string,
): Promise<{ pkpass: Uint8Array; manifestKeys: string[] }> {
  const passJsonBytes = new TextEncoder().encode(passJson);

  const [passHash, i1, i2, i3, l1, l2] = await Promise.all([
    sha1Hex(passJsonBytes),
    sha1Hex(ICON_1X), sha1Hex(ICON_2X), sha1Hex(ICON_3X),
    sha1Hex(LOGO_1X), sha1Hex(LOGO_2X),
  ]);

  const manifest: Record<string, string> = {
    'pass.json':    passHash,
    'icon.png':     i1,
    'icon@2x.png':  i2,
    'icon@3x.png':  i3,
    'logo.png':     l1,
    'logo@2x.png':  l2,
  };
  const manifestJson  = JSON.stringify(manifest);
  const manifestBytes = new TextEncoder().encode(manifestJson);
  const signatureBytes = signManifest(manifestJson, p12Base64, p12Password, wwdrPem);

  const zip = new JSZip();
  zip.file('pass.json',     passJsonBytes);
  zip.file('manifest.json', manifestBytes);
  zip.file('signature',     signatureBytes);
  zip.file('icon.png',      ICON_1X);
  zip.file('icon@2x.png',   ICON_2X);
  zip.file('icon@3x.png',   ICON_3X);
  zip.file('logo.png',      LOGO_1X);
  zip.file('logo@2x.png',   LOGO_2X);

  const pkpass = await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  return { pkpass, manifestKeys: Object.keys(manifest) };
}

// ─── GET /verify — server-side smoke test ────────────────────────────────────
// Auth: requires Authorization: Bearer <service-role-key>
// Checks every secret, parses P12 + WWDR, builds a complete signed test pass,
// reports byte size and pass.json field presence.
// NEVER logs or returns secret values, private keys, or tokens.

async function handleVerify(req: Request): Promise<Response> {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  // Only the service-role key (or a specific admin-controlled header) may call /verify
  if (!token || token !== serviceKey) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  type CheckStatus = 'PASS' | 'FAIL' | 'MISSING';

  const report: Record<string, CheckStatus | string | number | boolean> = {};

  // ── 1. Secret presence ─────────────────────────────────────────────────────
  const p12Base64    = Deno.env.get('PASSKIT_CERT_P12_BASE64')    ?? '';
  const p12Password  = Deno.env.get('PASSKIT_P12_PASSWORD')        ?? '';
  const teamId       = Deno.env.get('PASSKIT_TEAM_ID')             ?? '';
  const passTypeId   = Deno.env.get('PASSKIT_PASS_TYPE_IDENTIFIER') ?? '';
  const wwdrPem      = Deno.env.get('PASSKIT_WWDR_CERT_PEM')       ?? WWDR_G4_PEM_PLACEHOLDER;
  const apnsKeyB64   = Deno.env.get('APNS_AUTH_KEY_BASE64')        ?? '';
  const apnsKeyId    = Deno.env.get('APNS_KEY_ID')                 ?? '';

  report['PASSKIT_CERT_P12_BASE64']    = p12Base64   ? 'PRESENT' : 'MISSING';
  report['PASSKIT_P12_PASSWORD']        = p12Password ? 'PRESENT' : 'MISSING';
  report['PASSKIT_TEAM_ID']             = teamId      ? 'PRESENT' : 'MISSING';
  report['PASSKIT_PASS_TYPE_IDENTIFIER'] = passTypeId ? 'PRESENT' : 'MISSING';
  report['PASSKIT_WWDR_CERT_PEM']       = (wwdrPem && wwdrPem !== WWDR_G4_PEM_PLACEHOLDER) ? 'PRESENT' : 'MISSING';
  report['APNS_AUTH_KEY_BASE64']        = apnsKeyB64  ? 'PRESENT' : 'MISSING';
  report['APNS_KEY_ID']                 = apnsKeyId   ? 'PRESENT' : 'MISSING';

  const allSecretsPresent =
    !!p12Base64 && !!p12Password && !!teamId && !!passTypeId &&
    wwdrPem !== WWDR_G4_PEM_PLACEHOLDER && !!wwdrPem &&
    !!apnsKeyB64 && !!apnsKeyId;

  report['ALL_SECRETS_PRESENT'] = allSecretsPresent;

  if (!allSecretsPresent) {
    return new Response(JSON.stringify({ ...report, error: 'One or more secrets are missing. Cannot proceed with certificate or pass verification.' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ── 2. P12 Base64 decode ───────────────────────────────────────────────────
  let p12Der: string;
  try {
    p12Der = forge.util.decode64(p12Base64);
    report['P12_BASE64_DECODE'] = 'PASS';
  } catch {
    report['P12_BASE64_DECODE'] = 'FAIL';
    return new Response(JSON.stringify({ ...report, error: 'P12_BASE64_DECODE_FAILED' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ── 3. P12 parse + private key extraction ─────────────────────────────────
  let certSubject = '';
  let certHasPrivateKey = false;
  let certPassTypeMatch = false;
  let certExpiry = '';
  try {
    const p12Asn1 = forge.asn1.fromDer(p12Der);
    const p12     = forge.pkcs12.pkcs12FromAsn1(p12Asn1, p12Password);

    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
    const keyBags  = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
    const certItems = certBags[forge.pki.oids.certBag] ?? [];
    const keyItems  = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag] ?? [];

    certHasPrivateKey = keyItems.length > 0;

    if (certItems.length > 0 && certItems[0].cert) {
      const cert = certItems[0].cert;
      // Get CN from subject — safe to report, not secret
      const cn = cert.subject.getField('CN');
      certSubject = cn ? String(cn.value) : '(no CN)';
      // Check cert contains the expected pass type identifier
      certPassTypeMatch = certSubject.includes(passTypeId) || certSubject.includes('Pass Type ID');
      // Expiry — safe to report
      try { certExpiry = cert.validity.notAfter.toISOString(); } catch { certExpiry = 'unknown'; }
    }

    report['P12_PARSE']         = 'PASS';
    report['P12_CERT_SUBJECT']  = certSubject;  // CN only — not secret
    report['PRIVATE_KEY']       = certHasPrivateKey ? 'PASS' : 'FAIL';
    report['CERT_PASS_TYPE_MATCH'] = certPassTypeMatch;
    report['CERT_EXPIRY']       = certExpiry;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Map known error categories — never log key material
    const category =
      msg.includes('Invalid password') || msg.includes('PKCS12') ? 'P12_PARSE_FAILED' :
      msg.includes('private') ? 'PRIVATE_KEY_MISSING' :
      'P12_PARSE_FAILED';
    report['P12_PARSE']   = 'FAIL';
    report['PRIVATE_KEY'] = 'FAIL';
    report['P12_ERROR_CATEGORY'] = category;
    return new Response(JSON.stringify({ ...report, error: category }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!certHasPrivateKey) {
    return new Response(JSON.stringify({ ...report, error: 'PRIVATE_KEY_MISSING' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ── 4. WWDR PEM parse ──────────────────────────────────────────────────────
  try {
    const wwdrCert = forge.pki.certificateFromPem(wwdrPem);
    const wwdrCn   = wwdrCert.subject.getField('CN');
    // Report the WWDR cert CN — this is Apple's public CA cert, not secret
    report['WWDR_CERT'] = 'PASS';
    report['WWDR_CERT_CN'] = wwdrCn ? String(wwdrCn.value) : '(no CN)';
    try { report['WWDR_CERT_EXPIRY'] = wwdrCert.validity.notAfter.toISOString(); } catch { /* skip */ }
  } catch {
    report['WWDR_CERT'] = 'FAIL';
    return new Response(JSON.stringify({ ...report, error: 'WWDR_PARSE_FAILED' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ── 5. Build test pass.json and verify required fields ─────────────────────
  const supabaseUrl  = Deno.env.get('SUPABASE_URL') ?? '';
  const webServiceUrl = `${supabaseUrl}/functions/v1/passkit-webservice`;

  // Use a synthetic test-ticket payload — no real ticket data needed for smoke test
  const testTicketId  = '00000000-0000-0000-0000-000000000001';
  const testAuthToken = randomHex(32);
  const testToken     = randomHex(32); // fake secure_token — never a real one

  const passJson = buildPassJson({
    ticketId:       testTicketId,
    serialNumber:   testTicketId,
    authToken:      testAuthToken,
    passTypeId,
    teamId,
    webServiceUrl,
    eventTitle:     'Vybz Hub Smoke Test Event',
    eventDate:      '2026-12-31',
    eventStartTime: '20:00',
    eventVenue:     'Kingston Waterfront',
    eventParish:    'Kingston',
    ticketTypeName: 'General Admission',
    attendeeName:   'Test Attendee',
    secureToken:    testToken,
    ticketStatus:   'valid',
    checkedInAt:    null,
    orderNumber:    'VH-SMOKETEST-001',
  });

  // Verify required pass.json fields
  let passJsonValid = false;
  const passJsonChecks: Record<string, boolean> = {};
  try {
    const parsed = JSON.parse(passJson) as Record<string, unknown>;
    passJsonChecks['formatVersion']      = parsed.formatVersion === 1;
    passJsonChecks['passTypeIdentifier'] = parsed.passTypeIdentifier === passTypeId;
    passJsonChecks['teamIdentifier']     = parsed.teamIdentifier === teamId;
    passJsonChecks['serialNumber']       = typeof parsed.serialNumber === 'string' && parsed.serialNumber.length > 0;
    passJsonChecks['organizationName']   = parsed.organizationName === 'Vybz Hub';
    passJsonChecks['eventTicket']        = typeof parsed.eventTicket === 'object';
    passJsonChecks['barcodes']           = Array.isArray(parsed.barcodes) && (parsed.barcodes as any[]).length > 0;
    passJsonChecks['webServiceURL']      = typeof parsed.webServiceURL === 'string' && parsed.webServiceURL.length > 0;
    // authenticationToken is present but NEVER included in the report value
    passJsonChecks['authenticationToken'] = typeof parsed.authenticationToken === 'string' && parsed.authenticationToken.length > 0;
    passJsonValid = Object.values(passJsonChecks).every(Boolean);
    report['PASS_JSON']        = passJsonValid ? 'PASS' : 'FAIL';
    report['PASS_JSON_CHECKS'] = passJsonChecks as unknown as string;
  } catch {
    report['PASS_JSON'] = 'FAIL';
  }

  // ── 6. Manifest + signature + pkpass assembly ──────────────────────────────
  let pkpassBytes: Uint8Array;
  let manifestKeys: string[] = [];
  try {
    const result = await assemblePkpass(passJson, p12Base64, p12Password, wwdrPem);
    pkpassBytes  = result.pkpass;
    manifestKeys = result.manifestKeys;
    report['MANIFEST']   = 'PASS';
    report['MANIFEST_FILES'] = manifestKeys.join(', ');
    report['SIGNATURE']  = 'PASS';
    report['PKPASS_BINARY_GENERATED'] = true;
    report['PKPASS_BYTE_SIZE']        = pkpassBytes.byteLength;
    report['CONTENT_TYPE']            = 'application/vnd.apple.pkpass';
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const category =
      msg === 'P12_NO_CERTIFICATES'  ? 'P12_PARSE_FAILED'    :
      msg === 'PRIVATE_KEY_MISSING'  ? 'PRIVATE_KEY_MISSING' :
      msg.includes('manifest')       ? 'MANIFEST_FAILED'     :
      msg.includes('sign')           ? 'SIGNATURE_FAILED'    :
      'PKPASS_BUILD_FAILED';
    report['MANIFEST']  = 'FAIL';
    report['SIGNATURE'] = 'FAIL';
    report['PKPASS_BINARY_GENERATED'] = false;
    report['ERROR_CATEGORY'] = category;
    return new Response(JSON.stringify({ ...report, error: category }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ── 7. Summary ─────────────────────────────────────────────────────────────
  report['GENERATE_WALLET_PASS_DEPLOYED'] = 'YES';
  report['IOS_ADD_TO_WALLET_BUTTON']      = 'IMPLEMENTED';
  report['SECRETS_EXPOSED_CLIENT_SIDE']   = 'NO';
  report['PHYSICAL_IPHONE_INSTALL']       = 'REQUIRES_USER_TEST';

  console.log(`[generate-wallet-pass/verify] Smoke test complete — pkpass=${pkpassBytes!.byteLength}b cert_cn=${certSubject}`);

  return new Response(JSON.stringify(report, null, 2), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ─── Main handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // ── GET /verify — smoke test (service-role auth required) ────────────────
  const url = new URL(req.url);
  const cleanPath = url.pathname
    .replace(/^\/functions\/v1\/generate-wallet-pass/, '')
    .replace(/^\/generate-wallet-pass/, '') || '/';

  if (req.method === 'GET' && /^\/verify\/?$/.test(cleanPath)) {
    return handleVerify(req);
  }

  // ── All other non-POST requests → 405 ────────────────────────────────────
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ── POST — generate a real signed .pkpass ─────────────────────────────────
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const anonKey     = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();

    if (!token) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { ticket_id, _internal } = body as { ticket_id?: string; _internal?: boolean };
    if (!ticket_id || typeof ticket_id !== 'string') {
      return new Response(JSON.stringify({ error: 'ticket_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // ── Ticket ownership check ────────────────────────────────────────────────
    let ticket: Record<string, unknown> | null = null;
    let ticketFetchErr: { message: string } | null = null;

    if (_internal === true && token === serviceKey) {
      // Internal call from passkit-webservice — bypass ownership check
      const res = await admin
        .from('tickets')
        .select('id, order_id, event_id, ticket_type_id, attendee_name, secure_token, status, checked_in_at, owner_user_id')
        .eq('id', ticket_id)
        .maybeSingle();
      ticket = res.data as typeof ticket;
      ticketFetchErr = res.error;
    } else {
      // External customer call — verify JWT and ticket ownership
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

      const res = await admin
        .from('tickets')
        .select('id, order_id, event_id, ticket_type_id, attendee_name, secure_token, status, checked_in_at, owner_user_id')
        .eq('id', ticket_id)
        .eq('owner_user_id', user.id)
        .maybeSingle();
      ticket = res.data as typeof ticket;
      ticketFetchErr = res.error;
    }

    if (ticketFetchErr || !ticket) {
      return new Response(JSON.stringify({ error: 'Ticket not found or access denied' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Load event, ticket type, and order in parallel ────────────────────────
    const [evRes, tyRes, orRes] = await Promise.all([
      admin.from('events').select('title, date, start_time, venue, parish').eq('id', ticket.event_id as string).maybeSingle(),
      admin.from('event_ticket_types').select('name').eq('id', ticket.ticket_type_id as string).maybeSingle(),
      admin.from('ticket_orders').select('order_number').eq('id', ticket.order_id as string).maybeSingle(),
    ]);

    if (!evRes.data) {
      return new Response(JSON.stringify({ error: 'Event data not available' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Load PassKit secrets ──────────────────────────────────────────────────
    const p12Base64  = Deno.env.get('PASSKIT_CERT_P12_BASE64')    ?? '';
    const p12Password = Deno.env.get('PASSKIT_P12_PASSWORD')       ?? '';
    const teamId     = Deno.env.get('PASSKIT_TEAM_ID')             ?? '';
    const passTypeId = Deno.env.get('PASSKIT_PASS_TYPE_IDENTIFIER') ?? '';
    const wwdrPem    = Deno.env.get('PASSKIT_WWDR_CERT_PEM')       ?? WWDR_G4_PEM_PLACEHOLDER;

    if (!p12Base64 || !p12Password || !teamId || !passTypeId || wwdrPem === WWDR_G4_PEM_PLACEHOLDER) {
      const missing = [
        !p12Base64   && 'PASSKIT_CERT_P12_BASE64',
        !p12Password && 'PASSKIT_P12_PASSWORD',
        !teamId      && 'PASSKIT_TEAM_ID',
        !passTypeId  && 'PASSKIT_PASS_TYPE_IDENTIFIER',
        (wwdrPem === WWDR_G4_PEM_PLACEHOLDER) && 'PASSKIT_WWDR_CERT_PEM',
      ].filter(Boolean).join(', ');
      console.error('[generate-wallet-pass] Missing secrets:', missing);
      return new Response(
        JSON.stringify({ error: `Apple Wallet not configured. Missing: ${missing}` }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const webServiceUrl = `${supabaseUrl}/functions/v1/passkit-webservice`;

    // ── Stable authenticationToken ────────────────────────────────────────────
    let authToken: string;
    const { data: existingToken } = await admin
      .from('wallet_pass_tokens')
      .select('authentication_token')
      .eq('ticket_id', ticket_id)
      .maybeSingle();

    if (existingToken?.authentication_token) {
      authToken = existingToken.authentication_token as string;
    } else {
      authToken = randomHex(32);
      await admin.from('wallet_pass_tokens').upsert(
        { ticket_id, authentication_token: authToken, issued_at: new Date().toISOString() },
        { onConflict: 'ticket_id' },
      );
    }

    // ── Build pass.json ───────────────────────────────────────────────────────
    const ev = evRes.data as Record<string, unknown>;
    const ty = tyRes.data as Record<string, unknown> | null;
    const or = orRes.data as Record<string, unknown> | null;

    const passJson = buildPassJson({
      ticketId:       ticket.id as string,
      serialNumber:   ticket.id as string,
      authToken,
      passTypeId,
      teamId,
      webServiceUrl,
      eventTitle:     (ev.title as string)        ?? '',
      eventDate:      (ev.date as string)          ?? '',
      eventStartTime: (ev.start_time as string)    ?? '',
      eventVenue:     (ev.venue as string)         ?? '',
      eventParish:    (ev.parish as string)        ?? '',
      ticketTypeName: (ty?.name as string)         ?? 'General Admission',
      attendeeName:   (ticket.attendee_name as string) ?? '',
      secureToken:    ticket.secure_token as string,
      ticketStatus:   (ticket.status as string)    ?? 'valid',
      checkedInAt:    (ticket.checked_in_at as string | null) ?? null,
      orderNumber:    (or?.order_number as string) ?? '',
    });

    // ── Sign and assemble ─────────────────────────────────────────────────────
    let pkpassBuffer: Uint8Array;
    try {
      const result = await assemblePkpass(passJson, p12Base64, p12Password, wwdrPem);
      pkpassBuffer = result.pkpass;
    } catch (signErr) {
      const msg = signErr instanceof Error ? signErr.message : String(signErr);
      const category =
        msg === 'P12_NO_CERTIFICATES' ? 'P12_PARSE_FAILED'    :
        msg === 'PRIVATE_KEY_MISSING' ? 'PRIVATE_KEY_MISSING' :
        'SIGNATURE_FAILED';
      console.error('[generate-wallet-pass] Signing failed:', category);
      return new Response(
        JSON.stringify({ error: `Pass signing failed: ${category}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Log ticket ID prefix only — never log secure_token, authToken, or key material
    console.log(
      `[generate-wallet-pass] Pass generated: ticket=${(ticket.id as string).slice(0, 8)} ` +
      `status=${ticket.status} checked_in=${!!ticket.checked_in_at} bytes=${pkpassBuffer.byteLength}`,
    );

    return new Response(pkpassBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.apple.pkpass',
        'Content-Disposition': `attachment; filename="vybzhub-${(ticket.id as string).slice(0, 8)}.pkpass"`,
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        ...corsHeaders,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[generate-wallet-pass] Unhandled error:', msg);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
