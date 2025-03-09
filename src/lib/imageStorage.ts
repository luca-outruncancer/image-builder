// src/lib/imageStorage.ts

import { createClient } from '@supabase/supabase-js';
import { storageLogger } from '@/utils/logger';

// Use environment variables for Supabase connection
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let supabase: any = null;

try {
  if (supabaseUrl && supabaseKey) {
    supabase = createClient(supabaseUrl, supabaseKey);
    storageLogger.info("Supabase client initialized in imageStorage");
  } else {
    storageLogger.error("Unable to initialize Supabase client due to missing environment variables in imageStorage");
  }
} catch (error) {
  storageLogger.error("Error initializing Supabase client in imageStorage", { error });
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
export async function createImageRecord(imageData: Partial<ImageRecord>) {
  try {
    if (!supabase) {
      storageLogger.warn("Skipping database operation: Supabase client not available");
      return { 
        success: false, 
        error: "Supabase client not available. Check your environment variables." 
      };
    }
    
    const now = new Date().toISOString();
    
    storageLogger.info("Creating new image record", {
      position: `${imageData.start_position_x},${imageData.start_position_y}`,
      size: `${imageData.size_x}x${imageData.size_y}`,
      status: imageData.image_status
    });
    
    const { data, error } = await supabase
      .from('images')
      .insert({
        image_location: imageData.image_location,
        start_position_x: imageData.start_position_x,
        start_position_y: imageData.start_position_y,
        size_x: imageData.size_x,
        size_y: imageData.size_y,
        image_status: imageData.image_status || IMAGE_STATUS.PENDING_PAYMENT,
        created_at: now,
        last_updated_at: now,
        sender_wallet: imageData.sender_wallet, // Store the wallet address
        payment_attempts: 0 // Initialize payment attempts counter
      })
      .select()
      .single();
    
    if (error) {
      storageLogger.error("Error creating image record", { error });
      throw error;
    }
    
    storageLogger.info("Image record created successfully", { imageId: data.image_id });
    return { success: true, data };
  } catch (error) {
    storageLogger.error("Failed to create image record", { 
      error,
      imageData: {
        location: imageData.image_location,
        position: `${imageData.start_position_x},${imageData.start_position_y}`,
        size: `${imageData.size_x}x${imageData.size_y}`
      }
    });
    return { success: false, error };
  }
}

/**
 * Update the status of an existing image
 */
export async function updateImageStatus(imageId: number, status: number, confirmed: boolean = false) {
  try {
    if (!supabase) {
      storageLogger.warn("Skipping database operation: Supabase client not available");
      return { 
        success: false, 
        error: "Supabase client not available. Check your environment variables." 
      };
    }
    
    storageLogger.info("Updating image status", {
      imageId,
      newStatus: status,
      confirmed
    });
    
    const updateData: any = {
      image_status: status,
      last_updated_at: new Date().toISOString()
    };
    
    // If confirmed, update the confirmed_at timestamp
    if (confirmed) {
      updateData.confirmed_at = new Date().toISOString();
    }
    
    // Increment payment attempts counter if retrying
    if (status === IMAGE_STATUS.PAYMENT_RETRY) {
      // Get current image data first
      const { data: currentImage, error: fetchError } = await supabase
        .from('images')
        .select('payment_attempts')
        .eq('image_id', imageId)
        .single();
      
      if (fetchError) {
        storageLogger.error("Error fetching current image data", { imageId, error: fetchError });
        // Continue with update without incrementing
      } else {
        const currentAttempts = currentImage?.payment_attempts || 0;
        updateData.payment_attempts = currentAttempts + 1;
        storageLogger.debug("Incrementing payment attempts", { 
          imageId, 
          previousAttempts: currentAttempts,
          newAttempts: currentAttempts + 1
        });
      }
    }
    
    // If failed or timed out, record the final attempt count
    if (status === IMAGE_STATUS.PAYMENT_FAILED || status === IMAGE_STATUS.PAYMENT_TIMEOUT) {
      updateData.payment_final_status = status;
    }
    
    const { data, error } = await supabase
      .from('images')
      .update(updateData)
      .eq('image_id', imageId)
      .select()
      .single();
    
    if (error) {
      storageLogger.error("Error updating image status", { imageId, error });
      throw error;
    }
    
    storageLogger.info("Image status updated successfully", { 
      imageId, 
      status,
      confirmed: !!confirmed
    });
    
    return { success: true, data };
  } catch (error) {
    storageLogger.error("Failed to update image status", { 
      imageId, 
      status,
      error
    });
    return { success: false, error };
  }
}

/**
 * Get all image records that should be displayed on the canvas
 * (status 1 = confirmed, status 2 = pending payment, status 6 = payment retry)
 */
export async function getImageRecords(): Promise<ImageRecord[]> {
  try {
    if (!supabase) {
      storageLogger.warn("Skipping database operation: Supabase client not available");
      return [];
    }
    
    storageLogger.info("Fetching all active image records");
    
    const { data, error } = await supabase
      .from('images')
      .select('*')
      .in('image_status', [
        IMAGE_STATUS.CONFIRMED, 
        IMAGE_STATUS.PENDING_PAYMENT,
        IMAGE_STATUS.PAYMENT_RETRY
      ])
      .order('created_at', { ascending: false });
    
    if (error) {
      storageLogger.error("Error fetching image records", { error });
      throw error;
    }
    
    storageLogger.info("Retrieved image records", { count: data?.length || 0 });
    return data || [];
  } catch (error) {
    storageLogger.error("Failed to get image records", { error });
    return [];
  }
}

/**
 * Get a specific image record by ID
 */
export async function getImageById(imageId: number): Promise<ImageRecord | null> {
  try {
    if (!supabase) {
      storageLogger.warn("Skipping database operation: Supabase client not available");
      return null;
    }
    
    storageLogger.debug("Fetching image by ID", { imageId });
    
    const { data, error } = await supabase
      .from('images')
      .select('*')
      .eq('image_id', imageId)
      .single();
    
    if (error) {
      storageLogger.error("Error fetching image record by ID", { imageId, error });
      throw error;
    }
    
    storageLogger.debug("Retrieved image record", { 
      imageId, 
      status: data?.image_status
    });
    
    return data || null;
  } catch (error) {
    storageLogger.error(`Failed to get image with ID ${imageId}`, { error });
    return null;
  }
}

/**
 * Check if a specific area on the canvas is available
 */
export async function isAreaAvailable(x: number, y: number, width: number, height: number): Promise<boolean> {
  try {
    if (!supabase) {
      storageLogger.warn("Skipping database operation: Supabase client not available");
      return true; // Default to available if can't check
    }
    
    storageLogger.debug("Checking area availability", { 
      position: `${x},${y}`, 
      size: `${width}x${height}`
    });
    
    const { data, error } = await supabase
      .from('images')
      .select('*')
      .in('image_status', [
        IMAGE_STATUS.CONFIRMED, 
        IMAGE_STATUS.PENDING_PAYMENT,
        IMAGE_STATUS.PAYMENT_RETRY
      ])
      .or(`start_position_x.lt.${x + width},start_position_x.gt.${x - width}`)
      .or(`start_position_y.lt.${y + height},start_position_y.gt.${y - height}`);
    
    if (error) {
      storageLogger.error("Error checking area availability", { error });
      throw error;
    }
    
    if (!data || data.length === 0) {
      storageLogger.debug("Area is available (no overlaps)", { 
        position: `${x},${y}`, 
        size: `${width}x${height}`
      });
      return true; // No overlapping images found
    }
    
    // Check for actual overlap
    for (const image of data) {
      const imageRight = image.start_position_x + image.size_x;
      const imageBottom = image.start_position_y + image.size_y;
      const newRight = x + width;
      const newBottom = y + height;
      
      // Check if there's no overlap
      if (x >= imageRight || newRight <= image.start_position_x || 
          y >= imageBottom || newBottom <= image.start_position_y) {
        continue; // No overlap with this image
      }
      
      storageLogger.debug("Area is NOT available (found overlap)", { 
        position: `${x},${y}`, 
        size: `${width}x${height}`,
        overlapsWithImageId: image.image_id
      });
      
      return false; // Overlap found
    }
    
    storageLogger.debug("Area is available (no overlaps after detailed check)", { 
      position: `${x},${y}`, 
      size: `${width}x${height}`
    });
    
    return true; // No overlaps found
  } catch (error) {
    storageLogger.error("Failed to check area availability", { error });
    return true; // Default to available if check fails
  }
}

/**
 * Clean up expired pending payments (more than 24 hours old)
 * This can be called periodically to maintain database cleanliness
 */
export async function cleanupExpiredPendingPayments(): Promise<{ success: boolean, count?: number, error?: any }> {
  try {
    if (!supabase) {
      storageLogger.warn("Skipping database operation: Supabase client not available");
      return { success: false, error: "Supabase client not available" };
    }
    
    // Calculate cutoff time (24 hours ago)
    const cutoffTime = new Date();
    cutoffTime.setHours(cutoffTime.getHours() - 24);
    
    storageLogger.info("Cleaning up expired pending payments", { 
      cutoffTime: cutoffTime.toISOString()
    });
    
    // Update status of expired pending payments
    const { data, error } = await supabase
      .from('images')
      .update({ 
        image_status: IMAGE_STATUS.PAYMENT_TIMEOUT,
        last_updated_at: new Date().toISOString()
      })
      .in('image_status', [IMAGE_STATUS.PENDING_PAYMENT, IMAGE_STATUS.PAYMENT_RETRY])
      .lt('created_at', cutoffTime.toISOString());
    
    if (error) {
      storageLogger.error("Error cleaning up expired pending payments", { error });
      throw error;
    }
    
    storageLogger.info("Cleanup of expired pending payments complete", { 
      updatedCount: data?.length || 0 
    });
    
    return { 
      success: true, 
      count: data?.length || 0 
    };
  } catch (error) {
    storageLogger.error("Failed to clean up expired pending payments", { error });
    return { success: false, error };
  }
}