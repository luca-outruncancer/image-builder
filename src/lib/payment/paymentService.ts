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
  isTxAlreadyProcessedError,
  extractSignatureFromError
} from './utils';
import { PaymentStorageProvider } from './storage';
import { SolanaPaymentProvider } from './solana/solanaPaymentProvider';
import { ACTIVE_PAYMENT_TOKEN, RECIPIENT_WALLET_ADDRESS, getMintAddress } from '@/utils/constants';
import { paymentLogger } from '@/utils/logger/index';
import { generateRequestId } from '@/utils/logger/index';
import { LogData, ErrorLogData } from '@/utils/logger/types';

const PAYMENT_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes

/**
 * Core PaymentService that orchestrates the payment flow
 */
export class PaymentService {
  private paymentProvider: SolanaPaymentProvider;
  private storageProvider: PaymentStorageProvider;
  private activePayments: Map<string, PaymentSession>;
  private paymentTimeouts: Map<string, NodeJS.Timeout>;
  private wallet: WalletConfig;
  private requestId: string;
  
  constructor(wallet: WalletConfig) {
    this.wallet = wallet;
    this.paymentProvider = new SolanaPaymentProvider(wallet);
    this.storageProvider = new PaymentStorageProvider();
    this.activePayments = new Map();
    this.paymentTimeouts = new Map();
    this.requestId = generateRequestId();
    
    // Log service initialization
    paymentLogger.info('Payment service initialized', {
      requestId: this.requestId,
      walletConnected: this.wallet.connected,
      walletAddress: this.wallet.publicKey?.toString()
    });
  }
  
  /**
   * Initialize a new payment
   */
  public async initializePayment(
    amount: number,
    metadata: PaymentMetadata
  ): Promise<PaymentResponse> {
    const paymentId = generatePaymentId();
    const context = {
      paymentId,
      amount,
      token: ACTIVE_PAYMENT_TOKEN,
      imageId: metadata.imageId,
      walletConnected: this.wallet.connected,
      requestId: this.requestId
    };
    
    paymentLogger.info('Initializing payment', context);
    
    try {
      // Check if wallet is connected
      if (!this.wallet.connected || !this.wallet.publicKey) {
        paymentLogger.error('Payment initialization failed - wallet not connected', undefined, context);
        return {
          paymentId: '',
          status: PaymentStatus.FAILED,
          error: createPaymentError(
            ErrorCategory.WALLET_ERROR,
            'Wallet not connected',
            undefined,
            false
          )
        };
      }
      
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
      paymentLogger.debug('Payment added to active sessions', {
        paymentId,
        activeSessionsCount: this.activePayments.size
      });
      
      // Initialize in database
      const dbResult = await this.storageProvider.initializeTransaction(paymentSession);
      
      if (!dbResult.success) {
        const error = dbResult.error instanceof Error ? dbResult.error : new Error(String(dbResult.error));
        paymentLogger.error('Failed to initialize payment in database', error, {
          ...context,
          walletAddress: this.wallet.publicKey.toString()
        });
        
        this.activePayments.delete(paymentId);
        
        return {
          paymentId,
          status: PaymentStatus.FAILED,
          error: createPaymentError(
            ErrorCategory.DATABASE_ERROR,
            'Failed to initialize payment in database',
            error,
            false
          )
        };
      }
      
      // Update session with transaction ID
      paymentSession.transactionId = dbResult.transactionId;
      this.activePayments.set(paymentId, paymentSession);
      paymentLogger.info('Payment initialized with transaction ID', {
        ...context,
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
      const err = error instanceof Error ? error : new Error(String(error));
      paymentLogger.error('Payment initialization failed', err, context);
      throw err;
    }
  }
  
  /**
   * Process a payment
   */
  public async processPayment(paymentId: string): Promise<PaymentStatusResponse> {
    const context = { paymentId, requestId: this.requestId };
    
    paymentLogger.info('Processing payment', context);
    
    try {
      // Clean up any session data to ensure fresh transaction
      clearSessionBlockhashData();
      
      // Check if payment exists
      const paymentSession = this.activePayments.get(paymentId);
      if (!paymentSession) {
        paymentLogger.error('Payment session not found', undefined, {
          ...context,
          activeSessionsIds: Array.from(this.activePayments.keys())
        });
        
        return {
          paymentId,
          status: PaymentStatus.FAILED,
          error: createPaymentError(
            ErrorCategory.UNKNOWN_ERROR,
            'Payment session not found',
            undefined,
            false
          )
        };
      }
      
      // Update payment status
      paymentSession.status = PaymentStatus.PROCESSING;
      paymentSession.attempts += 1;
      paymentSession.updatedAt = new Date().toISOString();
      this.activePayments.set(paymentId, paymentSession);
      
      paymentLogger.debug('Payment updated to PROCESSING status', {
        ...context,
        attempt: paymentSession.attempts,
        imageId: paymentSession.imageId,
        amount: paymentSession.amount,
        token: paymentSession.token,
        transactionId: paymentSession.transactionId,
        walletAddress: paymentSession.walletAddress
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
      
      paymentLogger.info('Sending payment request to blockchain', {
        ...context,
        token: paymentRequest.token,
        amount: paymentRequest.amount,
        recipient: paymentRequest.recipientWallet.substring(0, 8) + "...",
        imageId: paymentRequest.metadata.imageId,
        walletAddress: paymentSession.walletAddress
      });
      
      // Get token mint address if needed
      const mintAddress = paymentSession.token === 'SOL' ? null : getMintAddress();
      
      // Process the payment
      const result = await this.paymentProvider.processPayment(paymentRequest, mintAddress);
      paymentLogger.info('Payment blockchain result received', {
        ...context,
        success: result.success,
        hash: result.transactionHash ? (result.transactionHash.substring(0, 8) + "...") : "none",
        reused: result.reused || false,
        errorCategory: result.error ? result.error.category : "none"
      });
      
      // Handle the result
      return await this.handlePaymentResult(paymentId, result);
    } catch (error) {
      // Special handling for "Transaction already processed" errors
      if (isTxAlreadyProcessedError(error)) {
        paymentLogger.info('Transaction already processed', {
          ...context,
          error: error instanceof Error ? error.message : String(error)
        });
        
        // Try to find the payment session
        const paymentSession = this.activePayments.get(paymentId);
        if (paymentSession && paymentSession.transactionHash) {
          paymentLogger.info('Found existing signature', {
            ...context,
            signature: paymentSession.transactionHash.substring(0, 8) + "...",
            walletAddress: paymentSession.walletAddress
          });
          
          // Create a successful result with the existing hash
          return await this.handlePaymentResult(paymentId, {
            success: true,
            transactionHash: paymentSession.transactionHash,
            blockchainConfirmation: true,
            reused: true
          });
        }
        
        // If we don't have a transaction hash, try to recover from the error
        const existingSig = extractSignatureFromError(error);
        if (existingSig) {
          paymentLogger.info('Recovered existing signature from error', {
            ...context,
            signature: existingSig.substring(0, 8) + "..."
          });
          
          // Verify the transaction status
          try {
            const status = await this.paymentProvider.getTransactionStatus(existingSig);
            if (status && !status.err) {
              return await this.handlePaymentResult(paymentId, {
                success: true,
                transactionHash: existingSig,
                blockchainConfirmation: true,
                reused: true
              });
            }
          } catch (statusError) {
            const err = statusError instanceof Error ? statusError : new Error(String(statusError));
            paymentLogger.error('Failed to verify recovered transaction status', err, context);
          }
        }
      }
      
      const err = error instanceof Error ? error : new Error(String(error));
      paymentLogger.error('Payment processing failed', err, context);
      
      // Update session status
      const paymentSession = this.activePayments.get(paymentId);
      if (paymentSession) {
        paymentSession.status = PaymentStatus.FAILED;
        paymentSession.error = createPaymentError(
          ErrorCategory.UNKNOWN_ERROR,
          'Payment processing failed',
          err,
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
          err,
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
    const context = { 
      paymentId,
      success: result.success,
      hash: result.transactionHash ? (result.transactionHash.substring(0, 8) + "...") : "none",
      requestId: this.requestId
    };
    
    paymentLogger.info('Handling payment result', context);
    
    const paymentSession = this.activePayments.get(paymentId);
    if (!paymentSession) {
      paymentLogger.error('Payment session not found when handling result', undefined, context);
      return {
        paymentId,
        status: PaymentStatus.FAILED,
        error: createPaymentError(
          ErrorCategory.UNKNOWN_ERROR,
          'Payment session not found',
          undefined,
          false
        )
      };
    }
    
    if (result.success) {
      // Payment successful
      paymentLogger.info('Payment successful', {
        ...context,
        walletAddress: paymentSession.walletAddress
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
        paymentLogger.info('User rejected the transaction', {
          ...context,
          walletAddress: paymentSession.walletAddress
        });
        
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
        paymentLogger.info('Duplicate transaction error', {
          ...context,
          walletAddress: paymentSession.walletAddress
        });
        
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
      paymentLogger.error('Payment failed', undefined, {
        ...context,
        errorMessage: result.error?.message,
        errorCategory: result.error?.category,
        walletAddress: paymentSession.walletAddress
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
      paymentLogger.debug('No session found for payment', { paymentId });
      return null;
    }
    
    paymentLogger.debug('Payment status', {
      paymentId,
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
    const context = { paymentId, requestId: this.requestId };
    
    try {
      paymentLogger.info('Cancelling payment', context);
      
      const paymentSession = this.activePayments.get(paymentId);
      if (!paymentSession) {
        paymentLogger.error('Cannot cancel payment - session not found', undefined, context);
        return {
          success: false,
          error: createPaymentError(
            ErrorCategory.UNKNOWN_ERROR,
            'Payment session not found',
            undefined,
            false
          )
        };
      }
      
      // Don't cancel confirmed payments
      if (paymentSession.status === PaymentStatus.CONFIRMED) {
        paymentLogger.info('Cannot cancel confirmed payment', {
          ...context,
          status: paymentSession.status
        });
        return {
          success: false,
          error: createPaymentError(
            ErrorCategory.UNKNOWN_ERROR,
            'Cannot cancel a confirmed payment',
            undefined,
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
      
      paymentLogger.info('Payment successfully cancelled', context);
      
      return { success: true };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      paymentLogger.error('Failed to cancel payment', err, context);
      return {
        success: false,
        error: createPaymentError(
          ErrorCategory.UNKNOWN_ERROR,
          'Failed to cancel payment',
          err,
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
    paymentLogger.debug('Payment timeout set', {
      paymentId,
      timeoutSeconds: PAYMENT_TIMEOUT_MS / 1000
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
      paymentLogger.debug('Payment timeout cleared', { paymentId });
    }
  }
  
  /**
   * Handle a payment timeout
   */
  private async handlePaymentTimeout(paymentId: string) {
    const context = { paymentId, timeoutSeconds: PAYMENT_TIMEOUT_MS / 1000 };
    paymentLogger.info('Payment timed out', context);
    
    const paymentSession = this.activePayments.get(paymentId);
    if (!paymentSession) {
      paymentLogger.debug('No payment session found for timed out payment', context);
      return;
    }
    
    // Only time out pending payments
    if (
      paymentSession.status !== PaymentStatus.INITIALIZED &&
      paymentSession.status !== PaymentStatus.PENDING &&
      paymentSession.status !== PaymentStatus.PROCESSING
    ) {
      paymentLogger.debug('Payment not eligible for timeout', {
        ...context,
        status: paymentSession.status
      });
      return;
    }
    
    // Update session status
    paymentSession.status = PaymentStatus.TIMEOUT;
    paymentSession.error = createPaymentError(
      ErrorCategory.TIMEOUT_ERROR,
      'Payment timed out after 3 minutes',
      undefined,
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
    const context = { paymentId, requestId: this.requestId };
    
    try {
      paymentLogger.info('Resetting payment after duplicate transaction error', context);
      
      // Clear blockchain cache
      clearSessionBlockhashData();
      
      // Clear payment provider cache
      this.paymentProvider.clearTransactionCache();
      
      // Get the payment session
      const paymentSession = this.activePayments.get(paymentId);
      if (!paymentSession) {
        paymentLogger.error('Cannot reset payment - session not found', undefined, context);
        return false;
      }
      
      // Reset payment state for retry
      paymentSession.status = PaymentStatus.INITIALIZED;
      paymentSession.error = undefined;
      paymentSession.updatedAt = new Date().toISOString();
      this.activePayments.set(paymentId, paymentSession);
      
      paymentLogger.info('Payment successfully reset for retry', context);
      
      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      paymentLogger.error('Failed to reset payment after duplicate error', err, context);
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
    const context = {
      activePaymentsCount: this.activePayments.size,
      requestId: this.requestId
    };
    
    paymentLogger.info('Disposing payment service', context);
    
    // Clear all timeouts
    for (const [paymentId, timeout] of this.paymentTimeouts.entries()) {
      clearTimeout(timeout);
      paymentLogger.debug('Cleared payment timeout', {
        paymentId,
        requestId: this.requestId
      });
    }
    this.paymentTimeouts.clear();

    // Clear active payments
    for (const [paymentId, session] of this.activePayments.entries()) {
      paymentLogger.debug('Clearing active payment', {
        paymentId,
        status: session.status,
        requestId: this.requestId
      });
    }
    this.activePayments.clear();

    // Clear session storage
    clearSessionBlockhashData();
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