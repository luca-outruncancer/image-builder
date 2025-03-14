// src/lib/supabase.ts

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { systemLogger } from '@/utils/logger';

// Use environment variables for Supabase connection
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Initialize Supabase client
let supabase: SupabaseClient | null = null;
let isInitialized = false;
let initError: Error | null = null;

export function initializeSupabase() {
  if (isInitialized) return { supabase, error: initError };
  
  try {
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase environment variables');
    }
    
    supabase = createClient(supabaseUrl, supabaseKey);
    isInitialized = true;
    systemLogger.info('Supabase client initialized');
    
    return { supabase, error: null };
  } catch (error) {
    initError = error as Error;
    systemLogger.error('Failed to initialize Supabase client', error instanceof Error ? error : new Error(String(error)));
    return { supabase: null, error: initError };
  }
}

// Initialize on module load
initializeSupabase();

export { supabase };
export const getSupabaseClient = () => supabase;
export const isSupabaseInitialized = () => isInitialized;
export const getSupabaseError = () => initError;