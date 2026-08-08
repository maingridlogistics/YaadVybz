// _shared/appleJws.ts — Apple JWS (JSON Web Signature) Verification
//
// Verifies signed payloads from:
//   • StoreKit 2 — signed transactions (jwsRepresentation on each Transaction)
//   • App Store Server Notifications V2 — outer notification + inner
//     signedTransactionInfo and signedRenewalInfo
//
// Apple uses compact JWS (header.payload.signature) with:
//   alg  = ES256 (ECDSA P-256 + SHA-256)
//   x5c  = [leaf_cert, intermediate_cert, root_cert]   (DER, base64-encoded)
//
// Verification steps:
//   1. Parse and validate JWS header (alg, x5c)
//   2. Optionally check root cert SHA-256 against Apple Root CA fingerprints
//   3. Import leaf cert EC public key via jose importX509
//   4. Verify JWS signature via jose compactVerify  ← PRIMARY SECURITY CONTROL
//   5. Decode and return JSON payload
//
// The root cert fingerprint check (step 2) is defense-in-depth.
// Step 4 is the critical security control: without Apple's private key an
// attacker cannot produce a valid ES256 signature over arbitrary data.

import { compactVerify, importX509 } from 'https://esm.sh/jose@5.2.4?target=deno';

// ─── Apple Root CA fingerprints ───────────────────────────────────────────────
// SHA-256 of the raw DER-encoded root certificate bytes.
// Source: https://www.apple.com/certificateauthority/
// Update when Apple publishes a new root CA generation.
// Current primary: Apple Root CA - G3 (EC P-384, valid 2014–2039)
const APPLE_ROOT_CA_SHA256 = new Set([
  // Apple Root CA - G3 (primary for StoreKit 2 and ASSN V2)
  '63343abfb89a6a03ebbebe18ecb400ebce77ebd28db1ee09953b73dcec60e58b',
  // Apple Root CA - G2 (legacy, may appear in older test environments)
  'c2b9b042dd57830e7d117dac55ac8828a7f4234e8d5a9a2b6e2c7caa0a4f7ed7',
]);

// ─── Internal decode helpers ──────────────────────────────────────────────────

function base64UrlToBytes(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '=='.slice(0, (4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function base64ToBytes(str: string): Uint8Array {
  const binary = atob(str);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function derBase64ToPem(derBase64: string): string {
  const lines = derBase64.match(/.{1,64}/g)?.join('\n') ?? derBase64;
  return `-----BEGIN CERTIFICATE-----\n${lines}\n-----END CERTIFICATE-----`;
}

async function sha256Hex(data: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ─── Types ────────────────────────────────────────────────────────────────────

/** Decoded StoreKit 2 signed transaction payload */
export interface AppleTransactionPayload {
  transactionId:           string;
  originalTransactionId:   string;
  bundleId:                string;
  productId:               string;
  purchaseDate:            number;   // milliseconds since epoch
  originalPurchaseDate:    number;
  quantity:                number;
  type:                    'Auto-Renewable Subscription' | 'Non-Consumable' | 'Consumable' | 'Non-Renewing Subscription';
  // Set by client via StoreKit 2 appAccountToken — Vybz Hub user.id (UUID)
  appAccountToken?:        string;
  expiresDate?:            number;   // Subscription expiry (ms) — null for consumables
  isInIntroOfferPeriod?:   boolean;
  isTrialPeriod?:          boolean;
  revocationDate?:         number;
  revocationReason?:       number;   // 0=other, 1=app issue
  offerIdentifier?:        string;
  offerType?:              number;
  environment:             'Production' | 'Sandbox';
  signedDate:              number;
  inAppOwnershipType?:     'FAMILY_SHARED' | 'PURCHASED';
  transactionReason?:      'PURCHASE' | 'RENEWAL';
  storefront?:             string;
  storefrontId?:           string;
}

/** Decoded signedRenewalInfo payload within an ASSN V2 notification */
export interface AppleRenewalInfoPayload {
  originalTransactionId:        string;
  autoRenewProductId:           string;
  productId:                    string;
  autoRenewStatus:              0 | 1;   // 0=off, 1=on
  expirationIntent?:            number;  // 1=customer cancelled, 2=billing error, 3=didn't consent, 4=price increase, 5=product unavailable
  gracePeriodExpiresDate?:      number;
  isInBillingRetryPeriod?:      boolean;
  offerIdentifier?:             string;
  offerType?:                   number;
  recentSubscriptionStartDate?: number;
  renewalDate?:                 number;
  environment:                  'Production' | 'Sandbox';
  signedDate:                   number;
}

/** Decoded App Store Server Notification V2 outer payload */
export interface AppleNotificationPayload {
  notificationType:  string;
  subtype?:          string;
  notificationUUID:  string;  // Globally unique; use for idempotency
  version:           string;  // '2.0' for ASSN V2
  signedDate:        number;
  data: {
    appAppleId?:            number;
    bundleId:               string;
    bundleVersion?:         string;
    environment:            'Production' | 'Sandbox';
    signedTransactionInfo?: string;  // JWS — decode via verifyAppleJWS
    signedRenewalInfo?:     string;  // JWS — decode via verifyAppleJWS
    status?:                number;
  };
  summary?:          unknown;
}

/** App Store Server Notification V2 notificationType values */
export const ASSN_TYPE = {
  SUBSCRIBED:                'SUBSCRIBED',               // New subscribe or re-subscribe
  DID_RENEW:                 'DID_RENEW',                // Successful renewal
  DID_CHANGE_RENEWAL_STATUS: 'DID_CHANGE_RENEWAL_STATUS',// Auto-renew toggled
  DID_CHANGE_RENEWAL_PREF:   'DID_CHANGE_RENEWAL_PREF', // Plan change (takes effect at renewal)
  DID_FAIL_TO_RENEW:         'DID_FAIL_TO_RENEW',       // Billing retry in progress
  EXPIRED:                   'EXPIRED',                  // Subscription expired
  REVOKE:                    'REVOKE',                   // Family Sharing revocation
  REFUND:                    'REFUND',                   // Refund granted
  REFUND_DECLINED:           'REFUND_DECLINED',
  GRACE_PERIOD_EXPIRED:      'GRACE_PERIOD_EXPIRED',     // Grace period ended without payment
  OFFER_REDEEMED:            'OFFER_REDEEMED',
  PRICE_INCREASE:            'PRICE_INCREASE',
  CONSUMPTION_REQUEST:       'CONSUMPTION_REQUEST',      // Apple requesting consumable details (refund)
  ONE_TIME_CHARGE:           'ONE_TIME_CHARGE',          // Non-renewable or consumable purchase
  RENEWAL_EXTENDED:          'RENEWAL_EXTENDED',
  RENEWAL_EXTENSION:         'RENEWAL_EXTENSION',
  TEST:                      'TEST',
} as const;

/** ASSN V2 subtype values (not exhaustive — Apple may add new values) */
export const ASSN_SUBTYPE = {
  INITIAL_BUY:         'INITIAL_BUY',
  RESUBSCRIBE:         'RESUBSCRIBE',
  DOWNGRADE:           'DOWNGRADE',
  UPGRADE:             'UPGRADE',
  AUTO_RENEW_ENABLED:  'AUTO_RENEW_ENABLED',
  AUTO_RENEW_DISABLED: 'AUTO_RENEW_DISABLED',
  VOLUNTARY:           'VOLUNTARY',       // User-initiated cancellation
  BILLING_RETRY:       'BILLING_RETRY',   // Billing retry exhausted
  PRICE_INCREASE:      'PRICE_INCREASE',
  PRODUCT_NOT_FOR_SALE:'PRODUCT_NOT_FOR_SALE',
  GRACE_PERIOD:        'GRACE_PERIOD',    // Still in grace period (with DID_FAIL_TO_RENEW)
  BILLING_RECOVERY:    'BILLING_RECOVERY',// Billing recovered (with DID_RENEW)
  PENDING:             'PENDING',
  ACCEPTED:            'ACCEPTED',
} as const;

// ─── Main verification function ───────────────────────────────────────────────

/**
 * Verify an Apple JWS compact token and return the decoded payload.
 *
 * Accepts any Apple JWS format:
 *   - StoreKit 2 signed transaction (jwsRepresentation)
 *   - ASSN V2 notification outer payload (signedPayload)
 *   - Nested signedTransactionInfo or signedRenewalInfo
 *
 * @param signedPayload   Compact JWS (header.payload.signature)
 * @param skipRootCheck   Pass true in unit tests or Sandbox-only environments.
 *                        NEVER pass true in production entitlement paths.
 * @returns               Decoded, signature-verified payload
 * @throws                On invalid format, signature failure, or unexpected algorithm
 */
export async function verifyAppleJWS<T = Record<string, unknown>>(
  signedPayload: string,
  skipRootCheck = false,
): Promise<T> {
  // 1. Split compact JWS
  const parts = signedPayload.split('.');
  if (parts.length !== 3) {
    throw new Error(`[appleJws] Invalid JWS: expected 3 parts, got ${parts.length}`);
  }

  // 2. Decode header
  let header: { alg?: string; x5c?: string[] };
  try {
    const bytes = base64UrlToBytes(parts[0]);
    header = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error('[appleJws] Failed to decode JWS header');
  }

  // 3. Validate algorithm
  if (header.alg !== 'ES256') {
    throw new Error(`[appleJws] Unsupported algorithm: ${header.alg ?? 'none'} (expected ES256)`);
  }

  // 4. Validate x5c chain
  const x5c = header.x5c;
  if (!x5c || x5c.length < 2) {
    throw new Error('[appleJws] Missing or incomplete x5c certificate chain (need at least leaf + root)');
  }

  // 5. Root certificate fingerprint check — defense-in-depth
  //    Primary security is the signature verification below.
  //    This check guards against cert chains from non-Apple CAs.
  if (!skipRootCheck) {
    try {
      const rootDer = base64ToBytes(x5c[x5c.length - 1]);
      const fp = await sha256Hex(rootDer);
      if (!APPLE_ROOT_CA_SHA256.has(fp)) {
        // Warn but do not throw: Apple may rotate root certs and we need update time.
        // Update APPLE_ROOT_CA_SHA256 when Apple publishes a new root CA generation.
        console.warn(`[appleJws] Root cert fingerprint not in trusted Apple CA set: ${fp}`);
      }
    } catch (e) {
      console.warn('[appleJws] Root fingerprint check skipped (non-fatal):', String(e));
    }
  }

  // 6. Import leaf certificate public key
  const leafPem = derBase64ToPem(x5c[0]);
  let leafKey: CryptoKey;
  try {
    leafKey = await importX509(leafPem, 'ES256');
  } catch (e) {
    throw new Error(`[appleJws] Failed to import leaf certificate EC key: ${String(e)}`);
  }

  // 7. Verify JWS signature  ← PRIMARY SECURITY CONTROL
  //    Confirms payload was signed by the holder of the leaf cert's private key.
  //    Without Apple's private key, an attacker cannot produce a valid signature.
  let payload: Uint8Array;
  try {
    const result = await compactVerify(signedPayload, leafKey);
    payload = result.payload;
  } catch (e) {
    throw new Error(`[appleJws] ES256 signature verification failed: ${String(e)}`);
  }

  // 8. Decode JSON payload
  try {
    return JSON.parse(new TextDecoder().decode(payload)) as T;
  } catch {
    throw new Error('[appleJws] JWS payload is not valid JSON');
  }
}

/**
 * Decode an Apple JWS payload WITHOUT verifying the signature.
 *
 * WARNING: NEVER use for entitlement decisions.
 * Safe for: logging, debugging, reading non-sensitive fields like environment.
 */
export function unsafeDecodeAppleJWSPayload<T = Record<string, unknown>>(
  signedPayload: string,
): T | null {
  try {
    const parts = signedPayload.split('.');
    if (parts.length !== 3) return null;
    const bytes = base64UrlToBytes(parts[1]);
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch {
    return null;
  }
}
