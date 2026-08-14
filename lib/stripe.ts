// lib/stripe.ts
// Web stub — @stripe/stripe-react-native is a native-only library and must
// never be imported on the web platform. This file provides safe no-op shims
// so shared code can import from 'lib/stripe' without platform guards.

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

// useStripe: return stubs that always resolve with an unsupported error.
// The web checkout path uses the hosted Stripe Checkout Session (WebBrowser)
// and never calls these methods — they are only here to satisfy the type system.
export function useStripe() {
  const unsupported = async () => ({
    error: {
      code: 'Unsupported' as const,
      message: 'Native PaymentSheet is not supported on web. Use hosted Stripe Checkout instead.',
      localizedMessage: 'Not supported on web.',
      stripeErrorCode: '',
      declineCode: undefined,
      type: 'api_error' as const,
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
    isApplePaySupported: false,
    confirmApplePay: unsupported,
    updateApplePaySummaryItems: unsupported,
    dismissApplePay: async () => {},
    collectBankAccountForPayment: unsupported,
    collectBankAccountForSetup: unsupported,
    verifyMicrodepositsForPayment: unsupported,
    verifyMicrodepositsForSetup: unsupported,
    canAddCardToWallet: unsupported,
    collectFinancialConnectionsAccounts: unsupported,
    resetPaymentSheetCustomer: async () => ({ error: undefined }),
  };
}
