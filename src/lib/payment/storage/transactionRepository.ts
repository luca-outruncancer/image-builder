// src/lib/payment/storage/transactionRepository.ts
import { supabase } from '@/lib/supabase';
import { PaymentStatus, PaymentError, TransactionRecord, PaymentSession} from '../types';
import { createPaymentError } from '../utils';
import { ErrorCategory } from '../types';
import { statusMapper } from './statusMapper';
import { validateDatabaseConnection, getCurrentTimestamp } from '../utils/storageUtils';

/**
 * TransactionRepository handles all database operations related to payment transactions
 */
export class TransactionRepository {
  /**
   * Initialize a transaction record for a new payment
   */
  public async initializeTransaction(
    paymentSession: PaymentSession
  ): Promise<{ success: boolean; transactionId?: number; error?: PaymentError }> {
    try {
      if (!validateDatabaseConnection(supabase)) {
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
      const { data, error } = await supabase
        .from('transactions')
        .insert([{
          image_id: imageId,
          sender_wallet: walletAddress,
          recipient_wallet: recipientWallet,
          transaction_hash: `pending_${paymentId}`,
          transaction_status: statusMapper.getTransactionStatus(PaymentStatus.INITIALIZED),
          amount: amount,
          token: token,
          timestamp: getCurrentTimestamp(),
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
      if (!validateDatabaseConnection(supabase)) {
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
        transaction_status: statusMapper.getTransactionStatus(status)
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
      const { error } = await supabase
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
   * Save a new transaction record
   */
  public async saveTransaction(
    record: TransactionRecord
  ): Promise<{ success: boolean; transactionId?: number; error?: PaymentError }> {
    try {
      if (!validateDatabaseConnection(supabase)) {
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
      const now = getCurrentTimestamp();
      
      // Get retry count (if this is a retry)
      let retryCount = 0;
      
      try {
        const { data: existingTx } = await supabase
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
      const { data, error } = await supabase
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
      if (!validateDatabaseConnection(supabase)) {
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
      
      const { data, error } = await supabase
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
      if (!validateDatabaseConnection(supabase)) {
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
      
      const { data, error } = await supabase
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
      if (!validateDatabaseConnection(supabase)) {
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
      
      const { data, error } = await supabase
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
      if (!validateDatabaseConnection(supabase)) {
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
      
      const now = getCurrentTimestamp();
      
      // Update the existing transaction record for this image
      const { error: txError } = await supabase
        .from('transactions')
        .update({
          transaction_status: 'timeout',
          last_verified_at: now
        })
        .eq('image_id', imageId)
        .in('transaction_status', ['initiated', 'pending', 'in_progress']);
      
      if (txError) {
        console.log("Note: Could not update transaction status for timeout:", txError);
        // We'll continue even if this fails
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

// Export a singleton instance
export const transactionRepository = new TransactionRepository();
