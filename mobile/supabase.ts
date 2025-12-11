import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Sentry from "@sentry/react-native";
import { createClient } from '@supabase/supabase-js';

// Supabase configuration from environment variables
// Expo requires the EXPO_PUBLIC_ prefix for environment variables to be accessible in the app
// Create a .env file in the mobile directory with:
// EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
// EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || SUPABASE_URL === 'YOUR_SUPABASE_URL' || !SUPABASE_ANON_KEY || SUPABASE_ANON_KEY === 'YOUR_SUPABASE_ANON_KEY') {
  throw new Error(
    'Missing Supabase credentials!\n\n' +
    'Please create a .env file in the mobile directory with:\n' +
    'EXPO_PUBLIC_SUPABASE_URL=your_supabase_url\n' +
    'EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key\n\n' +
    'Note: The EXPO_PUBLIC_ prefix is required for Expo to expose these variables.\n' +
    'Get these values from: Supabase Dashboard > Settings > API'
  );
}

// Create a proper storage adapter for AsyncStorage
// Supabase expects an object with getItem, setItem, removeItem methods
const AsyncStorageAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      const value = await AsyncStorage.getItem(key);
      // Only log auth/session-related keys to reduce breadcrumb volume
      if (key.includes('auth') || key.includes('session') || key.includes('supabase')) {
        Sentry.addBreadcrumb({
          category: "storage",
          message: `GET ${key}`,
          level: "debug",
          data: { found: value !== null },
        });
      }
      return value;
    } catch (err) {
      // Always log errors
      Sentry.addBreadcrumb({
        category: "storage",
        message: `GET ${key} FAILED`,
        level: "error",
        data: { error: (err as Error)?.message },
      });
      throw err;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      await AsyncStorage.setItem(key, value);
      // Only log auth/session-related keys to reduce breadcrumb volume
      if (key.includes('auth') || key.includes('session') || key.includes('supabase')) {
        Sentry.addBreadcrumb({
          category: "storage",
          message: `SET ${key}`,
          level: "debug",
        });
      }
    } catch (err) {
      // Always log errors
      Sentry.addBreadcrumb({
        category: "storage",
        message: `SET ${key} FAILED`,
        level: "error",
        data: { error: (err as Error)?.message },
      });
      throw err;
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      await AsyncStorage.removeItem(key);
      // Only log auth/session-related keys to reduce breadcrumb volume
      if (key.includes('auth') || key.includes('session') || key.includes('supabase')) {
        Sentry.addBreadcrumb({
          category: "storage",
          message: `REMOVE ${key}`,
          level: "debug",
        });
      }
    } catch (err) {
      // Always log errors
      Sentry.addBreadcrumb({
        category: "storage",
        message: `REMOVE ${key} FAILED`,
        level: "error",
        data: { error: (err as Error)?.message },
      });
      throw err;
    }
  },
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorageAdapter,
    autoRefreshToken: true, // Re-enabled now that refresh token reuse interval is set to 300s
    persistSession: true,
    detectSessionInUrl: false,
  },
});
