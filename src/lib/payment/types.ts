// src/lib/payment/types.ts
import { PublicKey, Transaction } from '@solana/web3.js';

// Payment status constants
export enum PaymentStatus {
  INITIALIZED = 'INITIALIZED',
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  CONFIRMED = 'CONFIRMED',
  FAILED = 'FAILED',
  TIMEOUT = 'TIMEOUT',
  CANCELED = 'CANCELED'
}

// Error categories for better handling
export enum ErrorCategory {
  USER_REJECTION = 'USER_REJECTION',
  NETWORK_ERROR = 'NETWORK_ERROR',
  BALANCE_ERROR = 'BALANCE_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  WALLET_ERROR = 'WALLET_ERROR',
  BLOCKCHAIN_ERROR = 'BLOCKCHAIN_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
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

// Database transaction record
export interface TransactionRecord {
  tx_id?: number;
  image_id: number;
  transaction_hash: string;
  sender_wallet: string;
  token: string;
  amount: number;
  status: string;
  signature?: string;
  created_at: string;
  confirmed_at?: string;
  attempt_count: number;
  recipient_wallet: string;
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