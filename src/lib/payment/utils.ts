// src/lib/payment/utils.ts
import { PaymentError, ErrorCategory } from './types';

/**
 * Create a standardized payment error object
 */
export function createPaymentError(
  category: ErrorCategory,
  message: string,
  originalError?: any,
  retryable: boolean = false,
  code?: string
): PaymentError {
  console.error(`Payment error [${category}]: ${message}`, originalError);
  
  return {
    category,
    message,
    originalError,
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
 * Create a unique identifier for a payment
 */
export function generatePaymentId(): string {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
  return `pay_${timestamp}_${random}`;
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
      return "There was an issue processing the transaction on the blockchain. Please try again.";
    
    default:
      return error.message || "An unexpected error occurred. Please try again.";
  }
}

/**
 * Format a currency amount with the appropriate decimal places
 */
export function formatCurrencyAmount(amount: number, token: string): string {
  const decimals = token === 'SOL' ? 6 : 2;
  return amount.toFixed(decimals);
}

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelayMs: number = 500
): Promise<T> {
  let lastError: any;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      console.warn(`Attempt ${i + 1}/${maxRetries} failed:`, error);
      lastError = error;
      
      // Don't retry if it's a user rejection or balance error
      if (isUserRejectionError(error) || isBalanceError(error)) {
        throw error;
      }
      
      // Exponential backoff
      const delay = initialDelayMs * Math.pow(2, i);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}