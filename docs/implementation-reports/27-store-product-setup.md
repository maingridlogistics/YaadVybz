# VYBZ HUB — PHASE 27: APP STORE + GOOGLE PLAY PRODUCT SETUP

## STATUS
NEEDS USER ACTION — All items require App Store Connect / Google Play Console access

## PRODUCT SKU MATRIX

### Subscriptions

| Product | iOS SKU | Android SKU | Status |
|---------|---------|-------------|--------|
| Pro Monthly ($4.99) | `com.chambex.vybzhub.pro.monthly` | same | NEEDS STORE CONFIG |
| Pro Yearly ($49.99) | `com.chambex.vybzhub.pro.yearly` | same | NEEDS STORE CONFIG |
| Elite Monthly ($14.99) | `com.chambex.vybzhub.elite.monthly` | same | NEEDS STORE CONFIG |
| Elite Yearly ($149.99) | `com.chambex.vybzhub.elite.yearly` | same | NEEDS STORE CONFIG |

### Boost IAPs (Consumables)

| Product | iOS SKU | Android SKU | Status |
|---------|---------|-------------|--------|
| 3-Day Event Boost | `com.chambex.vybzhub.boost.event.3day` | same | NEEDS STORE CONFIG |
| 7-Day Event Boost | `com.chambex.vybzhub.boost.event.7day` | same | NEEDS STORE CONFIG |
| Until Event End | `com.chambex.vybzhub.boost.event.end` | same | NEEDS STORE CONFIG |
| 3-Day Business Boost | `com.chambex.vybzhub.boost.biz.3day` | same | NEEDS STORE CONFIG |
| 7-Day Business Boost | `com.chambex.vybzhub.boost.biz.7day` | same | NEEDS STORE CONFIG |

## CODE REFERENCES
- `services/iapService.native.ts` — product IDs referenced
- `supabase/functions/verify-apple-transaction/` — validates Apple receipts
- `supabase/functions/verify-google-purchase/` — validates Google receipts
- `supabase/functions/apple-iap-notifications/` — handles Apple server notifications
- `supabase/functions/google-play-notifications/` — handles Google RTDN

## USER ACTION REQUIRED

### App Store Connect
1. Create each subscription group and product with exact SKUs above
2. Set pricing (USD base, auto-convert)
3. Configure subscription offers if any
4. Register webhook for App Store Server Notifications (URL: your Edge Function endpoint)

### Google Play Console
1. Create subscription products with exact SKUs above
2. Set pricing in base plan
3. Register RTDN subscription (URL: your Edge Function endpoint)

### Both Stores
- Enable sandbox/internal testing environments
- Add test accounts
- Test at least one purchase per product tier before production
