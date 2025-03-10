// src/lib/payment/storage/imageRepository.ts
import { supabase } from '@/lib/supabase';
import { PaymentStatus, PaymentError, PaymentImageRecord } from '../types';
import { createPaymentError } from '../utils';
import { ErrorCategory } from '../types';
import { statusMapper } from './statusMapper';
import { validateDatabaseConnection, getCurrentTimestamp } from '../utils/storageUtils';

/**
 * ImageRepository handles all database operations related to image status updates for payments
 */
export class ImageRepository {
  /**
   * Update the status of an image
   */
  public async updateImageStatus(
    imageId: number,
    status: PaymentStatus,
    confirmed: boolean = false
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
        image_status: statusMapper.getImageStatus(status),
        last_updated_at: getCurrentTimestamp()
      };
      
      // For confirmed payments, add confirmation timestamp
      if (confirmed || status === PaymentStatus.CONFIRMED) {
        updateData.confirmed_at = getCurrentTimestamp();
      }
      
      // Increment payment attempts counter if retrying
      if (status === PaymentStatus.PROCESSING) {
        // Get current image data first
        const { data: currentImage, error: fetchError } = await supabase
          .from('images')
          .select('payment_attempts')
          .eq('image_id', imageId)
          .single();
        
        if (fetchError) {
          console.error("Error fetching current image data:", fetchError);
          // Continue with update without incrementing
        } else {
          // Increment attempts counter
          const currentAttempts = currentImage?.payment_attempts || 0;
          updateData.payment_attempts = currentAttempts + 1;
        }
      }
      
      // If failed or timed out, record the final status
      if (status === PaymentStatus.FAILED || status === PaymentStatus.TIMEOUT) {
        updateData.payment_final_status = statusMapper.getImageStatus(status);
      }
      
      // Update the image record
      const { error } = await supabase
        .from('images')
        .update(updateData)
        .eq('image_id', imageId);
      
      if (error) {
        console.error("Error updating image status:", error);
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
      
      return { success: true };
    } catch (error) {
      console.error('Failed to update image status:', error);
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
        .eq('user_wallet', walletAddress)
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
          image_status: statusMapper.getImageStatus(PaymentStatus.TIMEOUT),
          last_updated_at: getCurrentTimestamp()
        })
        .eq('image_id', imageId)
        .in('image_status', [
          statusMapper.getImageStatus(PaymentStatus.PENDING),
          statusMapper.getImageStatus(PaymentStatus.PROCESSING),
          statusMapper.getImageStatus(PaymentStatus.INITIALIZED)
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
