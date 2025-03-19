// src/lib/server/imageCache.ts
import { getSupabaseClient } from '@/lib/server/supabase';
import { systemLogger } from '@/utils/logger';
import { IMAGE_CACHING_TTL } from '@/utils/constants';
import { PaymentStatus } from '@/lib/payment/types/index';

// Define the image data structure
export interface CachedImageData {
  image_id: number;
  image_location: string;
  start_position_x: number;
  start_position_y: number;
  size_x: number;
  size_y: number;
  status: string;
  sender_wallet: string;
  created_at: string;
  updated_at?: string;
  payment_attempts: number;
}

// Define the spatial index structure
interface SpatialIndex {
  [key: string]: number; // Maps grid position to image ID
}

// Cache state
let imageCache: Map<number, CachedImageData> = new Map();
let spatialIndex: SpatialIndex = {};
let isInitialized = false;
let lastRefreshTime = 0;

/**
 * Initialize the image cache by loading all confirmed images
 */
export async function initializeImageCache(): Promise<{ success: boolean; error?: Error }> {
  try {
    systemLogger.info('Initializing image cache');
    
    const client = getSupabaseClient();
    if (!client) {
      const error = new Error('Supabase client not available');
      systemLogger.error('Failed to initialize image cache', error);
      return { success: false, error };
    }
    
    // Fetch all confirmed, pending, or processing images
    const { data, error } = await client
      .from('images')
      .select('*')
      .in('status', [PaymentStatus.PENDING, PaymentStatus.PROCESSING, PaymentStatus.CONFIRMED])
    
    if (error) {
      const err = new Error(`Database error: ${error.message}`);
      systemLogger.error('Failed to fetch images for cache', err);
      return { success: false, error: err };
    }
    
    if (!data || !Array.isArray(data)) {
      const err = new Error('Invalid data format received from database');
      systemLogger.error('Failed to initialize image cache', err);
      return { success: false, error: err };
    }
    
    // Clear existing cache
    imageCache.clear();
    spatialIndex = {};
    
    // Populate cache and spatial index
    data.forEach(image => {
      imageCache.set(image.image_id, image);
      
      // Add to spatial index - each pixel of the image is mapped to the image ID
      for (let x = image.start_position_x; x < image.start_position_x + image.size_x; x++) {
        for (let y = image.start_position_y; y < image.start_position_y + image.size_y; y++) {
          spatialIndex[`${x},${y}`] = image.image_id;
        }
      }
    });
    
    isInitialized = true;
    lastRefreshTime = Date.now();
    
    systemLogger.info('Image cache initialized successfully', {
      imageCount: imageCache.size,
      spatialIndexSize: Object.keys(spatialIndex).length
    });
    
    return { success: true };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    systemLogger.error('Failed to initialize image cache', err);
    return { success: false, error: err };
  }
}

/**
 * Refresh the image cache if it's older than the TTL
 */
export async function refreshImageCacheIfNeeded(): Promise<boolean> {
  if (!isInitialized || (Date.now() - lastRefreshTime) > IMAGE_CACHING_TTL) {
    const result = await initializeImageCache();
    return result.success;
  }
  return true;
}

/**
 * Find an image at a specific position
 */
export function findImageAtPosition(x: number, y: number): CachedImageData | null {
  if (!isInitialized) {
    systemLogger.warn('Image cache not initialized when querying position', { x, y });
    return null;
  }
  
  const key = `${x},${y}`;
  const imageId = spatialIndex[key];
  
  if (!imageId) {
    return null;
  }
  
  return imageCache.get(imageId) || null;
}

/**
 * Get cache statistics
 */
export function getImageCacheStats() {
  return {
    isInitialized,
    imageCount: imageCache.size,
    spatialIndexSize: Object.keys(spatialIndex).length,
    lastRefreshTime,
    ageSeconds: Math.round((Date.now() - lastRefreshTime) / 1000)
  };
}

/**
 * Clear the image cache
 */
export function clearImageCache() {
  imageCache.clear();
  spatialIndex = {};
  isInitialized = false;
  lastRefreshTime = 0;
  systemLogger.debug('Image cache cleared');
}

/**
 * Add or update a single image in the cache
 * This is used when a new image is added or an existing one is updated
 */
export async function updateImageInCache(image: CachedImageData): Promise<boolean> {
  if (!isInitialized) {
    systemLogger.warn('Cache not initialized when updating image, initializing now', { 
      imageId: image.image_id 
    });
    
    // Try to initialize the cache
    const result = await initializeImageCache();
    if (!result.success) {
      systemLogger.error('Failed to initialize cache when updating image', { 
        imageId: image.image_id,
        error: result.error?.message 
      });
      return false;
    }
  }
  
  // Remove the image from the spatial index if it already exists
  const existingImage = imageCache.get(image.image_id);
  if (existingImage) {
    for (let x = existingImage.start_position_x; x < existingImage.start_position_x + existingImage.size_x; x++) {
      for (let y = existingImage.start_position_y; y < existingImage.start_position_y + existingImage.size_y; y++) {
        delete spatialIndex[`${x},${y}`];
      }
    }
  }
  
  // Add the new/updated image to the cache
  imageCache.set(image.image_id, image);
  
  // Add to spatial index
  for (let x = image.start_position_x; x < image.start_position_x + image.size_x; x++) {
    for (let y = image.start_position_y; y < image.start_position_y + image.size_y; y++) {
      spatialIndex[`${x},${y}`] = image.image_id;
    }
  }
  
  systemLogger.debug('Updated image in cache', { 
    imageId: image.image_id,
    position: { x: image.start_position_x, y: image.start_position_y },
    size: { width: image.size_x, height: image.size_y }
  });
  
  return true;
}

/**
 * Remove an image from the cache
 */
export function removeImageFromCache(imageId: number): void {
  if (!isInitialized) {
    systemLogger.warn('Attempted to remove image from uninitialized cache', { imageId });
    return;
  }
  
  const image = imageCache.get(imageId);
  if (!image) {
    systemLogger.warn('Attempted to remove non-existent image from cache', { imageId });
    return;
  }
  
  // Remove from spatial index
  for (let x = image.start_position_x; x < image.start_position_x + image.size_x; x++) {
    for (let y = image.start_position_y; y < image.start_position_y + image.size_y; y++) {
      delete spatialIndex[`${x},${y}`];
    }
  }
  
  // Remove from image cache
  imageCache.delete(imageId);
  
  systemLogger.debug('Removed image from cache', { imageId });
} 