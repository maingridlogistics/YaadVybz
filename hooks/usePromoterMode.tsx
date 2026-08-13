import { useContext } from 'react';
import { PromoterModeContext } from '../contexts/PromoterModeContext';

export function usePromoterMode() {
  return useContext(PromoterModeContext);
}
