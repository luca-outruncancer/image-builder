// src/lib/payment/storage/imageRepository.ts
import { supabase } from '@/lib/supabase';
import { PaymentStatus, PaymentError } from '../types';
import { PaymentImageRecord } from '../types/storageTypes';
import { createPaymentError } from '../utils';
import { ErrorCategory } from '../types';
import { PAYMENT_TO_TRANSACTION_STATUS } from '../utils/storageUtils';
import { validateDatabaseConnection, getCurrentTimestamp } from '../utils/storageUtils';
import { storageLogger } from '@/utils/logger';

/**
 * ImageRepository handles all database operations related to image status updates for payments
 */
export class ImageRepository {
  /**
   * Update the status of an image
   */
  public async updateImageStatus(
    imageId: number,
    status: PaymentStatus
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
      
      const dbStatus = PAYMENT_TO_TRANSACTION_STATUS[status].toUpperCase();
      const updateData: {
        status: string;
        updated_at: string;
      } = {
        status: dbStatus,
        updated_at: getCurrentTimestamp()
      };
      
      storageLogger.debug('Updating image status', {
        imageId,
        newStatus: dbStatus,
        updateData
      });
      
      const { error } = await supabase
        .from('images')
        .update(updateData)
        .eq('image_id', imageId);
      
      if (error) {
        storageLogger.error("Error updating image status:", {
          error,
          imageId,
          status: dbStatus,
          errorCode: error.code,
          errorMessage: error.message
        });
        return { 
          success: false, 
          error: createPaymentError(
            ErrorCategory.UNKNOWN_ERROR,
            `Failed to update image status: ${error.message}`,
            error,
            true
          )
        };
      }
      
      storageLogger.debug('Successfully updated image status', {
        imageId,
        status: dbStatus
      });
      
      return { success: true };
    } catch (error) {
      storageLogger.error('Failed to update image status:', {
        error,
        imageId,
        status: PAYMENT_TO_TRANSACTION_STATUS[status]
      });
      return { 
        success: false, 
        error: createPaymentError(
          ErrorCategory.UNKNOWN_ERROR,
          "Failed to update image status",
          error,
          true
        )
      };
    }
  }
  
  /**
   * Get image details by ID
   */
  public async getImageById(imageId: number): Promise<{ success: boolean; data?: PaymentImageRecord; error?: PaymentError }> {
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
        .from('images')
        .select('*')
        .eq('image_id', imageId)
        .single();
      
      if (error) {
        console.error("Error getting image by ID:", error);
        return { 
          success: false, 
          error: createPaymentError(
            ErrorCategory.UNKNOWN_ERROR,
            "Failed to get image details",
            error,
            true
          )
        };
      }
      
      return { success: true, data };
    } catch (error) {
      console.error(`Failed to get image with ID ${imageId}:`, error);
      return { 
        success: false, 
        error: createPaymentError(
          ErrorCategory.UNKNOWN_ERROR,
          "Failed to retrieve image details",
          error,
          true
        )
      };
    }
  }
  
  /**
   * Get images by wallet address
   */
  public async getImagesByWallet(walletAddress: string): Promise<{ success: boolean; data?: PaymentImageRecord[]; error?: PaymentError }> {
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
        .from('images')
        .select('*')
        .eq('sender_wallet', walletAddress)
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error("Error getting images by wallet:", error);
        return { 
          success: false, 
          error: createPaymentError(
            ErrorCategory.UNKNOWN_ERROR,
            "Failed to get images for wallet",
            error,
            true
          )
        };
      }
      
      return { success: true, data };
    } catch (error) {
      console.error(`Failed to get images for wallet ${walletAddress}:`, error);
      return { 
        success: false, 
        error: createPaymentError(
          ErrorCategory.UNKNOWN_ERROR,
          "Failed to retrieve wallet images",
          error,
          true
        )
      };
    }
  }
  
  /**
   * Mark a payment as timed out
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
      
      // Update image status to timed out
      const { error } = await supabase
        .from('images')
        .update({ 
          status: PAYMENT_TO_TRANSACTION_STATUS[PaymentStatus.TIMEOUT],
          updated_at: getCurrentTimestamp()
        })
        .eq('image_id', imageId)
        .in('status', [
          PAYMENT_TO_TRANSACTION_STATUS[PaymentStatus.PENDING],
          PAYMENT_TO_TRANSACTION_STATUS[PaymentStatus.PROCESSING],
          PAYMENT_TO_TRANSACTION_STATUS[PaymentStatus.INITIALIZED]
        ]);
      
      if (error) {
        console.error("Error marking image payment as timed out:", error);
        return { 
          success: false, 
          error: createPaymentError(
            ErrorCategory.UNKNOWN_ERROR,
            "Failed to update image status for timeout",
            error,
            true
          )
        };
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
  
  /**
   * Check if a position on the canvas is available
   */
  public async isPositionAvailable(
    x: number, 
    y: number, 
    width: number, 
    height: number, 
    excludeImageId?: number
  ): Promise<{ available: boolean; error?: PaymentError }> {
    try {
      if (!validateDatabaseConnection(supabase)) {
        return { 
          available: false,
          error: createPaymentError(
            ErrorCategory.UNKNOWN_ERROR,
            "Database client not available",
            null,
            false
          )
        };
      }
      
      let query = supabase
        .from('images')
        .select('*')
        .or(`start_position_x.lt.${x + width},start_position_x.gt.${x - width}`)
        .or(`start_position_y.lt.${y + height},start_position_y.gt.${y - height}`);
      
      // Exclude current image if provided
      if (excludeImageId) {
        query = query.neq('image_id', excludeImageId);
      }
      
      const { data, error } = await query;
      
      if (error) {
        console.error("Error checking position availability:", error);
        return { 
          available: false,
          error: createPaymentError(
            ErrorCategory.UNKNOWN_ERROR,
            "Failed to check if position is available",
            error,
            true
          )
        };
      }
      
      if (!data || data.length === 0) {
        return { available: true };
      }
      
      // Check for actual overlap
      for (const image of data) {
        const imageRight = image.start_position_x + image.size_x;
        const imageBottom = image.start_position_y + image.size_y;
        const newRight = x + width;
        const newBottom = y + height;
        
        // Check if there's overlap
        if (!(x >= imageRight || newRight <= image.start_position_x || 
            y >= imageBottom || newBottom <= image.start_position_y)) {
          return { available: false };
        }
      }
      
      return { available: true };
    } catch (error) {
      console.error('Failed to check position availability:', error);
      return { 
        available: false,
        error: createPaymentError(
          ErrorCategory.UNKNOWN_ERROR,
          "Failed to check position availability",
          error,
          true
        )
      };
    }
  }
}

// Export a singleton instance
export const imageRepository = new ImageRepository();
