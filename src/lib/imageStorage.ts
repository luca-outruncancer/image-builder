// src/lib/imageStorage.ts
'use client';

import { createClient } from '@supabase/supabase-js';

// Use environment variables for Supabase connection
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let supabase: any = null;

try {
  if (supabaseUrl && supabaseKey) {
    supabase = createClient(supabaseUrl, supabaseKey);
    console.log("Supabase client initialized in imageStorage");
  } else {
    console.error("Unable to initialize Supabase client due to missing environment variables in imageStorage");
  }
} catch (error) {
  console.error("Error initializing Supabase client in imageStorage:", error);
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
}

/**
 * Create a new image record in the database
 */
export async function createImageRecord(imageData: Partial<ImageRecord>) {
  try {
    if (!supabase) {
      console.warn("Skipping database operation: Supabase client not available");
      return { 
        success: false, 
        error: "Supabase client not available. Check your environment variables." 
      };
    }
    
    const now = new Date().toISOString();
    
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
        payment_attempts: 0 // Initialize payment attempts counter
      })
      .select()
      .single();
    
    if (error) {
      console.error("Error creating image record:", error);
      throw error;
    }
    
    return { success: true, data };
  } catch (error) {
    console.error("Failed to create image record:", error);
    return { success: false, error };
  }
}

/**
 * Update the status of an existing image
 */
export async function updateImageStatus(imageId: number, status: number, confirmed: boolean = false) {
  try {
    if (!supabase) {
      console.warn("Skipping database operation: Supabase client not available");
      return { 
        success: false, 
        error: "Supabase client not available. Check your environment variables." 
      };
    }
    
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
        console.error("Error fetching current image data:", fetchError);
        // Continue with update without incrementing
      } else {
        const currentAttempts = currentImage?.payment_attempts || 0;
        updateData.payment_attempts = currentAttempts + 1;
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
      console.error("Error updating image status:", error);
      throw error;
    }
    
    return { success: true, data };
  } catch (error) {
    console.error("Failed to update image status:", error);
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
      console.warn("Skipping database operation: Supabase client not available");
      return [];
    }
    
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
      console.error("Error fetching image records:", error);
      throw error;
    }
    
    return data || [];
  } catch (error) {
    console.error("Failed to get image records:", error);
    return [];
  }
}

/**
 * Get a specific image record by ID
 */
export async function getImageById(imageId: number): Promise<ImageRecord | null> {
  try {
    if (!supabase) {
      console.warn("Skipping database operation: Supabase client not available");
      return null;
    }
    
    const { data, error } = await supabase
      .from('images')
      .select('*')
      .eq('image_id', imageId)
      .single();
    
    if (error) {
      console.error("Error fetching image record by ID:", error);
      throw error;
    }
    
    return data || null;
  } catch (error) {
    console.error(`Failed to get image with ID ${imageId}:`, error);
    return null;
  }
}

/**
 * Check if a specific area on the canvas is available
 */
export async function isAreaAvailable(x: number, y: number, width: number, height: number): Promise<boolean> {
  try {
    if (!supabase) {
      console.warn("Skipping database operation: Supabase client not available");
      return true; // Default to available if can't check
    }
    
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
      console.error("Error checking area availability:", error);
      throw error;
    }
    
    if (!data || data.length === 0) {
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
      
      return false; // Overlap found
    }
    
    return true; // No overlaps found
  } catch (error) {
    console.error("Failed to check area availability:", error);
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
      console.warn("Skipping database operation: Supabase client not available");
      return { success: false, error: "Supabase client not available" };
    }
    
    // Calculate cutoff time (24 hours ago)
    const cutoffTime = new Date();
    cutoffTime.setHours(cutoffTime.getHours() - 24);
    
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
      console.error("Error cleaning up expired pending payments:", error);
      throw error;
    }
    
    return { 
      success: true, 
      count: data?.length || 0 
    };
  } catch (error) {
    console.error("Failed to clean up expired pending payments:", error);
    return { success: false, error };
  }
}
