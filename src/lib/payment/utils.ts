// src/lib/payment/utils.ts
import { ErrorCategory, PaymentError } from './types';
import { SendTransactionError } from '@solana/web3.js';
import { paymentLogger } from '@/utils/logger';

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
    // Only use error logging for unexpected errors
    if (category === ErrorCategory.UNKNOWN_ERROR || 
        category === ErrorCategory.BLOCKCHAIN_ERROR || 
        category === ErrorCategory.NETWORK_ERROR) {
      paymentLogger.error(`Payment error [${category}]: ${message}`, originalError instanceof Error ? originalError : new Error(String(originalError)));
    } else {
      // Use info logging for expected errors (user rejection, timeouts, etc.)
      paymentLogger.info(`Payment note [${category}]: ${message}`, {
        error: originalError instanceof Error ? originalError.message : String(originalError),
        code
      });
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
 * Extract transaction signature from error message
 */
export function extractSignatureFromError(error: any): string | null {
  if (!error) return null;
  
  // Check error message for signature
  const errorMessage = error.message || String(error);
  const signatureMatch = errorMessage.match(/signature: ([A-Za-z0-9]{32,})/);
  if (signatureMatch) {
    return signatureMatch[1];
  }
  
  // Check error logs if available
  if (error.logs) {
    for (const log of error.logs) {
      const logMatch = log.match(/signature: ([A-Za-z0-9]{32,})/);
      if (logMatch) {
        return logMatch[1];
      }
    }
  }
  
  return null;
}

/**
 * Generate a unique nonce for transactions
 */
export function getNonce(): number {
  // Use timestamp as base (last 6 digits)
  const timestamp = Date.now() % 1000000;
  // Add random number (0-999)
  const random = Math.floor(Math.random() * 1000);
  // Combine them
  return timestamp * 1000 + random;
}

/**
 * Create a unique identifier for a payment
 */
export function generatePaymentId(): string {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
  // Add entropy to make it unique even in case of timestamp collisions
  const entropy = crypto.getRandomValues(new Uint8Array(2))
    .reduce((acc, val) => acc + val.toString(16), '');
  
  return `pay_${timestamp}_${random}_${entropy}`;
}

/**
 * Format an error message for user display
 */
export function formatErrorForUser(error: PaymentError): string {
  // Special case for original error messages we want to show directly
  if (error.originalError instanceof Error) {
    // Check for specific Solana error messages to provide user-friendly explanations
    const errorMsg = error.originalError.message;
    
    if (errorMsg.includes('found no record of a prior credit') || 
        errorMsg.includes('insufficient funds') ||
        errorMsg.includes('Attempt to debit an account')) {
      return "Your wallet has insufficient funds for this transaction. Please add more SOL to your wallet and try again.";
    }
    
    if (errorMsg.includes('Simulation failed')) {
      return "The blockchain rejected this transaction. This can happen if your wallet is low on funds or the network is congested. Please try again or contact support.";
    }
    
    if (errorMsg.includes('Blockhash not found') || errorMsg.includes('block hash')) {
      return "The transaction took too long to process. Please try again.";
    }
  }
  
  // Otherwise use category-based messages
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
      paymentLogger.info(`Attempt ${i + 1}/${maxRetries} failed:`, error);
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
        key.includes('lastValidBlockHeight') ||
        key.includes('paymentSession') ||
        key.includes('txSignature')
      )) {
        keysToRemove.push(key);
      }
    }
    
    // Remove all identified keys
    keysToRemove.forEach(key => {
      try {
        sessionStorage.removeItem(key);
      } catch (e) {
        paymentLogger.info(`Failed to remove ${key} from session storage:`, e);
      }
    });
    
    paymentLogger.info(`Cleared ${keysToRemove.length} session storage items to prevent transaction reuse`);
  } catch (error) {
    paymentLogger.error("Error clearing session storage:", error);
  }
}

/**
 * Store transaction signature for a payment in session to prevent resubmissions
 */
export function storeTransactionSignature(paymentId: string, signature: string): void {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) {
      return;
    }
    
    const key = `txSignature_${paymentId}`;
    sessionStorage.setItem(key, signature);
    paymentLogger.info(`Stored transaction signature for payment ${paymentId}`);
  } catch (error) {
    paymentLogger.error("Error storing transaction signature:", error);
  }
}

/**
 * Get stored transaction signature for a payment
 */
export function getStoredTransactionSignature(paymentId: string): string | null {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) {
      return null;
    }
    
    const key = `txSignature_${paymentId}`;
    return sessionStorage.getItem(key);
  } catch (error) {
    paymentLogger.error("Error retrieving transaction signature:", error);
    return null;
  }
}

/**
 * Generate a unique session ID for diagnostic purposes
 * This helps trace transactions across page refreshes
 */
export function getOrCreateSessionId(): string {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) {
      return `memory_${Date.now()}`;
    }
    
    const key = 'payment_session_id';
    let sessionId = sessionStorage.getItem(key);
    
    if (!sessionId) {
      sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      sessionStorage.setItem(key, sessionId);
    }
    
    return sessionId;
  } catch (error) {
    paymentLogger.error("Error with session ID:", error);
    return `fallback_${Date.now()}`;
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