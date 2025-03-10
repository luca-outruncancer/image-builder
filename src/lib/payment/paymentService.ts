// src/lib/payment/paymentService.ts
'use client';

import { PaymentRequest,PaymentResponse, PaymentStatusResponse, PaymentStatus, PaymentMetadata, PaymentError,PaymentSession} from './types';
import { generatePaymentId, formatErrorForUser,clearSessionBlockhashData} from './utils';
import { SolanaPaymentProvider } from './solanaPaymentProvider';
import { PaymentStorageProvider } from './storage';
import { RECIPIENT_WALLET_ADDRESS } from '@/utils/constants';

const PAYMENT_TIMEOUT_MS = 180000; // 3 minutes

/**
 * Core PaymentService that orchestrates the payment flow
 */
export class PaymentService {
  private paymentProvider: SolanaPaymentProvider;
  private storageProvider: PaymentStorageProvider;
  private activePayments: Map<string, PaymentSession>;
  private paymentTimeouts: Map<string, NodeJS.Timeout>;
  private wallet: any;
  
  constructor(wallet: any) {
    this.wallet = wallet;
    this.paymentProvider = new SolanaPaymentProvider(wallet);
    this.storageProvider = new PaymentStorageProvider();
    this.activePayments = new Map();
    this.paymentTimeouts = new Map();
    
    console.log("PaymentService initialized");
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
        return {
          paymentId: '',
          status: PaymentStatus.FAILED,
          error: {
            category: 'wallet_error',
            message: 'Wallet not connected',
            retryable: false
          }
        };
      }
      
      // Generate a unique payment ID
      const paymentId = generatePaymentId();
      console.log(`Initializing payment ${paymentId} for amount ${amount}`);
      
      // Clean up any session data to ensure fresh transaction
      clearSessionBlockhashData();
      
      // Create payment session
      const paymentSession: PaymentSession = {
        paymentId,
        status: PaymentStatus.INITIALIZED,
        imageId: metadata.imageId,
        amount,
        token: 'SOL', // Currently hardcoded to SOL
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
      
      // Initialize in database
      const dbResult = await this.storageProvider.initializeTransaction(paymentSession);
      
      if (!dbResult.success) {
        console.error(`Failed to initialize payment ${paymentId} in database:`, dbResult.error);
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
      
      // Set timeout for this payment
      this.setPaymentTimeout(paymentId);
      
      return {
        paymentId,
        status: PaymentStatus.INITIALIZED,
        transactionId: dbResult.transactionId
      };
    } catch (error) {
      console.error('Failed to initialize payment:', error);
      return {
        paymentId: '',
        status: PaymentStatus.FAILED,
        error: {
          category: 'unknown_error',
          message: 'Payment initialization failed',
          retryable: true,
          originalError: error
        }
      };
    }
  }
  
  /**
   * Process a payment
   */
  public async processPayment(paymentId: string): Promise<PaymentStatusResponse> {
    const currentPaymentId = paymentId;
    
    if (!currentPaymentId) {
      return {
        paymentId: '',
        status: PaymentStatus.FAILED,
        error: {
          category: 'unknown_error',
          message: 'No payment ID provided',
          retryable: false
        }
      };
    }
    
    try {
      // Check if payment exists
      const paymentSession = this.activePayments.get(currentPaymentId);
      if (!paymentSession) {
        console.error(`Payment session ${currentPaymentId} not found in active payments`);
        
        return {
          paymentId: currentPaymentId,
          status: PaymentStatus.FAILED,
          error: {
            category: 'unknown_error',
            message: 'Payment session not found',
            retryable: false
          }
        };
      }
      
      // Update payment status
      paymentSession.status = PaymentStatus.PROCESSING;
      paymentSession.attempts += 1;
      paymentSession.updatedAt = new Date().toISOString();
      this.activePayments.set(currentPaymentId, paymentSession);
      
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
        metadata: paymentSession.metadata
      };
      
      // Process the payment
      const result = await this.paymentProvider.processPayment(paymentRequest, null);
      
      // Handle the result
      if (result.success) {
        // Update session status
        paymentSession.status = PaymentStatus.CONFIRMED;
        paymentSession.transactionHash = result.transactionHash;
        paymentSession.updatedAt = new Date().toISOString();
        this.activePayments.set(currentPaymentId, paymentSession);
        
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
        this.clearPaymentTimeout(currentPaymentId);
        
        return {
          paymentId: currentPaymentId,
          status: PaymentStatus.CONFIRMED,
          transactionHash: result.transactionHash,
          metadata: paymentSession.metadata,
          amount: paymentSession.amount,
          token: paymentSession.token,
          timestamp: paymentSession.updatedAt,
          attempts: paymentSession.attempts
        };
      } else {
        const errorCategory = result.error?.category || 'unknown_error';
        
        // Special handling for user rejection - don't mark as failed
        if (errorCategory === 'user_rejection') {
          paymentSession.status = PaymentStatus.PENDING;
          paymentSession.error = result.error;
          paymentSession.updatedAt = new Date().toISOString();
          this.activePayments.set(currentPaymentId, paymentSession);
          
          return {
            paymentId: currentPaymentId,
            status: PaymentStatus.PENDING,
            error: result.error,
            metadata: paymentSession.metadata,
            amount: paymentSession.amount,
            token: paymentSession.token,
            attempts: paymentSession.attempts
          };
        }
        
        // Mark as failed
        paymentSession.status = PaymentStatus.FAILED;
        paymentSession.error = result.error;
        paymentSession.updatedAt = new Date().toISOString();
        this.activePayments.set(currentPaymentId, paymentSession);
        
        // Update database
        if (paymentSession.transactionId) {
          await this.storageProvider.updateTransactionStatus(
            paymentSession.transactionId,
            PaymentStatus.FAILED
          );
        }
        
        return {
          paymentId: currentPaymentId,
          status: PaymentStatus.FAILED,
          error: result.error,
          metadata: paymentSession.metadata,
          amount: paymentSession.amount,
          token: paymentSession.token,
          attempts: paymentSession.attempts
        };
      }
    } catch (error) {
      console.error(`Error processing payment ${currentPaymentId}:`, error);
      
      // Get the payment session
      const paymentSession = this.activePayments.get(currentPaymentId);
      if (paymentSession) {
        paymentSession.status = PaymentStatus.FAILED;
        paymentSession.error = {
          category: 'unknown_error',
          message: 'Payment processing failed',
          originalError: error,
          retryable: true
        };
        paymentSession.updatedAt = new Date().toISOString();
        this.activePayments.set(currentPaymentId, paymentSession);
        
        // Update database
        if (paymentSession.transactionId) {
          await this.storageProvider.updateTransactionStatus(
            paymentSession.transactionId,
            PaymentStatus.FAILED
          );
        }
      }
      
      return {
        paymentId: currentPaymentId,
        status: PaymentStatus.FAILED,
        error: {
          category: 'unknown_error',
          message: 'Payment processing failed',
          originalError: error,
          retryable: true
        }
      };
    }
  }
  
  /**
   * Cancel a payment
   */
  public async cancelPayment(paymentId: string): Promise<{ success: boolean; error?: PaymentError }> {
    try {
      console.log(`Cancelling payment ${paymentId}`);
      
      const paymentSession = this.activePayments.get(paymentId);
      if (!paymentSession) {
        console.error(`Cannot cancel payment - session ${paymentId} not found`);
        return {
          success: false,
          error: {
            category: 'unknown_error',
            message: 'Payment session not found',
            retryable: false
          }
        };
      }
      
      // Don't cancel confirmed payments
      if (paymentSession.status === PaymentStatus.CONFIRMED) {
        console.log(`Cannot cancel payment ${paymentId} - already confirmed`);
        return {
          success: false,
          error: {
            category: 'unknown_error',
            message: 'Cannot cancel a confirmed payment',
            retryable: false
          }
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
      
      return { success: true };
    } catch (error) {
      console.error(`Failed to cancel payment ${paymentId}:`, error);
      return {
        success: false,
        error: {
          category: 'unknown_error',
          message: 'Failed to cancel payment',
          originalError: error,
          retryable: true
        }
      };
    }
  }
  
  /**
   * Get the status of a payment
   */
  public getPaymentStatus(paymentId: string): PaymentStatusResponse | null {
    const paymentSession = this.activePayments.get(paymentId);
    if (!paymentSession) {
      return null;
    }
    
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
   * Get a formatted error message for display to users
   */
  public getFormattedErrorMessage(error: PaymentError): string {
    return formatErrorForUser(error);
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
    console.log(`Payment timeout set for ${paymentId} (${PAYMENT_TIMEOUT_MS / 1000}s)`);
  }
  
  /**
   * Clear a payment timeout
   */
  private clearPaymentTimeout(paymentId: string) {
    const timeout = this.paymentTimeouts.get(paymentId);
    if (timeout) {
      clearTimeout(timeout);
      this.paymentTimeouts.delete(paymentId);
      console.log(`Payment timeout cleared for ${paymentId}`);
    }
  }
  
  /**
   * Handle a payment timeout
   */
  private async handlePaymentTimeout(paymentId: string) {
    console.log(`Payment ${paymentId} timed out after ${PAYMENT_TIMEOUT_MS / 1000}s`);
    
    const paymentSession = this.activePayments.get(paymentId);
    if (!paymentSession) {
      console.log(`No payment session found for timed out payment ${paymentId}`);
      return;
    }
    
    // Only time out pending payments
    if (
      paymentSession.status !== PaymentStatus.INITIALIZED &&
      paymentSession.status !== PaymentStatus.PENDING &&
      paymentSession.status !== PaymentStatus.PROCESSING
    ) {
      console.log(`Payment ${paymentId} in status ${paymentSession.status} - not eligible for timeout`);
      return;
    }
    
    // Update session status
    paymentSession.status = PaymentStatus.TIMEOUT;
    paymentSession.error = {
      category: 'timeout_error',
      message: 'Payment timed out after 3 minutes',
      retryable: false
    };
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
  }
  
  /**
   * Reset a payment after a duplicate transaction error
   */
  public async resetAfterDuplicateError(paymentId: string): Promise<boolean> {
    try {
      console.log(`Resetting payment ${paymentId} after duplicate transaction error`);
      
      // Clear blockchain cache
      clearSessionBlockhashData();
      
      // Clear payment provider cache
      this.paymentProvider.clearTransactionCache();
      
      // Get the payment session
      const paymentSession = this.activePayments.get(paymentId);
      if (!paymentSession) {
        console.error(`Cannot reset payment ${paymentId} - session not found`);
        return false;
      }
      
      // Reset payment state for retry
      paymentSession.status = PaymentStatus.INITIALIZED;
      paymentSession.error = undefined;
      paymentSession.updatedAt = new Date().toISOString();
      this.activePayments.set(paymentId, paymentSession);
      
      return true;
    } catch (error) {
      console.error(`Failed to reset payment after duplicate error:`, error);
      return false;
    }
  }
  
  /**
   * Clean up all resources
   */
  public dispose() {
    console.log("Disposing PaymentService resources");
    
    // Clear all timeouts
    for (const [paymentId, timeout] of this.paymentTimeouts.entries()) {
      clearTimeout(timeout);
    }
    
    this.paymentTimeouts.clear();
    this.activePayments.clear();
    
    // Clean session storage
    clearSessionBlockhashData();
  }
}

export default PaymentService;
