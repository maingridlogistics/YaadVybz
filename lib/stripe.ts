// lib/stripe.ts
// Web stub — @stripe/stripe-react-native is a native-only library and must
// never be imported on the web platform. This file provides safe no-op shims
// so shared code can import from 'lib/stripe' without platform guards.
//
// The return types here intentionally use `Record<string, unknown>` / loose
// shapes because we cannot import the real StripeError types from the native
// package on web. The native file (lib/stripe.native.ts) provides proper
// typing. All callers check for a truthy `error` property, which is all that
// is needed at runtime.

import React from 'react';

// StripeProvider: on web, just render children unchanged.
export function StripeProvider({
  children,
}: {
  children: React.ReactNode;
  publishableKey?: string;
  urlScheme?: string;
  merchantIdentifier?: string;
  [key: string]: unknown;
}): React.ReactElement {
  return React.createElement(React.Fragment, null, children);
}

// Minimal error shape used by the stubs below.
// Callers only check for truthiness of `error` and read `error.message`.
interface StubError {
  code: string;
  message: string;
  localizedMessage: string;
  stripeErrorCode: string;
  declineCode: string | undefined;
  type: string;
}

interface StubResult {
  error?: StubError;
}

// useStripe: return stubs that always resolve with an unsupported error.
// The web checkout path uses the hosted Stripe Checkout Session (WebBrowser)
// and never calls these methods — they are only here to satisfy the type system.
// Returning an error (not throwing) ensures callers follow their normal error
// branch rather than crashing, and never pretends a payment succeeded.
export function useStripe() {
  const unsupported = async (): Promise<StubResult> => ({
    error: {
      code: 'Unsupported',
      message: 'Native PaymentSheet is not supported on web. Use hosted Stripe Checkout instead.',
      localizedMessage: 'Not supported on web.',
      stripeErrorCode: '',
      declineCode: undefined,
      type: 'api_error',
    },
  });
  return {
    initPaymentSheet: unsupported,
    presentPaymentSheet: unsupported,
    confirmPaymentSheetPayment: unsupported,
    confirmPayment: unsupported,
    handleNextAction: unsupported,
    retrievePaymentIntent: unsupported,
    retrieveSetupIntent: unsupported,
    confirmSetupIntent: unsupported,
    createPaymentMethod: unsupported,
    createToken: unsupported,
    openApplePaySetup: unsupported,
    isApplePaySupported: false as boolean,
    confirmApplePay: unsupported,
    updateApplePaySummaryItems: unsupported,
    dismissApplePay: async (): Promise<void> => {},
    collectBankAccountForPayment: unsupported,
    collectBankAccountForSetup: unsupported,
    verifyMicrodepositsForPayment: unsupported,
    verifyMicrodepositsForSetup: unsupported,
    canAddCardToWallet: unsupported,
    collectFinancialConnectionsAccounts: unsupported,
    resetPaymentSheetCustomer: async (): Promise<{ error: undefined }> => ({ error: undefined }),
  };
}
