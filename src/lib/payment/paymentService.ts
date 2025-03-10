// src/lib/payment/paymentService.ts
'use client';

import { useWallet } from '@solana/wallet-adapter-react';
import { 
  PaymentRequest,
  PaymentResponse,
  PaymentStatusResponse,
  PaymentStatus,
  PaymentSession,
  ErrorCategory,
  PaymentError,
  TransactionResult,
  WalletConfig,
  PaymentMetadata
} from './types';
import { 
  createPaymentError, 
  generatePaymentId, 
  formatErrorForUser, 
  clearSessionBlockhashData,
  isTxAlreadyProcessedError
} from './utils';
import SolanaPaymentProvider from './solanaPaymentProvider';
import PaymentStorageProvider from './paymentStorageProvider';
import { ACTIVE_PAYMENT_TOKEN, RECIPIENT_WALLET_ADDRESS, getMintAddress } from '@/utils/constants';
import { paymentLogger } from '@/utils/logger';
import { generateRequestId } from '@/utils/logger';

const PAYMENT_TIMEOUT_MS = 180000; // 3 minutes

/**
 * Core PaymentService that orchestrates the payment flow
 */
export class PaymentService {
  private paymentProvider: SolanaPaymentProvider;
  private storageProvider: PaymentStorageProvider;
  private activePayments: Map<string, PaymentSession>;
  private paymentTimeouts: Map<string, NodeJS.Timeout>;
  private wallet: WalletConfig;
  
  constructor(wallet: WalletConfig) {
    this.wallet = wallet;
    this.paymentProvider = new SolanaPaymentProvider(wallet);
    this.storageProvider = new PaymentStorageProvider();
    this.activePayments = new Map();
    this.paymentTimeouts = new Map();
    
    // Generate a request ID for this payment service instance
    generateRequestId();
    
    paymentLogger.debug('Payment service initialized', { 
      walletConnected: wallet.connected,
      walletAddress: wallet.publicKey?.toString()
    });
  }
  
  /**
   * Initialize a new payment
   */
  public async initializePayment(
    amount: number,
    metadata: PaymentMetadata
  ): Promise<PaymentResponse> {
    const context = {
      amount,
      token: ACTIVE_PAYMENT_TOKEN,
      imageId: metadata.imageId,
      walletConnected: this.wallet.connected
    };
    
    try {
      // Check if wallet is connected
      if (!this.wallet.connected || !this.wallet.publicKey) {
        paymentLogger.error('Payment initialization failed - wallet not connected', null, context);
        return {
          paymentId: '',
          status: PaymentStatus.FAILED,
          error: createPaymentError(
            ErrorCategory.WALLET_ERROR,
            'Wallet not connected',
            null,
            false
          )
        };
      }
      
      // Generate a unique payment ID
      const paymentId = generatePaymentId();
      paymentLogger.info(`Initializing payment ${paymentId}`, { 
        amount: amount,
        token: ACTIVE_PAYMENT_TOKEN,
        ...context
      });
      
      // Clean up any session data to ensure fresh transaction
      clearSessionBlockhashData();
      
      // Create payment session
      const paymentSession: PaymentSession = {
        paymentId,
        status: PaymentStatus.INITIALIZED,
        imageId: metadata.imageId,
        amount,
        token: ACTIVE_PAYMENT_TOKEN,
        metadata: {
          ...metadata,
          paymentId // Store the payment ID in metadata for transaction tracking
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        attempts: 0,
        walletAddress: this.wallet.publicKey.toString(),
        recipientWallet: RECIPIENT_WALLET_ADDRESS
      };
      
      // Store in memory
      this.activePayments.set(paymentId, paymentSession);
      paymentLogger.debug(`Payment ${paymentId} added to active sessions`, {
        activeSessionsCount: this.activePayments.size
      });
      
      // Initialize in database
      const dbResult = await this.storageProvider.initializeTransaction(paymentSession);
      
      if (!dbResult.success) {
        paymentLogger.error(`Failed to initialize payment ${paymentId} in database`, 
          dbResult.error, context, this.wallet.publicKey.toString());
        
        this.activePayments.delete(paymentId);
        
        return {
          paymentId,
          status: PaymentStatus.FAILED,
          error: dbResult.error
        };
      }
      
      // Update session with transaction ID
      paymentSession.transactionId = dbResult.transactionId;
      this.activePayments.set(paymentId, paymentSession);
      paymentLogger.info(`Payment ${paymentId} initialized with transaction ID: ${dbResult.transactionId}`, 
        null, context, this.wallet.publicKey.toString());
      
      // Set timeout for this payment
      this.setPaymentTimeout(paymentId);
      
      return {
        paymentId,
        status: PaymentStatus.INITIALIZED,
        transactionId: dbResult.transactionId
      };
    } catch (error) {
      paymentLogger.error('Failed to initialize payment', error, context, 
        this.wallet.publicKey?.toString());
      
      return {
        paymentId: '',
        status: PaymentStatus.FAILED,
        error: createPaymentError(
          ErrorCategory.UNKNOWN_ERROR,
          'Payment initialization failed',
          error,
          true
        )
      };
    }
  }
  
  /**
   * Process a payment
   */
  public async processPayment(paymentId: string): Promise<PaymentStatusResponse> {
    const context = { paymentId };
    
    try {
      paymentLogger.info(`Processing payment ${paymentId}`, null, context);
      
      // Clean up any session data to ensure fresh transaction
      clearSessionBlockhashData();
      
      // Check if payment exists
      const paymentSession = this.activePayments.get(paymentId);
      if (!paymentSession) {
        paymentLogger.error(`Payment session ${paymentId} not found in active payments`, {
          activeSessionsIds: Array.from(this.activePayments.keys())
        }, context);
        
        return {
          paymentId,
          status: PaymentStatus.FAILED,
          error: createPaymentError(
            ErrorCategory.UNKNOWN_ERROR,
            'Payment session not found',
            null,
            false
          )
        };
      }
      
      // Update payment status
      paymentSession.status = PaymentStatus.PROCESSING;
      paymentSession.attempts += 1;
      paymentSession.updatedAt = new Date().toISOString();
      this.activePayments.set(paymentId, paymentSession);
      
      paymentLogger.debug(`Payment ${paymentId} updated to PROCESSING status`, { 
        attempt: paymentSession.attempts,
        imageId: paymentSession.imageId,
        amount: paymentSession.amount,
        token: paymentSession.token,
        transactionId: paymentSession.transactionId
      }, context, paymentSession.walletAddress);
      
      // Update database status
      if (paymentSession.transactionId) {
        await this.storageProvider.updateTransactionStatus(
          paymentSession.transactionId,
          PaymentStatus.PROCESSING
        );
      }
      
      // Create payment request object
      const paymentRequest: PaymentRequest = {
        amount: paymentSession.amount,
        token: paymentSession.token,
        recipientWallet: paymentSession.recipientWallet,
        metadata: { 
          ...paymentSession.metadata,
          paymentId // Make sure the payment ID is included
        }
      };
      
      paymentLogger.info(`Sending payment request to blockchain for ${paymentId}`, {
        token: paymentRequest.token,
        amount: paymentRequest.amount,
        recipient: paymentRequest.recipientWallet.substring(0, 8) + "...",
        imageId: paymentRequest.metadata.imageId
      }, context, paymentSession.walletAddress);
      
      // Get token mint address if needed
      const mintAddress = paymentSession.token === 'SOL' ? null : getMintAddress();
      
      // Process the payment
      const result = await this.paymentProvider.processPayment(paymentRequest, mintAddress);
      paymentLogger.info(`Payment ${paymentId} blockchain result received`, {
        success: result.success,
        hash: result.transactionHash ? (result.transactionHash.substring(0, 8) + "...") : "none",
        reused: result.reused || false,
        errorCategory: result.error ? result.error.category : "none"
      }, context, paymentSession.walletAddress);
      
      // Handle the result
      return await this.handlePaymentResult(paymentId, result);
    } catch (error) {
      // Special handling for "Transaction already processed" errors
      if (isTxAlreadyProcessedError(error)) {
        paymentLogger.info(`Transaction already processed for payment ${paymentId}`, {
          error: error instanceof Error ? error.message : String(error)
        }, context);
        
        // Try to find the payment session
        const paymentSession = this.activePayments.get(paymentId);
        if (paymentSession && paymentSession.transactionHash) {
          paymentLogger.info(`Found existing signature for payment ${paymentId}`, {
            signature: paymentSession.transactionHash.substring(0, 8) + "..."
          }, context, paymentSession.walletAddress);
          
          // Create a successful result with the existing hash
          return await this.handlePaymentResult(paymentId, {
            success: true,
            transactionHash: paymentSession.transactionHash,
            blockchainConfirmation: true,
            reused: true
          });
        }
      }
      
      paymentLogger.error(`Error processing payment ${paymentId}`, error, context);
      
      // Update session status
      const paymentSession = this.activePayments.get(paymentId);
      if (paymentSession) {
        paymentSession.status = PaymentStatus.FAILED;
        paymentSession.error = createPaymentError(
          ErrorCategory.UNKNOWN_ERROR,
          'Payment processing failed',
          error,
          true
        );
        paymentSession.updatedAt = new Date().toISOString();
        this.activePayments.set(paymentId, paymentSession);
        
        // Update database
        if (paymentSession.transactionId) {
          await this.storageProvider.updateTransactionStatus(
            paymentSession.transactionId,
            PaymentStatus.FAILED
          );
        }
      }
      
      return {
        paymentId,
        status: PaymentStatus.FAILED,
        error: createPaymentError(
          ErrorCategory.UNKNOWN_ERROR,
          'Payment processing failed',
          error,
          true
        )
      };
    }
  }
  
  /**
   * Handle the result of a payment processing attempt
   */
  private async handlePaymentResult(
    paymentId: string,
    result: TransactionResult
  ): Promise<PaymentStatusResponse> {
    const context = { paymentId, result: { success: result.success } };
    
    paymentLogger.debug(`Handling payment result for ${paymentId}`, {
      success: result.success,
      hash: result.transactionHash ? (result.transactionHash.substring(0, 8) + "...") : "none",
      error: result.error ? {
        category: result.error.category,
        message: result.error.message,
        code: result.error.code
      } : "none"
    }, context);
    
    const paymentSession = this.activePayments.get(paymentId);
    if (!paymentSession) {
      paymentLogger.error(`Payment session ${paymentId} not found when handling result`, null, context);
      return {
        paymentId,
        status: PaymentStatus.FAILED,
        error: createPaymentError(
          ErrorCategory.UNKNOWN_ERROR,
          'Payment session not found',
          null,
          false
        )
      };
    }
    
    if (result.success) {
      // Payment successful
      paymentLogger.info(`Payment ${paymentId} successful with hash: ${result.transactionHash}`, 
        null, context, paymentSession.walletAddress);
      
      paymentSession.status = PaymentStatus.CONFIRMED;
      paymentSession.transactionHash = result.transactionHash;
      paymentSession.updatedAt = new Date().toISOString();
      this.activePayments.set(paymentId, paymentSession);
      
      // Update database
      if (paymentSession.transactionId) {
        await this.storageProvider.updateTransactionStatus(
          paymentSession.transactionId,
          PaymentStatus.CONFIRMED,
          result.transactionHash,
          result.blockchainConfirmation
        );
      }
      
      // Clear timeout
      this.clearPaymentTimeout(paymentId);
      
      return {
        paymentId,
        status: PaymentStatus.CONFIRMED,
        transactionHash: result.transactionHash,
        metadata: paymentSession.metadata,
        amount: paymentSession.amount,
        token: paymentSession.token,
        timestamp: paymentSession.updatedAt,
        attempts: paymentSession.attempts
      };
    } else {
      // Payment failed
      const errorCategory = result.error?.category || ErrorCategory.UNKNOWN_ERROR;
      
      // Special handling for user rejection - don't mark as failed
      if (errorCategory === ErrorCategory.USER_REJECTION) {
        paymentLogger.info(`Payment ${paymentId} - User rejected the transaction`, 
          null, context, paymentSession.walletAddress);
        
        paymentSession.status = PaymentStatus.PENDING;
        paymentSession.error = result.error;
        paymentSession.updatedAt = new Date().toISOString();
        this.activePayments.set(paymentId, paymentSession);
        
        return {
          paymentId,
          status: PaymentStatus.PENDING,
          error: result.error,
          metadata: paymentSession.metadata,
          amount: paymentSession.amount,
          token: paymentSession.token,
          attempts: paymentSession.attempts
        };
      }
      
      // Special handling for "already processed" errors
      if (result.error?.code === 'DUPLICATE_TRANSACTION') {
        paymentLogger.info(`Payment ${paymentId} - Duplicate transaction error`, 
          null, context, paymentSession.walletAddress);
        
        // Here we should try to recover the transaction if it exists
        // But we'll mark it as failed for now
        paymentSession.status = PaymentStatus.FAILED;
        paymentSession.error = result.error;
        paymentSession.updatedAt = new Date().toISOString();
        this.activePayments.set(paymentId, paymentSession);
        
        // Clean session storage
        clearSessionBlockhashData();
        
        // Update database
        if (paymentSession.transactionId) {
          await this.storageProvider.updateTransactionStatus(
            paymentSession.transactionId,
            PaymentStatus.FAILED
          );
        }
        
        return {
          paymentId,
          status: PaymentStatus.FAILED,
          error: result.error,
          metadata: paymentSession.metadata,
          amount: paymentSession.amount,
          token: paymentSession.token,
          attempts: paymentSession.attempts
        };
      }
      
      // Mark as failed
      paymentLogger.error(`Payment ${paymentId} failed with error`, {
        errorMessage: result.error?.message,
        errorCategory: result.error?.category
      }, context, paymentSession.walletAddress);
      
      paymentSession.status = PaymentStatus.FAILED;
      paymentSession.error = result.error;
      paymentSession.updatedAt = new Date().toISOString();
      this.activePayments.set(paymentId, paymentSession);
      
      // Update database
      if (paymentSession.transactionId) {
        await this.storageProvider.updateTransactionStatus(
          paymentSession.transactionId,
          PaymentStatus.FAILED
        );
      }
      
      return {
        paymentId,
        status: PaymentStatus.FAILED,
        error: result.error,
        metadata: paymentSession.metadata,
        amount: paymentSession.amount,
        token: paymentSession.token,
        attempts: paymentSession.attempts
      };
    }
  }
  
  /**
   * Get the status of a payment
   */
  public getPaymentStatus(paymentId: string): PaymentStatusResponse | null {
    const paymentSession = this.activePayments.get(paymentId);
    if (!paymentSession) {
      paymentLogger.debug(`getPaymentStatus: No session found for ${paymentId}`);
      return null;
    }
    
    paymentLogger.debug(`Payment status for ${paymentId}`, {
      status: paymentSession.status,
      hash: paymentSession.transactionHash ? (paymentSession.transactionHash.substring(0, 8) + "...") : "none",
      attempts: paymentSession.attempts
    });
    
    return {
      paymentId,
      status: paymentSession.status,
      transactionHash: paymentSession.transactionHash,
      error: paymentSession.error,
      metadata: paymentSession.metadata,
      amount: paymentSession.amount,
      token: paymentSession.token,
      timestamp: paymentSession.updatedAt,
      attempts: paymentSession.attempts
    };
  }
  
  /**
   * Cancel a payment
   */
  public async cancelPayment(paymentId: string): Promise<{ success: boolean; error?: PaymentError }> {
    try {
      paymentLogger.info(`Cancelling payment ${paymentId}`);
      
      const paymentSession = this.activePayments.get(paymentId);
      if (!paymentSession) {
        paymentLogger.error(`Cannot cancel payment - session ${paymentId} not found`);
        return {
          success: false,
          error: createPaymentError(
            ErrorCategory.UNKNOWN_ERROR,
            'Payment session not found',
            null,
            false
          )
        };
      }
      
      // Don't cancel confirmed payments
      if (paymentSession.status === PaymentStatus.CONFIRMED) {
        paymentLogger.info(`Cannot cancel payment ${paymentId} - already confirmed`);
        return {
          success: false,
          error: createPaymentError(
            ErrorCategory.UNKNOWN_ERROR,
            'Cannot cancel a confirmed payment',
            null,
            false
          )
        };
      }
      
      // Update session status
      paymentSession.status = PaymentStatus.CANCELED;
      paymentSession.updatedAt = new Date().toISOString();
      this.activePayments.set(paymentId, paymentSession);
      
      // Update database
      if (paymentSession.transactionId) {
        await this.storageProvider.updateTransactionStatus(
          paymentSession.transactionId,
          PaymentStatus.CANCELED
        );
      }
      
      // Clear timeout
      this.clearPaymentTimeout(paymentId);
      
      // Clean up session storage
      clearSessionBlockhashData();
      
      paymentLogger.info(`Payment ${paymentId} successfully cancelled`);
      
      return { success: true };
    } catch (error) {
      paymentLogger.error(`Failed to cancel payment ${paymentId}`, error);
      return {
        success: false,
        error: createPaymentError(
          ErrorCategory.UNKNOWN_ERROR,
          'Failed to cancel payment',
          error,
          true
        )
      };
    }
  }
  
  /**
   * Set a timeout for a payment
   */
  private setPaymentTimeout(paymentId: string) {
    // Clear any existing timeout
    this.clearPaymentTimeout(paymentId);
    
    // Set new timeout
    const timeout = setTimeout(() => {
      this.handlePaymentTimeout(paymentId);
    }, PAYMENT_TIMEOUT_MS);
    
    this.paymentTimeouts.set(paymentId, timeout);
    paymentLogger.debug(`Payment timeout set for ${paymentId} (${PAYMENT_TIMEOUT_MS / 1000}s)`);
  }
  
  /**
   * Clear a payment timeout
   */
  private clearPaymentTimeout(paymentId: string) {
    const timeout = this.paymentTimeouts.get(paymentId);
    if (timeout) {
      clearTimeout(timeout);
      this.paymentTimeouts.delete(paymentId);
      paymentLogger.debug(`Payment timeout cleared for ${paymentId}`);
    }
  }
  
  /**
   * Handle a payment timeout
   */
  private async handlePaymentTimeout(paymentId: string) {
    paymentLogger.info(`Payment ${paymentId} timed out after ${PAYMENT_TIMEOUT_MS / 1000}s`);
    
    const paymentSession = this.activePayments.get(paymentId);
    if (!paymentSession) {
      paymentLogger.debug(`No payment session found for timed out payment ${paymentId}`);
      return;
    }
    
    // Only time out pending payments
    if (
      paymentSession.status !== PaymentStatus.INITIALIZED &&
      paymentSession.status !== PaymentStatus.PENDING &&
      paymentSession.status !== PaymentStatus.PROCESSING
    ) {
      paymentLogger.debug(`Payment ${paymentId} in status ${paymentSession.status} - not eligible for timeout`);
      return;
    }
    
    // Update session status
    paymentSession.status = PaymentStatus.TIMEOUT;
    paymentSession.error = createPaymentError(
      ErrorCategory.TIMEOUT_ERROR,
      'Payment timed out after 3 minutes',
      null,
      false
    );
    paymentSession.updatedAt = new Date().toISOString();
    this.activePayments.set(paymentId, paymentSession);
    
    // Update database
    if (paymentSession.transactionId) {
      await this.storageProvider.updateTransactionStatus(
        paymentSession.transactionId,
        PaymentStatus.TIMEOUT
      );
    }
    
    // If we have an image ID, mark it as timed out
    if (paymentSession.imageId) {
      await this.storageProvider.markPaymentAsTimedOut(paymentSession.imageId);
    }
    
    // Clean up session storage
    clearSessionBlockhashData();
  }
  
  /**
   * Reset payment state after a duplicate transaction error
   */
  public async resetAfterDuplicateError(paymentId: string): Promise<boolean> {
    try {
      paymentLogger.info(`Resetting payment ${paymentId} after duplicate transaction error`);
      
      // Clear blockchain cache
      clearSessionBlockhashData();
      
      // Clear payment provider cache
      this.paymentProvider.clearTransactionCache();
      
      // Get the payment session
      const paymentSession = this.activePayments.get(paymentId);
      if (!paymentSession) {
        paymentLogger.error(`Cannot reset payment ${paymentId} - session not found`);
        return false;
      }
      
      // Reset payment state for retry
      paymentSession.status = PaymentStatus.INITIALIZED;
      paymentSession.error = undefined;
      paymentSession.updatedAt = new Date().toISOString();
      this.activePayments.set(paymentId, paymentSession);
      
      paymentLogger.info(`Payment ${paymentId} successfully reset for retry`);
      
      return true;
    } catch (error) {
      paymentLogger.error(`Failed to reset payment after duplicate error`, error);
      return false;
    }
  }
  
  /**
   * Get a formatted error message for display to users
   */
  public getFormattedErrorMessage(error: PaymentError): string {
    return formatErrorForUser(error);
  }
  
  /**
   * Clean up all resources
   */
  public dispose() {
    paymentLogger.debug("Disposing PaymentService resources");
    
    // Clear all timeouts
    for (const [paymentId, timeout] of this.paymentTimeouts.entries()) {
      clearTimeout(timeout);
    }
    
    this.paymentTimeouts.clear();
    this.activePayments.clear();
    
    // Clean session storage
    clearSessionBlockhashData();
    
    paymentLogger.debug("PaymentService cleanup complete");
  }
}

/**
 * React hook for using the payment service
 */
export function usePaymentService() {
  const wallet = useWallet();
  
  const walletConfig: WalletConfig = {
    publicKey: wallet.publicKey,
    signTransaction: wallet.signTransaction,
    connected: wallet.connected
  };
  
  return new PaymentService(walletConfig);
}

export default PaymentService;