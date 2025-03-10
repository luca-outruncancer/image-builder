// src/lib/payment/types/storageTypes.ts

// Database transaction record
export interface TransactionRecord {
  transaction_id?: number;
  image_id: number;
  sender_wallet: string;
  recipient_wallet: string;
  transaction_hash: string;
  transaction_status: string;
  amount: number;
  token: string;
  timestamp?: string;
  retry_count?: number;
  blockchain_confirmation?: boolean;
  last_verified_at?: string;
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
