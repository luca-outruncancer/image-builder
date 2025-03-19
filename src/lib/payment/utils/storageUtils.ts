// src/lib/payment/utils/storageUtils.ts
import {
  PaymentSession,
  PaymentStatus,
  PaymentError,
  TransactionRecord,
  PaymentMetadata
} from '../types/index';
import { storageLogger, paymentLogger } from '@/utils/logger';
import { SupabaseClient } from '@supabase/supabase-js';

// Map payment status to transaction status
export const PAYMENT_TO_TRANSACTION_STATUS: Record<PaymentStatus, string> = {
  [PaymentStatus.INITIALIZED]: 'INITIALIZED',
  [PaymentStatus.PENDING]: 'PENDING',
  [PaymentStatus.PROCESSING]: 'PROCESSING',
  [PaymentStatus.CONFIRMED]: 'CONFIRMED',
  [PaymentStatus.FAILED]: 'FAILED',
  [PaymentStatus.TIMEOUT]: 'TIMEOUT',
  [PaymentStatus.CANCELED]: 'CANCELED'
};

/**
 * Convert a payment status to a transaction database status
 */
export function getTransactionStatusFromPaymentStatus(status: PaymentStatus): string {
  const dbStatus = PAYMENT_TO_TRANSACTION_STATUS[status] || 'UNKNOWN';
  paymentLogger.debug('Converting payment status to transaction status', {
    paymentStatus: status,
    transactionStatus: dbStatus
  });
  return dbStatus;
}

/**
 * Convert a payment status to a database status string
 */
export function getImageStatusFromPaymentStatus(status: PaymentStatus): string {
  const dbStatus = PAYMENT_TO_TRANSACTION_STATUS[status] || 'PENDING';
  
  paymentLogger.debug('Converting payment status to database status', {
    paymentStatus: status,
    dbStatus
  });
  return dbStatus;
}

/**
 * Validate that the database connection is available
 */
export function validateDatabaseConnection(client: SupabaseClient | null): boolean {
  if (!client) {
    storageLogger.error('Database client is null');
    return false;
  }

  // Check if the client has the required properties
  if (!client.from || typeof client.from !== 'function') {
    storageLogger.error('Invalid database client: missing or invalid from() method', {
      hasFrom: !!client.from,
      fromType: typeof client.from
    });
    return false;
  }

  storageLogger.debug('Database client validation successful');
  return true;
}

/**
 * Get current timestamp in ISO format
 */
export function getCurrentTimestamp(): string {
  const timestamp = new Date().toISOString();
  storageLogger.debug('Generated timestamp', { timestamp });
  return timestamp;
}
