// src/lib/payment/utils/errorUtils.ts
import { PaymentError, ErrorCategory } from '../types/index';
import { SendTransactionError } from '@solana/web3.js';
import { paymentLogger } from '@/utils/logger';

/**
 * Create a standardized payment error object
 */
export function createPaymentError(
  category: ErrorCategory,
  message: string,
  originalError: Error | unknown,
  retryable: boolean,
  code?: string
): PaymentError {
  const error = originalError instanceof Error ? originalError : new Error(String(originalError));
  
  if (retryable) {
    paymentLogger.error('Payment error', error, {
      category,
      message,
      code
    });
  } else {
    paymentLogger.info('Payment note', {
      category,
      message,
      error: error.message,
      code
    });
  }

  return {
    category,
    message,
    originalError: error,
    retryable,
    code
  };
}

/**
 * Determine if an error is a user rejection
 */
export function isUserRejectionError(error: any): boolean {
  if (!error) return false;
  
  const errorMessage = error.message || String(error);
  return (
    errorMessage.includes("rejected") || 
    errorMessage.includes("cancelled") || 
    errorMessage.includes("canceled") || 
    errorMessage.includes("declined") ||
    errorMessage.includes("User denied") ||
    errorMessage.includes("User rejected") ||
    errorMessage.includes("WalletSignTransactionError")
  );
}

/**
 * Determine if an error is a network error
 */
export function isNetworkError(error: any): boolean {
  if (!error) return false;
  
  const errorMessage = error.message || String(error);
  return (
    errorMessage.includes("network") ||
    errorMessage.includes("timeout") ||
    errorMessage.includes("timed out") ||
    errorMessage.includes("connection") ||
    errorMessage.includes("unreachable") ||
    errorMessage.includes("failed to fetch")
  );
}

/**
 * Determine if an error is a balance error
 */
export function isBalanceError(error: any): boolean {
  if (!error) return false;
  
  const errorMessage = error.message || String(error);
  return (
    errorMessage.includes("insufficient") ||
    errorMessage.includes("balance") ||
    errorMessage.includes("not enough") ||
    errorMessage.includes("0x1") // Solana error code for insufficient funds
  );
}

/**
 * Determine if an error is a "Transaction already processed" error
 */
export function isTxAlreadyProcessedError(error: any): boolean {
  if (!error) return false;
  
  // Check error message
  const errorMessage = error.message || String(error);
  
  return (
    errorMessage.includes("already been processed") ||
    errorMessage.includes("already processed") ||
    errorMessage.includes("This transaction has already") ||
    // SendTransactionError with duplicate code
    (error instanceof SendTransactionError && 
      error.logs && 
      error.logs.some(log => log.includes("already processed")))
  );
}

/**
 * Extract transaction signature from error if possible
 */
export function extractSignatureFromError(error: any): string | null {
  if (!error) return null;
  
  try {
    // Check if it's a SendTransactionError with logs
    if (error instanceof SendTransactionError && error.logs) {
      for (const log of error.logs) {
        const matches = log.match(/signature: ([A-Za-z0-9]+)/);
        if (matches && matches[1]) {
          return matches[1];
        }
      }
    }
    
    // Try to extract from error message
    const errorMessage = error.message || String(error);
    const sigMatches = errorMessage.match(/signature ([A-Za-z0-9]+)/);
    if (sigMatches && sigMatches[1]) {
      return sigMatches[1];
    }
  } catch (e) {
    paymentLogger.error('Error extracting signature', e instanceof Error ? e : new Error(String(e)));
  }
  
  return null;
}

/**
 * Format an error message for user display
 */
export function formatErrorForUser(error: PaymentError): string {
  switch (error.category) {
    case ErrorCategory.USER_REJECTION:
      return "Transaction was declined. You can try again when ready.";
    
    case ErrorCategory.BALANCE_ERROR:
      return "Insufficient funds for this transaction. Please add more funds to your wallet.";
    
    case ErrorCategory.NETWORK_ERROR:
      return "Network connection issue. Please check your internet connection and try again.";
    
    case ErrorCategory.TIMEOUT_ERROR:
      return "The transaction took too long to process. Please try again.";
    
    case ErrorCategory.WALLET_ERROR:
      return "There was an issue with your wallet. Please reconnect your wallet and try again.";
    
    case ErrorCategory.BLOCKCHAIN_ERROR:
      // Special handling for duplicate transaction errors
      if (error.code === 'DUPLICATE_TRANSACTION') {
        return "This transaction was already processed. Please refresh the page and try again.";
      }
      return "There was an issue processing the transaction on the blockchain. Please try again.";
    
    default:
      return error.message || "An unexpected error occurred. Please try again.";
  }
}
