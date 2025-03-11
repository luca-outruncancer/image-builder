// src/lib/payment/solana/solanaPaymentProvider.ts
'use client';

import { 
  Connection, 
  PublicKey, 
  Commitment,
  SendTransactionError
} from '@solana/web3.js';
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
  isTxAlreadyProcessedError,
  clearSessionBlockhashData
} from '../utils';
import { processSolPayment } from './solPaymentProcessor';
import { processTokenPayment } from './tokenPaymentProcessor';
import { RPC_ENDPOINT, CONNECTION_TIMEOUT } from '@/lib/solana/walletConfig';

/**
 * SolanaPaymentProvider handles the interaction with Solana blockchain
 * This is a facade that delegates to specialized processors while managing connection and transaction state
 */
export class SolanaPaymentProvider {
  private connection: Connection;
  private wallet: WalletConfig;
  private cachedTransactions: Map<string, {
    signature: string;
    timestamp: number;
    status: 'pending' | 'confirmed' | 'failed';
  }> = new Map();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
  private readonly CLEANUP_INTERVAL = 60 * 1000; // 1 minute
  
  constructor(wallet: WalletConfig) {
    this.wallet = wallet;
    this.connection = this.createConnection();
    this.startCacheCleanup();
  }
  
  private startCacheCleanup() {
    setInterval(() => {
      this.cleanupCache();
    }, this.CLEANUP_INTERVAL);
  }
  
  private cleanupCache() {
    const now = Date.now();
    for (const [key, value] of this.cachedTransactions.entries()) {
      if (now - value.timestamp > this.CACHE_DURATION) {
        this.cachedTransactions.delete(key);
      }
    }
  }
  
  /**
   * Create a Solana connection with custom configuration
   */
  private createConnection(): Connection {
    const commitment: Commitment = 'confirmed';
    
    try {
      if (!RPC_ENDPOINT) {
        throw new Error('No RPC endpoint configured');
      }
      
      const connection = new Connection(RPC_ENDPOINT, {
        commitment,
        confirmTransactionInitialTimeout: CONNECTION_TIMEOUT
      });
      
      return connection;
    } catch (error) {
      console.error("Failed to create Solana connection:", error);
      throw createPaymentError(
        ErrorCategory.NETWORK_ERROR,
        'Connection initialization failed',
        error,
        true
      );
    }
  }

  /**
   * Verify if a transaction has already been processed successfully
   */
  public async verifyTransaction(signature: string): Promise<boolean> {
    try {
      console.log(`Verifying transaction signature: ${signature}`);
      const status = await this.connection.getSignatureStatus(signature);
      
      // If we have a confirmation, the transaction succeeded
      if (status && status.value && !status.value.err) {
        console.log(`Transaction verified: ${signature} was SUCCESSFUL`);
        return true;
      }
      
      console.log(`Transaction verified: ${signature} was NOT successful`, status);
      return false;
    } catch (error) {
      console.error("Error verifying transaction:", error);
      return false;
    }
  }

  /**
   * Check if a transaction with these parameters is already in progress or completed
   */
  private async checkExistingTransaction(paymentId: string): Promise<string | null> {
    const cached = this.cachedTransactions.get(paymentId);
    if (!cached) return null;
    
    // If transaction is already confirmed, return the signature
    if (cached.status === 'confirmed') {
      return cached.signature;
    }
    
    // If transaction is pending, check its status
    if (cached.status === 'pending') {
      try {
        const status = await this.connection.getSignatureStatus(cached.signature);
        if (status.value?.confirmationStatus === 'confirmed' || status.value?.confirmationStatus === 'finalized') {
          // Update cache with confirmed status
          this.cachedTransactions.set(paymentId, {
            ...cached,
            status: 'confirmed'
          });
          return cached.signature;
        }
      } catch (error) {
        console.error(`Error checking transaction status: ${error}`);
      }
    }
    
    return null;
  }
  
  /**
   * Process payment with automatic token type selection and retry logic
   */
  public async processPayment(request: PaymentRequest, mintAddress?: string | null): Promise<TransactionResult> {
    try {
      const paymentId = request.metadata?.paymentId || 'unknown';
      console.log(`[SolanaPaymentProvider] Processing payment [ID: ${paymentId}]`, {
        amount: request.amount,
        token: request.token,
        hasMintAddress: !!mintAddress
      });
      
      // Clear any cached transaction data for this payment ID
      this.cachedTransactions.delete(paymentId);
      
      // Check for existing transaction first
      const existingSignature = await this.checkExistingTransaction(paymentId);
      if (existingSignature) {
        console.log(`[SolanaPaymentProvider] Using existing transaction: ${existingSignature}`);
        return {
          success: true,
          transactionHash: existingSignature,
          blockchainConfirmation: true,
          reused: true
        };
      }
      
      // Process the payment with retry logic
      const result = await retryWithBackoff(async () => {
        // Clear any cached transaction data before each attempt
        clearSessionBlockhashData();
        
        if (request.token === 'SOL') {
          return await processSolPayment(request, this.wallet);
        } else if (mintAddress) {
          return await processTokenPayment(request, mintAddress, this.wallet);
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
      
      // Cache successful transactions for future reference
      if (result.success && result.transactionHash) {
        this.cachedTransactions.set(paymentId, {
          signature: result.transactionHash,
          timestamp: Date.now(),
          status: 'pending'
        });
        console.log(`[SolanaPaymentProvider] Cached transaction signature: ${result.transactionHash}`);
      }
      
      return result;
    } catch (error) {
      console.error(`[SolanaPaymentProvider] Payment error [ID: ${request.metadata?.paymentId || 'unknown'}]:`, error);
      
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
  
  /**
   * Clear the transaction cache
   */
  public clearTransactionCache(): void {
    console.log("Clearing transaction cache");
    this.cachedTransactions.clear();
  }

  /**
   * Get the status of a transaction
   */
  public async getTransactionStatus(signature: string): Promise<{ err: any } | null> {
    try {
      const status = await this.connection.getSignatureStatus(signature);
      return status.value;
    } catch (error) {
      console.error(`Error getting transaction status for ${signature}:`, error);
      return null;
    }
  }
}

export default SolanaPaymentProvider;