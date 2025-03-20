// src/lib/payment/types/index.ts

/**
 * This file re-exports all types from the model.ts file.
 * We've now migrated to using a modular types approach.
 */

// Export all types from the model.ts file
export * from './model';

// Then export any types that might be unique to storageTypes
export type { 
  PaymentImageRecord,
  DatabaseResult,
  StatusMapping
} from './storageTypes';
