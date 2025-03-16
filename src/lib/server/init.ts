import { initializeSupabase } from '@/lib/supabase';
import { systemLogger } from '@/utils/logger';
import { initializeImageCache } from './imageCache';

/**
 * Server-side initialization registry
 * Add all server-side services that need initialization here
 */
interface ServerModule {
  name: string;
  initialize: () => Promise<{ success: boolean; error?: Error }>;
  isRequired: boolean;
}

/**
 * Result of server initialization
 */
export interface ServerInitResult {
  success: boolean;
  results: Record<string, { success: boolean; error?: Error }>;
  criticalFailure: boolean;
  alreadyInitialized?: boolean;
}

/**
 * Registry of all server modules that need initialization
 */
const serverModules: ServerModule[] = [
  {
    name: 'Supabase',
    initialize: async () => {
      const { supabase, error } = initializeSupabase();
      return { 
        success: !!supabase, 
        error: error || undefined 
      };
    },
    isRequired: true
  },
  {
    name: 'ImageCache',
    initialize: async () => {
      // Only initialize image cache after Supabase is ready
      const result = await initializeImageCache();
      return { 
        success: result.success, 
        error: result.error 
      };
    },
    isRequired: false // Not critical for app function, but improves performance
  },
  // Add other modules here as needed
  // Example:
  // {
  //   name: 'Redis',
  //   initialize: async () => {
  //     const result = await initializeRedis();
  //     return { success: result.connected, error: result.error };
  //   },
  //   isRequired: true
  // },
];

/**
 * Initialize all server modules
 * @returns Object containing initialization results
 */
export async function initializeServer(): Promise<ServerInitResult> {
  systemLogger.info('Starting server initialization');
  
  const results: Record<string, { success: boolean; error?: Error }> = {};
  let criticalFailure = false;
  
  for (const module of serverModules) {
    try {
      systemLogger.info(`Initializing ${module.name}`);
      const result = await module.initialize();
      
      results[module.name] = result;
      
      if (!result.success) {
        systemLogger.error(`Failed to initialize ${module.name}`, result.error);
        if (module.isRequired) {
          criticalFailure = true;
        }
      } else {
        systemLogger.info(`Successfully initialized ${module.name}`);
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      results[module.name] = { success: false, error: err };
      systemLogger.error(`Error during ${module.name} initialization`, err);
      
      if (module.isRequired) {
        criticalFailure = true;
      }
    }
  }
  
  if (criticalFailure) {
    systemLogger.error('Server initialization failed due to critical module failure');
  } else {
    systemLogger.info('Server initialization completed successfully');
  }
  
  return {
    success: !criticalFailure,
    results,
    criticalFailure
  };
}

// Singleton to track initialization state
let isInitialized = false;
let initializationPromise: Promise<ServerInitResult> | null = null;

/**
 * Ensure server is initialized
 * This can be called multiple times safely - will only initialize once
 */
export function ensureServerInitialized(): Promise<ServerInitResult> {
  if (isInitialized) {
    return Promise.resolve({ 
      success: true, 
      alreadyInitialized: true,
      results: {},
      criticalFailure: false
    });
  }
  
  if (initializationPromise) {
    return initializationPromise;
  }
  
  initializationPromise = initializeServer();
  
  // Set the initialization flag when complete
  initializationPromise.then(result => {
    isInitialized = result.success;
  });
  
  return initializationPromise;
} 