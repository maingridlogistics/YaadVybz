
// IAPContext — In-App Purchase React context.
//
// Wraps services/iapService.ts and provides:
//   • Lifetime Pro non-consumable product (price, title, currency)
//   • Boost consumable products
//   • Purchase functions with loading state
//   • Restore Lifetime Pro
//
// Platform behaviour:
//   • iOS:          Full IAP functionality. initIAP() called on mount.
//   • Android/Web:  Provider is a transparent no-op that renders children unchanged.

import React, { createContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { Platform } from 'react-native';
import {
  initIAP,
  teardownIAP,
  loadAllProducts,
  purchaseLifetimePro,
  purchaseAppleBoost,
  restoreApplePurchases,
  setupTransactionListener,
  type IAPProduct,
  type IAPPurchaseResult,
  type IAPRestoreResult,
  type BoostProductId,
  type AppleBoostProductId,
} from '../services/iapService';

// ─── Context type ─────────────────────────────────────────────────────────────

interface IAPContextType {
  /** Lifetime Pro non-consumable product fetched from StoreKit (null if unavailable) */
  proProduct: IAPProduct | null;
  /** All boost consumable products fetched from StoreKit */
  boostProducts: IAPProduct[];
  /** Legacy alias: same as [proProduct].filter(Boolean) for any remaining consumers */
  subscriptionProducts: IAPProduct[];
  /** True while products are being loaded from Apple */
  isLoadingProducts: boolean;
  /** True while a purchase is in flight */
  isPurchasing: boolean;
  /** Product ID currently being purchased */
  purchasingProductId: string | null;
  /** True while Restore Purchases is in flight */
  isRestoring: boolean;
  /** Last purchase result */
  lastPurchaseResult: IAPPurchaseResult | null;
  /**
   * Purchase the lifetime Pro non-consumable.
   * @param userId  Supabase auth user.id (set as appAccountToken)
   */
  purchaseProLifetime: (userId: string) => Promise<IAPPurchaseResult>;
  /**
   * Legacy alias for purchaseProLifetime — accepts productId param for compat
   * but ignores it; always purchases the lifetime Pro product.
   */
  purchaseSubscription: (productId: string, userId: string) => Promise<IAPPurchaseResult>;
  /**
   * Purchase a boost consumable.
   */
  purchaseBoost: (productId: AppleBoostProductId, userId: string, eventId: string) => Promise<IAPPurchaseResult>;
  /**
   * Restore lifetime Pro purchase (non-consumable).
   */
  restorePurchases: (userId: string) => Promise<IAPRestoreResult>;
  /** Re-fetch products from Apple */
  refreshProducts: () => Promise<void>;
}

// ─── Default (non-iOS) context values ────────────────────────────────────────

const defaultContext: IAPContextType = {
  proProduct:            null,
  boostProducts:         [],
  subscriptionProducts:  [],
  isLoadingProducts:     false,
  isPurchasing:          false,
  purchasingProductId:   null,
  isRestoring:           false,
  lastPurchaseResult:    null,
  purchaseProLifetime:   async () => ({ ok: false, error: 'Apple IAP only available on iOS' }),
  purchaseSubscription:  async () => ({ ok: false, error: 'Apple IAP only available on iOS' }),
  purchaseBoost:         async () => ({ ok: false, error: 'Apple IAP only available on iOS' }),
  restorePurchases:      async () => ({ ok: false, error: 'Apple IAP only available on iOS' }),
  refreshProducts:       async () => {},
};

const IAPContext = createContext<IAPContextType>(defaultContext);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function IAPProvider({ children }: { children: ReactNode }) {
  if (Platform.OS !== 'ios') {
    return <IAPContext.Provider value={defaultContext}>{children}</IAPContext.Provider>;
  }
  return <IAPProviderNative>{children}</IAPProviderNative>;
}

function IAPProviderNative({ children }: { children: ReactNode }) {
  const [proProduct, setProProduct]                   = useState<IAPProduct | null>(null);
  const [boostProducts, setBoostProducts]             = useState<IAPProduct[]>([]);
  const [isLoadingProducts, setIsLoadingProducts]     = useState(false);
  const [isPurchasing, setIsPurchasing]               = useState(false);
  const [purchasingProductId, setPurchasingProductId] = useState<string | null>(null);
  const [isRestoring, setIsRestoring]                 = useState(false);
  const [lastPurchaseResult, setLastPurchaseResult]   = useState<IAPPurchaseResult | null>(null);

  const loadProducts = useCallback(async () => {
    setIsLoadingProducts(true);
    try {
      const { proProduct: pro, boosts } = await loadAllProducts();
      setProProduct(pro);
      setBoostProducts(boosts);
    } catch {
      // Product loading failed — screens will show empty state
    } finally {
      setIsLoadingProducts(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    async function setup() {
      try {
        await initIAP();
        if (!mounted) return;
        await loadProducts();
      } catch {
        // IAP init failed
      }
    }

    setup();

    const removeListener = setupTransactionListener(
      '',
      (result) => { if (mounted) setLastPurchaseResult(result); },
    );

    return () => {
      mounted = false;
      removeListener();
      teardownIAP().catch(() => {});
    };
  }, [loadProducts]);

  // ── Purchase lifetime Pro ──────────────────────────────────────────────────
  const purchaseProLifetime = useCallback(async (userId: string): Promise<IAPPurchaseResult> => {
    const productId = 'com.vybzhub.pro.lifetime';
    setIsPurchasing(true);
    setPurchasingProductId(productId);
    setLastPurchaseResult(null);
    try {
      const result = await purchaseLifetimePro(userId);
      setLastPurchaseResult(result);
      return result;
    } finally {
      setIsPurchasing(false);
      setPurchasingProductId(null);
    }
  }, []);

  // Legacy alias
  const purchaseSubscription = useCallback(async (
    _productId: string,
    userId: string,
  ): Promise<IAPPurchaseResult> => {
    return purchaseProLifetime(userId);
  }, [purchaseProLifetime]);

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
      const result = await purchaseAppleBoost(productId as BoostProductId, userId, eventId);
      setLastPurchaseResult(result);
      return result;
    } finally {
      setIsPurchasing(false);
      setPurchasingProductId(null);
    }
  }, []);

  // ── Restore lifetime Pro ──────────────────────────────────────────────────
  const restorePurchases = useCallback(async (userId: string): Promise<IAPRestoreResult> => {
    setIsRestoring(true);
    try {
      return await restoreApplePurchases(userId);
    } finally {
      setIsRestoring(false);
    }
  }, []);

  const subscriptionProducts = proProduct ? [proProduct] : [];

  const value: IAPContextType = {
    proProduct,
    boostProducts,
    subscriptionProducts,
    isLoadingProducts,
    isPurchasing,
    purchasingProductId,
    isRestoring,
    lastPurchaseResult,
    purchaseProLifetime,
    purchaseSubscription,
    purchaseBoost,
    restorePurchases,
    refreshProducts: loadProducts,
  };

  return <IAPContext.Provider value={value}>{children}</IAPContext.Provider>;
}

export { IAPContext };
