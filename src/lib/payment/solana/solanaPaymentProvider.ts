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
  clearSessionBlockhashData
} from '../utils';
import { processSolPayment } from './solPaymentProcessor';
import { processTokenPayment } from './tokenPaymentProcessor';
import { RPC_ENDPOINT, CONNECTION_TIMEOUT } from '@/lib/solana/walletConfig';
import { blockchainLogger } from '@/utils/logger';

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
      blockchainLogger.error('Failed to create Solana connection', error instanceof Error ? error : new Error(String(error)));
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
      blockchainLogger.debug('Verifying transaction signature', {
        signature
      });
      const status = await this.connection.getSignatureStatus(signature);
      
      // If we have a confirmation, the transaction succeeded
      if (status && status.value && !status.value.err) {
        blockchainLogger.info('Transaction verified successful', {
          signature
        });
        return true;
      }
      
      blockchainLogger.info('Transaction verified unsuccessful', {
        signature,
        status
      });
      return false;
    } catch (error) {
      blockchainLogger.error('Error verifying transaction', error instanceof Error ? error : new Error(String(error)));
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
        blockchainLogger.error('Error checking transaction status', error instanceof Error ? error : new Error(String(error)));
      }
    }
    
    return null;
  }
  
  /**
   * Process payment with automatic token type selection
   */
  public async processPayment(request: PaymentRequest, mintAddress?: string | null): Promise<TransactionResult> {
    try {
      const paymentId = request.metadata?.paymentId || 'unknown';
      blockchainLogger.info('Processing payment', {
        paymentId: request.metadata?.paymentId || 'unknown',
        amount: request.amount,
        token: request.token
      });
      
      // Clear any cached transaction data for this payment ID
      this.cachedTransactions.delete(paymentId);
      
      // Check for existing transaction first
      const existingSignature = await this.checkExistingTransaction(paymentId);
      if (existingSignature) {
        blockchainLogger.info('Using existing transaction', {
          signature: existingSignature
        });
        return {
          success: true,
          transactionHash: existingSignature,
          blockchainConfirmation: true,
          reused: true
        };
      }
      
      // Clear any cached transaction data before attempting
      clearSessionBlockhashData();
      
      let result: TransactionResult;
      if (request.token === 'SOL') {
        result = await processSolPayment(request, this.wallet);
      } else if (mintAddress) {
        result = await processTokenPayment(request, mintAddress, this.wallet);
      } else {
        throw new Error(`Unsupported payment token: ${request.token}`);
      }
      
      // Cache successful transactions for future reference
      if (result.success && result.transactionHash) {
        this.cachedTransactions.set(paymentId, {
          signature: result.transactionHash,
          timestamp: Date.now(),
          status: 'pending'
        });
        blockchainLogger.info('Cached transaction signature', {
          signature: result.transactionHash
        });
      }
      
      return result;
    } catch (error) {
      blockchainLogger.error('Payment error', error instanceof Error ? error : new Error(String(error)), {
        paymentId: request.metadata?.paymentId || 'unknown'
      });
      
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
      
      return {
        success: false,
        error: createPaymentError(
          ErrorCategory.BLOCKCHAIN_ERROR,
          error instanceof Error ? error.message : 'Payment processing failed',
          error,
          false
        )
      };
    }
  }
  
  /**
   * Clear the transaction cache
   */
  public clearTransactionCache(): void {
    blockchainLogger.info('Clearing transaction cache');
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
      blockchainLogger.error('Error getting transaction status', error instanceof Error ? error : new Error(String(error)), {
        signature
      });
      return null;
    }
  }
}

export default SolanaPaymentProvider;