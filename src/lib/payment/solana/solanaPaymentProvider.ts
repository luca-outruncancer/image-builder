// src/lib/payment/solana/solanaPaymentProvider.ts
'use client';

import { 
  PaymentRequest,
  TransactionResult,
  WalletConfig,
  ErrorCategory
} from '../types';
import { 
  createPaymentError, 
  isUserRejectionError,
  isNetworkError,
  isBalanceError,
  retryWithBackoff,
  isTxAlreadyProcessedError
} from '../utils';
import { SolPaymentProcessor } from './solPaymentProcessor';
import { TokenPaymentProcessor } from './tokenPaymentProcessor';
import { connectionManager } from './connectionManager';

/**
 * SolanaPaymentProvider handles the interaction with Solana blockchain
 * This is a facade that delegates to specialized processors
 */
export class SolanaPaymentProvider {
  private wallet: WalletConfig;
  private solProcessor: SolPaymentProcessor;
  private tokenProcessor: TokenPaymentProcessor;
  
  constructor(wallet: WalletConfig) {
    this.wallet = wallet;
    this.solProcessor = new SolPaymentProcessor(wallet);
    this.tokenProcessor = new TokenPaymentProcessor(wallet);
  }
  
  /**
   * Verify if a transaction has already been processed successfully
   */
  public async verifyTransaction(signature: string): Promise<boolean> {
    return connectionManager.verifyTransaction(signature);
  }

  /**
   * Clear the cached transactions
   */
  public clearTransactionCache(): void {
    console.log("Clearing transaction cache");
    this.solProcessor.clearTransactionCache();
    this.tokenProcessor.clearTransactionCache();
  }
  
  /**
   * Process payment with automatic token type selection and retry logic
   */
  public async processPayment(request: PaymentRequest, mintAddress?: string | null): Promise<TransactionResult> {
    try {
      console.log(`Processing payment [PaymentID: ${request.metadata?.paymentId || 'unknown'}]`, {
        amount: request.amount,
        token: request.token,
        hasMintAddress: !!mintAddress
      });
      
      // Retry with backoff for transient errors
      return await retryWithBackoff(async () => {
        if (request.token === 'SOL') {
          return await this.solProcessor.processPayment(request);
        } else if (mintAddress) {
          return await this.tokenProcessor.processPayment(request, mintAddress);
        } else {
          throw new Error(`Unsupported payment token: ${request.token}`);
        }
      }, 2, 500, (error) => {
        // Don't retry user rejections or balance errors
        if (isUserRejectionError(error) || isBalanceError(error)) {
          return false;
        }
        
        // Don't retry duplicate transaction errors
        if (isTxAlreadyProcessedError(error)) {
          return false;
        }
        
        // Only retry network errors and unknown errors
        return isNetworkError(error) || true;
      }); 
    } catch (error) {
      console.error(`Payment processing error [PaymentID: ${request.metadata?.paymentId || 'unknown'}]:`, error);
      
      // Handle errors that weren't automatically retried
      if (isUserRejectionError(error)) {
        return {
          success: false,
          error: createPaymentError(
            ErrorCategory.USER_REJECTION,
            'Transaction was declined by user',
            error,
            false
          )
        };
      }
      
      if (isBalanceError(error)) {
        return {
          success: false,
          error: createPaymentError(
            ErrorCategory.BALANCE_ERROR,
            error instanceof Error ? error.message : 'Insufficient funds',
            error,
            false
          )
        };
      }
      
      if (isNetworkError(error)) {
        return {
          success: false,
          error: createPaymentError(
            ErrorCategory.NETWORK_ERROR,
            'Network error during payment processing',
            error,
            true
          )
        };
      }
      
      if (isTxAlreadyProcessedError(error)) {
        return {
          success: false,
          error: createPaymentError(
            ErrorCategory.BLOCKCHAIN_ERROR,
            'Transaction already processed. Please try again with a new transaction.',
            error,
            false,
            'DUPLICATE_TRANSACTION'
          )
        };
      }
      
      return {
        success: false,
        error: createPaymentError(
          ErrorCategory.UNKNOWN_ERROR,
          error instanceof Error ? error.message : 'Payment processing failed',
          error,
          true
        )
      };
    }
  }
}

export default SolanaPaymentProvider;