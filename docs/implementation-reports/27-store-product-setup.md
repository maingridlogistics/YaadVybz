# VYBZ HUB — PHASE 27: APP STORE + GOOGLE PLAY PRODUCT SETUP

## STATUS
COMPLETE — CHECKLIST CREATED

## CODE-SIDE PRODUCT IDENTIFIERS

### Subscription Products

| Product | Apple SKU | Google SKU | Monthly Price | Yearly Price |
|---------|-----------|------------|---------------|--------------|
| Pro Monthly | (check `constants/data.ts` `appleProductIdMonthly`) | (check `googleProductIdMonthly`) | $4.99 | — |
| Pro Yearly | (check `appleProductIdYearly`) | (check `googleProductIdYearly`) | — | ~$49.99 |
| Elite Monthly | (check `appleProductIdMonthly`) | (check `googleProductIdMonthly`) | $14.99 | — |
| Elite Yearly | (check `appleProductIdYearly`) | (check `googleProductIdYearly`) | — | ~$149.99 |

### Boost IAP Products (One-Time or Consumable)

| Product | Apple SKU | Google SKU | Price |
|---------|-----------|------------|-------|
| 3-Day Event Boost | (check boost screen) | (check) | TBD |
| 7-Day Event Boost | (check boost screen) | (check) | TBD |
| Until Event Ends | (check boost screen) | Apple only | TBD |
| 3-Day Business Boost | (check) | (check) | TBD |
| 7-Day Business Boost | (check) | (check) | TBD |

Note: "Until Event Ends" is Events-only per product rules. Businesses only have time-limited boosts.

## APP STORE CONNECT CHECKLIST

### Subscriptions
- [ ] Create subscription group "Vybz Hub Creator"
- [ ] Create subscription: Pro Monthly ($4.99)
- [ ] Create subscription: Pro Yearly (~$49.99, confirm pricing)
- [ ] Create subscription: Elite Monthly ($14.99)
- [ ] Create subscription: Elite Yearly (~$149.99, confirm pricing)
- [ ] Set up family sharing (as appropriate)
- [ ] Configure introductory offers (optional)
- [ ] Add subscription metadata/descriptions for App Review

### IAP Products (Boosts)
- [ ] Create consumable IAP: 3-Day Event Boost
- [ ] Create consumable IAP: 7-Day Event Boost
- [ ] Create consumable IAP: Until Event Ends
- [ ] Create consumable IAP: 3-Day Business Boost
- [ ] Create consumable IAP: 7-Day Business Boost

### Server Notifications
- [ ] Configure App Store Server Notifications URL → `verify-apple-transaction` edge function URL
- [ ] Enable SIGNED_RENEWED, EXPIRED, REVOKE notification types

### App Review
- [ ] Provide sandbox test accounts
- [ ] Document IAP testing instructions
- [ ] Provide demo account with Pro features accessible

## GOOGLE PLAY CONSOLE CHECKLIST

### Subscriptions
- [ ] Create subscription: com.chambex.vybzhub.pro.monthly
- [ ] Create subscription: com.chambex.vybzhub.pro.yearly
- [ ] Create subscription: com.chambex.vybzhub.elite.monthly
- [ ] Create subscription: com.chambex.vybzhub.elite.yearly
- [ ] Set up base plans and offers
- [ ] Configure grace period (recommended: 3 days)

### One-Time Products (Boosts)
- [ ] Create managed product: 3-Day Event Boost
- [ ] Create managed product: 7-Day Event Boost
- [ ] Create managed product: 3-Day Business Boost
- [ ] Create managed product: 7-Day Business Boost

### Real-Time Developer Notifications
- [ ] Configure RTDN Pub/Sub topic
- [ ] Subscribe `google-play-notifications` edge function to topic

### Testing
- [ ] Add license testers for internal testing
- [ ] Test purchase + subscription flow on internal testing track
- [ ] Verify RTDN delivery to edge function

## VALIDATION
NOT RUN — requires App Store Connect and Google Play Console access.

## NOTES
- All SKU strings must match exactly what is hardcoded in `constants/data.ts` and IAP service files
- Run a search for Apple/Google product ID constants to get exact values: `search_files SUBSCRIPTION_PLANS`
