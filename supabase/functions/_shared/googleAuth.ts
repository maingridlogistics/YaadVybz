// _shared/googleAuth.ts — Google Service Account JWT + Access Token
//
// Creates a short-lived OAuth2 access token for the Google Play Developer API
// using a service account private key (RS256 JWT exchange).
//
// Used by:
//   - verify-google-purchase   (subscription & consumable token verification)
//   - google-play-notifications (Real-Time Developer Notification handler)
//
// All credentials are read server-side from Deno.env — never exposed to clients.
// The GOOGLE_PLAY_SERVICE_ACCOUNT_JSON secret must be the full service-account JSON blob.

import { importPKCS8, SignJWT } from 'https://deno.land/x/jose@v4.15.4/index.ts';

const SCOPE = 'https://www.googleapis.com/auth/androidpublisher';

/** Parsed fields we need from the service account JSON */
interface ServiceAccount {
  client_email: string;
  private_key:  string;
  token_uri:    string;
}

// Cache the token for up to 55 minutes to avoid hammering Google's token endpoint.
let cachedToken:   string | null = null;
let tokenExpiry:   number        = 0;

/**
 * Returns a valid Google OAuth2 access token for the Android Publisher API.
 * Re-uses the cached token until < 60 s remain; refreshes otherwise.
 */
export async function getGoogleAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && now < tokenExpiry) return cachedToken;

  const saJson = Deno.env.get('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON');
  if (!saJson) throw new Error('[googleAuth] GOOGLE_PLAY_SERVICE_ACCOUNT_JSON not set');

  let sa: ServiceAccount;
  try {
    sa = JSON.parse(saJson) as ServiceAccount;
  } catch {
    throw new Error('[googleAuth] Failed to parse GOOGLE_PLAY_SERVICE_ACCOUNT_JSON');
  }

  const iat = Math.floor(now / 1000);
  const exp = iat + 3600;

  // Import the RSA private key (PKCS#8 PEM, RS256)
  const privateKey = await importPKCS8(sa.private_key, 'RS256');

  const jwt = await new SignJWT({ scope: SCOPE })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(sa.client_email)
    .setAudience(sa.token_uri ?? 'https://oauth2.googleapis.com/token')
    .setIssuedAt(iat)
    .setExpirationTime(exp)
    .sign(privateKey);

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion:  jwt,
    }),
  });

  if (!tokenRes.ok) {
    const body = await tokenRes.text().catch(() => '');
    throw new Error(`[googleAuth] Token exchange failed (${tokenRes.status}): ${body}`);
  }

  const tokenData = await tokenRes.json();
  cachedToken = tokenData.access_token as string;
  tokenExpiry = now + ((tokenData.expires_in as number) - 60) * 1000;

  return cachedToken;
}

/**
 * Returns the Android package name from env.
 * Throws if not configured.
 */
export function getPackageName(): string {
  const pkg = Deno.env.get('GOOGLE_PLAY_PACKAGE_NAME');
  if (!pkg) throw new Error('[googleAuth] GOOGLE_PLAY_PACKAGE_NAME not set');
  return pkg;
}
