// verify-google-purchase — Android client → Vybz Hub server purchase verification.
//
// The Android client sends the purchase token obtained from Google Play Billing
// BEFORE acknowledging the transaction.  This function:
//   1. Verifies the token against the Google Play Developer API
//   2. Checks idempotency (purchase_token column in subscriptions / boost_purchases)
//   3. Activates subscription entitlements OR consumable boost
//   4. Acknowledges (subscription) or consumes (inapp) the purchase server-side
//
// The client must NOT acknowledge / consume until it receives { ok: true }.
//
// Request:  POST /functions/v1/verify-google-purchase
//   Auth:   Bearer <supabase_access_token>
//   Body:   { purchaseToken, productId, purchaseType, eventId? }
//
// Response: { ok, tier? } | { ok, boostType?, boostExpiresAt? }

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { getGoogleAccessToken, getPackageName } from '../_shared/googleAuth.ts';
import {
  syncSubscriptionEntitlements,
  activateBoostEntitlement,
  type PlanTier,
  type BoostType,
} from '../_shared/entitlements.ts';
import { checkSubscriptionEligibility } from '../_shared/subscriptionGuard.ts';

// ─── Product ID maps ──────────────────────────────────────────────────────────

const SUBSCRIPTION_PRODUCTS: Record<string, { plan: 'pro' | 'elite'; cycle: 'monthly' | 'yearly' }> = {
  'com.vybzhub.subscription.promoter_pro.monthly': { plan: 'pro',   cycle: 'monthly' },
  'com.vybzhub.subscription.promoter_pro.yearly':  { plan: 'pro',   cycle: 'yearly'  },
  'com.vybzhub.subscription.elite.monthly':         { plan: 'elite', cycle: 'monthly' },
  'com.vybzhub.subscription.elite.yearly':          { plan: 'elite', cycle: 'yearly'  },
};

const BOOST_PRODUCTS: Record<string, BoostType> = {
  'com.vybzhub.boost.three_day':        'three_day',
  'com.vybzhub.boost.seven_day':        'seven_day',
  'com.vybzhub.boost.until_event_end':  'until_event_end',
};

// ─── Google Play API helpers ──────────────────────────────────────────────────

interface GoogleSubscriptionV2 {
  lineItems?: Array<{
    productId:     string;
    expiryTime?:   string;
    autoRenewingPlan?: { autoRenewEnabled: boolean };
    offerDetails?: { basePlanId: string };
  }>;
  startTime?:         string;
  linkedPurchaseToken?: string;
  pausedStateContext?:  unknown;
  canceledStateContext?: { developerInitiatedCancellation?: unknown; userInitiatedCancellation?: unknown };
  testPurchase?:        unknown;
  acknowledgementState?: string; // ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED | _PENDING
  externalAccountIdentifiers?: { obfuscatedExternalAccountId?: string };
  subscriptionState?: string;    // SUBSCRIPTION_STATE_ACTIVE | _CANCELED | _IN_GRACE_PERIOD | _ON_HOLD | _PAUSED | _EXPIRED
}

interface GoogleProductPurchase {
  purchaseState:         number; // 0=Purchased 1=Canceled 2=Pending
  consumptionState:      number; // 0=Not consumed 1=Consumed
  acknowledgementState:  number; // 0=Not ack'd 1=Ack'd
  orderId:               string;
  purchaseTimeMillis:    string;
  obfuscatedExternalAccountId?: string;
  productId?:            string;
}

async function getSubscriptionV2(
  packageName: string,
  token:       string,
  accessToken: string,
): Promise<GoogleSubscriptionV2> {
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/purchases/subscriptionsv2/tokens/${encodeURIComponent(token)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Google subscriptionsv2 API ${res.status}: ${body}`);
  }
  return res.json();
}

async function getProductPurchase(
  packageName: string,
  productId:   string,
  token:       string,
  accessToken: string,
): Promise<GoogleProductPurchase> {
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(token)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Google products API ${res.status}: ${body}`);
  }
  return res.json();
}

async function acknowledgeSubscription(
  packageName: string,
  productId:   string,
  token:       string,
  accessToken: string,
): Promise<void> {
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/purchases/subscriptions/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(token)}:acknowledge`;
  await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
}

async function consumeProductPurchase(
  packageName: string,
  productId:   string,
  token:       string,
  accessToken: string,
): Promise<void> {
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(token)}:consume`;
  await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
}

// ─── Subscription state → Vybz Hub status ────────────────────────────────────

function googleStateToVybzStatus(subscriptionState?: string): string {
  switch (subscriptionState) {
    case 'SUBSCRIPTION_STATE_ACTIVE':           return 'active';
    case 'SUBSCRIPTION_STATE_CANCELED':         return 'canceled';
    case 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD':  return 'past_due';
    case 'SUBSCRIPTION_STATE_ON_HOLD':          return 'past_due';  // billing problem; access preserved temporarily
    case 'SUBSCRIPTION_STATE_PAUSED':           return 'paused';    // user-paused; ISSUE-021 fix (was 'canceled')
    case 'SUBSCRIPTION_STATE_EXPIRED':          return 'expired';
    default:                                    return 'active';
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

  // 1. Authenticate
  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '').trim();
  if (!token) {
    return new Response(JSON.stringify({ ok: false, error: 'Authorization required' }), { status: 401, headers: jsonHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !user) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), { status: 401, headers: jsonHeaders });
  }

  // 2. Parse body
  let body: {
    purchaseToken?:  string;
    productId?:      string;
    purchaseType?:   'subscription' | 'consumable';
    eventId?:        string;
  };
  try { body = await req.json(); }
  catch {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON body' }), { status: 400, headers: jsonHeaders });
  }

  const { purchaseToken, productId, purchaseType, eventId } = body;

  if (!purchaseToken || !productId || !purchaseType) {
    return new Response(JSON.stringify({ ok: false, error: 'purchaseToken, productId, and purchaseType are required' }), { status: 400, headers: jsonHeaders });
  }
  if (purchaseType === 'consumable' && !eventId) {
    return new Response(JSON.stringify({ ok: false, error: 'eventId is required for consumable (boost) purchases' }), { status: 400, headers: jsonHeaders });
  }

  // 3. Get Google credentials
  let accessToken: string;
  let packageName: string;
  try {
    [accessToken, packageName] = await Promise.all([getGoogleAccessToken(), Promise.resolve(getPackageName())]);
  } catch (e) {
    console.error('[verify-google-purchase] Credential error:', String(e));
    return new Response(JSON.stringify({ ok: false, error: 'Payment configuration error' }), { status: 500, headers: jsonHeaders });
  }

  // 4. Validate product IDs
  const subConfig = SUBSCRIPTION_PRODUCTS[productId];
  const boostType  = BOOST_PRODUCTS[productId];

  if (purchaseType === 'subscription' && !subConfig) {
    return new Response(JSON.stringify({ ok: false, error: `Unknown subscription product: ${productId}` }), { status: 400, headers: jsonHeaders });
  }
  if (purchaseType === 'consumable' && !boostType) {
    return new Response(JSON.stringify({ ok: false, error: `Unknown boost product: ${productId}` }), { status: 400, headers: jsonHeaders });
  }

  // 5. Idempotency check using purchase token
  if (purchaseType === 'subscription') {
    const { data: existingSub } = await supabaseAdmin
      .from('subscriptions')
      .select('id, plan, status')
      .eq('provider_purchase_token', purchaseToken)
      .maybeSingle();

    if (existingSub) {
      console.log(`[verify-google-purchase] Duplicate sub token user=${user.id.slice(0,8)} — cached success`);
      return new Response(JSON.stringify({ ok: true, cached: true, tier: existingSub.plan }), { status: 200, headers: jsonHeaders });
    }
  } else {
    const { data: existingBoost } = await supabaseAdmin
      .from('boost_purchases')
      .select('id, event_id')
      .eq('provider_purchase_token', purchaseToken)
      .maybeSingle();

    if (existingBoost) {
      const sameEvent = existingBoost.event_id === eventId;
      if (sameEvent) {
        return new Response(JSON.stringify({ ok: true, cached: true }), { status: 200, headers: jsonHeaders });
      }
      return new Response(
        JSON.stringify({ ok: false, error: 'This purchase has already been used to boost another event' }),
        { status: 409, headers: jsonHeaders },
      );
    }
  }

  // 6. Cross-provider subscription guard (subscriptions only)
  if (purchaseType === 'subscription') {
    const eligibility = await checkSubscriptionEligibility(supabaseAdmin, user.id, 'google');
    if (!eligibility.eligible) {
      const sub = eligibility.activeSubscription;
      const isSameGoogle = sub?.paymentProvider === 'google';
      if (!isSameGoogle) {
        console.warn(`[verify-google-purchase] Cross-provider block: user=${user.id.slice(0,8)} has ${sub?.paymentProvider} subscription`);
        return new Response(
          JSON.stringify({ ok: false, error: eligibility.reason, activeProvider: sub?.paymentProvider ?? null }),
          { status: 409, headers: jsonHeaders },
        );
      }
    }
  }

  // 7. Verify with Google Play API
  try {
    if (purchaseType === 'subscription' && subConfig) {
      // ── Subscription ────────────────────────────────────────────────────────
      const subData = await getSubscriptionV2(packageName, purchaseToken, accessToken);

      const isSandbox = !!(subData.testPurchase);
      const state = subData.subscriptionState ?? 'SUBSCRIPTION_STATE_ACTIVE';
      const vybzStatus = googleStateToVybzStatus(state);

      // Get expiry from first line item
      const lineItem = subData.lineItems?.[0];
      const expiryTime = lineItem?.expiryTime ?? null;
      const expiresAt = expiryTime ? new Date(expiryTime).toISOString() : null;
      const autoRenew = lineItem?.autoRenewingPlan?.autoRenewEnabled ?? true;

      // Verify the product ID matches the line item
      if (lineItem?.productId && lineItem.productId !== productId) {
        console.warn(`[verify-google-purchase] Product mismatch: expected=${productId} got=${lineItem.productId}`);
      }

      // Write entitlements
      await syncSubscriptionEntitlements(supabaseAdmin, {
        userId:                user.id,
        plan:                  subConfig.plan as PlanTier,
        subscriptionStatus:    vybzStatus,
        paymentProvider:       'google',
        currentPeriodEnd:      expiresAt,
        originalTransactionId: purchaseToken,  // use token as stable ID for Google
        autoRenewStatus:       autoRenew,
        environment:           isSandbox ? 'sandbox' : 'production',
        overrideRemainingBoosts: vybzStatus === 'active' ? undefined : undefined,
      });

      // Upsert subscription ledger
      const { error: subErr } = await supabaseAdmin.from('subscriptions').upsert({
        user_id:                  user.id,
        plan:                     subConfig.plan,
        billing_cycle:            subConfig.cycle,
        status:                   vybzStatus,
        payment_provider:         'google',
        original_transaction_id:  purchaseToken,
        provider_purchase_token:  purchaseToken,
        provider_product_id:      productId,
        current_period_end:       expiresAt,
        auto_renew_status:        autoRenew,
        environment:              isSandbox ? 'sandbox' : 'production',
        last_verified_at:         new Date().toISOString(),
      }, { onConflict: 'original_transaction_id' });

      if (subErr) console.warn('[verify-google-purchase] subscriptions upsert error:', subErr.message);

      // Acknowledge subscription server-side (required within 3 days)
      if (subData.acknowledgementState !== 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED') {
        // Google subscriptions v2 uses a different acknowledge endpoint
        const ackUrl = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`;
        await fetch(ackUrl, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: '{}',
        }).catch((e) => console.warn('[verify-google-purchase] acknowledge failed:', String(e)));
      }

      console.log(`[verify-google-purchase] Sub activated: user=${user.id.slice(0,8)} plan=${subConfig.plan} status=${vybzStatus} cycle=${subConfig.cycle}`);
      return new Response(JSON.stringify({ ok: true, tier: subConfig.plan, environment: isSandbox ? 'sandbox' : 'production' }), { status: 200, headers: jsonHeaders });

    } else if (purchaseType === 'consumable' && boostType && eventId) {
      // ── Consumable boost ─────────────────────────────────────────────────────
      const productData = await getProductPurchase(packageName, productId, purchaseToken, accessToken);

      if (productData.purchaseState !== 0) {
        return new Response(JSON.stringify({ ok: false, error: 'Purchase is not in a completed state' }), { status: 400, headers: jsonHeaders });
      }

      // Verify event ownership
      const { data: eventRow } = await supabaseAdmin
        .from('events')
        .select('id, promoter_id')
        .eq('id', eventId)
        .eq('promoter_id', user.id)
        .maybeSingle();

      if (!eventRow) {
        return new Response(JSON.stringify({ ok: false, error: 'Event not found or you are not the owner' }), { status: 403, headers: jsonHeaders });
      }

      const isSandbox = false; // Google Play sandbox uses test accounts, no separate field
      const orderId = productData.orderId;

      const { ok, boostExpiresAt, error: boostErr } = await activateBoostEntitlement(supabaseAdmin, {
        eventId,
        promoterId:       user.id,
        boostType,
        paymentProvider:  'google',
        transactionId:    orderId,
        purchaseToken:    purchaseToken,  // written to provider_purchase_token for idempotency & refund lookups
        currency:         'usd',
        environment:      'production',
      });

      if (!ok) {
        return new Response(JSON.stringify({ ok: false, error: boostErr ?? 'Boost activation failed' }), { status: 500, headers: jsonHeaders });
      }

      // Consume server-side so the item can be re-purchased
      await consumeProductPurchase(packageName, productId, purchaseToken, accessToken)
        .catch((e) => console.warn('[verify-google-purchase] consume failed (non-fatal):', String(e)));

      console.log(`[verify-google-purchase] Boost activated: user=${user.id.slice(0,8)} type=${boostType} event=${eventId}`);
      return new Response(JSON.stringify({ ok: true, boostType, boostExpiresAt }), { status: 200, headers: jsonHeaders });
    }
  } catch (e) {
    console.error('[verify-google-purchase] Verification error:', String(e));
    return new Response(
      JSON.stringify({ ok: false, error: `Verification failed: ${String(e).slice(0, 200)}` }),
      { status: 500, headers: jsonHeaders },
    );
  }

  return new Response(JSON.stringify({ ok: false, error: 'Unhandled purchase type combination' }), { status: 400, headers: jsonHeaders });
});
