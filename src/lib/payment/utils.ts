// src/lib/payment/utils.ts
import { ErrorCategory, PaymentError } from './types';
import { SendTransactionError } from '@solana/web3.js';

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
    // Only use console.error for unexpected errors
    if (category === ErrorCategory.UNKNOWN_ERROR || 
        category === ErrorCategory.BLOCKCHAIN_ERROR || 
        category === ErrorCategory.NETWORK_ERROR) {
      console.error(`Payment error [${category}]: ${message}`, originalError);
    } else {
      // Use console.log for expected errors (user rejection, timeouts, etc.)
      console.log(`Payment note [${category}]: ${message}`, originalError);
    }
    
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
    console.error("Error extracting signature from error:", e);
  }
  
  return null;
}

/**
 * Generate a unique transaction ID/nonce
 */
export function getNonce(): string {
  return Date.now().toString() + Math.random().toString().slice(2, 8);
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
      // Special handling for duplicate transaction errors
      if (error.code === 'DUPLICATE_TRANSACTION') {
        return "This transaction was already processed. Please refresh the page and try again.";
      }
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
  initialDelayMs: number = 500,
  shouldRetry: (error: any) => boolean = () => true
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
      
      // Don't retry if it's a duplicate transaction error
      if (isTxAlreadyProcessedError(error)) {
        throw error;
      }
      
      // Custom retry logic if provided
      if (!shouldRetry(error)) {
        throw error;
      }
      
      // Exponential backoff
      const delay = initialDelayMs * Math.pow(2, i);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

/**
 * Clear blockhash data from session storage
 * This helps prevent duplicate transaction errors by removing cached blockhashes
 */
export function clearSessionBlockhashData(): void {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) {
      return;
    }
    
    // Search for and remove blockhash-related items in session storage
    const keysToRemove: string[] = [];
    
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && (
        key.includes('blockhash') || 
        key.includes('transaction') ||
        key.includes('lastValidBlockHeight')
      )) {
        keysToRemove.push(key);
      }
    }
    
    // Remove all identified keys
    keysToRemove.forEach(key => {
      try {
        sessionStorage.removeItem(key);
      } catch (e) {
        console.warn(`Failed to remove ${key} from session storage:`, e);
      }
    });
    
    console.log(`Cleared ${keysToRemove.length} blockhash-related items from session storage`);
  } catch (error) {
    console.error("Error clearing session storage:", error);
  }
}

/**
 * Debounce function to prevent multiple rapid executions
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  
  return function(...args: Parameters<T>): void {
    if (timeout) {
      clearTimeout(timeout);
    }
    
    timeout = setTimeout(() => {
      func(...args);
      timeout = null;
    }, wait);
  };
}