import 'react-native-url-polyfill/auto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://twilfdbvrzhlnllcmssc.supabase.co';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

const createStorageAdapter = () => {
  if (Platform.OS === 'web') {
    return {
      getItem: (key: string) => {
        if (typeof window !== 'undefined' && window.localStorage) {
          return Promise.resolve(window.localStorage.getItem(key));
        }
        return Promise.resolve(null);
      },
      setItem: (key: string, value: string) => {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem(key, value);
        }
        return Promise.resolve();
      },
      removeItem: (key: string) => {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.removeItem(key);
        }
        return Promise.resolve();
      },
    };
  }
  return AsyncStorage;
};

// Warn in dev if keys are missing, but never crash the module
if (!SUPABASE_ANON_KEY) {
  console.warn(
    '[VybzHub] EXPO_PUBLIC_SUPABASE_ANON_KEY is not set. ' +
      'Copy the "anon / public" key from your Supabase Dashboard → Project Settings → API ' +
      'and add it to your .env file as EXPO_PUBLIC_SUPABASE_ANON_KEY=<key>.'
  );
}

// Use a placeholder key so createClient never throws — real auth calls will
// fail with a descriptive server error rather than a crash.
export const supabase: SupabaseClient = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY || 'placeholder-key-set-EXPO_PUBLIC_SUPABASE_ANON_KEY',
  {
    auth: {
      storage: createStorageAdapter() as any,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
);

/** True once we have a real anon key */
export const supabaseReady = Boolean(SUPABASE_ANON_KEY);

/**
 * Returns the singleton Supabase client.
 * All ticketing and Phase 3/4 services should call this instead of
 * importing `supabase` directly, so the reference stays consistent.
 */
export function getSupabaseClient(): SupabaseClient {
  return supabase;
}
