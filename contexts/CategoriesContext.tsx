import React, { createContext, useState, useEffect, ReactNode, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PARISHES as DEFAULT_PARISHES, EVENT_TYPES as DEFAULT_EVENT_TYPES } from '../constants/data';

export interface EventTypeItem {
  id: string;
  label: string;
  icon: string;
  color: string;
}

interface CategoriesContextType {
  parishes: string[];
  eventTypes: EventTypeItem[];
  addParish: (parish: string) => void;
  removeParish: (parish: string) => void;
  addEventType: (type: Omit<EventTypeItem, 'id'>) => void;
  editEventType: (id: string, updates: Partial<Omit<EventTypeItem, 'id'>>) => void;
  removeEventType: (id: string) => void;
  resetToDefaults: () => void;
}

export const CategoriesContext = createContext<CategoriesContextType | undefined>(undefined);

const PARISHES_KEY = '@vybzhub_custom_parishes';
const TYPES_KEY = '@vybzhub_custom_event_types';

export function CategoriesProvider({ children }: { children: ReactNode }) {
  const [parishes, setParishes] = useState<string[]>(DEFAULT_PARISHES);
  const [eventTypes, setEventTypes] = useState<EventTypeItem[]>(DEFAULT_EVENT_TYPES);

  useEffect(() => {
    (async () => {
      try {
        const [storedParishes, storedTypes] = await Promise.all([
          AsyncStorage.getItem(PARISHES_KEY),
          AsyncStorage.getItem(TYPES_KEY),
        ]);
        if (storedParishes) setParishes(JSON.parse(storedParishes));
        if (storedTypes) setEventTypes(JSON.parse(storedTypes));
      } catch (_) {}
    })();
  }, []);

  const saveParishes = (data: string[]) => {
    AsyncStorage.setItem(PARISHES_KEY, JSON.stringify(data)).catch(() => {});
  };
  const saveTypes = (data: EventTypeItem[]) => {
    AsyncStorage.setItem(TYPES_KEY, JSON.stringify(data)).catch(() => {});
  };

  const addParish = useCallback((parish: string) => {
    const trimmed = parish.trim();
    if (!trimmed) return;
    setParishes((prev) => {
      if (prev.some((p) => p.toLowerCase() === trimmed.toLowerCase())) return prev;
      const updated = [...prev, trimmed];
      saveParishes(updated);
      return updated;
    });
  }, []);

  const removeParish = useCallback((parish: string) => {
    setParishes((prev) => {
      const updated = prev.filter((p) => p !== parish);
      saveParishes(updated);
      return updated;
    });
  }, []);

  const addEventType = useCallback((type: Omit<EventTypeItem, 'id'>) => {
    const newType: EventTypeItem = { ...type, id: `custom_${Date.now()}` };
    setEventTypes((prev) => {
      const updated = [...prev, newType];
      saveTypes(updated);
      return updated;
    });
  }, []);

  const editEventType = useCallback((id: string, updates: Partial<Omit<EventTypeItem, 'id'>>) => {
    setEventTypes((prev) => {
      const updated = prev.map((t) => (t.id === id ? { ...t, ...updates } : t));
      saveTypes(updated);
      return updated;
    });
  }, []);

  const removeEventType = useCallback((id: string) => {
    setEventTypes((prev) => {
      const updated = prev.filter((t) => t.id !== id);
      saveTypes(updated);
      return updated;
    });
  }, []);

  const resetToDefaults = useCallback(() => {
    setParishes(DEFAULT_PARISHES);
    setEventTypes(DEFAULT_EVENT_TYPES);
    AsyncStorage.multiRemove([PARISHES_KEY, TYPES_KEY]).catch(() => {});
  }, []);

  return (
    <CategoriesContext.Provider
      value={{ parishes, eventTypes, addParish, removeParish, addEventType, editEventType, removeEventType, resetToDefaults }}
    >
      {children}
    </CategoriesContext.Provider>
  );
}
