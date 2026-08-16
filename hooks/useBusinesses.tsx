// ─── useBusinesses Hook ───────────────────────────────────────────────────────
// State + business logic for Business Directory.
// Consumes businessService — NO JSX.

import { useState, useCallback, useRef } from 'react';
import {
  fetchBusinessCategories,
  searchBusinesses,
  BusinessCategory,
  BusinessSearchResult,
  BusinessSearchParams,
} from '../services/businessService';

const PAGE_SIZE = 40;

// ─── Category Cache (module-level, shared across hook instances) ──────────────
let categoryCache: BusinessCategory[] | null = null;
let categoryFetchPromise: Promise<BusinessCategory[]> | null = null;

async function getCategories(): Promise<BusinessCategory[]> {
  if (categoryCache) return categoryCache;
  if (categoryFetchPromise) return categoryFetchPromise;
  categoryFetchPromise = fetchBusinessCategories().then((cats) => {
    categoryCache = cats;
    categoryFetchPromise = null;
    return cats;
  });
  return categoryFetchPromise;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UseBusinessesReturn {
  // Data
  results: BusinessSearchResult[];
  categories: BusinessCategory[];

  // Loading / error states
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;

  // Actions
  search: (params: BusinessSearchParams) => Promise<void>;
  loadMore: (params: BusinessSearchParams) => Promise<void>;
  clearError: () => void;
  loadCategories: () => Promise<void>;
}

export function useBusinesses(): UseBusinessesReturn {
  const [results, setResults] = useState<BusinessSearchResult[]>([]);
  const [categories, setCategories] = useState<BusinessCategory[]>(categoryCache ?? []);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  // Prevent stale responses from overwriting newer results
  const searchIdRef = useRef(0);

  const search = useCallback(async (params: BusinessSearchParams) => {
    const currentId = ++searchIdRef.current;
    setLoading(true);
    setError(null);

    const { results: data, error: err } = await searchBusinesses({
      ...params,
      limit: PAGE_SIZE,
      offset: 0,
    });

    if (currentId !== searchIdRef.current) return; // Stale — discard

    setLoading(false);
    if (err) {
      setError(err);
      return;
    }
    setResults(data);
    setHasMore(data.length === PAGE_SIZE);
  }, []);

  const loadMore = useCallback(async (params: BusinessSearchParams) => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);

    const { results: data, error: err } = await searchBusinesses({
      ...params,
      limit: PAGE_SIZE,
      offset: results.length,
    });

    setLoadingMore(false);
    if (err) {
      setError(err);
      return;
    }
    setResults((prev) => [...prev, ...data]);
    setHasMore(data.length === PAGE_SIZE);
  }, [loadingMore, hasMore, results.length]);

  const clearError = useCallback(() => setError(null), []);

  const loadCategories = useCallback(async () => {
    const cats = await getCategories();
    setCategories(cats);
  }, []);

  return {
    results,
    categories,
    loading,
    loadingMore,
    error,
    hasMore,
    search,
    loadMore,
    clearError,
    loadCategories,
  };
}
