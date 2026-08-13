/**
 * PromoterModeContext
 *
 * Controls whether a promoter user is currently viewing the app in
 * "Attendee View" or "Promoter Dashboard" mode.
 *
 * SECURITY NOTE: This context controls UX only. All promoter routes,
 * RPCs, and RLS policies still enforce server-side authorization.
 * A non-promoter manipulating local storage cannot gain promoter access.
 */

import React, { createContext, useState, useEffect, useCallback, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

type ActiveView = 'attendee' | 'promoter';

const STORAGE_KEY = 'vybzhub_active_view';

interface PromoterModeContextType {
  activeView: ActiveView;
  isPromoterModeReady: boolean;
  switchToPromoter: () => void;
  switchToAttendee: () => void;
}

export const PromoterModeContext = createContext<PromoterModeContextType>({
  activeView: 'attendee',
  isPromoterModeReady: false,
  switchToPromoter: () => {},
  switchToAttendee: () => {},
});

export function PromoterModeProvider({ children }: { children: ReactNode }) {
  const [activeView, setActiveView] = useState<ActiveView>('attendee');
  const [isPromoterModeReady, setIsPromoterModeReady] = useState(false);

  // Restore persisted view on mount
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (stored === 'promoter' || stored === 'attendee') {
          setActiveView(stored);
        }
      })
      .catch(() => {})
      .finally(() => setIsPromoterModeReady(true));
  }, []);

  const switchToPromoter = useCallback(() => {
    setActiveView('promoter');
    AsyncStorage.setItem(STORAGE_KEY, 'promoter').catch(() => {});
  }, []);

  const switchToAttendee = useCallback(() => {
    setActiveView('attendee');
    AsyncStorage.setItem(STORAGE_KEY, 'attendee').catch(() => {});
  }, []);

  return (
    <PromoterModeContext.Provider
      value={{ activeView, isPromoterModeReady, switchToPromoter, switchToAttendee }}
    >
      {children}
    </PromoterModeContext.Provider>
  );
}
