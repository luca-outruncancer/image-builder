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
    
    paymentLogger.info("PaymentService initialized", {
      walletConnected: wallet.connected
    });
  }
  
  /**
   * Initialize a new payment
   */
  public async initializePayment(
    amount: number,
    metadata: PaymentMetadata
  ): Promise<PaymentResponse> {
    try {
      // Check if wallet is connected
      if (!this.wallet.connected || !this.wallet.publicKey) {
        paymentLogger.error('Wallet not connected during payment initialization', {
          imageId: metadata.imageId
        });
        
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
        amount,
        token: ACTIVE_PAYMENT_TOKEN,
        imageId: metadata.imageId,
        walletAddress: this.wallet.publicKey.toString().substring(0, 8) + '...'
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
      paymentLogger.debug(`Payment session stored in memory`, {
        paymentId,
        activeSessions: this.activePayments.size
      });
      
      // Initialize in database
      const dbResult = await this.storageProvider.initializeTransaction(paymentSession);
      
      if (!dbResult.success) {
        paymentLogger.error(`Failed to initialize payment in database`, {
          paymentId,
          error: dbResult.error
        });
        
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
      paymentLogger.debug(`Payment session updated with transaction ID`, {
        paymentId,
        transactionId: dbResult.transactionId
      });
      
      // Set timeout for this payment
      this.setPaymentTimeout(paymentId);
      
      return {
        paymentId,
        status: PaymentStatus.INITIALIZED,
        transactionId: dbResult.transactionId
      };
    } catch (error) {
      paymentLogger.error('Failed to initialize payment', {
        error,
        imageId: metadata.imageId
      });
      
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
    try {
      paymentLogger.info(`Processing payment`, { paymentId });
      
      // Clean up any session data to ensure fresh transaction
      clearSessionBlockhashData();
      
      // Check if payment exists
      const paymentSession = this.activePayments.get(paymentId);
      if (!paymentSession) {
        paymentLogger.error(`Payment session not found`, { 
          paymentId,
          activeSessions: Array.from(this.activePayments.keys())
        });
        
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
      
      paymentLogger.debug(`Payment status updated to PROCESSING`, {
        paymentId,
        attempt: paymentSession.attempts
      });
      
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
      
      paymentLogger.debug(`Created payment request`, {
        paymentId,
        amount: paymentRequest.amount,
        token: paymentRequest.token
      });
      
      // Get token mint address if needed
      const mintAddress = paymentSession.token === 'SOL' ? null : getMintAddress();
      
      // Process the payment
      paymentLogger.info(`Sending payment to blockchain`, { paymentId });
      const result = await this.paymentProvider.processPayment(paymentRequest, mintAddress);
      paymentLogger.info(`Received blockchain result`, { 
        paymentId,
        success: result.success,
        error: result.error ? result.error.category : null,
        transactionHash: result.transactionHash ? result.transactionHash.substring(0, 8) + '...' : null
      });
      
      // Handle the result
      return await this.handlePaymentResult(paymentId, result);
    } catch (error) {
      // Special handling for "Transaction already processed" errors
      if (isTxAlreadyProcessedError(error)) {
        paymentLogger.info(`Transaction already processed error detected`, { paymentId });
        
        // Try to find the payment session
        const paymentSession = this.activePayments.get(paymentId);
        if (paymentSession && paymentSession.transactionHash) {
          paymentLogger.info(`Found existing signature for payment`, {
            paymentId,
            signature: paymentSession.transactionHash
          });
          
          // Create a successful result with the existing hash
          return await this.handlePaymentResult(paymentId, {
            success: true,
            transactionHash: paymentSession.transactionHash,
            blockchainConfirmation: true,
            reused: true
          });
        }
      }
      
      paymentLogger.error(`Error processing payment`, {
        paymentId,
        error: error instanceof Error ? error.message : String(error)
      });
      
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
    paymentLogger.debug(`Handling payment result`, {
      paymentId,
      success: result.success,
      reused: result.reused || false,
      errorCode: result.error?.code
    });
    
    const paymentSession = this.activePayments.get(paymentId);
    if (!paymentSession) {
      paymentLogger.error(`Payment session not found when handling result`, { paymentId });
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
      paymentLogger.info(`Payment successful`, {
        paymentId,
        transactionHash: result.transactionHash
      });
      
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
        paymentLogger.info(`User rejected transaction`, { paymentId });
        
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
        paymentLogger.info(`Duplicate transaction error`, { paymentId });
        
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
      paymentLogger.error(`Payment failed`, {
        paymentId,
        error: result.error?.message,
        category: result.error?.category
      });
      
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
      paymentLogger.debug(`No session found for payment status check`, { paymentId });
      return null;
    }
    
    paymentLogger.debug(`Retrieved payment status`, {
      paymentId,
      status: paymentSession.status,
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
      paymentLogger.info(`Cancelling payment`, { paymentId });
      
      const paymentSession = this.activePayments.get(paymentId);
      if (!paymentSession) {
        paymentLogger.error(`Cannot cancel payment - session not found`, { paymentId });
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
        paymentLogger.warn(`Cannot cancel confirmed payment`, { paymentId });
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
      
      paymentLogger.info(`Payment successfully cancelled`, { paymentId });
      
      return { success: true };
    } catch (error) {
      paymentLogger.error(`Failed to cancel payment`, {
        paymentId,
        error: error instanceof Error ? error.message : String(error)
      });
      
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
    paymentLogger.debug(`Payment timeout set`, {
      paymentId,
      timeoutMs: PAYMENT_TIMEOUT_MS
    });
  }
  
  /**
   * Clear a payment timeout
   */
  private clearPaymentTimeout(paymentId: string) {
    const timeout = this.paymentTimeouts.get(paymentId);
    if (timeout) {
      clearTimeout(timeout);
      this.paymentTimeouts.delete(paymentId);
      paymentLogger.debug(`Payment timeout cleared`, { paymentId });
    }
  }
  
  /**
   * Handle a payment timeout
   */
  private async handlePaymentTimeout(paymentId: string) {
    paymentLogger.info(`Payment timed out`, { paymentId });
    
    const paymentSession = this.activePayments.get(paymentId);
    if (!paymentSession) {
      paymentLogger.warn(`No session found for timed out payment`, { paymentId });
      return;
    }
    
    // Only time out pending payments
    if (
      paymentSession.status !== PaymentStatus.INITIALIZED &&
      paymentSession.status !== PaymentStatus.PENDING &&
      paymentSession.status !== PaymentStatus.PROCESSING
    ) {
      paymentLogger.debug(`Payment not eligible for timeout`, {
        paymentId,
        status: paymentSession.status
      });
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
      paymentLogger.info(`Resetting payment after duplicate transaction error`, { paymentId });
      
      // Clear blockchain cache
      clearSessionBlockhashData();
      
      // Clear payment provider cache
      this.paymentProvider.clearTransactionCache();
      
      // Get the payment session
      const paymentSession = this.activePayments.get(paymentId);
      if (!paymentSession) {
        paymentLogger.error(`Cannot reset payment - session not found`, { paymentId });
        return false;
      }
      
      // Reset payment state for retry
      paymentSession.status = PaymentStatus.INITIALIZED;
      paymentSession.error = undefined;
      paymentSession.updatedAt = new Date().toISOString();
      this.activePayments.set(paymentId, paymentSession);
      
      paymentLogger.info(`Payment reset successful`, { paymentId });
      
      return true;
    } catch (error) {
      paymentLogger.error(`Failed to reset payment after duplicate error`, { 
        paymentId,
        error: error instanceof Error ? error.message : String(error)
      });
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
    paymentLogger.info("Disposing PaymentService resources");
    
    // Clear all timeouts
    for (const [paymentId, timeout] of this.paymentTimeouts.entries()) {
      clearTimeout(timeout);
    }
    
    this.paymentTimeouts.clear();
    this.activePayments.clear();
    
    // Clean session storage
    clearSessionBlockhashData();
    
    paymentLogger.debug("Payment service cleanup complete");
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