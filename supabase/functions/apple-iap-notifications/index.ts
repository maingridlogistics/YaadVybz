// apple-iap-notifications — App Store Server Notifications V2 handler.
//
// ISSUE-006 FIX: DID_RENEW now calls syncSubscriptionEntitlements() for a
//   full entitlement sync (verified_promoter, featured_priority, promoter_tier
//   on events, last_verified_at) instead of a partial manual update.
//
// ISSUE-018 FIX: CONSUMPTION_REQUEST is handled — looks up boost activation
//   state and logs it. Full consumption reporting via App Store Server API
//   requires App Store Connect API credentials (separate configuration).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  verifyAppleJWS,
  unsafeDecodeAppleJWSPayload,
  ASSN_TYPE,
  ASSN_SUBTYPE,
  type AppleNotificationPayload,
  type AppleTransactionPayload,
  type AppleRenewalInfoPayload,
} from '../_shared/appleJws.ts';
import {
  syncSubscriptionEntitlements,
  downgradeToFree,
  resetBoostCredits,
  activateLifetimePro,
  type PlanTier,
} from '../_shared/entitlements.ts';
import { sendPushToUserIds } from '../_shared/push.ts';

/** Lifetime Pro non-consumable — kept for refund/revoke handling only */
const LIFETIME_PRO_PRODUCT_ID = 'com.vybzhub.pro.lifetime';

const SUBSCRIPTION_PRODUCTS: Record<string, { plan: 'pro' | 'elite'; cycle: 'monthly' | 'yearly' }> = {
  'com.vybzhub.subscription.promoter_pro.monthly': { plan: 'pro',   cycle: 'monthly' },
  'com.vybzhub.subscription.promoter_pro.yearly':  { plan: 'pro',   cycle: 'yearly'  },
  'com.vybzhub.subscription.elite.monthly':         { plan: 'elite', cycle: 'monthly' },
  'com.vybzhub.subscription.elite.yearly':          { plan: 'elite', cycle: 'yearly'  },
};

const BOOST_PRODUCTS: Record<string, string> = {
  'com.vybzhub.boost.three_day':        'three_day',
  'com.vybzhub.boost.seven_day':        'seven_day',
  'com.vybzhub.boost.until_event_end':  'until_event_end',
};

async function resolveUserFromTransaction(
  supabaseAdmin: ReturnType<typeof createClient>,
  tx: AppleTransactionPayload,
): Promise<string | null> {
  // 1. appAccountToken = Vybz Hub user.id (set during purchase via StoreKit 2)
  if (tx.appAccountToken) {
    const { data: profile } = await supabaseAdmin
      .from('user_profiles')
      .select('id')
      .eq('id', tx.appAccountToken)
      .maybeSingle();
    if (profile?.id) return profile.id;
  }

  // 2. Look up by originalTransactionId in subscriptions ledger
  const { data: subRow } = await supabaseAdmin
    .from('subscriptions')
    .select('user_id')
    .eq('original_transaction_id', tx.originalTransactionId)
    .maybeSingle();
  if (subRow?.user_id) return subRow.user_id as string;

  // 3. Look up by apple_original_transaction_id in user_profiles (Apple only)
  const { data: profileRow } = await supabaseAdmin
    .from('user_profiles')
    .select('id')
    .eq('apple_original_transaction_id', tx.originalTransactionId)
    .maybeSingle();
  if (profileRow?.id) return profileRow.id as string;

  return null;
}

serve(async (req: Request) => {
  if (req.method === 'GET') {
    return new Response('Apple IAP Notifications V2 — Active', { status: 200 });
  }
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  const expectedBundle = Deno.env.get('APPLE_BUNDLE_ID') ?? 'com.chambex.vybzhub';
  let rawBody: string;

  try {
    rawBody = await req.text();
  } catch {
    console.error('[apple-iap-notif] Failed to read request body');
    return new Response('OK', { status: 200 });
  }

  // ── 1. Verify outer JWS notification payload ──────────────────────────────
  let notification: AppleNotificationPayload;
  try {
    notification = await verifyAppleJWS<AppleNotificationPayload>(rawBody.trim());
  } catch {
    try {
      const wrapper = JSON.parse(rawBody) as { signedPayload?: string };
      if (wrapper.signedPayload) {
        notification = await verifyAppleJWS<AppleNotificationPayload>(wrapper.signedPayload);
      } else {
        throw new Error('No signedPayload field');
      }
    } catch (e2) {
      console.error('[apple-iap-notif] Outer JWS verification failed:', String(e2).slice(0, 200));
      return new Response('OK', { status: 200 });
    }
  }

  const { notificationType, subtype, notificationUUID, data: notifData } = notification;
  const isSandbox = notifData.environment === 'Sandbox';
  const logPrefix = `[apple-iap-notif ${notificationType}${subtype ? '/' + subtype : ''}]`;

  console.log(`${logPrefix} uuid=${notificationUUID} env=${notifData.environment}`);

  if (notifData.bundleId && notifData.bundleId !== expectedBundle) {
    console.warn(`${logPrefix} Bundle ID mismatch: ${notifData.bundleId} !== ${expectedBundle}`);
    return new Response('OK', { status: 200 });
  }

  if (notificationType === ASSN_TYPE.TEST) {
    console.log(`${logPrefix} Test notification acknowledged uuid=${notificationUUID}`);
    return new Response('OK', { status: 200 });
  }

  // ── 2. Decode inner signed payloads ───────────────────────────────────────
  let tx: AppleTransactionPayload | null = null;
  let renewalInfo: AppleRenewalInfoPayload | null = null;

  if (notifData.signedTransactionInfo) {
    try {
      tx = await verifyAppleJWS<AppleTransactionPayload>(notifData.signedTransactionInfo);
    } catch (e) {
      console.warn(`${logPrefix} signedTransactionInfo verification failed:`, String(e).slice(0, 200));
      tx = unsafeDecodeAppleJWSPayload<AppleTransactionPayload>(notifData.signedTransactionInfo);
      if (tx) {
        console.warn(`${logPrefix} Proceeding with unverified tx data for logging only`);
        return new Response('OK', { status: 200 });
      }
    }
  }

  if (notifData.signedRenewalInfo) {
    try {
      renewalInfo = await verifyAppleJWS<AppleRenewalInfoPayload>(notifData.signedRenewalInfo);
    } catch {
      renewalInfo = null;
    }
  }

  if (!tx) {
    console.log(`${logPrefix} No verifiable transaction info — acknowledged without DB write`);
    return new Response('OK', { status: 200 });
  }

  // ── 3. Resolve user ───────────────────────────────────────────────────────
  const userId = await resolveUserFromTransaction(supabaseAdmin, tx);
  if (!userId) {
    console.warn(`${logPrefix} Cannot resolve user from originalTxId=${tx.originalTransactionId}`);
    return new Response('OK', { status: 200 });
  }

  const env: 'production' | 'sandbox' = isSandbox ? 'sandbox' : 'production';
  const productConfig = SUBSCRIPTION_PRODUCTS[tx.productId];
  const plan = productConfig?.plan ?? 'free';

  // ── 4. Route by notification type ─────────────────────────────────────────

  try {
    switch (notificationType) {

      // ── SUBSCRIBED ─────────────────────────────────────────────────────────
      case ASSN_TYPE.SUBSCRIBED: {
        if (!productConfig) {
          console.warn(`${logPrefix} Unknown product ${tx.productId}`);
          break;
        }
        const expiresDate = tx.expiresDate ? new Date(tx.expiresDate).toISOString() : null;

        await syncSubscriptionEntitlements(supabaseAdmin, {
          userId,
          plan:                  plan as PlanTier,
          billingCycle:          productConfig.cycle,
          subscriptionStatus:    'active',
          paymentProvider:       'apple',
          currentPeriodEnd:      expiresDate,
          originalTransactionId: tx.originalTransactionId,
          autoRenewStatus:       renewalInfo?.autoRenewStatus === 1,
          environment:           env,
        });

        await supabaseAdmin.from('subscriptions').upsert({
          user_id:                  userId,
          plan,
          billing_cycle:            productConfig.cycle,
          status:                   'active',
          payment_provider:         'apple',
          original_transaction_id:  tx.originalTransactionId,
          provider_product_id:      tx.productId,
          provider_transaction_id:  tx.transactionId,
          current_period_end:       expiresDate,
          auto_renew_status:        renewalInfo?.autoRenewStatus === 1,
          environment:              tx.environment,
          last_verified_at:         new Date().toISOString(),
        }, { onConflict: 'original_transaction_id' });

        console.log(`${logPrefix} Subscription activated: user=${userId.slice(0,8)} plan=${plan}`);
        break;
      }

      // ── DID_RENEW: ISSUE-006 FIX — use full syncSubscriptionEntitlements ───
      // BILLING CYCLE FIX: derive billingCycle from the renewed tx.productId
      // via the canonical SUBSCRIPTION_PRODUCTS map.  Do NOT hardcode 'monthly'.
      // This prevents yearly subscriptions from having billing_cycle overwritten
      // to 'monthly' on each renewal.
      case ASSN_TYPE.DID_RENEW: {
        const newPeriodEnd = tx.expiresDate ? new Date(tx.expiresDate).toISOString() : null;

        // Canonical product config from the RENEWED transaction's productId.
        // tx.productId is always the product that was just billed by Apple.
        const renewedProductConfig = SUBSCRIPTION_PRODUCTS[tx.productId];
        const renewedPlan = (renewedProductConfig?.plan ?? productConfig?.plan ?? 'pro') as PlanTier;
        // Use canonical cycle from the renewed productId — authoritative source.
        // Fall back to the existing DB value only if the product is unrecognised.
        let renewedCycle: 'monthly' | 'yearly' | undefined = renewedProductConfig?.cycle;
        if (!renewedCycle) {
          // Product not in our map — read from the existing subscription row
          // to avoid overwriting a yearly cycle with a hardcoded 'monthly'.
          const { data: existingSubForCycle } = await supabaseAdmin
            .from('subscriptions')
            .select('billing_cycle')
            .eq('original_transaction_id', tx.originalTransactionId)
            .maybeSingle();
          renewedCycle = (existingSubForCycle?.billing_cycle as 'monthly' | 'yearly') ?? 'monthly';
        }

        // Full entitlement sync — updates verified_promoter, featured_priority,
        // events.promoter_tier, monthly_boost_allowance, and last_verified_at.
        // billingCycle is now passed correctly so yearly subs are not reset to monthly.
        await syncSubscriptionEntitlements(supabaseAdmin, {
          userId,
          plan:                  renewedPlan,
          billingCycle:          renewedCycle,
          subscriptionStatus:    'active',
          paymentProvider:       'apple',
          currentPeriodEnd:      newPeriodEnd,
          originalTransactionId: tx.originalTransactionId,
          autoRenewStatus:       renewalInfo?.autoRenewStatus === 1,
          environment:           env,
        });

        // Reset boost credits for the new billing period
        await resetBoostCredits(supabaseAdmin, userId, newPeriodEnd);

        // Update subscription ledger
        await supabaseAdmin.from('subscriptions')
          .update({
            status:             'active',
            current_period_end: newPeriodEnd,
            last_verified_at:   new Date().toISOString(),
            auto_renew_status:  renewalInfo?.autoRenewStatus === 1,
          })
          .eq('original_transaction_id', tx.originalTransactionId);

        console.log(`${logPrefix} Renewal synced: user=${userId.slice(0,8)} plan=${renewedPlan} period_end=${newPeriodEnd} subtype=${subtype ?? 'none'}`);
        break;
      }

      // ── DID_FAIL_TO_RENEW ─────────────────────────────────────────────────
      case ASSN_TYPE.DID_FAIL_TO_RENEW: {
        const inGracePeriod = subtype === ASSN_SUBTYPE.GRACE_PERIOD;
        const newStatus = 'past_due';

        await supabaseAdmin.from('user_profiles')
          .update({ subscription_status: newStatus })
          .eq('id', userId);
        await supabaseAdmin.from('subscriptions')
          .update({ status: newStatus })
          .eq('original_transaction_id', tx.originalTransactionId);

        await supabaseAdmin.from('notifications').insert({
          user_id: userId,
          type:    'payment_failed',
          title:   'Subscription Renewal Failed',
          body:    inGracePeriod
            ? 'Your subscription renewal failed. We will retry during the grace period — please update your payment method.'
            : 'Your subscription renewal failed. Please update your payment method to keep your promoter access.',
          read:    false,
        });
        void sendPushToUserIds(
          [userId],
          'Subscription Renewal Failed',
          'Please update your payment method to keep your promoter access.',
          undefined, 'payment_failed', supabaseAdmin, true,
        ).catch(() => {});

        console.log(`${logPrefix} Billing retry: user=${userId.slice(0,8)} grace=${inGracePeriod}`);
        break;
      }

      // ── GRACE_PERIOD_EXPIRED ──────────────────────────────────────────────
      case ASSN_TYPE.GRACE_PERIOD_EXPIRED: {
        await downgradeToFree(supabaseAdmin, userId, 'apple', 'expired');
        await supabaseAdmin.from('subscriptions')
          .update({ status: 'canceled' })
          .eq('original_transaction_id', tx.originalTransactionId);
        console.log(`${logPrefix} Grace period expired — user=${userId.slice(0,8)} downgraded`);
        break;
      }

      // ── EXPIRED ───────────────────────────────────────────────────────────
      case ASSN_TYPE.EXPIRED: {
        await downgradeToFree(supabaseAdmin, userId, 'apple', 'expired');
        await supabaseAdmin.from('subscriptions')
          .update({ status: 'canceled' })
          .eq('original_transaction_id', tx.originalTransactionId);
        console.log(`${logPrefix} Subscription expired: user=${userId.slice(0,8)}`);
        break;
      }

      // ── REVOKE ────────────────────────────────────────────────────────────
      case ASSN_TYPE.REVOKE: {
        await downgradeToFree(supabaseAdmin, userId, 'apple', 'revoked');
        await supabaseAdmin.from('subscriptions')
          .update({ status: 'canceled', revoked_at: new Date().toISOString() })
          .eq('original_transaction_id', tx.originalTransactionId);
        console.log(`${logPrefix} Family Sharing revoked: user=${userId.slice(0,8)}`);
        break;
      }

      // ── REFUND ────────────────────────────────────────────────────────────
      case ASSN_TYPE.REFUND: {
        // Lifetime Pro refund — revoke permanent ownership
        if (tx.productId === LIFETIME_PRO_PRODUCT_ID) {
          await supabaseAdmin.from('user_profiles')
            .update({ lifetime_pro_owned: false, subscription_tier: 'free', monthly_boost_allowance: 0, featured_priority: 0 })
            .eq('id', userId);
          await supabaseAdmin.from('events').update({ promoter_tier: 'free' }).eq('promoter_id', userId);
          console.log(`${logPrefix} Lifetime Pro refunded: user=${userId.slice(0,8)}`);
          break;
        }

        if (BOOST_PRODUCTS[tx.productId]) {
          const { data: purchaseRow } = await supabaseAdmin
            .from('boost_purchases')
            .select('id, event_id, status')
            .eq('apple_transaction_id', tx.transactionId)
            .maybeSingle();

          if (purchaseRow) {
            const refundedEventId = purchaseRow.event_id as string;

            await supabaseAdmin
              .from('boost_purchases')
              .update({ status: 'refunded', refunded_at: new Date().toISOString() })
              .eq('id', purchaseRow.id as string);

            const { data: otherActive } = await supabaseAdmin
              .from('boost_purchases')
              .select('id')
              .eq('event_id', refundedEventId)
              .eq('status', 'completed')
              .neq('id', purchaseRow.id as string)
              .limit(1);

            if (!(otherActive?.length ?? 0)) {
              const { data: eventRow } = await supabaseAdmin
                .from('events')
                .select('id, boosted, boost_status')
                .eq('id', refundedEventId)
                .maybeSingle();

              if (eventRow?.boosted && eventRow?.boost_status === 'active') {
                await supabaseAdmin
                  .from('events')
                  .update({ boosted: false, boost_status: 'refunded' })
                  .eq('id', refundedEventId);
                console.log(`${logPrefix} Boost deactivated after refund: event=${refundedEventId}`);
              }
            }
          } else {
            console.warn(`${logPrefix} No boost_purchase found for refunded Apple tx=${tx.transactionId}`);
          }
        } else {
          await downgradeToFree(supabaseAdmin, userId, 'apple', 'refunded');
          await supabaseAdmin.from('subscriptions')
            .update({ status: 'canceled', revoked_at: new Date().toISOString() })
            .eq('original_transaction_id', tx.originalTransactionId);
          console.log(`${logPrefix} Subscription refund processed: user=${userId.slice(0,8)}`);
        }
        break;
      }

      // ── DID_CHANGE_RENEWAL_STATUS ─────────────────────────────────────────
      case ASSN_TYPE.DID_CHANGE_RENEWAL_STATUS: {
        const autoRenewOn = renewalInfo?.autoRenewStatus === 1;

        await supabaseAdmin.from('subscriptions')
          .update({ auto_renew_status: autoRenewOn, cancel_at_period_end: !autoRenewOn })
          .eq('original_transaction_id', tx.originalTransactionId);

        if (subtype === ASSN_SUBTYPE.AUTO_RENEW_DISABLED && tx.expiresDate) {
          const periodEndFmt = new Date(tx.expiresDate)
            .toLocaleDateString('en-JM', { month: 'short', day: 'numeric', year: 'numeric' });
          await supabaseAdmin.from('notifications').insert({
            user_id: userId,
            type:    'subscription_cancellation_scheduled',
            title:   'Subscription Set to Cancel',
            body:    `Your subscription will end on ${periodEndFmt}. Re-enable auto-renew in the App Store any time before then.`,
            read:    false,
          });
          void sendPushToUserIds(
            [userId],
            'Subscription Set to Cancel',
            `Your subscription will end on ${periodEndFmt}.`,
            undefined, 'subscription_cancellation_scheduled', supabaseAdmin, true,
          ).catch(() => {});
        }

        console.log(`${logPrefix} Auto-renew ${autoRenewOn ? 'enabled' : 'disabled'}: user=${userId.slice(0,8)}`);
        break;
      }

      // ── DID_CHANGE_RENEWAL_PREF ───────────────────────────────────────────
      // autoRenewProductId is the product the user will be charged for at next renewal.
      // We persist auto_renew_status so the eligibility endpoint can tell the client
      // a plan change is pending without waiting for DID_RENEW.
      // The effective tier in user_profiles is NOT changed here — it stays the current
      // entitlement period value until DID_RENEW fires with the new productId.
      case ASSN_TYPE.DID_CHANGE_RENEWAL_PREF: {
        const newProd = renewalInfo?.autoRenewProductId ?? 'unknown';
        const isDowngrade = subtype === ASSN_SUBTYPE.DOWNGRADE;
        const isUpgrade   = subtype === ASSN_SUBTYPE.UPGRADE;
        console.log(`${logPrefix} Renewal preference changed: user=${userId.slice(0,8)} newProduct=${newProd} downgrade=${isDowngrade} upgrade=${isUpgrade}`);

        if (renewalInfo) {
          // Write auto_renew_status so the UI can detect a pending plan change.
          // No new schema migration required — auto_renew_status already exists.
          const { error: prefErr } = await supabaseAdmin
            .from('subscriptions')
            .update({
              auto_renew_status:    renewalInfo.autoRenewStatus === 1,
              cancel_at_period_end: renewalInfo.autoRenewStatus !== 1,
            })
            .eq('original_transaction_id', tx.originalTransactionId);

          if (prefErr) {
            console.warn(`${logPrefix} Failed to persist renewal pref update:`, prefErr.message);
          } else {
            console.log(`${logPrefix} Renewal pref persisted: user=${userId.slice(0,8)} autoRenew=${renewalInfo.autoRenewStatus === 1}`);
          }
        }
        break;
      }

      // ── CONSUMPTION_REQUEST (ISSUE-018) ────────────────────────────────────
      case ASSN_TYPE.CONSUMPTION_REQUEST: {
        // Apple is asking for consumption data about a consumable boost refund request.
        // IMPORTANT: This is an informational request — it does NOT grant a refund.
        // The REFUND notification (above) is the authoritative refund event.
        //
        // We log the boost activation state so the data is available for support.
        // Full consumption reporting via PUT /inApps/v1/transactions/consumption/{txId}
        // requires App Store Connect API credentials. Contact Apple developer support
        // for implementation guidance when App Store Connect API is configured.
        if (!BOOST_PRODUCTS[tx.productId]) {
          console.log(`${logPrefix} CONSUMPTION_REQUEST for non-boost product ${tx.productId} — acknowledged`);
          break;
        }

        const boostType = BOOST_PRODUCTS[tx.productId];

        const { data: boostPurchase } = await supabaseAdmin
          .from('boost_purchases')
          .select('id, event_id, status, completed_at')
          .eq('apple_transaction_id', tx.transactionId)
          .maybeSingle();

        const wasActivated = boostPurchase?.status === 'completed';

        let eventBoostStatus: string | null = null;
        if (boostPurchase?.event_id) {
          const { data: eventRow } = await supabaseAdmin
            .from('events')
            .select('boost_status, boost_expires_at')
            .eq('id', boostPurchase.event_id)
            .maybeSingle();
          eventBoostStatus = eventRow?.boost_status ?? null;
        }

        console.log(
          `${logPrefix} CONSUMPTION_REQUEST: boost=${boostType} ` +
          `txId=${tx.transactionId.slice(-8)} user=${userId.slice(0,8)} ` +
          `activated=${wasActivated} boostStatus=${eventBoostStatus ?? 'unknown'} ` +
          `eventId=${boostPurchase?.event_id ?? 'none'}`
        );
        // Always return 200 to acknowledge Apple — avoid retry storms.
        break;
      }

      default: {
        console.log(`${logPrefix} Unhandled notification type — acknowledged: user=${userId.slice(0,8)}`);
        break;
      }
    }
  } catch (err) {
    console.error(`${logPrefix} Handler error (returning 200):`, String(err).slice(0, 300));
  }

  return new Response('OK', { status: 200 });
});
