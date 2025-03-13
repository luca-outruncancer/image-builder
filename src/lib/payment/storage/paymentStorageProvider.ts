// src/lib/payment/storage/paymentStorageProvider.ts
'use client';

import { PaymentSession, PaymentStatus, PaymentError, TransactionRecord } from '../types';
import { createPaymentError } from '../utils';
import { ErrorCategory } from '../types';
import { transactionRepository } from './transactionRepository';
import { imageRepository } from './imageRepository';
import { statusMapper } from './statusMapper';
import { storageLogger } from '@/utils/logger';

/**
 * PaymentStorageProvider handles database operations for payments
 * This is a facade that coordinates between repositories
 */
export class PaymentStorageProvider {
  /**
   * Initialize a transaction record for a new payment
   */
  public async initializeTransaction(
    paymentSession: PaymentSession
  ): Promise<{ success: boolean; transactionId?: number; error?: PaymentError }> {
    try {
      storageLogger.info('Initializing transaction', {
        paymentId: paymentSession.paymentId,
        imageId: paymentSession.imageId
      });
      
      // First, create the transaction record
      const result = await transactionRepository.initializeTransaction(paymentSession);
      
      if (!result.success || !result.transactionId) {
        return result;
      }
      
      // Then update the image status
      const { imageId } = paymentSession;
      const imageResult = await imageRepository.updateImageStatus(
        imageId,
        PaymentStatus.INITIALIZED
      );
      
      if (!imageResult.success) {
        storageLogger.warn('Transaction initialized but failed to update image status', {
          imageId,
          error: imageResult.error instanceof Error ? imageResult.error : new Error(String(imageResult.error))
        });
        return {
          success: true,
          transactionId: result.transactionId,
          error: imageResult.error
        };
      }
      
      return {
        success: true,
        transactionId: result.transactionId
      };
    } catch (error) {
      storageLogger.error('Failed to initialize transaction', error instanceof Error ? error : new Error(String(error)), {
        paymentId: paymentSession.paymentId,
        imageId: paymentSession.imageId
      });
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
      storageLogger.info('Updating transaction status', {
        transactionId,
        status
      });
      
      // First update the transaction
      const txResult = await transactionRepository.updateTransactionStatus(
        transactionId,
        status,
        transactionHash,
        blockchainConfirmation
      );
      
      if (!txResult.success) {
        return txResult;
      }
      
      // If this is a final status, also update the image status
      if (statusMapper.isFinalStatus(status)) {
        // Get the image ID for this transaction
        const { success, data: txData, error: txError } = await transactionRepository.getTransaction(transactionId);
        
        if (!success || !txData) {
          storageLogger.error('Error getting image ID for transaction', txError instanceof Error ? txError : new Error(String(txError)), {
            transactionId
          });
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
        
        // Update the image status
        const imageResult = await imageRepository.updateImageStatus(
          imageId,
          status
        );
        
        if (!imageResult.success) {
          return {
            success: true,
            error: createPaymentError(
              ErrorCategory.UNKNOWN_ERROR,
              "Transaction status updated but image status could not be updated",
              imageResult.error,
              false
            )
          };
        }
      }
      
      return { success: true };
    } catch (error) {
      storageLogger.error('Failed to update transaction status', error instanceof Error ? error : new Error(String(error)), {
        transactionId,
        status
      });
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
  }
  
  /**
   * Save a new transaction record and update image status
   */
  public async saveTransaction(
    record: TransactionRecord
  ): Promise<{ success: boolean; transactionId?: number; error?: PaymentError }> {
    try {
      storageLogger.info('Saving new transaction', {
        imageId: record.image_id,
        transactionHash: record.transaction_hash
      });
      
      // Insert the transaction
      const txResult = await transactionRepository.saveTransaction(record);
      
      if (!txResult.success || !txResult.transactionId) {
        return txResult;
      }
      
      // Map transaction status to image status
      let status: PaymentStatus;
      
      switch (record.transaction_status) {
        case 'SUCCESS':
          status = PaymentStatus.CONFIRMED;
          break;
        case 'FAILED':
          status = PaymentStatus.FAILED;
          break;
        case 'TIMEOUT':
          status = PaymentStatus.TIMEOUT;
          break;
        case 'PENDING':
          status = PaymentStatus.PENDING;
          break;
        default:
          status = PaymentStatus.PENDING;
      }
      
      // Update the image status
      const imageResult = await imageRepository.updateImageStatus(
        record.image_id,
        status
      );
      
      if (!imageResult.success) {
        return {
          success: true,
          transactionId: txResult.transactionId,
          error: createPaymentError(
            ErrorCategory.UNKNOWN_ERROR,
            "Transaction saved but image status could not be updated",
            imageResult.error,
            false
          )
        };
      }
      
      return {
        success: true,
        transactionId: txResult.transactionId
      };
    } catch (error) {
      storageLogger.error('Failed to save transaction', error instanceof Error ? error : new Error(String(error)), {
        imageId: record.image_id,
        transactionHash: record.transaction_hash
      });
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
    return transactionRepository.getTransaction(transactionId);
  }
  
  /**
   * Get a transaction by image ID
   */
  public async getTransactionByImageId(imageId: number): Promise<{ success: boolean; data?: TransactionRecord; error?: PaymentError }> {
    return transactionRepository.getTransactionByImageId(imageId);
  }
  
  /**
   * Get all transactions for a wallet address
   */
  public async getTransactionsByWallet(walletAddress: string): Promise<{ success: boolean; data?: TransactionRecord[]; error?: PaymentError }> {
    return transactionRepository.getTransactionsByWallet(walletAddress);
  }
  
  /**
   * Mark a payment as timed out if it's been pending for too long
   */
  public async markPaymentAsTimedOut(imageId: number): Promise<{ success: boolean; error?: PaymentError }> {
    try {
      storageLogger.info('Marking payment as timed out', {
        imageId
      });
      
      // First update the image status
      const imageResult = await imageRepository.markPaymentAsTimedOut(imageId);
      
      if (!imageResult.success) {
        return imageResult;
      }
      
      // Then update any transaction records
      const txResult = await transactionRepository.markPaymentAsTimedOut(imageId);
      
      // Even if transaction update fails, consider it a success since image was updated
      if (!txResult.success) {
        return {
          success: true,
          error: createPaymentError(
            ErrorCategory.UNKNOWN_ERROR,
            "Image status updated but transaction status could not be updated",
            txResult.error,
            false
          )
        };
      }
      
      return { success: true };
    } catch (error) {
      storageLogger.error('Failed to mark payment as timed out', error instanceof Error ? error : new Error(String(error)), {
        imageId
      });
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

// Export default instance
export default PaymentStorageProvider;
