// src/lib/server/imageStorage.ts

import { PaymentStatus } from '@/lib/payment/types/index';
import { imageLogger, storageLogger } from '@/utils/logger/index';
import { supabase, getSupabaseClient } from '@/lib/server/supabase';

export interface ImageRecord {
  image_id: number;
  image_location: string;
  start_position_x: number;
  start_position_y: number;
  size_x: number;
  size_y: number;
  status: string; // payment_status enum
  created_at: string;
  updated_at?: string;
  payment_attempts: number;
  sender_wallet: string;
}

/**
 * Create a new image record in the database
 */
export async function createImageRecord(params: {
  image_location: string;
  start_position_x: number;
  start_position_y: number;
  size_x: number;
  size_y: number;
  status: string;
  sender_wallet: string;
}): Promise<{ success: boolean; data?: ImageRecord; error?: any }> {
  const client = getSupabaseClient();
  if (!client) {
    storageLogger.info('Skipping database operation: Supabase client not available');
    return { success: false, error: 'Database client not available' };
  }
  
  try {
    const { data, error } = await client
      .from('images')
      .insert({
        image_location: params.image_location,
        start_position_x: params.start_position_x,
        start_position_y: params.start_position_y,
        size_x: params.size_x,
        size_y: params.size_y,
        status: params.status,
        sender_wallet: params.sender_wallet,
        created_at: new Date().toISOString()
      })
      .select()
      .single();
    
    if (error) {
      storageLogger.error('Error creating image record', error instanceof Error ? error : new Error(String(error)), {
        location: params.image_location,
        status: params.status
      });
      return { success: false, error };
    }
    
    return { success: true, data };
  } catch (error) {
    storageLogger.error('Failed to create image record', error instanceof Error ? error : new Error(String(error)), {
      location: params.image_location,
      status: params.status
    });
    return { success: false, error };
  }
}

/**
 * Update the status of an image
 */
export async function updateImageStatus(
  imageId: number,
  status: PaymentStatus
): Promise<{ success: boolean; error?: any }> {
  const client = getSupabaseClient();
  if (!client) {
    storageLogger.info('Skipping database operation: Supabase client not available');
    return { success: false, error: 'Database client not available' };
  }
  
  try {
    storageLogger.debug('Updating image status', {
      imageId,
      newStatus: status
    });

    const { error } = await client
      .from('images')
      .update({
        status: status.toUpperCase(),
        updated_at: new Date().toISOString()
      })
      .eq('image_id', imageId);
    
    if (error) {
      storageLogger.error('Error updating image status', error instanceof Error ? error : new Error(String(error)), {
        imageId,
        status
      });
      return { success: false, error };
    }
    
    storageLogger.debug('Successfully updated image status', {
      imageId,
      status
    });
    
    return { success: true };
  } catch (error) {
    storageLogger.error('Failed to update image status', error instanceof Error ? error : new Error(String(error)), {
      imageId,
      status
    });
    return { success: false, error };
  }
}

/**
 * Get all placed images
 */
export async function getPlacedImages(): Promise<{ success: boolean; data?: any[]; error?: any }> {
  const client = getSupabaseClient();
  if (!client) {
    storageLogger.error('Skipping database operation: Supabase client not available');
    return { success: false, error: 'Database client not available' };
  }
  
  try {
    storageLogger.info('Fetching placed images with CONFIRMED status');
    
    // First try with the enum value
    const { data, error } = await client
      .from('images')
      .select('*')
      .eq('status', PaymentStatus.CONFIRMED);
    
    if (error) {
      storageLogger.error('Error fetching image records with enum value', error instanceof Error ? error : new Error(String(error)));
      
      // Try with uppercase string as fallback
      storageLogger.info('Retrying with uppercase string "CONFIRMED"');
      const fallbackResult = await client
        .from('images')
        .select('*')
        .eq('status', 'CONFIRMED');
      
      if (fallbackResult.error) {
        storageLogger.error('Error fetching image records with uppercase string', 
          fallbackResult.error instanceof Error ? fallbackResult.error : new Error(String(fallbackResult.error)));
        return { success: false, error: fallbackResult.error };
      }
      
      if (fallbackResult.data && fallbackResult.data.length > 0) {
        storageLogger.info(`Successfully fetched ${fallbackResult.data.length} images with uppercase string`);
        return { success: true, data: fallbackResult.data };
      } else {
        storageLogger.warn('No confirmed images found with uppercase string');
        
        // Last attempt - try to get all images to see what statuses exist
        const allImagesResult = await client
          .from('images')
          .select('status')
          .then(result => {
            if (!result.error && result.data) {
              // Count occurrences of each status
              const statusCounts: Record<string, number> = {};
              result.data.forEach(row => {
                const status = row.status;
                statusCounts[status] = (statusCounts[status] || 0) + 1;
              });
              
              storageLogger.info('Available image statuses:', { statuses: statusCounts });
            }
            return result;
          });
        
        return { success: true, data: [] };
      }
    }
    
    if (data && data.length > 0) {
      storageLogger.info(`Successfully fetched ${data.length} images with enum value`);
      return { success: true, data };
    } else {
      storageLogger.warn('No confirmed images found with enum value');
      return { success: true, data: [] };
    }
  } catch (error) {
    storageLogger.error('Failed to get image records', error instanceof Error ? error : new Error(String(error)));
    return { success: false, error };
  }
}

/**
 * Get an image by ID
 */
export async function getImageById(imageId: number): Promise<{ success: boolean; data?: any; error?: any }> {
  const client = getSupabaseClient();
  if (!client) {
    storageLogger.info('Skipping database operation: Supabase client not available');
    return { success: false, error: 'Database client not available' };
  }
  
  try {
    const { data, error } = await client
      .from('images')
      .select('*')
      .eq('image_id', imageId)
      .single();
    
    if (error) {
      storageLogger.error('Error fetching image record by ID', error instanceof Error ? error : new Error(String(error)), {
        imageId
      });
      return { success: false, error };
    }
    
    return { success: true, data };
  } catch (error) {
    storageLogger.error('Failed to get image record', error instanceof Error ? error : new Error(String(error)), {
      imageId
    });
    return { success: false, error };
  }
}

/**
 * Check if an area is available for placing an image
 */
export async function checkAreaAvailability(
  x: number,
  y: number,
  width: number,
  height: number,
  excludeImageId?: number
): Promise<{ success: boolean; available?: boolean; error?: any }> {
  const client = getSupabaseClient();
  if (!client) {
    storageLogger.info('Skipping database operation: Supabase client not available');
    return { success: false, error: 'Database client not available' };
  }
  
  try {
    // Query for any confirmed images that overlap with the target area
    let query = client
      .from('images')
      .select('*')
      .eq('status', PaymentStatus.CONFIRMED)
      .or(`start_position_x.lte.${x + width},end_position_x.gte.${x}`)
      .or(`start_position_y.lte.${y + height},end_position_y.gte.${y}`);
    
    // Exclude the current image if needed
    if (excludeImageId) {
      query = query.neq('image_id', excludeImageId);
    }
    
    const { data, error } = await query;
    
    if (error) {
      storageLogger.error('Error checking area availability', error instanceof Error ? error : new Error(String(error)), {
        x, y, width, height, excludeImageId
      });
      return { success: false, error };
    }
    
    // If we found any images that overlap, the area is not available
    const available = !data || data.length === 0;
    
    return { success: true, available };
  } catch (error) {
    storageLogger.error('Failed to check area availability', error instanceof Error ? error : new Error(String(error)), {
      x, y, width, height, excludeImageId
    });
    return { success: false, error };
  }
}

/**
 * Clean up expired pending payments
 */
export async function cleanupExpiredPendingPayments(
  timeoutMinutes: number = 3
): Promise<{ success: boolean; error?: any }> {
  const client = getSupabaseClient();
  if (!client) {
    storageLogger.info('Skipping database operation: Supabase client not available');
    return { success: false, error: 'Database client not available' };
  }
  
  try {
    // Calculate timeout timestamp
    const timeoutThreshold = new Date();
    timeoutThreshold.setMinutes(timeoutThreshold.getMinutes() - timeoutMinutes);
    
    // Update status of expired pending payments
    const { data, error } = await client
      .from('images')
      .update({ status: PaymentStatus.TIMEOUT })
      .eq('status', PaymentStatus.PENDING)
      .lt('created_at', timeoutThreshold.toISOString());
    
    if (error) {
      storageLogger.error('Error cleaning up expired payments', error instanceof Error ? error : new Error(String(error)));
      return { success: false, error };
    }
    
    return { success: true };
  } catch (error) {
    storageLogger.error('Failed to clean up expired payments', error instanceof Error ? error : new Error(String(error)));
    return { success: false, error };
  }
}

// Additional functions can be added here as needed, for example for image uploads
export async function uploadImage(/* ... parameters as needed ... */) {
  // Implementation for uploading an image to storage and creating a record
} 