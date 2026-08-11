import React, { createContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { AppState } from 'react-native';
import {
  Business,
  BusinessCategory,
  BusinessLocation,
  BusinessPromotion,
  BusinessService,
} from '../types/business';
import {
  fetchLiveBusinesses,
  fetchCategories,
  fetchMyBusiness,
  mapCategoryFromDb,
  mapLocationFromDb,
  mapServiceFromDb,
  mapPromotionFromDb,
  mapBusinessFromDb,
} from '../services/businessService';
import { supabase } from '../lib/supabase';

// ─── Context Type ─────────────────────────────────────────────────────────────
interface BusinessContextType {
  businesses: Business[];
  categories: BusinessCategory[];
  myBusiness: Business | null;
  isLoading: boolean;
  isLoadingMine: boolean;
  error: string | null;
  refreshBusinesses: () => Promise<void>;
  refreshMyBusiness: () => Promise<void>;
  setMyBusiness: (b: Business | null) => void;
  // Filters
  filterByCategory: (categoryId: string) => Business[];
  filterByParish: (parish: string) => Business[];
  searchBusinesses: (query: string) => Business[];
  getFeatured: () => Business[];
  getNearby: (lat: number, lng: number, radiusKm?: number) => Business[];
  // Pending revision indicator
  hasPendingRevision: boolean;
}

export const BusinessContext = createContext<BusinessContextType | undefined>(undefined);

// ─── Haversine distance (km) ──────────────────────────────────────────────────
function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Provider ─────────────────────────────────────────────────────────────────
export function BusinessProvider({ children }: { children: ReactNode }) {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [categories, setCategories] = useState<BusinessCategory[]>([]);
  const [myBusiness, setMyBusiness] = useState<Business | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMine, setIsLoadingMine] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const hasPendingRevision = Boolean(myBusiness?.pendingRevisionId);

  // ── Load public business data ─────────────────────────────────────────────
  const refreshBusinesses = useCallback(async () => {
    try {
      const [bizResult, catResult] = await Promise.all([
        fetchLiveBusinesses({ limit: 200 }),
        fetchCategories(),
      ]);
      if (bizResult.data) setBusinesses(bizResult.data);
      if (catResult.data) setCategories(catResult.data);
      if (bizResult.error) setError(bizResult.error);
    } catch (e) {
      setError('Failed to load businesses');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ── Load owner's own business ─────────────────────────────────────────────
  const refreshMyBusiness = useCallback(async () => {
    if (!currentUserId) return;
    setIsLoadingMine(true);
    try {
      const result = await fetchMyBusiness(currentUserId);
      setMyBusiness(result.data);
    } catch (_) {
    } finally {
      setIsLoadingMine(false);
    }
  }, [currentUserId]);

  // ── Bootstrap ─────────────────────────────────────────────────────────────
  useEffect(() => {
    refreshBusinesses();

    supabase.auth.getSession().then(({ data: { session } }) => {
      const uid = session?.user?.id ?? null;
      setCurrentUserId(uid);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const uid = session?.user?.id ?? null;
      setCurrentUserId(uid);
      if (!uid) setMyBusiness(null);
    });

    // Real-time updates for businesses
    const channel = supabase
      .channel('public:businesses')
      .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'businesses' }, (payload: any) => {
        if (payload.eventType === 'INSERT') {
          const biz = mapBusinessFromDb(payload.new);
          if (biz.status === 'live') {
            setBusinesses((prev) => {
              if (prev.find((b) => b.id === biz.id)) return prev;
              return [biz, ...prev];
            });
          }
        } else if (payload.eventType === 'UPDATE') {
          const updated = mapBusinessFromDb(payload.new);
          setBusinesses((prev) =>
            updated.status === 'live'
              ? prev.map((b) => (b.id === updated.id ? updated : b))
              : prev.filter((b) => b.id !== updated.id),
          );
          // Sync myBusiness if it's the owner's row
          setMyBusiness((prev) => (prev?.id === updated.id ? { ...prev, ...updated } : prev));
        } else if (payload.eventType === 'DELETE') {
          const deletedId = payload.old?.id;
          setBusinesses((prev) => prev.filter((b) => b.id !== deletedId));
          setMyBusiness((prev) => (prev?.id === deletedId ? null : prev));
        }
      })
      .subscribe();

    const appSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshBusinesses();
    });

    return () => {
      supabase.removeChannel(channel);
      subscription.unsubscribe();
      appSub.remove();
    };
  }, [refreshBusinesses]);

  // Load owner's business when currentUserId changes
  useEffect(() => {
    if (currentUserId) refreshMyBusiness();
    else setMyBusiness(null);
  }, [currentUserId, refreshMyBusiness]);

  // ── Query helpers ─────────────────────────────────────────────────────────
  const filterByCategory = useCallback(
    (categoryId: string) => businesses.filter((b) => b.categoryId === categoryId || b.secondaryCategoryIds.includes(categoryId)),
    [businesses],
  );

  const filterByParish = useCallback(
    (parish: string) =>
      businesses.filter((b) =>
        b.locations?.some((l) => l.parish.toLowerCase() === parish.toLowerCase() && l.active),
      ),
    [businesses],
  );

  const searchBusinesses = useCallback(
    (query: string) => {
      const q = query.trim().toLowerCase();
      if (!q) return businesses;
      return businesses.filter(
        (b) =>
          b.name.toLowerCase().includes(q) ||
          b.description.toLowerCase().includes(q) ||
          b.category?.name.toLowerCase().includes(q),
      );
    },
    [businesses],
  );

  const getFeatured = useCallback(
    () => businesses.filter((b) => b.featured).sort((a, z) => z.featuredPriority - a.featuredPriority),
    [businesses],
  );

  const getNearby = useCallback(
    (lat: number, lng: number, radiusKm = 25) => {
      const results: Array<{ biz: Business; dist: number }> = [];
      for (const biz of businesses) {
        if (!biz.locations) continue;
        for (const loc of biz.locations) {
          if (loc.latitude != null && loc.longitude != null) {
            const dist = distanceKm(lat, lng, loc.latitude, loc.longitude);
            if (dist <= radiusKm) {
              results.push({ biz, dist });
              break; // count each business once
            }
          }
        }
      }
      return results.sort((a, b) => a.dist - b.dist).map((r) => r.biz);
    },
    [businesses],
  );

  return (
    <BusinessContext.Provider
      value={{
        businesses,
        categories,
        myBusiness,
        isLoading,
        isLoadingMine,
        error,
        refreshBusinesses,
        refreshMyBusiness,
        setMyBusiness,
        filterByCategory,
        filterByParish,
        searchBusinesses,
        getFeatured,
        getNearby,
        hasPendingRevision,
      }}
    >
      {children}
    </BusinessContext.Provider>
  );
}
