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
    
    console.log("PaymentService initialized");
    console.log("Active sessions on init:", this.activePayments.size);
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
      console.log(`Initializing payment ${paymentId} for amount ${amount} ${ACTIVE_PAYMENT_TOKEN}`, {
        imageId: metadata.imageId,
        walletConnected: this.wallet.connected
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
      console.log(`Payment ${paymentId} added to active sessions. Total active:`, this.activePayments.size);
      
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
      console.log(`Payment ${paymentId} updated with transaction ID: ${dbResult.transactionId}`);
      
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
      console.log(`Processing payment ${paymentId}`);
      
      // Clean up any session data to ensure fresh transaction
      clearSessionBlockhashData();
      
      // Check if payment exists
      const paymentSession = this.activePayments.get(paymentId);
      if (!paymentSession) {
        console.error(`Payment session ${paymentId} not found in active payments`);
        console.log("Current active sessions:", Array.from(this.activePayments.keys()));
        
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
      
      console.log(`Payment ${paymentId} updated to PROCESSING status. Attempt: ${paymentSession.attempts}`);
      console.log("Payment details:", {
        imageId: paymentSession.imageId,
        amount: paymentSession.amount,
        token: paymentSession.token,
        transactionId: paymentSession.transactionId
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
      
      console.log(`Payment request for ${paymentId} created`, {
        token: paymentRequest.token,
        amount: paymentRequest.amount,
        recipient: paymentRequest.recipientWallet.substring(0, 8) + "...",
        metadata: {
          imageId: paymentRequest.metadata.imageId,
          paymentId: paymentRequest.metadata.paymentId
        }
      });
      
      // Get token mint address if needed
      const mintAddress = paymentSession.token === 'SOL' ? null : getMintAddress();
      
      // Process the payment
      console.log(`Sending payment ${paymentId} to blockchain provider`);
      const result = await this.paymentProvider.processPayment(paymentRequest, mintAddress);
      console.log(`Payment ${paymentId} blockchain result:`, {
        success: result.success,
        hash: result.transactionHash ? (result.transactionHash.substring(0, 8) + "...") : "none",
        reused: result.reused || false,
        error: result.error ? result.error.message : "none"
      });
      
      // Handle the result
      return await this.handlePaymentResult(paymentId, result);
    } catch (error) {
      // Special handling for "Transaction already processed" errors
      if (isTxAlreadyProcessedError(error)) {
        console.log(`Transaction already processed for payment ${paymentId}. Attempting verification.`);
        
        // Try to find the payment session
        const paymentSession = this.activePayments.get(paymentId);
        if (paymentSession && paymentSession.transactionHash) {
          console.log(`Found existing signature ${paymentSession.transactionHash} for payment ${paymentId}`);
          
          // Create a successful result with the existing hash
          return await this.handlePaymentResult(paymentId, {
            success: true,
            transactionHash: paymentSession.transactionHash,
            blockchainConfirmation: true,
            reused: true
          });
        }
      }
      
      console.error(`Error processing payment ${paymentId}:`, error);
      
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
    console.log(`Handling payment result for ${paymentId}:`, {
      success: result.success,
      hash: result.transactionHash ? (result.transactionHash.substring(0, 8) + "...") : "none",
      error: result.error ? {
        category: result.error.category,
        message: result.error.message,
        code: result.error.code
      } : "none"
    });
    
    const paymentSession = this.activePayments.get(paymentId);
    if (!paymentSession) {
      console.error(`Payment session ${paymentId} not found when handling result`);
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
      console.log(`Payment ${paymentId} successful with hash: ${result.transactionHash}`);
      
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
        console.log(`Payment ${paymentId} - User rejected the transaction`);
        
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
        console.log(`Payment ${paymentId} - Duplicate transaction error`);
        
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
      console.log(`Payment ${paymentId} failed with error: ${result.error?.message}`);
      
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
      console.log(`getPaymentStatus: No session found for ${paymentId}`);
      return null;
    }
    
    console.log(`Payment status for ${paymentId}:`, {
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
      console.log(`Cancelling payment ${paymentId}`);
      
      const paymentSession = this.activePayments.get(paymentId);
      if (!paymentSession) {
        console.error(`Cannot cancel payment - session ${paymentId} not found`);
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
        console.log(`Cannot cancel payment ${paymentId} - already confirmed`);
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
      
      console.log(`Payment ${paymentId} successfully cancelled`);
      
      return { success: true };
    } catch (error) {
      console.error(`Failed to cancel payment ${paymentId}:`, error);
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
      
      console.log(`Payment ${paymentId} successfully reset for retry`);
      
      return true;
    } catch (error) {
      console.error(`Failed to reset payment after duplicate error:`, error);
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
    console.log("Disposing PaymentService resources");
    
    // Clear all timeouts
    for (const [paymentId, timeout] of this.paymentTimeouts.entries()) {
      clearTimeout(timeout);
    }
    
    this.paymentTimeouts.clear();
    this.activePayments.clear();
    
    // Clean session storage
    clearSessionBlockhashData();
    
    console.log("PaymentService cleanup complete");
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