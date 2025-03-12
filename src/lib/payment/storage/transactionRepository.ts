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
   * Initialize a new transaction record
   */
  public async initializeTransaction(
    paymentSession: PaymentSession
  ): Promise<{ success: boolean; transactionId?: number; error?: PaymentError }> {
    const { imageId, amount, token, paymentId, walletAddress, recipientWallet } = paymentSession;
    
    if (!supabase) {
      console.error("Database client not available");
      return { 
        success: false, 
        error: createPaymentError(
          ErrorCategory.UNKNOWN_ERROR,
          "Database client not available",
          null,
          true
        )
      };
    }
    
    try {
      const { data, error } = await supabase
        .from('transaction_records')
        .insert([{
          image_id: imageId,
          amount: amount,
          status: PaymentStatus.INITIALIZED.toUpperCase(),
          signature: `pending_${paymentId}`,
          created_at: new Date().toISOString(),
          attempt_count: 0,
          recipient_wallet: recipientWallet,
          transaction_hash: `pending_${paymentId}`,
          sender_wallet: walletAddress,
          token: token
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
        transactionId: data[0].tx_id 
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
        status: status.toUpperCase()
      };
      
      // Add transaction hash if provided
      if (transactionHash) {
        updateData.transaction_hash = transactionHash;
        updateData.signature = transactionHash;
      }
      
      // Add blockchain confirmation if provided
      if (blockchainConfirmation !== undefined) {
        updateData.confirmed_at = blockchainConfirmation ? new Date().toISOString() : null;
      }
      
      // Update the transaction
      const { error } = await supabase
        .from('transaction_records')
        .update(updateData)
        .eq('tx_id', transactionId);
      
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
          .from('transaction_records')
          .select('attempt_count')
          .eq('image_id', record.image_id)
          .eq('status', PaymentStatus.FAILED)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        
        if (existingTx?.attempt_count !== undefined) {
          retryCount = existingTx.attempt_count + 1;
        }
      } catch (countError) {
        // It's okay if there's no previous transaction
        console.log("No previous transaction found, this is the first attempt");
      }
      
      // Insert the transaction record
      const { data, error } = await supabase
        .from('transaction_records')
        .insert([{
          image_id: record.image_id,
          sender_wallet: record.sender_wallet,
          recipient_wallet: record.recipient_wallet,
          transaction_hash: record.transaction_hash,
          status: record.status,
          amount: record.amount,
          token: record.token,
          created_at: now,
          attempt_count: retryCount,
          signature: record.signature
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
        transactionId: data[0].tx_id 
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
        .from('transaction_records')
        .select('*')
        .eq('tx_id', transactionId)
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
        .from('transaction_records')
        .select('*')
        .eq('image_id', imageId)
        .order('created_at', { ascending: false })
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
        .from('transaction_records')
        .select('*')
        .eq('sender_wallet', walletAddress)
        .order('created_at', { ascending: false });
      
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
        .from('transaction_records')
        .update({
          status: PaymentStatus.TIMEOUT,
          confirmed_at: now
        })
        .eq('image_id', imageId)
        .in('status', [PaymentStatus.INITIALIZED, PaymentStatus.PENDING, PaymentStatus.PROCESSING]);
      
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
