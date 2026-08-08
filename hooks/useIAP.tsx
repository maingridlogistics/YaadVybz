// useIAP — consumer hook for the Apple In-App Purchase context.
//
// Usage:
//   import { useIAP } from '../hooks/useIAP';
//   const { purchaseSubscription, subscriptionProducts, isPurchasing } = useIAP();
//
// On Android and Web, all values are safe defaults (empty arrays, false flags, no-op functions).
// No Platform.OS check needed in consuming components.
//
// DO NOT import IAPContext directly — always use this hook for clean dependency inversion.

import { useContext } from 'react';
import { IAPContext } from '../contexts/IAPContext';

export function useIAP() {
  return useContext(IAPContext);
}
