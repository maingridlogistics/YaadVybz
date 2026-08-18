# VYBZ HUB — SUBSCRIPTION SYSTEM FORENSIC AUDIT

> **Date:** 2026-08-18  
> **Status:** Audit Only — No Code Changes  
> **Scope:** Complete end-to-end subscription system diagnosis

---

## A. CURRENT ARCHITECTURE (End-to-End Text Diagram)

```
USER TAPS SUBSCRIBE (upgrade.tsx)
    │
    ▼
handleAppleSubscribe()
    │ reads selectedTier + billing toggle → resolves appleProductId from SUBSCRIPTION_PLANS
    ▼
IAPContext.purchaseSubscription(productId, userId)
    │ sets isPurchasing=true, setPurchasingProductId
    ▼
purchaseAppleSubscription()  [iapService.native.ts]
    │
    ├─ foregroundPurchase() sets up:
    │     • _foregroundProductIds.add(productId)
    │     • one-shot purchaseUpdatedListener filtered to productId
    │     • purchaseErrorListener
    │     • 2-minute timeout
    │     • calls requestPurchase() — return value DISCARDED
    │
    ▼
StoreKit 2 presents payment sheet
    │
    ▼  (user approves)
purchaseUpdatedListener fires with Purchase object
    │
    ├─ resolveJWS(purchase): purchase.purchaseToken → JWS string
    │    [fallback: getTransactionJwsIOS(purchase.productId)]
    ▼
verifyAppleWithServer({ signedTransaction: jws, purchaseType: 'subscription' })
    │  POST /functions/v1/verify-apple-transaction
    │  Bearer: supabase access token
    ▼
verify-apple-transaction [Edge Function]
    │  1. Auth user from JWT
    │  2. Parse body
    │  3. verifyAppleJWS(signedTransaction) → AppleTransactionPayload
    │  4. Bundle ID check
    │  5. Sandbox guard (APPLE_REJECT_SANDBOX env)
    │  6. appAccountToken cross-check vs auth user.id
    │  7. Idempotency check (apple_transactions table)
    │  7b. Cross-provider eligibility guard
    │  8. Product ID → plan lookup
    │  9a. syncSubscriptionEntitlements() [THROWS on profile write failure]
    │      → user_profiles UPDATE (tier, status, period_end, etc.)
    │      → subscriptions UPSERT
    │      → events UPDATE (promoter_tier)
    │  → subscriptions UPSERT (second time — see DEFECT M-1)
    │  → apple_transactions INSERT (idempotency record)
    │  Return { ok: true, tier, environment }
    ▼
foregroundPurchase settle(result)
    │  if ok: finishTransaction()
    │  _foregroundProductIds.delete(productId)
    ▼
IAPContext: setLastPurchaseResult(result), setIsPurchasing(false)
    ▼
upgrade.tsx handleAppleSubscribe():
    │  if ok: poll eligibility up to 3× with 1.5s delays
    │         refreshProfile() + loadEligibility()
    │         Alert "You're all set"
    │  if error (not cancelled): Alert "Purchase Failed"
    ▼
AuthContext.refreshProfile() → fetchProfile() → supabase user_profiles SELECT *
    → setUser(mapProfileFromDb(row))  [includes subscription_tier, status, etc.]
    ▼
upgrade.tsx re-reads: currentTier = user?.subscriptionTier ?? 'free'
```

---

## B. FILES AND RESPONSIBILITIES

| File | Responsibility |
|---|---|
| `services/iapService.native.ts` | All StoreKit 2 interaction: init, product fetch, purchase, restore, background listener. The authoritative iOS IAP implementation. |
| `services/iapService.ts` | Metro fallback. Contains its own copy of purchase logic (non-native path). Used when `.native.ts` is absent. On iOS, the `.native.ts` extension takes precedence. |
| `contexts/IAPContext.tsx` | React context wrapping `iapService`. Manages `isPurchasing`, `isRestoring`, `lastPurchaseResult`. Non-iOS renders a no-op provider. |
| `hooks/useIAP.tsx` | Thin `useContext(IAPContext)` consumer hook. |
| `app/monetization/upgrade.tsx` | The plan selection screen. Manages `selectedTier`, `billing`, `eligibility`, all CTA handlers. Reads `currentTier` from `user?.subscriptionTier`. |
| `constants/data.ts` | `SUBSCRIPTION_PLANS` array with hardcoded prices and all 8 SKUs (4 Apple, 4 Google). |
| `constants/purchaseGate.ts` | `isAppleIAP`, `isGoogleIAP`, `GOOGLE_IAP_ENABLED=false` flag. |
| `services/subscriptionService.ts` | Client-side wrappers: `createSubscriptionCheckout`, `createCustomerPortalSession`, `checkSubscriptionEligibility`, `fetchSubscription`, `checkPostQuota`, `consumePostAllowance`, `useBoostCredit`. |
| `services/entitlementService.ts` | `getEntitlementSnapshot()`, `deriveEntitlementGates()` — reads from `user_profiles`. |
| `contexts/AuthContext.tsx` | Owns `user: UserProfile | null`. Profile is loaded via `fetchProfile()` on SIGNED_IN, TOKEN_REFRESHED, foreground return (60s throttle). `refreshProfile()` is exposed for screens to call after purchase. |
| `supabase/functions/verify-apple-transaction/index.ts` | Server-side Apple JWS verification. Writes entitlements. Returns `{ ok, tier, environment }`. |
| `supabase/functions/apple-iap-notifications/index.ts` | ASSN V2 webhook handler. Routes `SUBSCRIBED`, `DID_RENEW`, `EXPIRED`, `REFUND`, `REVOKE`, `DID_CHANGE_RENEWAL_STATUS`, `DID_CHANGE_RENEWAL_PREF`, `DID_FAIL_TO_RENEW`, `GRACE_PERIOD_EXPIRED`, `CONSUMPTION_REQUEST`. |
| `supabase/functions/check-subscription-eligibility/index.ts` | Returns cross-provider subscription state to the client UI. |
| `supabase/functions/_shared/entitlements.ts` | `syncSubscriptionEntitlements()` — writes `user_profiles`, `subscriptions`, `events`. `activateBoostEntitlement()`, `downgradeToFree()`, `resetBoostCredits()`. |
| `supabase/functions/_shared/subscriptionGuard.ts` | `checkSubscriptionEligibility()` — queries `subscriptions` and `user_profiles` to determine purchase eligibility. |
| `supabase/functions/_shared/appleJws.ts` | ES256 JWS signature verification against Apple's x5c cert chain. |

---

## C. PRODUCTS — ALL SKUs AND TIER MAPPING

### Subscription Products

Defined in 3 places: `constants/data.ts`, `services/iapService.native.ts`, `supabase/functions/verify-apple-transaction`, `supabase/functions/apple-iap-notifications`

| SKU | Platform | Tier | Cycle | Display Name in Code | Hardcoded Price (USD) | Where Defined |
|---|---|---|---|---|---|---|
| `com.vybzhub.subscription.promoter_pro.monthly` | Apple + Google | Pro | Monthly | "Pro" | $4.99/mo | `constants/data.ts` `SUBSCRIPTION_PLANS` |
| `com.vybzhub.subscription.promoter_pro.yearly` | Apple + Google | Pro | Yearly | "Pro" | $44.99/yr | `constants/data.ts` `SUBSCRIPTION_PLANS` |
| `com.vybzhub.subscription.elite.monthly` | Apple + Google | Elite | Monthly | "Elite" | $14.99/mo | `constants/data.ts` `SUBSCRIPTION_PLANS` |
| `com.vybzhub.subscription.elite.yearly` | Apple + Google | Elite | Yearly | "Elite" | $134.99/yr | `constants/data.ts` `SUBSCRIPTION_PLANS` |

### Boost Consumable Products

| SKU | Platform | Type | Hardcoded Price | Where Defined |
|---|---|---|---|---|
| `com.vybzhub.boost.three_day` | Apple + Google | 3-Day | $1.99 | `constants/data.ts` `BOOST_PACKAGES` |
| `com.vybzhub.boost.seven_day` | Apple + Google | 7-Day | $3.99 | `constants/data.ts` `BOOST_PACKAGES` |
| `com.vybzhub.boost.until_event_end` | Apple + Google | Until Event End | $6.99 | `constants/data.ts` `BOOST_PACKAGES` |

### Price Display

All subscription and boost prices are **hardcoded** in `constants/data.ts`. Native localized prices from StoreKit are fetched via `loadAllProducts()` → `subscriptionProducts[].localizedPrice`. The UI uses `getLocalizedPrice(plan)` which prefers `subscriptionProducts` when available and falls back to the hardcoded price. **If no products are returned from StoreKit (product not found in App Store Connect), the hardcoded price is displayed and the purchase button remains enabled.**

### Plans with no product configured

- `Free` tier has no product ID — correct, as it is absence of paid entitlement only.
- All 4 subscription SKUs and 3 boost SKUs have product IDs defined. Whether these are **configured in App Store Connect** cannot be proven from code — this is an external verification item.

---

## D. PURCHASE FLOW (Exact Current Sequence)

**Starting point: User taps "Subscribe with Apple" for Pro Monthly**

| Step | File | Function | Input | Output | Failure Behavior |
|---|---|---|---|---|---|
| 1 | `upgrade.tsx` | `handleAppleSubscribe` | `selectedTier='pro'`, `billing='monthly'` | Resolves `appleProductId = 'com.vybzhub.subscription.promoter_pro.monthly'` | If no product ID: `Alert('Not Available')` |
| 2 | `upgrade.tsx` | `handleAppleSubscribe` | `purchaseEligible` flag from eligibility check | Guards against already-active subscription | If ineligible: `Alert('Subscription Active', reason)` |
| 3 | `IAPContext.tsx` | `purchaseSubscription` | `(productId, userId)` | `isPurchasing=true`, `purchasingProductId=productId`, `lastPurchaseResult=null` | N/A |
| 4 | `iapService.native.ts` | `purchaseAppleSubscription` → `foregroundPurchase` | `productId, purchaseType='subs', userId` | `_foregroundProductIds.add(productId)` | N/A |
| 5 | `iapService.native.ts` | `foregroundPurchase` (internal) | `purchaseUpdatedListener` registration | One-shot listener filtered to `productId` | N/A |
| 6 | `iapService.native.ts` | `foregroundPurchase` (internal) | `purchaseErrorListener` registration | Error listener | N/A |
| 7 | `iapService.native.ts` | `foregroundPurchase` (internal) | `requestPurchase({...buildPurchaseRequest, type:'subs'})` | **DISCARDED** — StoreKit shows payment sheet | `.catch`: if user cancelled → `settle({ok:false, error:'Purchase cancelled'})`; other errors → `settle({ok:false, error})` |
| 8 | StoreKit 2 | (OS) | User approves payment | `purchaseUpdatedListener` fires with `Purchase` object containing `purchaseToken` (JWS) | User cancels → `purchaseErrorListener` fires with `ErrorCode.UserCancelled` |
| 9 | `iapService.native.ts` | `purchaseUpdatedListener` callback | `purchase` object, `pId === productId` | Calls `resolveJWS(purchase)` | If JWS absent: `settle({ok:false, error:'Transaction data unavailable for verification'})` |
| 10 | `iapService.native.ts` | `resolveJWS` | `purchase` | `extractIOSJWS(purchase)` reads `purchase.purchaseToken` | If null: tries `tryGetTransactionJwsIOS(purchase.productId)` |
| 11 | `iapService.native.ts` | `onVerify` (foreground subscription) | `jws` string | `verifyAppleWithServer({signedTransaction:jws, purchaseType:'subscription'})` | Returns `{ok:false, error}` |
| 12 | `iapService.native.ts` | `invokeVerify` | `supabase.functions.invoke('verify-apple-transaction', {body})` | `{ok, tier, environment}` | `FunctionsHttpError` → reads detail; returns `{ok:false, error}` |
| 13 | `verify-apple-transaction` Edge Function | (server) | JWT + `{signedTransaction, purchaseType}` | Writes entitlements, returns `{ok:true, tier, environment}` | Returns `{ok:false, error}` on any step failure |
| 14 | `iapService.native.ts` | `foregroundPurchase` `onVerify` | `result.ok === true` | `finishTransaction({purchase, isConsumable:false})` | If `finishTransaction` throws: `console.warn` only — result.ok is still returned |
| 15 | `iapService.native.ts` | `foregroundPurchase` | `settle(result)` | `_foregroundProductIds.delete(productId)`, cleanup listeners, resolve Promise | N/A |
| 16 | `IAPContext.tsx` | `purchaseSubscription` (finally) | — | `setIsPurchasing(false)`, `setPurchasingProductId(null)`, `setLastPurchaseResult(result)` | Finally block always runs — spinner always clears |
| 17 | `upgrade.tsx` | `handleAppleSubscribe` | `result.ok === true` | Polls eligibility up to 3× with 1.5s delays | — |
| 18 | `upgrade.tsx` | (poll) | `refreshProfile()` + `loadEligibility()` | Fetches fresh `user_profiles` row + eligibility endpoint | — |
| 19 | `upgrade.tsx` | (poll) | `checkSubscriptionEligibility('apple')` | If `inconsistent_entitlement` and `tries < 3`: waits 1.5s and retries | — |
| 20 | `upgrade.tsx` | `handleAppleSubscribe` | `result.ok === true` | `Alert("You're all set.")` | — |
| 21 | `AuthContext.tsx` | `refreshProfile` → `fetchProfile` | `user.id` | `user_profiles SELECT *` → `setUser(mapProfileFromDb(row))` | Error: silent, `user` state not updated |

---

## E. RESTORE FLOW (Exact Current Sequence)

| Step | File | Function | Details |
|---|---|---|---|
| 1 | `upgrade.tsx` | `handleRestorePurchases` | Calls `restorePurchases(user.id)` from `IAPContext` |
| 2 | `IAPContext.tsx` | `restorePurchases` | `setIsRestoring(true)` → calls `restoreApplePurchases(userId)` |
| 3 | `iapService.native.ts` | `restoreApplePurchases` | Calls `getAvailablePurchases()` — expo-iap method that returns previously purchased non-consumable/subscription items StoreKit thinks are active |
| 4 | `iapService.native.ts` | `restoreApplePurchases` | Filters by `SUBSCRIPTION_IDS_ARRAY.includes(pId)` — only subscription SKUs, no boosts |
| 5 | `iapService.native.ts` | `restoreApplePurchases` | For each qualifying purchase: calls `resolveJWS(purchase)` to get JWS |
| 6 | `iapService.native.ts` | `restoreApplePurchases` | Calls `verifyAppleWithServer({signedTransaction:jws, purchaseType:'subscription'})` |
| 7 | `verify-apple-transaction` | (server) | Full idempotency + verification flow. Returns `{ok:true, tier, cached:true}` if previously verified. |
| 8 | `iapService.native.ts` | `restoreApplePurchases` | Collects `restoredTier` from the first successful result |
| 9 | `IAPContext.tsx` | `restorePurchases` (finally) | `setIsRestoring(false)` |
| 10 | `upgrade.tsx` | `handleRestorePurchases` | If `result.ok && result.restoredTier`: `Alert('Restored!')` + `refreshProfile()` + `loadEligibility()` |
| 11 | `upgrade.tsx` | `handleRestorePurchases` | If `result.ok && !result.restoredTier`: `Alert('No Active Subscriptions')` |

**Critical finding for restore:** `getAvailablePurchases()` in expo-iap 5.1.0 is the equivalent of StoreKit's `currentEntitlements` query. If Apple returns an empty list (subscription expired, sandbox quirk, or SKU not recognized), `purchases` will be empty and the app correctly reports "No Active Subscriptions." Whether this accurately reflects Apple's actual state depends on StoreKit returning valid entries — this is a runtime dependency on App Store Connect and device state.

---

## F. APPLE → BACKEND VERIFICATION (Exact Sequence in `verify-apple-transaction`)

1. **Auth**: Bearer JWT → `supabase.auth.getUser(token)` → resolves `user.id`
2. **Body parse**: `{ signedTransaction, purchaseType, eventId? }`
3. **JWS verification**: `verifyAppleJWS(signedTransaction)` → ES256 signature check against Apple x5c cert chain → `AppleTransactionPayload`
4. **Bundle ID check**: `tx.bundleId === 'com.chambex.vybzhub'` (hardcoded fallback + `APPLE_BUNDLE_ID` env var)
5. **Sandbox guard**: `tx.environment === 'Sandbox'` + `APPLE_REJECT_SANDBOX` env check. **Default behavior: Sandbox accepted** (env var not set = false)
6. **appAccountToken check**: `tx.appAccountToken.toLowerCase().replace(/-/g,'')` must equal `user.id`. Absent token: warns but does NOT reject (Ask-to-Buy / legacy restore path)
7. **Idempotency**: `checkAppleTransactionIdempotency(supabaseAdmin, tx.transactionId)` → queries `apple_transactions.transaction_id`. Hit → returns cached ok
8. **Cross-provider eligibility**: `checkSubscriptionEligibility(supabaseAdmin, user.id, 'apple')`. Same-Apple provider: allowed to continue. Different provider: blocked
9. **Product ID validation**: `SUBSCRIPTION_PRODUCTS[tx.productId]` or `BOOST_PRODUCTS[tx.productId]`
10. **Subscription activation**:
    - `syncSubscriptionEntitlements()` — writes `user_profiles`, `subscriptions`, `events`. **THROWS on profile write failure**
    - `subscriptions.upsert()` — **second upsert** (first was inside `syncSubscriptionEntitlements`)
    - `apple_transactions.insert()` — idempotency record
    - Returns `{ ok: true, environment, tier }`
11. **Error at any step**: returns `{ ok: false, error }` — client does NOT call `finishTransaction`

**Backend APIs used:** None external. JWS is verified cryptographically locally using the cert chain embedded in the token itself. There is no call to Apple's App Store Server API in `verify-apple-transaction`. Renewal info is not fetched; `expiresDate` comes from the JWS payload directly.

---

## G. SERVER NOTIFICATIONS (`apple-iap-notifications`)

### Handled

| Notification Type | Subtype Variants | What Is Written |
|---|---|---|
| `SUBSCRIBED` | INITIAL_BUY, RESUBSCRIBE | `user_profiles` UPDATE (tier/status/period_end), `subscriptions` UPSERT |
| `DID_RENEW` | BILLING_RECOVERY | Full `syncSubscriptionEntitlements()`, `resetBoostCredits()`, `subscriptions` UPDATE |
| `DID_FAIL_TO_RENEW` | GRACE_PERIOD | `user_profiles.subscription_status = 'past_due'`, `subscriptions.status = 'past_due'`, push notification |
| `GRACE_PERIOD_EXPIRED` | — | `downgradeToFree()` → tier='free', `subscriptions.status = 'canceled'` |
| `EXPIRED` | VOLUNTARY, BILLING_RETRY | `downgradeToFree()`, `subscriptions.status = 'canceled'` |
| `REVOKE` | — | `downgradeToFree()`, `subscriptions.status = 'canceled'`, `revoked_at` |
| `REFUND` | — | Subscription: `downgradeToFree()`. Boost: deactivates event boost |
| `DID_CHANGE_RENEWAL_STATUS` | AUTO_RENEW_DISABLED, AUTO_RENEW_ENABLED | `subscriptions.auto_renew_status`, `subscriptions.cancel_at_period_end`. Sends notification if disabled |
| `DID_CHANGE_RENEWAL_PREF` | DOWNGRADE, UPGRADE | **Console log only — no DB write** |
| `CONSUMPTION_REQUEST` | — | Console log only |
| `TEST` | — | Console log only |

### NOT Handled / Missing

| Missing | Impact |
|---|---|
| `DID_CHANGE_RENEWAL_PREF` writes nothing to DB | **Pro→Elite or Elite→Pro plan changes queued through Apple are logged only. The tier change takes effect at renewal (via `DID_RENEW`), but no "pending upgrade" state is written. The app cannot show "Your plan will change to Elite at next renewal."** |
| `OFFER_REDEEMED` | Free trial offer activations not processed |
| `PRICE_INCREASE` | User consent tracking not implemented |
| `ONE_TIME_CHARGE` | Non-renewable purchases not handled |
| `RENEWAL_EXTENDED` / `RENEWAL_EXTENSION` | No response |
| `REFUND_DECLINED` | No response |

### `DID_CHANGE_RENEWAL_STATUS` behaviour note

When user cancels auto-renewal in App Store, `cancel_at_period_end` is written to `subscriptions` table only. `user_profiles.subscription_status` remains 'active'. The `AppleManageCard` component reads from `eligibility.activeSubscription.cancelAtPeriodEnd` which comes from the `subscriptions` table — so it displays correctly. `currentTier` in `upgrade.tsx` reads from `user?.subscriptionTier` (AuthContext → `user_profiles`) which stays 'active' until EXPIRED fires. **This is correct behaviour** — tier stays active until period ends. Not a defect.

---

## H. SUPABASE STATE — ALL FIELDS, WRITERS, READERS

### `user_profiles` (authoritative entitlement record)

| Column | Type | Who Writes | When | Who Reads | Authoritative? |
|---|---|---|---|---|---|
| `subscription_tier` | text | `syncSubscriptionEntitlements()`, `downgradeToFree()` | Purchase, renewal, ASSN V2 notification | `AuthContext.fetchProfile()` → `user.subscriptionTier` → `upgrade.tsx` `currentTier` | **YES — primary** |
| `subscription_status` | text | `syncSubscriptionEntitlements()`, `downgradeToFree()`, `DID_FAIL_TO_RENEW` handler | Purchase, renewal, billing failure, expiry | `AuthContext.fetchProfile()` → `user.subscriptionStatus` → `entitlementService` gates | YES |
| `current_period_end` | timestamptz | `syncSubscriptionEntitlements()`, `downgradeToFree()` (sets null), `resetBoostCredits()` | Purchase, renewal, expiry | `AuthContext.fetchProfile()` → `user.currentPeriodEnd` | YES |
| `monthly_boost_allowance` | int | `syncSubscriptionEntitlements()` | Purchase, renewal | `AuthContext` → `user.monthlyBoostAllowance` | YES |
| `remaining_boosts` | int | `syncSubscriptionEntitlements()` (on plan change), `resetBoostCredits()` (on renewal), `use-boost-credit` RPC | Plan change, renewal, credit redemption | `AuthContext` → `user.remainingBoosts` | YES |
| `featured_priority` | int | `syncSubscriptionEntitlements()` | Plan change | `eventSearchService`, `AuthContext` | YES |
| `verified_promoter` | bool | `admin_set_verified_promoter()` RPC only | Admin action | `AuthContext` → `user.verifiedPromoter` | YES — admin-only |
| `apple_original_transaction_id` | text | `syncSubscriptionEntitlements()` (apple path) | Purchase/renewal | `entitlementService.getEntitlementSnapshot()` (provider inference) | YES |
| `stripe_customer_id` | text | Stripe webhook → `syncSubscriptionEntitlements()` | Stripe purchase | `AuthContext` → `user.stripeCustomerId` | YES |
| `google_purchase_token` | text | `syncSubscriptionEntitlements()` (google path) | Google purchase | `entitlementService` | YES |

### `subscriptions` (provider ledger)

| Column | Who Writes | When | Who Reads |
|---|---|---|---|
| All columns | `syncSubscriptionEntitlements()`, ASSN V2 notification handlers, `verify-apple-transaction` (second upsert), Stripe webhook | Purchase, renewal, notification | `subscriptionGuard.checkSubscriptionEligibility()` → `check-subscription-eligibility` Edge Function → `upgrade.tsx` |
| `cancel_at_period_end` | `DID_CHANGE_RENEWAL_STATUS` handler | User cancels auto-renew | `eligibility.activeSubscription.cancelAtPeriodEnd` → `AppleManageCard` |
| `auto_renew_status` | `syncSubscriptionEntitlements()`, `DID_CHANGE_RENEWAL_STATUS` | Purchase, renewal, user toggle | `subscriptionGuard` |

### `apple_transactions` (idempotency ledger)

| Who Writes | When | Who Reads |
|---|---|---|
| `recordAppleTransaction()` in `verify-apple-transaction` | After all entitlement writes succeed | `checkAppleTransactionIdempotency()` in same function before any writes |

---

## I. UI STATE — HOW EVERYTHING IS DETERMINED

### `currentTier` (what plan is shown as "Active")
```
upgrade.tsx: const currentTier = user?.subscriptionTier ?? 'free'
             user comes from AuthContext → user_profiles.subscription_tier
```
**Source: `user_profiles.subscription_tier` read at last `fetchProfile()` call.**

### `selectedTier` (which card has the radio selected)
```
upgrade.tsx: const [selectedTier, setSelectedTier] = useState<SubscriptionTier>(currentTier)
```
Initialized to `currentTier` on mount. When user taps a different plan card, `setSelectedTier(plan.tier)` fires immediately. The UI visually shows the card as "Selected" **before any purchase occurs**. This is intentional UX — tapping a card highlights it.

### `isPurchasing` spinner
Set `true` in `IAPContext.purchaseSubscription` → cleared in `finally` block. **All exit paths clear the spinner** because the `finally` block is unconditional.

### `isRestoring` spinner
Set `true` in `IAPContext.restorePurchases` → cleared in `finally` block. **All exit paths clear it.**

### `eligibility` / `hasActivePaidSub`
```
upgrade.tsx: const [eligibility, setEligibility] = useState(null)
             loaded by loadEligibility() → checkSubscriptionEligibility(provider)
             → check-subscription-eligibility Edge Function
             → subscriptionGuard reads subscriptions + user_profiles tables
```
**Source: subscriptions table cross-referenced with user_profiles.**

### `purchaseEligible`
```
upgrade.tsx: const purchaseEligible = eligibility?.eligible ?? !hasActivePaidSub
```
If `eligibility` is null (still loading or failed), this falls back to `!hasActivePaidSub` which itself defaults to false. **During eligibility load, `purchaseEligible` is `true` by default if no eligibility data exists — this could allow a purchase attempt before the server confirms ineligibility.**

### CTA button disabled state
```
ctaDisabled = isLoadingEligibility || isCtaLoading || isRestoring || isLoadingProducts ||
              (!purchaseEligible && isCrossProviderActive) ||
              (selectedPlanIsCurrentTier && !hasActivePaidSub && selectedTier === 'free')
```
While `isLoadingEligibility=true` the button is disabled. After eligibility loads, it depends on the computed flags above.

---

## J. PLAN SWITCHING — PRO → ELITE AND ELITE → PRO

### Pro → Elite (upgrade within same provider)

1. User is on Pro. `currentTier = 'pro'`. `selectedTier` initialized to `'pro'`.
2. User taps Elite card → `setSelectedTier('elite')`.
3. User taps "Subscribe with Apple" → `handleAppleSubscribe` runs.
4. `purchaseEligible` check: `eligibility.eligible` is `false` because user has active Pro (same provider). The code path blocks:
   ```js
   if (!purchaseEligible) {
     Alert.alert('Subscription Active', eligibility?.reason ?? '...');
     return;
   }
   ```
5. **No upgrade purchase is initiated.** The user is shown "You already have an active Pro subscription billed through Apple App Store."
6. User is directed to "Manage in App Store" which is Apple's own UI for plan switching.

This is correct behaviour for StoreKit 2 subscription groups — upgrades happen through Apple's UI. However, the UX is confusing: selecting Elite and tapping Subscribe shows a blocking alert instead of routing to Apple Manage Subscriptions directly.

### Elite → Pro (downgrade within same provider)

Same path as above — `purchaseEligible` is false, user gets the "Subscription Active" alert, is directed to "Manage in App Store." Apple handles the scheduled downgrade at renewal.

**Neither Pro→Elite nor Elite→Pro triggers a new IAP purchase from the app.** Both are handled entirely through Apple's UI after the user taps "Manage in App Store."

**The app has no concept of a "pending tier change."** When the user returns from Apple Manage and `DID_CHANGE_RENEWAL_PREF` fires, the notification handler logs but **writes nothing to the database**. The displayed tier will remain unchanged until `DID_RENEW` fires at the next billing date with the new `productId`.

---

## K. SANDBOX HANDLING

- **Sandbox accepted by default**: `APPLE_REJECT_SANDBOX` env var is not set to `'true'` in the configured secrets list → Sandbox transactions are processed identically to production.
- JWS verification: `verifyAppleJWS()` applies the same ES256 signature verification. Apple signs Sandbox JWS with the same cert chain structure as production but from Sandbox CAs. The root fingerprint check in `appleJws.ts` will warn if the Sandbox root is not in `APPLE_ROOT_CA_SHA256` but **does not throw** — it's defensive-in-depth only and the purchase proceeds.
- `environment` field is stored in `apple_transactions.environment` and `subscriptions.environment` for audit purposes.
- Sandbox subscriptions follow compressed renewal cycles (1 min, 5 min, etc.) — the `expiresDate` in the JWS will have a very short window, causing `current_period_end` to expire within minutes. On next foreground return (60s throttle in AuthContext), `fetchProfile` re-reads `user_profiles` which still shows `active` because only ASSN V2 `EXPIRED` notification downgrades the tier — **no client-side date comparison is done**.

---

## L. USER BINDING — HOW TRANSACTIONS MAP TO VYBZ HUB USERS

**Primary binding: `appAccountToken`**
- Set during purchase: `buildPurchaseRequest` includes `apple: { appAccountToken: userId.toLowerCase() }`.
- On server: `tx.appAccountToken` is compared to `auth.uid()` from the Bearer JWT.
- If they match: purchase proceeds.
- If absent: warning is logged, check is skipped (Ask-to-Buy / legacy restore path).

**Secondary binding (ASSN V2 notifications only, in `resolveUserFromTransaction`)**:
1. `tx.appAccountToken` → direct `user_profiles.id` lookup
2. `tx.originalTransactionId` → `subscriptions.original_transaction_id` → `user_id`
3. `tx.originalTransactionId` → `user_profiles.apple_original_transaction_id` → `id`

**Restore binding:**
`restoreApplePurchases` calls `getAvailablePurchases()` which returns StoreKit-local purchases for the **currently signed-in Apple ID**. The app then verifies each one server-side, which re-checks `appAccountToken` against the current Supabase user. If a user restores on a device signed into a different Apple ID than the original purchase, StoreKit won't return those purchases. If the **same Apple ID** is on a device where a **different Vybz Hub account** is logged in, the `appAccountToken` mismatch check on the server would reject the restore (403 response). However, if `appAccountToken` is absent in an older transaction, it is skipped — this creates a theoretical path where an old purchase without `appAccountToken` could be verified and credited to the wrong Vybz Hub account.

---

## M. CONFIRMED DEFECTS (Proven from Code)

---

### DEFECT M-1: Double `subscriptions` Upsert in `verify-apple-transaction`

**SEVERITY:** REAL DEFECT (low immediate risk, audit/data concern)

**FILE:** `supabase/functions/verify-apple-transaction/index.ts`

**CURRENT BEHAVIOR:**
`syncSubscriptionEntitlements()` in `_shared/entitlements.ts` already performs a `subscriptions.upsert()` internally. Then `verify-apple-transaction` immediately performs a **second** `subscriptions.upsert()` after `syncSubscriptionEntitlements()` returns (the block with `billing_cycle: subConfig.cycle`). The first upsert writes `billing_cycle: 'monthly'` as a hardcoded default. The second upsert writes the correct `subConfig.cycle`.

**WHY WRONG:**
The first upsert in `syncSubscriptionEntitlements` uses `billing_cycle: 'monthly'` hardcoded. The second one (in `verify-apple-transaction`) correctly uses `subConfig.cycle` which can be 'yearly'. Since both use `onConflict: 'original_transaction_id'`, the second write wins. The billing cycle is ultimately correct in the DB. However, the first write fires for no reason. For yearly subscribers, the subscriptions row briefly holds `billing_cycle='monthly'` before the second write corrects it — a race window exists if `check-subscription-eligibility` is called between the two writes.

**USER IMPACT:** For yearly subscriptions, there is a brief window where `subscriptions.billing_cycle='monthly'` which could cause the UI to show "Monthly" for a Yearly subscriber if eligibility is checked at exactly that moment.

---

### DEFECT M-2: `requestPurchase` argument shape may not match expo-iap 5.1.0 expected shape

**SEVERITY:** VALIDATION ITEM

**FILE:** `services/iapService.native.ts`, `services/iapService.ts`

**CURRENT BEHAVIOR:**
```typescript
requestPurchase({
  ...buildPurchaseRequest(productId, userId),
  type: purchaseType,
} as unknown as Parameters<typeof requestPurchase>[0])
```
`buildPurchaseRequest` returns `{ request: { apple: { sku, appAccountToken, andDangerouslyFinishTransactionAutomatically }, google: { skus, obfuscatedAccountIdAndroid } } }`. The spread of this into a flat object with `type` at the top level may not match what expo-iap 5.1.0 expects. The `as unknown` cast suppresses TypeScript errors but does not guarantee runtime correctness.

**WHY WRONG:** If expo-iap 5.1.0 `requestPurchase` expects `{ sku, appAccountToken }` at the top level rather than nested under `request.apple`, the `appAccountToken` is never sent to StoreKit, breaking the user binding that prevents transaction replay across accounts.

**USER IMPACT:** If `appAccountToken` is not transmitted, the server skips the account binding check (it only warns, not rejects, when absent). This creates a security gap where a stolen JWS could be used by a different user.

---

### DEFECT M-3: `entitlementService.ts` infers payment provider from column presence — not from `subscriptions` table

**SEVERITY:** REAL DEFECT

**FILE:** `services/entitlementService.ts` `getEntitlementSnapshot()`

**CURRENT BEHAVIOR:**
```typescript
if (profile.apple_original_transaction_id) paymentProvider = 'apple';
else if (profile.stripe_customer_id) paymentProvider = 'stripe';
else if (tier !== 'free') paymentProvider = 'admin';
```

**WHY WRONG:** A user who had an Apple subscription, cancelled it, and started a Stripe subscription will have `apple_original_transaction_id` still set AND `stripe_customer_id` set. The function would incorrectly infer `paymentProvider = 'apple'` (apple check runs first).

**USER IMPACT:** Any screen consuming `getEntitlementSnapshot().paymentProvider` would show "Apple" as the provider even for a user on Stripe. No current screen appears to use this field for critical logic — but it is a latent defect.

---

### DEFECT M-4: `DID_CHANGE_RENEWAL_PREF` notification writes nothing to DB

**SEVERITY:** REAL DEFECT

**FILE:** `supabase/functions/apple-iap-notifications/index.ts`

**CURRENT BEHAVIOR:** The handler logs the new product ID and does nothing else.

**WHY WRONG:** When a user upgrades Pro→Elite through Apple's UI, Apple sends `DID_CHANGE_RENEWAL_PREF` with `subtype=UPGRADE`. The upgrade takes effect at the next renewal (when `DID_RENEW` fires with the new product). But if there is a **same-day** upgrade and no renewal fires soon, the app never reflects the pending plan change.

**USER IMPACT:** User upgrades to Elite through Apple Manage Subscriptions. App continues to show Pro until the next billing cycle when `DID_RENEW` fires. This explains "Pro→Elite transition discrepancy" from physical test results. Severity: user-facing but not a billing error.

---

### DEFECT M-5: `purchaseEligible` defaults to `true` during eligibility loading

**SEVERITY:** REAL DEFECT

**FILE:** `app/monetization/upgrade.tsx`

**CURRENT BEHAVIOR:**
```typescript
const purchaseEligible = eligibility?.eligible ?? !hasActivePaidSub;
```
When `eligibility` is null (first load or after error), `eligibility?.eligible` is `undefined`, so this evaluates to `!hasActivePaidSub` which is `!(false)` = `true`. The CTA button is disabled while `isLoadingEligibility=true`, so in practice this doesn't cause a premature purchase. However if the eligibility load **fails silently** (network error, edge function error where `data` is null but no error is set), `isLoadingEligibility` goes to `false` and `eligibility` stays `null`, making `purchaseEligible=true` even for a user who already has an active subscription.

**WHY WRONG:** If `checkSubscriptionEligibility` call fails, the screen allows purchase for a user who should be blocked.

**USER IMPACT:** A user with an active subscription whose eligibility check fails would see the Subscribe button enabled and could initiate a duplicate purchase attempt, which Apple would reject with "already subscribed" — triggering the stuck spinner scenario described in the test results.

---

### DEFECT M-6: `GOOGLE_IAP_ENABLED=false` but `IAPContext` renders `IAPProviderNative` on Android

**SEVERITY:** REAL DEFECT

**FILE:** `contexts/IAPContext.tsx`

**CURRENT BEHAVIOR:**
```typescript
if (Platform.OS !== 'ios') {
  return <IAPContext.Provider value={defaultContext}>{children}</IAPContext.Provider>;
}
return <IAPProviderNative>{children}</IAPProviderNative>;
```
The guard is `!== 'ios'`, so Android gets `defaultContext`. This part is correct. However, `purchaseGate.ts` defines `isGoogleIAP: boolean = Platform.OS === 'android' && GOOGLE_IAP_ENABLED`. Since `GOOGLE_IAP_ENABLED=false`, `isGoogleIAP=false`, so `handleGoogleSubscribe` is never called. This is safe in current state. But the Android `IAPContext` silently discards any native IAP call — **no error is surfaced to Android users** if the gate logic is accidentally enabled.

**USER IMPACT:** None currently (`GOOGLE_IAP_ENABLED=false`). Risk if flag is set to `true` without implementing the Android IAP context.

---

### DEFECT M-7: `setupTransactionListener` in `IAPContext` passes empty string as `userId`

**SEVERITY:** REAL DEFECT (background/Ask-to-Buy path broken)

**FILE:** `contexts/IAPContext.tsx`

**CURRENT BEHAVIOR:**
```typescript
const removeListener = setupTransactionListener(
  '',     // userId not available at context level — screens provide it
  (result) => { if (mounted) setLastPurchaseResult(result); },
);
```

`setupTransactionListener` accepts `_userId` (underscore = unused). The background listener code for boosts:
```typescript
} else if (eventId) {
  result = await verifyAppleWithServer({...eventId});
} else {
  // Background listener has no event context for boosts — cannot verify.
  console.warn('background listener: no eventId for boost product');
  return;
}
```
Boost transactions received in background (Ask-to-Buy approved, app was backgrounded during purchase) will be **silently dropped** — the transaction is left unfinished. StoreKit will re-deliver on next launch. For **subscriptions** (the critical path), `eventId` is not needed, so background subscription verification works correctly.

**USER IMPACT:** If a boost purchase is approved via Ask-to-Buy while the app is backgrounded, it is not processed until the next app launch and the screen for that event is opened. Low-frequency scenario.

---

## N. LIKELY CAUSES OF PHYSICAL TEST RESULTS

### 1. Apple active but Vybz Hub says Free

**Most likely cause:** The most common trigger is `syncSubscriptionEntitlements()` failing silently in a previous code version (before the current `throw` fix was implemented). The `subscriptions` table row was written (because the upsert runs after profile update), but `user_profiles.subscription_tier` remained `'free'`. This creates the `inconsistent_entitlement` state in `subscriptionGuard`.

With the current code (post-fix), the throw propagates and `verify-apple-transaction` returns `{ ok: false }`. The user sees "Purchase Failed" but the transaction is NOT finished. On next restore or re-purchase, `verify-apple-transaction` will retry the full flow, write the profile correctly, and return `ok:true`.

**Secondary cause:** `fetchProfile()` in `AuthContext` is throttled at 60 seconds on foreground return. If the user purchases, the subscription webhook fires and updates `user_profiles`, but the app hasn't refreshed the profile yet, showing the stale "Free" tier. This resolves on next foreground refresh or explicit `refreshProfile()` call.

**Third cause:** ASSN V2 `SUBSCRIBED` notification may not have fired yet (delivery latency from Apple's servers can be minutes). If the user purchased successfully but the notification hasn't arrived, and the client-side verification also failed, the profile remains Free.

### 2. Restore says No Active Subscriptions

**Confirmed code-level causes:**
- `getAvailablePurchases()` returns subscriptions that StoreKit considers currently entitling. If the Sandbox subscription has expired (Sandbox billing periods are minutes long), StoreKit will not return it.
- If the SKU is not registered in App Store Connect as an active subscription, StoreKit will not return it in available purchases.
- If `appAccountToken` is absent in the restored transaction and the server's `resolveJWS` returns null (no JWS on an old/restored purchase), the restore loop `continue`s silently and `restoredTier` is never set.
- **Critical confirmed defect:** The idempotency cache returns `{ok:true, cached:true}` without a `tier` field. The restore loop checks `result.ok && result.tier` — `result.tier` is `undefined` — so `restoredTier` is never set, and the user gets "No Active Subscriptions" even though the server returns `ok:true`. This is a release blocker for restore functionality.

### 3. "You're currently subscribed" (Apple's dialog)

This is a **native StoreKit dialog**, not an app Alert. It fires when `requestPurchase` is called for a product that Apple already considers entitling for this Apple ID. This happens when:
- The user is already subscribed and tries to purchase again (e.g., clicked the button while `purchaseEligible` was incorrectly `true` per Defect M-5).
- The eligibility check failed or hadn't loaded yet, allowing the CTA to be tapped.

When this dialog fires, StoreKit does **not** call `purchaseUpdatedListener` with a normal purchase result. Instead it triggers `purchaseErrorListener` with a specific error code. In the current code, `purchaseErrorListener` calls `settle({ok:false, error})` and the `finally` block clears `isPurchasing`. The user sees "Purchase Failed" with Apple's error message — confusing UX because the user IS subscribed.

### 4. Purchasing spinner stuck

Three identified code paths:

**Path A (fixed by current code):** The old `iapService.native.ts` called `requestPurchase` and cast its return as `Purchase`. The cast returned an incomplete object, `extractIOSJWS` returned null, the function returned `{ok:false}` immediately. But the `finally` block in `IAPContext.purchaseSubscription` was present — so the spinner should have cleared. The "stuck" perception was the 2-minute timeout window before the listener settled.

**Path B (current risk):** If `requestPurchase` throws AND the `purchaseErrorListener` fires simultaneously, `settle()` is called twice. The `settled` flag prevents double-resolve. The `finally` block in `IAPContext` always fires. **Spinner clears correctly.**

**Path C (current risk — Defect M-5):** If `checkSubscriptionEligibility` fails, `isLoadingEligibility` goes to `false` while `eligibility` is `null`. The user taps Subscribe, `isPurchasing` goes `true`. Apple returns "already subscribed" via `purchaseErrorListener`. `settle({ok:false, error})` fires. `finally` block clears `isPurchasing`. Spinner clears but failed alert appears.

**Most likely actual "stuck" scenario:** If `requestPurchase` resolves immediately (on the "already-subscribed" case) but `purchaseUpdatedListener` never fires, the 2-minute timeout in `foregroundPurchase` would eventually settle with `{ok:false}`. During those 2 minutes the spinner is shown. This is the most likely "stuck" behaviour observed.

### 5. Pro→Elite transition discrepancy

Direct cause: **Defect M-4**. `DID_CHANGE_RENEWAL_PREF` fires on the server when the user changes plan in Apple Manage Subscriptions. The handler logs but writes nothing. The app continues showing Pro until `DID_RENEW` fires at the next billing cycle with the Elite product ID, which triggers `syncSubscriptionEntitlements` with `plan='elite'`. In Sandbox testing (billing cycles of minutes), this is less visible. In production (monthly billing), the user would see Pro for up to a full month after upgrading to Elite via Apple's UI.

---

## O. REQUIRED FIX PLAN (Ordered, Not Implemented)

| # | Issue | Classification | Priority |
|---|---|---|---|
| 1 | **Restore returns `{ok:true, cached:true}` without `tier` field — "No Active Subscriptions" for verified users** | RELEASE BLOCKER | 1 |
| 2 | **`appAccountToken` shape in `buildPurchaseRequest` — verify it reaches StoreKit correctly (M-2)** | RELEASE BLOCKER | 2 |
| 3 | **`DID_CHANGE_RENEWAL_PREF` handler must write pending plan change to DB (M-4)** | REAL DEFECT | 3 |
| 4 | **Double `subscriptions` upsert in `verify-apple-transaction` — first upsert in `syncSubscriptionEntitlements` hardcodes `billing_cycle:'monthly'` (M-1)** | REAL DEFECT | 4 |
| 5 | **`purchaseEligible` defaults to `true` on eligibility load failure — disable CTA on null eligibility (M-5)** | REAL DEFECT | 5 |
| 6 | **`entitlementService.ts` provider inference uses column presence instead of `subscriptions` table (M-3)** | REAL DEFECT | 6 |
| 7 | **`setupTransactionListener` background path silently drops background boost purchases (M-7)** | REAL DEFECT | 7 |
| 8 | **Apple Root CA G2 fingerprint in `appleJws.ts` is a placeholder value — verify actual fingerprint** | VALIDATION ITEM | 8 |
| 9 | **Verify all 4 subscription product IDs are active in App Store Connect** | VALIDATION ITEM | 9 |
| 10 | **Verify ASSN V2 endpoint is configured in App Store Connect with correct URL** | VALIDATION ITEM | 10 |
| 11 | **`GOOGLE_IAP_ENABLED=false` gate — ensure Android IAP context is implemented before setting to true** | OPTIONAL HARDENING | 11 |
| 12 | **`DID_FAIL_TO_RENEW` with `GRACE_PERIOD` subtype: consider keeping tier active (not just status change) during grace period** | OPTIONAL HARDENING | 12 |
| 13 | **Pending plan change UI: show "Upgrading to Elite at next renewal" based on `DID_CHANGE_RENEWAL_PREF` DB write** | OPTIONAL HARDENING | 13 |

---

## P. EXTERNAL APP STORE CONNECT ITEMS TO VERIFY

> These cannot be proven from code inspection alone.

| Item | Why Required |
|---|---|
| All 4 subscription SKUs are configured, approved, and in "Ready to Submit" / "Approved" state in App Store Connect | `getAvailablePurchases()` and `fetchProducts()` return empty if SKUs don't exist |
| Pro and Elite subscriptions are in the **same Subscription Group** | StoreKit requires same-group membership for upgrades/downgrades via `DID_CHANGE_RENEWAL_PREF`. If they are in separate groups, cross-plan switching is not possible at the Apple level |
| ASSN V2 notifications endpoint is configured to `https://twilfdbvrzhlnllcmssc.supabase.co/functions/v1/apple-iap-notifications` in App Store Connect → App Information → Notifications | Without this, `DID_RENEW`, `EXPIRED` etc. never fire — expiration recovery fails |
| ASSN V2 is configured for **both Production and Sandbox** URLs | Sandbox testing requires a separate Sandbox URL in App Store Connect |
| `APPLE_BUNDLE_ID` secret in Supabase is set to the exact bundle ID used in the production build | Mismatch causes every transaction to be rejected at step 4 of `verify-apple-transaction` |
| Push Notifications capability is enabled in the provisioning profile for the production build | Required for `DID_FAIL_TO_RENEW` push alerts to deliver |
| App Store Connect In-App Purchases → Yearly products use the correct price tiers matching code (`$44.99`, `$134.99`) | Price mismatch is not a code error but causes user confusion |
| `getTransactionJwsIOS` export is confirmed available or absent in expo-iap 5.1.0 | Cannot be proven from code alone — requires inspecting the installed node_modules |
| Sandbox test account has not exceeded the 6 Sandbox subscription renewal limit per Apple ID | After 6 sandbox renewals Apple stops renewing — "Restore" will return empty |
