// src/lib/payment/types/storageTypes.ts

// Database transaction record
export interface TransactionRecord {
  tx_id?: number;
  image_id: number;
  transaction_hash: string;
  sender_wallet: string;
  token: string;
  amount: number;
  status: string; // payment_status enum
  signature?: string;
  created_at: string;
  confirmed_at?: string;
  attempt_count: number;
  recipient_wallet: string;
  unique_nonce?: string;  // Added for transaction uniqueness
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
