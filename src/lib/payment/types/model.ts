import { PublicKey, Transaction } from '@solana/web3.js';

/**
 * This file contains all the models/types used in the payment system.
 * For backward compatibility, these are also exported via index.ts
 * In the future, imports should be made directly from this file.
 */

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
  paymentId?: string;
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
  reused?: boolean;
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
  unique_nonce?: string;
}

// Database image record for payments
export interface PaymentImageRecord {
  image_id: number;
  image_location: string;
  start_position_x: number;
  start_position_y: number;
  size_x: number;
  size_y: number;
  image_status: number;
  created_at: string;
  confirmed_at?: string;
  payment_attempts?: number;
  last_updated_at?: string;
  sender_wallet?: string; 
}

// Database operation result
export interface DatabaseResult<T> {
  success: boolean;
  data?: T;
  error?: any;
}

// Status mapping interfaces
export interface StatusMapping {
  [key: string]: string | number;
} 