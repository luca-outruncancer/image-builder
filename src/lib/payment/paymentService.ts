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
  getStoredTransactionSignature,
  storeTransactionSignature,
  getOrCreateSessionId
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
  private sessionId: string;
  
  constructor(wallet: WalletConfig) {
    this.wallet = wallet;
    this.paymentProvider = new SolanaPaymentProvider(wallet);
    this.storageProvider = new PaymentStorageProvider();
    this.activePayments = new Map();
    this.paymentTimeouts = new Map();
    this.sessionId = getOrCreateSessionId();
    
    console.log(`PaymentService initialized with session ID: ${this.sessionId}`);
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
      console.log(`[PS:${this.sessionId}] Initializing payment ${paymentId} for amount ${amount} ${ACTIVE_PAYMENT_TOKEN}`, {
        imageId: metadata.imageId,
        walletConnected: this.wallet.connected
      });
      
      // Check for existing transaction in session storage
      const existingSignature = metadata.imageId ? getStoredTransactionSignature(`img_${metadata.imageId}`) : null;
      if (existingSignature) {
        console.log(`Found existing signature in session storage for image ${metadata.imageId}: ${existingSignature}`);
        // We'll verify this during the processing phase
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
      console.log(`[PS:${this.sessionId}] Payment ${paymentId} added to active sessions. Total active:`, this.activePayments.size);
      
      // Initialize in database
      const dbResult = await this.storageProvider.initializeTransaction(paymentSession);
      
      if (!dbResult.success) {
        console.error(`[PS:${this.sessionId}] Failed to initialize payment ${paymentId} in database:`, dbResult.error);
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
      console.log(`[PS:${this.sessionId}] Payment ${paymentId} updated with transaction ID: ${dbResult.transactionId}`);
      
      // Set timeout for this payment
      this.setPaymentTimeout(paymentId);
      
      return {
        paymentId,
        status: PaymentStatus.INITIALIZED,
        transactionId: dbResult.transactionId
      };
    } catch (error) {
      console.error('[PS:${this.sessionId}] Failed to initialize payment:', error);
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
      console.log(`[PS:${this.sessionId}] Processing payment ${paymentId}`);
      
      // Clean up any session data to ensure fresh transaction
      clearSessionBlockhashData();
      
      // Check if payment exists
      const paymentSession = this.activePayments.get(paymentId);
      if (!paymentSession) {
        console.error(`[PS:${this.sessionId}] Payment session ${paymentId} not found in active payments`);
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
      
      // First check for previously completed transactions in session storage
      if (paymentSession.imageId) {
        const storedSignature = getStoredTransactionSignature(`img_${paymentSession.imageId}`);
        if (storedSignature) {
          console.log(`[PS:${this.sessionId}] Found stored signature for image ${paymentSession.imageId}, verifying...`);
          
          try {
            // Verify if this transaction was successful
            const result = await this.paymentProvider.verifyExistingTransaction(storedSignature);
            if (result.success) {
              console.log(`[PS:${this.sessionId}] Stored signature ${storedSignature} verified as successful`);
              
              // Update payment session
              paymentSession.status = PaymentStatus.CONFIRMED;
              paymentSession.transactionHash = storedSignature;
              paymentSession.updatedAt = new Date().toISOString();
              this.activePayments.set(paymentId, paymentSession);
              
              // Update database
              if (paymentSession.transactionId) {
                await this.storageProvider.updateTransactionStatus(
                  paymentSession.transactionId,
                  PaymentStatus.CONFIRMED,
                  storedSignature,
                  true
                );
              }
              
              return {
                paymentId,
                status: PaymentStatus.CONFIRMED,
                transactionHash: storedSignature,
                metadata: paymentSession.metadata,
                amount: paymentSession.amount,
                token: paymentSession.token,
                timestamp: paymentSession.updatedAt,
                attempts: paymentSession.attempts
              };
            }
          } catch (verifyError) {
            console.error(`[PS:${this.sessionId}] Error verifying stored signature:`, verifyError);
            // Continue with normal payment flow
          }
        }
      }
      
      // Update payment status
      paymentSession.status = PaymentStatus.PROCESSING;
      paymentSession.attempts += 1;
      paymentSession.updatedAt = new Date().toISOString();
      this.activePayments.set(paymentId, paymentSession);
      
      console.log(`[PS:${this.sessionId}] Payment ${paymentId} updated to PROCESSING status. Attempt: ${paymentSession.attempts}`);
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
      
      console.log(`[PS:${this.sessionId}] Payment request for ${paymentId} created`, {
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
      console.log(`[PS:${this.sessionId}] Sending payment ${paymentId} to blockchain provider`);
      const result = await this.paymentProvider.processPayment(paymentRequest, mintAddress);
      console.log(`[PS:${this.sessionId}] Payment ${paymentId} blockchain result:`, {
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
        console.log(`[PS:${this.sessionId}] Transaction already processed for payment ${paymentId}. Attempting recovery.`);
        
        // Try to find the payment session
        const paymentSession = this.activePayments.get(paymentId);
        if (paymentSession && paymentSession.transactionHash) {
          console.log(`[PS:${this.sessionId}] Found existing signature ${paymentSession.transactionHash} for payment ${paymentId}`);
          
          // Store this in session storage for future reference
          if (paymentSession.imageId) {
            storeTransactionSignature(`img_${paymentSession.imageId}`, paymentSession.transactionHash);
          }
          
          // Create a successful result with the existing hash
          return await this.handlePaymentResult(paymentId, {
            success: true,
            transactionHash: paymentSession.transactionHash,
            blockchainConfirmation: true,
            reused: true
          });
        }
      }
      
      console.error(`[PS:${this.sessionId}] Error processing payment ${paymentId}:`, error);
      
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