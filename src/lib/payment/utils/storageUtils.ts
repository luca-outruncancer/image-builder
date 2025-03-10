// src/lib/payment/utils/storageUtils.ts
import { IMAGE_STATUS } from '@/lib/imageStorage';
import { PaymentStatus } from '../types';

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
  return PAYMENT_TO_TRANSACTION_STATUS[status] || 'unknown';
}

/**
 * Convert a payment status to an image status
 */
export function getImageStatusFromPaymentStatus(status: PaymentStatus): number {
  return PAYMENT_TO_IMAGE_STATUS[status] || IMAGE_STATUS.PENDING_PAYMENT;
}

/**
 * Validate a database connection
 */
export function validateDatabaseConnection(db: any): boolean {
  if (!db) {
    console.warn("Database client not available");
    return false;
  }
  return true;
}

/**
 * Get current timestamp in ISO format
 */
export function getCurrentTimestamp(): string {
  return new Date().toISOString();
}
