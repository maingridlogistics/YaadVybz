// lib/stripe.native.ts
// Native platform: re-export real Stripe primitives from @stripe/stripe-react-native.
// This file is only bundled on iOS and Android — never on web.
export { StripeProvider, useStripe } from '@stripe/stripe-react-native';
