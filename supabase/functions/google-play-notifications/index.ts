// google-play-notifications — Google Play Real-Time Developer Notifications handler.
//
// Google sends POST requests to this endpoint via Google Cloud Pub/Sub whenever
// a subscription or one-time product changes state (purchased, renewed, canceled,
// expired, refunded, account-held, paused, etc.).
//
// Authentication:
//   Google Pub/Sub appends ?token=<GOOGLE_PUBSUB_TOKEN> to the push URL.
//   The GOOGLE_PUBSUB_TOKEN secret must be set in Edge Function environment.
//
// Security:
//   • Never grant entitlements from the notification alone — always verify by
//     calling the Google Play Developer API with the purchase token.
//   • idempotency: subscription upsert uses provider_purchase_token conflict key.
//
// Setup:
//   In Google Play Console → Monetize → Subscriptions → Real-time developer notifications:
//   Set the Pub/Sub push URL to:
//   https://<project>.supabase.co/functions/v1/google-play-notifications?token=<GOOGLE_PUBSUB_TOKEN>

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { getGoogleAccessToken, getPackageName } from '../_shared/googleAuth.ts';
import {
  syncSubscriptionEntitlements,
  downgradeToFree,
  resetBoostCredits,
  type PlanTier,
} from '../_shared/entitlements.ts';

// ─── Google Play notification types ──────────────────────────────────────────

const SUB_NOTIFICATION_TYPES: Record<number, string> = {
  1:  'SUBSCRIPTION_RECOVERED',        // From account hold
  2:  'SUBSCRIPTION_RENEWED',
  3:  'SUBSCRIPTION_CANCELED',
  4:  'SUBSCRIPTION_PURCHASED',
  5:  'SUBSCRIPTION_ON_HOLD',          // Account hold
  6:  'SUBSCRIPTION_IN_GRACE_PERIOD',
  7:  'SUBSCRIPTION_RESTARTED',
  8:  'SUBSCRIPTION_PRICE_CHANGE_CONFIRMED',
  9:  'SUBSCRIPTION_DEFERRED',
  10: 'SUBSCRIPTION_PAUSED',
  11: 'SUBSCRIPTION_PAUSE_SCHEDULE_CHANGED',
  12: 'SUBSCRIPTION_REVOKED',
  13: 'SUBSCRIPTION_EXPIRED',
};

const OTP_NOTIFICATION_TYPES: Record<number, string> = {
  1: 'ONE_TIME_PRODUCT_PURCHASED',
  2: 'ONE_TIME_PRODUCT_CANCELED',
};

// ─── Product ID map ───────────────────────────────────────────────────────────

const SUBSCRIPTION_PRODUCTS: Record<string, { plan: 'pro' | 'elite'; cycle: 'monthly' | 'yearly' }> = {
  'com.vybzhub.subscription.promoter_pro.monthly': { plan: 'pro',   cycle: 'monthly' },
  'com.vybzhub.subscription.promoter_pro.yearly':  { plan: 'pro',   cycle: 'yearly'  },
  'com.vybzhub.subscription.elite.monthly':         { plan: 'elite', cycle: 'monthly' },
  'com.vybzhub.subscription.elite.yearly':          { plan: 'elite', cycle: 'yearly'  },
};

// ─── Google API helper ────────────────────────────────────────────────────────

interface GoogleSubscriptionV2 {
  subscriptionState?:   string;
  lineItems?:           Array<{ productId: string; expiryTime?: string; autoRenewingPlan?: { autoRenewEnabled: boolean } }>;
  testPurchase?:        unknown;
  linkedPurchaseToken?: string;
  externalAccountIdentifiers?: { obfuscatedExternalAccountId?: string };
}

async function fetchSubscription(
  packageName:  string,
  token:        string,
  accessToken:  string,
): Promise<GoogleSubscriptionV2 | null> {
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/purchases/subscriptionsv2/tokens/${encodeURIComponent(token)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    console.warn(`[google-notif] fetchSubscription failed ${res.status}: ${await res.text().catch(() => '')}`);
    return null;
  }
  return res.json();
}

function googleStateToVybzStatus(state?: string): string {
  switch (state) {
    case 'SUBSCRIPTION_STATE_ACTIVE':           return 'active';
    case 'SUBSCRIPTION_STATE_CANCELED':         return 'canceled';
    case 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD':  return 'past_due';
    case 'SUBSCRIPTION_STATE_ON_HOLD':          return 'past_due';
    case 'SUBSCRIPTION_STATE_PAUSED':           return 'canceled';
    case 'SUBSCRIPTION_STATE_EXPIRED':          return 'expired';
    default:                                    return 'active';
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

  // Validate Pub/Sub token
  const url = new URL(req.url);
  const expectedToken = Deno.env.get('GOOGLE_PUBSUB_TOKEN');
  const receivedToken = url.searchParams.get('token');
  if (expectedToken && receivedToken !== expectedToken) {
    console.warn('[google-notif] Invalid Pub/Sub token');
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), { status: 401, headers: jsonHeaders });
  }

  // Parse Pub/Sub message
  let rawMessage: Record<string, unknown>;
  try { rawMessage = await req.json(); }
  catch { return new Response('ok', { status: 200 }); } // Always 200 to Pub/Sub

  const messageData = (rawMessage.message as Record<string, unknown>)?.data;
  if (!messageData || typeof messageData !== 'string') {
    return new Response('ok', { status: 200 });
  }

  let notification: Record<string, unknown>;
  try {
    const decoded = atob(messageData);
    notification = JSON.parse(decoded);
  } catch (e) {
    console.error('[google-notif] Failed to decode notification:', String(e));
    return new Response('ok', { status: 200 });
  }

  // Handle test notifications
  if (notification.testNotification) {
    console.log('[google-notif TEST] Test notification received');
    return new Response('ok', { status: 200 });
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  // ── Subscription notification ────────────────────────────────────────────

  const subNotif = notification.subscriptionNotification as Record<string, unknown> | undefined;
  if (subNotif) {
    const purchaseToken  = subNotif.purchaseToken as string;
    const subscriptionId = subNotif.subscriptionId as string;
    const notifType      = subNotif.notificationType as number;
    const typeName       = SUB_NOTIFICATION_TYPES[notifType] ?? `UNKNOWN_${notifType}`;

    console.log(`[google-notif] ${typeName} productId=${subscriptionId} token=${purchaseToken?.slice(0, 12)}…`);

    if (!purchaseToken || !subscriptionId) {
      return new Response('ok', { status: 200 });
    }

    // Find user by purchase token in subscriptions table
    const { data: subRow } = await supabaseAdmin
      .from('subscriptions')
      .select('user_id, plan')
      .eq('provider_purchase_token', purchaseToken)
      .maybeSingle();

    if (!subRow?.user_id) {
      // Unknown token — could be a race before verify-google-purchase ran
      console.warn(`[google-notif] Unknown purchase token ${purchaseToken.slice(0, 12)}… — skipping`);
      return new Response('ok', { status: 200 });
    }

    const userId = subRow.user_id;

    // Downgrade events: cancel, expire, revoke, hold
    const isDowngrade = [
      'SUBSCRIPTION_CANCELED', 'SUBSCRIPTION_EXPIRED', 'SUBSCRIPTION_REVOKED',
      'SUBSCRIPTION_ON_HOLD',
    ].includes(typeName);

    const isUpgrade = [
      'SUBSCRIPTION_PURCHASED', 'SUBSCRIPTION_RENEWED', 'SUBSCRIPTION_RECOVERED',
      'SUBSCRIPTION_RESTARTED',
    ].includes(typeName);

    const isGracePeriod = typeName === 'SUBSCRIPTION_IN_GRACE_PERIOD';

    if (isDowngrade) {
      const reason = typeName === 'SUBSCRIPTION_REVOKED' ? 'revoked'
        : typeName === 'SUBSCRIPTION_EXPIRED'   ? 'expired'
        : 'canceled';
      await downgradeToFree(supabaseAdmin, userId, 'google', reason as any);
      await supabaseAdmin
        .from('subscriptions')
        .update({ status: reason, updated_at: new Date().toISOString() })
        .eq('provider_purchase_token', purchaseToken);
      console.log(`[google-notif] Downgraded user=${userId.slice(0,8)} reason=${reason}`);
      return new Response('ok', { status: 200 });
    }

    if (isGracePeriod) {
      await syncSubscriptionEntitlements(supabaseAdmin, {
        userId,
        plan:               (subRow.plan as PlanTier) ?? 'free',
        subscriptionStatus: 'past_due',
        paymentProvider:    'google',
        currentPeriodEnd:   null,
        originalTransactionId: purchaseToken,
      });
      await supabaseAdmin
        .from('subscriptions')
        .update({ status: 'past_due' })
        .eq('provider_purchase_token', purchaseToken);
      return new Response('ok', { status: 200 });
    }

    if (isUpgrade) {
      // Re-verify from Google API for authoritative state
      try {
        const [accessToken, packageName] = await Promise.all([
          getGoogleAccessToken(),
          Promise.resolve(getPackageName()),
        ]);
        const subData = await fetchSubscription(packageName, purchaseToken, accessToken);
        if (!subData) return new Response('ok', { status: 200 });

        const lineItem   = subData.lineItems?.[0];
        const expiresAt  = lineItem?.expiryTime ? new Date(lineItem.expiryTime).toISOString() : null;
        const autoRenew  = lineItem?.autoRenewingPlan?.autoRenewEnabled ?? true;
        const status     = googleStateToVybzStatus(subData.subscriptionState);
        const planCfg    = lineItem?.productId ? SUBSCRIPTION_PRODUCTS[lineItem.productId] : null;
        const plan       = (planCfg?.plan ?? subRow.plan ?? 'pro') as PlanTier;

        await syncSubscriptionEntitlements(supabaseAdmin, {
          userId,
          plan,
          subscriptionStatus:    status,
          paymentProvider:       'google',
          currentPeriodEnd:      expiresAt,
          originalTransactionId: purchaseToken,
          autoRenewStatus:       autoRenew,
          environment:           subData.testPurchase ? 'sandbox' : 'production',
        });

        // Reset boost credits on renewal
        if (typeName === 'SUBSCRIPTION_RENEWED') {
          await resetBoostCredits(supabaseAdmin, userId, expiresAt);
        }

        await supabaseAdmin
          .from('subscriptions')
          .update({
            status,
            current_period_end: expiresAt,
            auto_renew_status: autoRenew,
            last_verified_at: new Date().toISOString(),
          })
          .eq('provider_purchase_token', purchaseToken);

        console.log(`[google-notif] ${typeName} synced: user=${userId.slice(0,8)} plan=${plan} status=${status}`);
      } catch (e) {
        console.error('[google-notif] Re-verification failed:', String(e));
      }
    }

    return new Response('ok', { status: 200 });
  }

  // ── One-time product notification (boosts) ────────────────────────────────

  const otpNotif = notification.oneTimeProductNotification as Record<string, unknown> | undefined;
  if (otpNotif) {
    const notifType = otpNotif.notificationType as number;
    const typeName  = OTP_NOTIFICATION_TYPES[notifType] ?? `UNKNOWN_${notifType}`;
    const purchaseToken = otpNotif.purchaseToken as string;
    const sku           = otpNotif.sku as string;

    console.log(`[google-notif] OTP ${typeName} sku=${sku} token=${purchaseToken?.slice(0, 12)}…`);

    if (typeName === 'ONE_TIME_PRODUCT_CANCELED' && purchaseToken) {
      // Refund: deactivate the boost
      const { data: boostRow } = await supabaseAdmin
        .from('boost_purchases')
        .select('id, event_id')
        .eq('provider_purchase_token', purchaseToken)
        .maybeSingle();

      if (boostRow) {
        await supabaseAdmin
          .from('boost_purchases')
          .update({ status: 'refunded', refunded_at: new Date().toISOString() })
          .eq('id', boostRow.id);

        // Check if another active boost covers this event before deactivating
        const { data: otherBoost } = await supabaseAdmin
          .from('boost_purchases')
          .select('id')
          .eq('event_id', boostRow.event_id)
          .eq('status', 'completed')
          .neq('id', boostRow.id)
          .maybeSingle();

        if (!otherBoost) {
          await supabaseAdmin
            .from('events')
            .update({ boosted: false, boost_status: 'refunded' })
            .eq('id', boostRow.event_id);
          console.log(`[google-notif] Boost deactivated after refund: event=${boostRow.event_id}`);
        }
      }
    }
    return new Response('ok', { status: 200 });
  }

  return new Response('ok', { status: 200 });
});
