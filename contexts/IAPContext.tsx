// IAPContext — Apple In-App Purchase React context (iOS only).
//
// Wraps services/iapService.ts and provides:
//   • Real Apple-localized product objects (price, title, currency)
//   • Purchase functions with loading state
//   • Restore Purchases
//
// Platform behaviour:
//   • iOS:          Full IAP functionality. initIAP() called on mount.
//   • Android/Web:  Provider is a transparent no-op that renders children unchanged.
//                   All hooks that consume this context receive the default empty state.
//
// Usage:
//   <IAPProvider> is mounted in app/_layout.tsx (always — self-limits on non-iOS).
//   Screens import useIAP() from hooks/useIAP.tsx, NEVER import this file directly.
//
// Entitlement writes:
//   This context does NOT write entitlements. Server writes to user_profiles;
//   AuthContext.refreshProfile() reads them. Screens should call refreshProfile()
//   after a successful purchase result from purchaseSubscription() / purchaseBoost().

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { Platform } from 'react-native';
import {
  initIAP,
  teardownIAP,
  loadAllProducts,
  purchaseAppleSubscription,
  purchaseAppleBoost,
  restoreApplePurchases,
  setupTransactionListener,
  type IAPProduct,
  type IAPPurchaseResult,
  type IAPRestoreResult,
  type AppleSubscriptionProductId,
  type AppleBoostProductId,
} from '../services/iapService';

// ─── Context type ─────────────────────────────────────────────────────────────

interface IAPContextType {
  /** All subscription products fetched from Apple StoreKit */
  subscriptionProducts: IAPProduct[];
  /** All boost consumable products fetched from Apple StoreKit */
  boostProducts: IAPProduct[];
  /** True while products are being loaded from Apple */
  isLoadingProducts: boolean;
  /** True while a purchase is in flight (show spinner) */
  isPurchasing: boolean;
  /** Product ID currently being purchased (for per-product loading indicators) */
  purchasingProductId: string | null;
  /** True while Restore Purchases is in flight */
  isRestoring: boolean;
  /** Last purchase result (cleared on next purchase attempt) */
  lastPurchaseResult: IAPPurchaseResult | null;
  /**
   * Purchase a subscription product.
   * @param productId  Apple product ID from APPLE_SUBSCRIPTION_PRODUCT_IDS
   * @param userId     Supabase auth user.id (set as appAccountToken)
   */
  purchaseSubscription: (productId: AppleSubscriptionProductId, userId: string) => Promise<IAPPurchaseResult>;
  /**
   * Purchase a boost consumable.
   * @param productId  Apple product ID from APPLE_BOOST_PRODUCT_IDS
   * @param userId     Supabase auth user.id
   * @param eventId    Event to boost (must be owned by userId)
   */
  purchaseBoost: (productId: AppleBoostProductId, userId: string, eventId: string) => Promise<IAPPurchaseResult>;
  /**
   * Restore active Apple subscriptions. Call from a visible "Restore Purchases" button.
   * Consumable boosts are NOT restored (Apple does not include consumables in entitlements).
   */
  restorePurchases: (userId: string) => Promise<IAPRestoreResult>;
  /** Re-fetch products from Apple (e.g., after network recovery) */
  refreshProducts: () => Promise<void>;
}

// ─── Default (non-iOS) context values ────────────────────────────────────────

const defaultContext: IAPContextType = {
  subscriptionProducts:  [],
  boostProducts:         [],
  isLoadingProducts:     false,
  isPurchasing:          false,
  purchasingProductId:   null,
  isRestoring:           false,
  lastPurchaseResult:    null,
  purchaseSubscription:  async () => ({ ok: false, error: 'Apple IAP only available on iOS' }),
  purchaseBoost:         async () => ({ ok: false, error: 'Apple IAP only available on iOS' }),
  restorePurchases:      async () => ({ ok: false, error: 'Apple IAP only available on iOS' }),
  refreshProducts:       async () => {},
};

const IAPContext = createContext<IAPContextType>(defaultContext);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function IAPProvider({ children }: { children: ReactNode }) {
  // Web: return children immediately — no native IAP available.
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    return <>{children}</>;
  }

  return <IAPProviderNative>{children}</IAPProviderNative>;
}

/** Native IAP provider — rendered on iOS (Apple) and Android (Google Play). */
function IAPProviderNative({ children }: { children: ReactNode }) {
  const [subscriptionProducts, setSubscriptionProducts] = useState<IAPProduct[]>([]);
  const [boostProducts, setBoostProducts]               = useState<IAPProduct[]>([]);
  const [isLoadingProducts, setIsLoadingProducts]       = useState(false);
  const [isPurchasing, setIsPurchasing]                 = useState(false);
  const [purchasingProductId, setPurchasingProductId]   = useState<string | null>(null);
  const [isRestoring, setIsRestoring]                   = useState(false);
  const [lastPurchaseResult, setLastPurchaseResult]     = useState<IAPPurchaseResult | null>(null);

  // ── Initialize IAP and load products on mount ──────────────────────────────
  useEffect(() => {
    let mounted = true;

    async function setup() {
      try {
        await initIAP();
        if (!mounted) return;
        await loadProducts();
      } catch (e) {
        console.warn('[IAPContext] Setup failed:', String(e));
      }
    }

    setup();

    // Set up background transaction listener for:
    //   - Ask to Buy (parent approves after user leaves screen)
    //   - Interrupted purchases from previous sessions
    const removeListener = setupTransactionListener(
      '',     // userId not available at context level — screens provide it
      (result) => {
        if (mounted) setLastPurchaseResult(result);
      },
    );

    return () => {
      mounted = false;
      removeListener();
      teardownIAP().catch(() => {});
    };
  }, []);

  // ── Load products from Apple ───────────────────────────────────────────────
  const loadProducts = useCallback(async () => {
    setIsLoadingProducts(true);
    try {
      const { subscriptions, boosts } = await loadAllProducts();
      setSubscriptionProducts(subscriptions);
      setBoostProducts(boosts);
    } catch (e) {
      console.warn('[IAPContext] loadProducts failed:', String(e));
    } finally {
      setIsLoadingProducts(false);
    }
  }, []);

  // ── Purchase subscription ──────────────────────────────────────────────────
  const purchaseSubscription = useCallback(async (
    productId: AppleSubscriptionProductId,
    userId: string,
  ): Promise<IAPPurchaseResult> => {
    setIsPurchasing(true);
    setPurchasingProductId(productId);
    setLastPurchaseResult(null);
    try {
      const result = await purchaseAppleSubscription(productId, userId);
      setLastPurchaseResult(result);
      return result;
    } finally {
      setIsPurchasing(false);
      setPurchasingProductId(null);
    }
  }, []);

  // ── Purchase boost consumable ──────────────────────────────────────────────
  const purchaseBoost = useCallback(async (
    productId: AppleBoostProductId,
    userId: string,
    eventId: string,
  ): Promise<IAPPurchaseResult> => {
    setIsPurchasing(true);
    setPurchasingProductId(productId);
    setLastPurchaseResult(null);
    try {
      const result = await purchaseAppleBoost(productId, userId, eventId);
      setLastPurchaseResult(result);
      return result;
    } finally {
      setIsPurchasing(false);
      setPurchasingProductId(null);
    }
  }, []);

  // ── Restore purchases ──────────────────────────────────────────────────────
  const restorePurchases = useCallback(async (userId: string): Promise<IAPRestoreResult> => {
    setIsRestoring(true);
    try {
      return await restoreApplePurchases(userId);
    } finally {
      setIsRestoring(false);
    }
  }, []);

  const value: IAPContextType = {
    subscriptionProducts,
    boostProducts,
    isLoadingProducts,
    isPurchasing,
    purchasingProductId,
    isRestoring,
    lastPurchaseResult,
    purchaseSubscription,
    purchaseBoost,
    restorePurchases,
    refreshProducts: loadProducts,
  };

  return <IAPContext.Provider value={value}>{children}</IAPContext.Provider>;
}

// ─── Internal context accessor ────────────────────────────────────────────────
// Not exported — screens use hooks/useIAP.tsx instead.
export { IAPContext };
