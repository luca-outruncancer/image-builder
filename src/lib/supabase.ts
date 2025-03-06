// src/lib/supabase.ts

import { createClient } from '@supabase/supabase-js';

// Use environment variables for Supabase connection
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Initialize Supabase client
let supabase: any = null;

try {
  if (supabaseUrl && supabaseKey) {
    supabase = createClient(supabaseUrl, supabaseKey);
    console.log("Supabase client initialized in shared utility");
  } else {
    console.error("Unable to initialize Supabase client due to missing environment variables in shared utility");
  }
} catch (error) {
  console.error("Error initializing Supabase client in shared utility:", error);
}

export { supabase };