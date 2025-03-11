// src/lib/payment/utils/storageUtils.ts
import { IMAGE_STATUS } from '@/lib/imageStorage';
import { PaymentStatus } from '../types';
import { storageLogger, paymentLogger } from '@/utils/logger';

// Map payment status to transaction status
export const PAYMENT_TO_TRANSACTION_STATUS: Record<PaymentStatus, string> = {
  [PaymentStatus.INITIALIZED]: 'initiated',
  [PaymentStatus.PENDING]: 'pending',
  [PaymentStatus.PROCESSING]: 'in_progress',
  [PaymentStatus.CONFIRMED]: 'success',
  [PaymentStatus.FAILED]: 'failed',
  [PaymentStatus.TIMEOUT]: 'timeout',
  [PaymentStatus.CANCELED]: 'canceled'
};

// Map payment status to image status
export const PAYMENT_TO_IMAGE_STATUS: Record<PaymentStatus, number> = {
  [PaymentStatus.INITIALIZED]: IMAGE_STATUS.PENDING_PAYMENT,
  [PaymentStatus.PENDING]: IMAGE_STATUS.PENDING_PAYMENT,
  [PaymentStatus.PROCESSING]: IMAGE_STATUS.PENDING_PAYMENT,
  [PaymentStatus.CONFIRMED]: IMAGE_STATUS.CONFIRMED,
  [PaymentStatus.FAILED]: IMAGE_STATUS.PAYMENT_FAILED,
  [PaymentStatus.TIMEOUT]: IMAGE_STATUS.PAYMENT_TIMEOUT,
  [PaymentStatus.CANCELED]: IMAGE_STATUS.NOT_INITIATED
};

/**
 * Convert a payment status to a transaction database status
 */
export function getTransactionStatusFromPaymentStatus(status: PaymentStatus): string {
  const dbStatus = PAYMENT_TO_TRANSACTION_STATUS[status] || 'unknown';
  paymentLogger.debug('Converting payment status to transaction status', {
    paymentStatus: status,
    transactionStatus: dbStatus
  });
  return dbStatus;
}

/**
 * Convert a payment status to an image status
 */
export function getImageStatusFromPaymentStatus(status: PaymentStatus): number {
  const imageStatus = PAYMENT_TO_IMAGE_STATUS[status] || IMAGE_STATUS.PENDING_PAYMENT;
  
  // Find the status name in a type-safe way
  const imageStatusEntries = Object.entries(IMAGE_STATUS) as [string, number][];
  const statusName = imageStatusEntries.find(([_, value]) => value === imageStatus)?.[0] || 'UNKNOWN';
  
  paymentLogger.debug('Converting payment status to image status', {
    paymentStatus: status,
    imageStatus,
    imageStatusName: statusName
  });
  return imageStatus;
}

/**
 * Validate a database connection
 */
export function validateDatabaseConnection(db: any): boolean {
  if (!db) {
    storageLogger.error('Database client not available');
    return false;
  }
  
  storageLogger.debug('Database connection validated');
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
