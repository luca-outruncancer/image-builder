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