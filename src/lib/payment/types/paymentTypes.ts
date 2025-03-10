// src/lib/payment/types/paymentTypes.ts
import { PublicKey, Transaction } from '@solana/web3.js';

// Payment status constants
export enum PaymentStatus {
  INITIALIZED = 'initialized',
  PENDING = 'pending',
  PROCESSING = 'processing',
  CONFIRMED = 'confirmed',
  FAILED = 'failed',
  TIMEOUT = 'timeout',
  CANCELED = 'canceled'
}

// Error categories for better handling
export enum ErrorCategory {
  USER_REJECTION = 'user_rejection',
  NETWORK_ERROR = 'network_error',
  BALANCE_ERROR = 'balance_error',
  TIMEOUT_ERROR = 'timeout_error',
  WALLET_ERROR = 'wallet_error',
  BLOCKCHAIN_ERROR = 'blockchain_error',
  UNKNOWN_ERROR = 'unknown_error'
}

// Structured error object
export interface PaymentError {
  category: ErrorCategory;
  message: string;
  originalError?: any;
  retryable: boolean;
  code?: string;
}

// Payment metadata for database records
export interface PaymentMetadata {
  imageId: number;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  fileName?: string;
  paymentId?: string; // Added for tracking unique payments
}

// Payment request object
export interface PaymentRequest {
  amount: number;
  token: string;
  recipientWallet: string;
  metadata: PaymentMetadata;
}

// Payment response after initialization
export interface PaymentResponse {
  paymentId: string;
  status: PaymentStatus;
  transactionId?: number;
  error?: PaymentError;
}

// Transaction result after processing
export interface TransactionResult {
  success: boolean;
  transactionHash?: string;
  error?: PaymentError;
  blockchainConfirmation?: boolean;
  reused?: boolean; // Indicates this is a reused transaction that was already processed
}

// Status response for payment
export interface PaymentStatusResponse {
  paymentId: string;
  status: PaymentStatus;
  transactionHash?: string;
  error?: PaymentError;
  metadata?: PaymentMetadata;
  amount?: number;
  token?: string;
  timestamp?: string;
  attempts?: number;
}

// Wallet configuration interface
export interface WalletConfig {
  publicKey: PublicKey | null;
  signTransaction?: (transaction: Transaction) => Promise<Transaction>;
  connected: boolean;
}

// Payment session tracking
export interface PaymentSession {
  paymentId: string;
  status: PaymentStatus;
  transactionId?: number;
  imageId: number;
  amount: number;
  token: string;
  metadata: PaymentMetadata;
  createdAt: string;
  updatedAt: string;
  attempts: number;
  error?: PaymentError;
  transactionHash?: string;
  walletAddress?: string;
  recipientWallet: string;
}
