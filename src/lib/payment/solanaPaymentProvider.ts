// src/lib/payment/solanaPaymentProvider.ts
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
} from './types';
import { 
  createPaymentError,
  isUserRejectionError,
  isNetworkError,
  isBalanceError,
  retryWithBackoff,
  isTxAlreadyProcessedError
} from './utils';
import { RPC_ENDPOINT, CONNECTION_TIMEOUT } from '@/lib/solana/walletConfig';
import { processPayment as processBlockchainPayment } from './solana';

/**
 * SolanaPaymentProvider handles the interaction with Solana blockchain
 * Uses specialized processors for SOL and token payments
 */
export class SolanaPaymentProvider {
  private connection: Connection;
  private wallet: WalletConfig;
  private cachedTransactions: Map<string, string> = new Map(); // Map of txId -> signature
  
  constructor(wallet: WalletConfig) {
    this.wallet = wallet;
    this.connection = this.createConnection();
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
  private async verifyTransaction(signature: string): Promise<boolean> {
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
    const cachedSignature = this.cachedTransactions.get(paymentId);
    if (cachedSignature) {
      // Verify it's a successful transaction
      const isValid = await this.verifyTransaction(cachedSignature);
      if (isValid) {
        return cachedSignature;
      }
      // If not valid, remove from cache
      this.cachedTransactions.delete(paymentId);
    }
    return null;
  }
  
  /**
   * Clear the cached transactions
   */
  public clearTransactionCache(): void {
    console.log("Clearing transaction cache");
    this.cachedTransactions.clear();
  }
  
  /**
   * Process payment with automatic token type selection and retry logic
   * Uses specialized payment processors based on token type
   */
  public async processPayment(request: PaymentRequest, mintAddress?: string | null): Promise<TransactionResult> {
    try {
      const paymentId = request.metadata?.paymentId || 'unknown';
      console.log(`[SolanaPaymentProvider] Processing payment [ID: ${paymentId}]`, {
        amount: request.amount,
        token: request.token,
        hasMintAddress: !!mintAddress
      });
      
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
      
      // Retry with backoff for transient errors
      const result = await retryWithBackoff(async () => {
        return await processBlockchainPayment(request, this.wallet, mintAddress);
      }, 2); // Maximum 2 retries
      
      // Cache successful transactions for future reference
      if (result.success && result.transactionHash) {
        this.cachedTransactions.set(paymentId, result.transactionHash);
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
}

export default SolanaPaymentProvider;