// src/lib/payment/utils/transactionUtils.ts

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
      
      // Don't retry if the custom retry function returns false
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
