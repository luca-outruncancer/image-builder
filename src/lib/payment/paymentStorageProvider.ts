// src/lib/payment/paymentStorageProvider.ts
'use client';

import { createClient } from '@supabase/supabase-js';
import { 
  TransactionRecord,
  PaymentSession,
  PaymentStatus,
  PaymentError,
  PaymentMetadata,
  ErrorCategory
} from './types';
import { createPaymentError } from './utils';
import { IMAGE_STATUS } from '@/lib/imageStorage';

// Use environment variables for Supabase connection
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Map payment status to transaction status
const PAYMENT_TO_TRANSACTION_STATUS: Record<PaymentStatus, string> = {
  [PaymentStatus.INITIALIZED]: 'initiated',
  [PaymentStatus.PENDING]: 'pending',
  [PaymentStatus.PROCESSING]: 'in_progress',
  [PaymentStatus.CONFIRMED]: 'success',
  [PaymentStatus.FAILED]: 'failed',
  [PaymentStatus.TIMEOUT]: 'timeout',
  [PaymentStatus.CANCELED]: 'canceled'
};

// Map payment status to image status
const PAYMENT_TO_IMAGE_STATUS: Record<PaymentStatus, number> = {
  [PaymentStatus.INITIALIZED]: IMAGE_STATUS.PENDING_PAYMENT,
  [PaymentStatus.PENDING]: IMAGE_STATUS.PENDING_PAYMENT,
  [PaymentStatus.PROCESSING]: IMAGE_STATUS.PENDING_PAYMENT,
  [PaymentStatus.CONFIRMED]: IMAGE_STATUS.CONFIRMED,
  [PaymentStatus.FAILED]: IMAGE_STATUS.PAYMENT_FAILED,
  [PaymentStatus.TIMEOUT]: IMAGE_STATUS.PAYMENT_TIMEOUT,
  [PaymentStatus.CANCELED]: IMAGE_STATUS.NOT_INITIATED
};

/**
 * PaymentStorageProvider handles database interactions for payments
 */
export class PaymentStorageProvider {
  private supabase: any;
  
  constructor() {
    this.initializeSupabase();
  }
  
  /**
   * Initialize Supabase client
   */
  private initializeSupabase() {
    try {
      if (supabaseUrl && supabaseKey) {
        this.supabase = createClient(supabaseUrl, supabaseKey);
        console.log("Supabase client initialized in PaymentStorageProvider");
      } else {
        console.error("Unable to initialize Supabase client due to missing environment variables");
      }
    } catch (error) {
      console.error("Error initializing Supabase client:", error);
    }
  }
  
  /**
   * Check if the Supabase client is available
   */
  private checkSupabase(): boolean {
    if (!this.supabase) {
      console.warn("Supabase client not available");
      return false;
    }
    return true;
  }
  
  /**
   * Initialize a transaction record for a new payment
   */
  public async initializeTransaction(
    paymentSession: PaymentSession
  ): Promise<{ success: boolean; transactionId?: number; error?: PaymentError }> {
    try {
      if (!this.checkSupabase()) {
        return { 
          success: false, 
          error: createPaymentError(
            ErrorCategory.UNKNOWN_ERROR,
            "Database client not available",
            null,
            false
          )
        };
      }
      
      const { imageId, amount, token, walletAddress, recipientWallet, paymentId } = paymentSession;
      
      // Validate input data
      if (!imageId || !amount || !token || !walletAddress || !recipientWallet) {
        return {
          success: false,
          error: createPaymentError(
            ErrorCategory.UNKNOWN_ERROR,
            "Missing required fields for transaction initialization",
            null,
            false
          )
        };
      }
      
      // Create transaction record with INITIATED status
      const { data, error } = await this.supabase
        .from('transactions')
        .insert([{
          image_id: imageId,
          sender_wallet: walletAddress,
          recipient_wallet: recipientWallet,
          transaction_hash: `pending_${paymentId}`,
          transaction_status: PAYMENT_TO_TRANSACTION_STATUS[PaymentStatus.INITIALIZED],
          amount: amount,
          token: token,
          timestamp: new Date().toISOString(),
          retry_count: 0,
          blockchain_confirmation: false
        }])
        .select();
      
      if (error) {
        console.error("Database error initializing transaction:", error);
        return { 
          success: false, 
          error: createPaymentError(
            ErrorCategory.UNKNOWN_ERROR,
            "Failed to create transaction record",
            error,
            true
          )
        };
      }
      
      // Update image status to indicate transaction initiation
      const { error: updateError } = await this.supabase
        .from('images')
        .update({ 
          image_status: PAYMENT_TO_IMAGE_STATUS[PaymentStatus.INITIALIZED],
          sender_wallet: walletAddress,
          last_updated_at: new Date().toISOString()
        })
        .eq('image_id', imageId);
      
      if (updateError) {
        console.error("Error updating image status after transaction initialization:", updateError);
        return { 
          success: true, 
          transactionId: data[0].transaction_id,
          error: createPaymentError(
            ErrorCategory.UNKNOWN_ERROR,
            "Transaction initialized but image status could not be updated",
            updateError,
            false
          )
        };
      }
      
      return { 
        success: true, 
        transactionId: data[0].transaction_id 
      };
    } catch (error) {
      console.error('Failed to initialize transaction:', error);
      return { 
        success: false, 
        error: createPaymentError(
          ErrorCategory.UNKNOWN_ERROR,
          "Database operation failed",
          error,
          true
        )
      };
    }
  }
  
  /**
   * Update the status of an existing transaction
   */
  public async updateTransactionStatus(
    transactionId: number,
    status: PaymentStatus,
    transactionHash?: string,
    blockchainConfirmation?: boolean
  ): Promise<{ success: boolean; error?: PaymentError }> {
    try {
      if (!this.checkSupabase()) {
        return { 
          success: false, 
          error: createPaymentError(
            ErrorCategory.UNKNOWN_ERROR,
            "Database client not available",
            null,
            false
          )
        };
      }
      
      const updateData: any = {
        transaction_status: PAYMENT_TO_TRANSACTION_STATUS[status]
      };
      
      // Add transaction hash if provided
      if (transactionHash) {
        updateData.transaction_hash = transactionHash;
      }
      
      // Add blockchain confirmation if provided
      if (blockchainConfirmation !== undefined) {
        updateData.blockchain_confirmation = blockchainConfirmation;
      }
      
      // Update the transaction
      const { error } = await this.supabase
        .from('transactions')
        .update(updateData)
        .eq('transaction_id', transactionId);
      
      if (error) {
        console.error("Database error updating transaction status:", error);
        return { 
          success: false, 
          error: createPaymentError(
            ErrorCategory.UNKNOWN_ERROR,
            "Failed to update transaction status",
            error,
            true
          )
        };
      }
      
      // If this is a final status, also update the image status
      if (
        status === PaymentStatus.CONFIRMED || 
        status === PaymentStatus.FAILED || 
        status === PaymentStatus.TIMEOUT || 
        status === PaymentStatus.CANCELED
      ) {
        // Get the image ID for this transaction
        const { data: txData, error: txError } = await this.supabase
          .from('transactions')
          .select('image_id')
          .eq('transaction_id', transactionId)
          .single();
        
        if (txError) {
          console.error("Error getting image ID for transaction:", txError);
          return { 
            success: true, 
            error: createPaymentError(
              ErrorCategory.UNKNOWN_ERROR,
              "Transaction status updated but could not update image status",
              txError,
              false
            )
          };
        }
        
        const imageId = txData.image_id;
        const newImageStatus = PAYMENT_TO_IMAGE_STATUS[status];
        
        // For confirmed payments, add confirmation timestamp
        const additionalFields = status === PaymentStatus.CONFIRMED 
          ? { confirmed_at: new Date().toISOString() } 
          : {};
        
        const { error: imageError } = await this.supabase
          .from('images')
          .update({ 
            image_status: newImageStatus,
            last_updated_at: new Date().toISOString(),
            ...additionalFields
          })
          .eq('image_id', imageId);
        
        if (imageError) {
          console.error("Error updating image status after transaction update:", imageError);
          return { 
            success: true, 
            error: createPaymentError(
              ErrorCategory.UNKNOWN_ERROR,
              "Transaction status updated but image status could not be updated",
              imageError,
              false
            )
          };
        }
      }
      
      return { success: true };
    } catch (error) {
      console.error('Failed to update transaction status:', error);
      return { 
        success: false, 
        error: createPaymentError(
          ErrorCategory.UNKNOWN_ERROR,
          "Failed to update transaction",
          error,
          true
        )
      };
    }
  }
  
  /**
   * Save a new transaction record and update image status
   */
  public async saveTransaction(
    record: TransactionRecord
  ): Promise<{ success: boolean; transactionId?: number; error?: PaymentError }> {
    try {
      if (!this.checkSupabase()) {
        return { 
          success: false, 
          error: createPaymentError(
            ErrorCategory.UNKNOWN_ERROR,
            "Database client not available",
            null,
            false
          )
        };
      }
      
      // Validate transaction record
      if (!record.image_id || !record.transaction_hash || !record.amount) {
        return {
          success: false,
          error: createPaymentError(
            ErrorCategory.UNKNOWN_ERROR,
            "Invalid transaction record: missing required fields",
            null,
            false
          )
        };
      }
      
      // Get current timestamp
      const now = new Date().toISOString();
      
      // Get retry count (if this is a retry)
      let retryCount = 0;
      
      try {
        const { data: existingTx } = await this.supabase
          .from('transactions')
          .select('retry_count')
          .eq('image_id', record.image_id)
          .eq('transaction_status', 'failed')
          .order('timestamp', { ascending: false })
          .limit(1)
          .single();
        
        if (existingTx?.retry_count !== undefined) {
          retryCount = existingTx.retry_count + 1;
        }
      } catch (countError) {
        // It's okay if there's no previous transaction
        console.log("No previous transaction found, this is the first attempt");
      }
      
      // Insert the transaction record
      const { data, error } = await this.supabase
        .from('transactions')
        .insert([{
          image_id: record.image_id,
          sender_wallet: record.sender_wallet,
          recipient_wallet: record.recipient_wallet,
          transaction_hash: record.transaction_hash,
          transaction_status: record.transaction_status,
          amount: record.amount,
          token: record.token,
          timestamp: now,
          retry_count: retryCount,
          blockchain_confirmation: record.blockchain_confirmation || true
        }])
        .select();
      
      if (error) {
        console.error("Database error saving transaction:", error);
        return { 
          success: false, 
          error: createPaymentError(
            ErrorCategory.UNKNOWN_ERROR,
            "Failed to save transaction record",
            error,
            true
          )
        };
      }
      
      // Map transaction status to image status
      let newImageStatus;
      let additionalFields = {};
      
      switch (record.transaction_status) {
        case 'success':
          newImageStatus = IMAGE_STATUS.CONFIRMED;
          additionalFields = { confirmed_at: now };
          break;
        case 'failed':
          newImageStatus = IMAGE_STATUS.PAYMENT_FAILED;
          break;
        case 'timeout':
          newImageStatus = IMAGE_STATUS.PAYMENT_TIMEOUT;
          break;
        case 'pending':
          newImageStatus = IMAGE_STATUS.PENDING_PAYMENT;
          break;
        default:
          newImageStatus = IMAGE_STATUS.PENDING_PAYMENT;
      }
      
      // Update the image record
      const { error: updateError } = await this.supabase
        .from('images')
        .update({ 
          image_status: newImageStatus,
          last_updated_at: now,
          ...additionalFields
        })
        .eq('image_id', record.image_id);
      
      if (updateError) {
        console.error("Error updating image status after transaction:", updateError);
        return { 
          success: true, 
          transactionId: data[0].transaction_id,
          error: createPaymentError(
            ErrorCategory.UNKNOWN_ERROR,
            "Transaction saved but image status could not be updated",
            updateError,
            false
          )
        };
      }
      
      return { 
        success: true, 
        transactionId: data[0].transaction_id 
      };
    } catch (error) {
      console.error('Failed to save transaction:', error);
      return { 
        success: false, 
        error: createPaymentError(
          ErrorCategory.UNKNOWN_ERROR,
          "Failed to save transaction",
          error,
          true
        )
      };
    }
  }
  
  /**
   * Get a transaction by ID
   */
  public async getTransaction(transactionId: number): Promise<{ success: boolean; data?: TransactionRecord; error?: PaymentError }> {
    try {
      if (!this.checkSupabase()) {
        return { 
          success: false, 
          error: createPaymentError(
            ErrorCategory.UNKNOWN_ERROR,
            "Database client not available",
            null,
            false
          )
        };
      }
      
      const { data, error } = await this.supabase
        .from('transactions')
        .select('*')
        .eq('transaction_id', transactionId)
        .single();
      
      if (error) {
        console.error("Error getting transaction:", error);
        return { 
          success: false, 
          error: createPaymentError(
            ErrorCategory.UNKNOWN_ERROR,
            "Failed to get transaction",
            error,
            true
          )
        };
      }
      
      return { success: true, data };
    } catch (error) {
      console.error('Failed to get transaction:', error);
      return { 
        success: false, 
        error: createPaymentError(
          ErrorCategory.UNKNOWN_ERROR,
          "Failed to retrieve transaction",
          error,
          true
        )
      };
    }
  }
  
  /**
   * Get a transaction by image ID
   */
  public async getTransactionByImageId(imageId: number): Promise<{ success: boolean; data?: TransactionRecord; error?: PaymentError }> {
    try {
      if (!this.checkSupabase()) {
        return { 
          success: false, 
          error: createPaymentError(
            ErrorCategory.UNKNOWN_ERROR,
            "Database client not available",
            null,
            false
          )
        };
      }
      
      const { data, error } = await this.supabase
        .from('transactions')
        .select('*')
        .eq('image_id', imageId)
        .order('timestamp', { ascending: false })
        .limit(1)
        .single();
      
      if (error) {
        // If no transaction found, that's ok
        if (error.code === 'PGRST116') {
          return { success: true, data: undefined };
        }
        
        console.error("Error getting transaction by image ID:", error);
        return { 
          success: false, 
          error: createPaymentError(
            ErrorCategory.UNKNOWN_ERROR,
            "Failed to get transaction for image",
            error,
            true
          )
        };
      }
      
      return { success: true, data };
    } catch (error) {
      console.error('Failed to get transaction by image ID:', error);
      return { 
        success: false, 
        error: createPaymentError(
          ErrorCategory.UNKNOWN_ERROR,
          "Failed to retrieve transaction for image",
          error,
          true
        )
      };
    }
  }
  
  /**
   * Get all transactions for a wallet address
   */
  public async getTransactionsByWallet(walletAddress: string): Promise<{ success: boolean; data?: TransactionRecord[]; error?: PaymentError }> {
    try {
      if (!this.checkSupabase()) {
        return { 
          success: false, 
          error: createPaymentError(
            ErrorCategory.UNKNOWN_ERROR,
            "Database client not available",
            null,
            false
          )
        };
      }
      
      const { data, error } = await this.supabase
        .from('transactions')
        .select('*')
        .eq('sender_wallet', walletAddress)
        .order('timestamp', { ascending: false });
      
      if (error) {
        console.error("Error getting transactions for wallet:", error);
        return { 
          success: false, 
          error: createPaymentError(
            ErrorCategory.UNKNOWN_ERROR,
            "Failed to get transactions for wallet",
            error,
            true
          )
        };
      }
      
      return { success: true, data };
    } catch (error) {
      console.error('Failed to get transactions for wallet:', error);
      return { 
        success: false, 
        error: createPaymentError(
          ErrorCategory.UNKNOWN_ERROR,
          "Failed to retrieve wallet transactions",
          error,
          true
        )
      };
    }
  }
  
  /**
   * Mark a payment as timed out if it's been pending for too long
   */
  public async markPaymentAsTimedOut(imageId: number): Promise<{ success: boolean; error?: PaymentError }> {
    try {
      if (!this.checkSupabase()) {
        return { 
          success: false, 
          error: createPaymentError(
            ErrorCategory.UNKNOWN_ERROR,
            "Database client not available",
            null,
            false
          )
        };
      }
      
      const now = new Date().toISOString();
      
      // Update image status
      const { error: imageError } = await this.supabase
        .from('images')
        .update({ 
          image_status: IMAGE_STATUS.PAYMENT_TIMEOUT,
          last_updated_at: now
        })
        .eq('image_id', imageId)
        .in('image_status', [IMAGE_STATUS.PENDING_PAYMENT, IMAGE_STATUS.PAYMENT_RETRY]);
      
      if (imageError) {
        console.error("Error marking image payment as timed out:", imageError);
        return { 
          success: false, 
          error: createPaymentError(
            ErrorCategory.UNKNOWN_ERROR,
            "Failed to update image status for timeout",
            imageError,
            true
          )
        };
      }
      
      // Add a transaction record for the timeout
      const { error: txError } = await this.supabase
        .from('transactions')
        .insert([{
          image_id: imageId,
          sender_wallet: 'unknown',
          recipient_wallet: 'unknown',
          transaction_hash: 'timeout',
          transaction_status: 'timeout',
          amount: 0,
          token: 'unknown',
          timestamp: now
        }]);
      
      if (txError) {
        console.error("Error creating timeout transaction record:", txError);
        // Don't fail the operation, as the image status was updated successfully
      }
      
      return { success: true };
    } catch (error) {
      console.error('Failed to mark payment as timed out:', error);
      return { 
        success: false, 
        error: createPaymentError(
          ErrorCategory.UNKNOWN_ERROR,
          "Failed to mark payment as timed out",
          error,
          true
        )
      };
    }
  }
}

export default PaymentStorageProvider;