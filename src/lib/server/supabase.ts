// src/lib/server/supabase.ts

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { systemLogger } from '@/utils/logger';

// Use environment variables for Supabase connection
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Initialize Supabase client
let supabase: SupabaseClient | null = null;
let isInitialized = false;
let initError: Error | null = null;

/**
 * Initialize the Supabase client
 * This should be called only once at server startup
 * The function is idempotent - calling it multiple times will only initialize once
 */
export function initializeSupabase() {
  if (isInitialized) {
    systemLogger.debug('Supabase client already initialized, reusing existing instance');
    return { supabase, error: initError };
  }
  
  try {
    if (!supabaseUrl || !supabaseKey) {
      const error = new Error('Missing Supabase environment variables');
      systemLogger.error('Failed to initialize Supabase client', error, {
        hasUrl: !!supabaseUrl,
        hasKey: !!supabaseKey
      });
      initError = error;
      return { supabase: null, error };
    }
    
    systemLogger.info('Initializing Supabase client', {
      url: supabaseUrl.substring(0, 15) + '...',
      isServer: typeof window === 'undefined'
    });
    
    supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false // Disable session persistence for server-side usage
      }
    });
    
    isInitialized = true;
    systemLogger.info('Supabase client initialized successfully');
    
    return { supabase, error: null };
  } catch (error) {
    initError = error as Error;
    systemLogger.error('Failed to initialize Supabase client', error instanceof Error ? error : new Error(String(error)));
    return { supabase: null, error: initError };
  }
}

// Initialize on module load for both client and server
// This ensures the client is available immediately when imported
initializeSupabase();

// Export the client and helper functions
export { supabase };
export const getSupabaseClient = () => {
  // If not initialized yet, try to initialize
  if (!isInitialized && !initError) {
    initializeSupabase();
  }
  return supabase;
};
export const isSupabaseInitialized = () => isInitialized;
export const getSupabaseError = () => initError; 