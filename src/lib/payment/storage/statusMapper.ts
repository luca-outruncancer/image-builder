// src/lib/payment/storage/statusMapper.ts
import { PaymentStatus } from '../types';
import { PAYMENT_TO_TRANSACTION_STATUS } from '../utils/storageUtils';

/**
 * StatusMapper handles the conversion between various status types
 * in the payment and storage systems
 */
export class StatusMapper {
  /**
   * Convert a payment status to a database status
   */
  public getTransactionStatus(paymentStatus: PaymentStatus): string {
    return PAYMENT_TO_TRANSACTION_STATUS[paymentStatus] || 'UNKNOWN';
  }
  
  /**
   * Determine if a payment status is final (no further processing needed)
   */
  public isFinalStatus(paymentStatus: PaymentStatus): boolean {
    return [
      PaymentStatus.CONFIRMED,
      PaymentStatus.FAILED,
      PaymentStatus.TIMEOUT,
      PaymentStatus.CANCELED
    ].includes(paymentStatus);
  }
  
  /**
   * Get a description of the current status
   */
  public getStatusDescription(paymentStatus: PaymentStatus): string {
    switch (paymentStatus) {
      case PaymentStatus.INITIALIZED:
        return 'Payment initialized';
      case PaymentStatus.PENDING:
        return 'Payment pending user confirmation';
      case PaymentStatus.PROCESSING:
        return 'Payment being processed';
      case PaymentStatus.CONFIRMED:
        return 'Payment confirmed successfully';
      case PaymentStatus.FAILED:
        return 'Payment failed';
      case PaymentStatus.TIMEOUT:
        return 'Payment timed out';
      case PaymentStatus.CANCELED:
        return 'Payment canceled';
      default:
        return 'Unknown payment status';
    }
  }
}

// Export a singleton instance
export const statusMapper = new StatusMapper();
