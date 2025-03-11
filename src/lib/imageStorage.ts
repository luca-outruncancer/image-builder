// src/lib/imageStorage.ts

import { createClient } from '@supabase/supabase-js';
import { PaymentStatus } from './payment/types';
import { imageLogger, storageLogger } from '@/utils/logger';

// Use environment variables for Supabase connection
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Initialize Supabase client
let supabase: any = null;

// Initialize only if environment variables are available
if (supabaseUrl && supabaseKey) {
  try {
    supabase = createClient(supabaseUrl, supabaseKey);
    storageLogger.info('Supabase client initialized in imageStorage');
  } catch (error) {
    storageLogger.error('Error initializing Supabase client in imageStorage:', error);
  }
} else {
  storageLogger.error('Unable to initialize Supabase client due to missing environment variables in imageStorage');
}

// Image status constants
export const IMAGE_STATUS = {
  CONFIRMED: 1,       // Payment successful
  PENDING_PAYMENT: 2, // Awaiting payment
  PAYMENT_FAILED: 3,  // Payment attempt failed
  PAYMENT_TIMEOUT: 4, // Payment timed out
  NOT_INITIATED: 5,   // Payment not initiated or abandoned
  PAYMENT_RETRY: 6    // Payment being retried
};

export interface ImageRecord {
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

/**
 * Create a new image record in the database
 */
export async function createImageRecord(
  imageId: number,
  x: number,
  y: number,
  width: number,
  height: number,
  walletAddress: string,
  cost: number,
  status: PaymentStatus = PaymentStatus.PENDING
): Promise<{ success: boolean; error?: any }> {
  if (!supabase) {
    storageLogger.info('Skipping database operation: Supabase client not available');
    return { success: false, error: 'Database client not available' };
  }
  
  try {
    const { error } = await supabase
      .from('images')
      .insert({
        image_id: imageId,
        x,
        y,
        width,
        height,
        wallet_address: walletAddress,
        cost,
        status: status.toUpperCase()
      });
    
    if (error) {
      storageLogger.error('Error creating image record:', error);
      return { success: false, error };
    }
    
    return { success: true };
  } catch (error) {
    storageLogger.error('Failed to create image record:', error);
    return { success: false, error };
  }
}

/**
 * Update the status of an image
 */
export async function updateImageStatus(
  imageId: number,
  status: PaymentStatus,
  confirmed: boolean = false
): Promise<{ success: boolean; error?: any }> {
  if (!supabase) {
    storageLogger.info('Skipping database operation: Supabase client not available');
    return { success: false, error: 'Database client not available' };
  }
  
  try {
    // First get the current image data
    const { data: currentData, error: fetchError } = await supabase
      .from('images')
      .select('status')
      .eq('image_id', imageId)
      .single();
    
    if (fetchError) {
      storageLogger.error('Error fetching current image data:', fetchError);
      return { success: false, error: fetchError };
    }
    
    // Only update if status is different or confirmation is being set
    if (currentData.status !== status || confirmed) {
      const { error } = await supabase
        .from('images')
        .update({
          status,
          confirmed,
          updated_at: new Date().toISOString()
        })
        .eq('image_id', imageId);
      
      if (error) {
        storageLogger.error('Error updating image status:', error);
        return { success: false, error };
      }
    }
    
    return { success: true };
  } catch (error) {
    storageLogger.error('Failed to update image status:', error);
    return { success: false, error };
  }
}

/**
 * Get all placed images
 */
export async function getPlacedImages(): Promise<{ success: boolean; data?: any[]; error?: any }> {
  if (!supabase) {
    storageLogger.info('Skipping database operation: Supabase client not available');
    return { success: false, error: 'Database client not available' };
  }
  
  try {
    const { data, error } = await supabase
      .from('images')
      .select('*')
      .eq('status', PaymentStatus.CONFIRMED.toUpperCase())
      .eq('confirmed', true);
    
    if (error) {
      storageLogger.error('Error fetching image records:', error);
      return { success: false, error };
    }
    
    return { success: true, data };
  } catch (error) {
    storageLogger.error('Failed to get image records:', error);
    return { success: false, error };
  }
}

/**
 * Get an image by ID
 */
export async function getImageById(imageId: number): Promise<{ success: boolean; data?: any; error?: any }> {
  if (!supabase) {
    storageLogger.info('Skipping database operation: Supabase client not available');
    return { success: false, error: 'Database client not available' };
  }
  
  try {
    const { data, error } = await supabase
      .from('images')
      .select('*')
      .eq('image_id', imageId)
      .single();
    
    if (error) {
      storageLogger.error('Error fetching image record by ID:', error);
      return { success: false, error };
    }
    
    return { success: true, data };
  } catch (error) {
    storageLogger.error(`Failed to get image with ID ${imageId}:`, error);
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
  if (!supabase) {
    storageLogger.info('Skipping database operation: Supabase client not available');
    return { success: false, error: 'Database client not available' };
  }
  
  try {
    // Query for any confirmed images that overlap with the target area
    let query = supabase
      .from('images')
      .select('*')
      .eq('status', PaymentStatus.CONFIRMED.toUpperCase())
      .eq('confirmed', true)
      .or(`and(x.gte.${x},x.lt.${x + width}),and(x.lte.${x},x.plus.width.gt.${x})`)
      .or(`and(y.gte.${y},y.lt.${y + height}),and(y.lte.${y},y.plus.height.gt.${y})`);
    
    // Exclude the current image if updating
    if (excludeImageId) {
      query = query.neq('image_id', excludeImageId);
    }
    
    const { data, error } = await query;
    
    if (error) {
      storageLogger.error('Error checking area availability:', error);
      return { success: false, error };
    }
    
    // Area is available if no overlapping images were found
    return { success: true, available: data.length === 0 };
  } catch (error) {
    storageLogger.error('Failed to check area availability:', error);
    return { success: false, error };
  }
}

/**
 * Clean up expired pending payments
 */
export async function cleanupExpiredPendingPayments(
  timeoutMinutes: number = 3
): Promise<{ success: boolean; error?: any }> {
  if (!supabase) {
    storageLogger.info('Skipping database operation: Supabase client not available');
    return { success: false, error: 'Database client not available' };
  }
  
  try {
    const { error } = await supabase
      .from('images')
      .update({
        status: PaymentStatus.TIMEOUT.toUpperCase(),
        updated_at: new Date().toISOString()
      })
      .eq('status', PaymentStatus.PENDING.toUpperCase())
      .lt('created_at', new Date(Date.now() - timeoutMinutes * 60000).toISOString());
    
    if (error) {
      storageLogger.error('Error cleaning up expired payments:', error);
      return { success: false, error };
    }
    
    return { success: true };
  } catch (error) {
    storageLogger.error('Failed to cleanup expired payments:', error);
    return { success: false, error };
  }
}
