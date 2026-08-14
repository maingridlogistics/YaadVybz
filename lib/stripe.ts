// lib/stripe.ts
// Web stub — @stripe/stripe-react-native is a native-only library and must
// never be imported on the web platform. This file provides safe no-op shims
// so shared code can import from 'lib/stripe' without platform guards.
//
// Type shapes mirror the @stripe/stripe-react-native public API closely enough
// that shared hooks (useCustomerTicketing) compile on both native and web.
// The native file (lib/stripe.native.ts) re-exports the real package.

import React from 'react';

// ── StripeProvider ────────────────────────────────────────────────────────────
// On web, just render children unchanged — no native provider needed.
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

// ── Shared stub error shape ───────────────────────────────────────────────────
// Mirrors the StripeError<PaymentSheetError> structure used by the real SDK.
// Callers only check truthiness of `error` and read `error.message`/`error.code`.
interface StubError {
  code: string;
  message: string;
  localizedMessage: string;
  stripeErrorCode: string;
  declineCode: string | undefined;
  type: string;
}

const WEB_UNSUPPORTED: StubError = {
  code: 'Unsupported',
  message: 'Native PaymentSheet is not supported on web. Use hosted Stripe Checkout instead.',
  localizedMessage: 'Not supported on web.',
  stripeErrorCode: '',
  declineCode: undefined,
  type: 'api_error',
};

// ── Parameter shapes ──────────────────────────────────────────────────────────
// Defined locally so we never import from the native package on web.
// These only need to be wide enough for TypeScript to accept call sites.

/** Mirrors InitPaymentSheetParams from @stripe/stripe-react-native */
interface InitPaymentSheetParams {
  paymentIntentClientSecret?: string;
  setupIntentClientSecret?: string;
  customerId?: string;
  customerEphemeralKeySecret?: string;
  merchantDisplayName?: string;
  returnURL?: string;
  applePay?: object;
  googlePay?: object;
  appearance?: object;
  allowsDelayedPaymentMethods?: boolean;
  [key: string]: unknown;
}

/** Mirrors PresentPaymentSheetParams from @stripe/stripe-react-native */
interface PresentPaymentSheetParams {
  confirmParams?: object;
  [key: string]: unknown;
}

// ── useStripe ─────────────────────────────────────────────────────────────────
// Returns stubs that always resolve with an unsupported error.
// Web checkout uses hosted Stripe Checkout Session (WebBrowser) — these
// methods are never actually called at runtime on web.
// Returning an error (not throwing) ensures callers follow their normal error
// branch and NEVER pretend a payment succeeded.
export function useStripe() {
  const unsupported = async (): Promise<{ error: StubError }> => ({
    error: WEB_UNSUPPORTED,
  });

  return {
    initPaymentSheet: async (
      _params: InitPaymentSheetParams,
    ): Promise<{ error?: StubError }> => ({ error: WEB_UNSUPPORTED }),

    presentPaymentSheet: async (
      _params?: PresentPaymentSheetParams,
    ): Promise<{ error?: StubError }> => ({ error: WEB_UNSUPPORTED }),

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
