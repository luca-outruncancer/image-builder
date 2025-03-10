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