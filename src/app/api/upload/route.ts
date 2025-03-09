// src/app/api/upload/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { writeFile } from 'fs/promises';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { nanoid } from 'nanoid';
import { createImageRecord, IMAGE_STATUS } from '@/lib/imageStorage';
import { RECIPIENT_WALLET_ADDRESS, IMAGE_SETTINGS, FEATURES, CANVAS_WIDTH, CANVAS_HEIGHT, GRID_SIZE } from '@/utils/constants';
import { resizeImage, determineOptimalFormat } from '@/lib/imageResizer';
import { supabase } from '@/lib/supabase';

// Maximum file size limit (5MB)
const MAX_FILE_SIZE = 5 * 1024 * 1024;

// Allowed image types
const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif'
]);

// Rate limiting configuration
const MAX_UPLOADS_PER_MINUTE = 10;
const MAX_UPLOADS_PER_HOUR = 30;

// In-memory rate limiting (will reset on server restart)
const uploadCounts: Record<string, { minuteCount: number, hourCount: number, lastMinute: number, lastHour: number }> = {};

/**
 * Validate file type and content
 */
async function validateFile(file: File): Promise<{valid: boolean, reason?: string}> {
  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, reason: `File size exceeds maximum limit of ${MAX_FILE_SIZE / (1024 * 1024)}MB` };
  }
  
  // Check file type
  if (!ALLOWED_TYPES.has(file.type)) {
    return { valid: false, reason: 'Unsupported file type. Allowed types: JPEG, PNG, WebP, GIF' };
  }
  
  // More advanced validation could be added here
  // For example, checking file signatures, scanning for malware, etc.
  
  return { valid: true };
}

/**
 * Validate position and size
 */
function validatePlacement(x: number, y: number, width: number, height: number): {valid: boolean, reason?: string} {
  // Check if values are numbers
  if (isNaN(x) || isNaN(y) || isNaN(width) || isNaN(height)) {
    return { valid: false, reason: 'Position and size must be valid numbers' };
  }
  
  // Check if values are integers
  if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(width) || !Number.isInteger(height)) {
    return { valid: false, reason: 'Position and size must be integers' };
  }
  
  // Check if position is aligned to grid
  if (x % GRID_SIZE !== 0 || y % GRID_SIZE !== 0) {
    return { valid: false, reason: `Position must be aligned to grid size (${GRID_SIZE}px)` };
  }
  
  // Check if values are within canvas bounds
  if (x < 0 || y < 0 || x + width > CANVAS_WIDTH || y + height > CANVAS_HEIGHT) {
    return { valid: false, reason: 'Position and size must be within canvas bounds' };
  }
  
  // Check if size is valid
  if (width <= 0 || height <= 0) {
    return { valid: false, reason: 'Width and height must be positive values' };
  }
  
  // Check if size is reasonable
  if (width > CANVAS_WIDTH / 2 || height > CANVAS_HEIGHT / 2) {
    return { valid: false, reason: 'Image size is too large' };
  }
  
  return { valid: true };
}

/**
 * Check rate limits
 */
function checkRateLimit(userId: string): {allowed: boolean, reason?: string} {
  const now = Date.now();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const currentMinute = Math.floor(now / minute);
  const currentHour = Math.floor(now / hour);
  
  // Initialize rate limit data if not exists
  if (!uploadCounts[userId]) {
    uploadCounts[userId] = {
      minuteCount: 0,
      hourCount: 0,
      lastMinute: currentMinute,
      lastHour: currentHour
    };
  }
  
  // Reset counters if time period has changed
  if (uploadCounts[userId].lastMinute !== currentMinute) {
    uploadCounts[userId].minuteCount = 0;
    uploadCounts[userId].lastMinute = currentMinute;
  }
  
  if (uploadCounts[userId].lastHour !== currentHour) {
    uploadCounts[userId].hourCount = 0;
    uploadCounts[userId].lastHour = currentHour;
  }
  
  // Check per-minute limit
  if (uploadCounts[userId].minuteCount >= MAX_UPLOADS_PER_MINUTE) {
    return { allowed: false, reason: `Exceeded rate limit of ${MAX_UPLOADS_PER_MINUTE} uploads per minute` };
  }
  
  // Check per-hour limit
  if (uploadCounts[userId].hourCount >= MAX_UPLOADS_PER_HOUR) {
    return { allowed: false, reason: `Exceeded rate limit of ${MAX_UPLOADS_PER_HOUR} uploads per hour` };
  }
  
  // Update counters
  uploadCounts[userId].minuteCount++;
  uploadCounts[userId].hourCount++;
  
  return { allowed: true };
}

/**
 * Check database lock for the area
 */
async function checkAreaLock(x: number, y: number, width: number, height: number, userId: string): Promise<{available: boolean, reason?: string, lockId?: number}> {
  try {
    // Check if area is available using database function
    const { data: isAvailable, error: checkError } = await supabase.rpc('check_area_availability', {
      x_pos: x,
      y_pos: y,
      width: width,
      height: height
    });
    
    if (checkError) {
      console.error('[Upload API] Error checking area availability:', checkError);
      return { available: false, reason: 'Database error when checking area availability' };
    }
    
    if (!isAvailable) {
      return { available: false, reason: 'Selected area is already occupied or locked' };
    }
    
    // Try to lock the area
    const { data: lockId, error: lockError } = await supabase.rpc('lock_area', {
      x_pos: x,
      y_pos: y,
      width: width,
      height: height,
      lock_owner: userId,
      lock_duration_seconds: 120 // 2 minutes
    });
    
    if (lockError) {
      console.error('[Upload API] Error locking area:', lockError);
      return { available: false, reason: 'Database error when locking area' };
    }
    
    if (lockId === 0) {
      return { available: false, reason: 'Area is no longer available (locked by another user)' };
    }
    
    return { available: true, lockId };
  } catch (error) {
    console.error('[Upload API] Error in database operations:', error);
    return { available: false, reason: 'Internal server error checking area availability' };
  }
}

/**
 * Release database lock
 */
async function releaseLock(lockId: number): Promise<void> {
  try {
    await supabase.rpc('release_lock', { id: lockId });
    console.log(`[Upload API] Released lock ${lockId}`);
  } catch (error) {
    console.error(`[Upload API] Error releasing lock ${lockId}:`, error);
  }
}

/**
 * API route handler
 */
export async function POST(request: NextRequest) {
  const uploadId = nanoid(6); // Short ID for logging
  console.log(`[Upload:${uploadId}] Processing new upload request`);
  
  // Extract user ID for rate limiting
  const apiKey = request.headers.get('x-api-key') || '';
  const userId = request.headers.get('x-user-id') || apiKey || 'anonymous';
  let areaLockId: number | undefined;
  
  try {
    // Check rate limits
    const rateLimitCheck = checkRateLimit(userId);
    if (!rateLimitCheck.allowed) {
      console.warn(`[Upload:${uploadId}] Rate limit exceeded for user ${userId}: ${rateLimitCheck.reason}`);
      return NextResponse.json(
        { error: rateLimitCheck.reason || 'Rate limit exceeded' },
        { status: 429 }
      );
    }
    
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const positionString = formData.get('position') as string;
    const sizeString = formData.get('size') as string;
    const walletAddress = formData.get('wallet') as string;

    // Basic validation
    if (!file || !positionString || !sizeString) {
      console.log(`[Upload:${uploadId}] Missing required parameters`);
      return NextResponse.json(
        { error: 'File, position, and size are required' },
        { status: 400 }
      );
    }

    // Validate file
    const fileCheck = await validateFile(file);
    if (!fileCheck.valid) {
      console.warn(`[Upload:${uploadId}] File validation failed: ${fileCheck.reason}`);
      return NextResponse.json(
        { error: fileCheck.reason },
        { status: 400 }
      );
    }
    
    // Parse position and size
    let position: {x: number, y: number};
    let size: {width: number, height: number};
    
    try {
      position = JSON.parse(positionString);
      size = JSON.parse(sizeString);
    } catch (error) {
      console.warn(`[Upload:${uploadId}] Failed to parse position/size JSON: ${error}`);
      return NextResponse.json(
        { error: 'Invalid position or size format' },
        { status: 400 }
      );
    }
    
    // Validate position and size
    const placementCheck = validatePlacement(position.x, position.y, size.width, size.height);
    if (!placementCheck.valid) {
      console.warn(`[Upload:${uploadId}] Placement validation failed: ${placementCheck.reason}`);
      return NextResponse.json(
        { error: placementCheck.reason },
        { status: 400 }
      );
    }
    
    // Check and acquire area lock
    const lockCheck = await checkAreaLock(position.x, position.y, size.width, size.height, userId);
    if (!lockCheck.available) {
      console.warn(`[Upload:${uploadId}] Area lock check failed: ${lockCheck.reason}`);
      return NextResponse.json(
        { error: lockCheck.reason },
        { status: 409 } // Conflict
      );
    }
    
    // Store lock ID for later release
    areaLockId = lockCheck.lockId;
    
    console.log(`[Upload:${uploadId}] Request validated:`, { 
      fileName: file.name, 
      fileSize: `${(file.size / 1024).toFixed(1)}KB`,
      position, 
      targetSize: size,
      wallet: walletAddress ? `${walletAddress.slice(0, 6)}...` : 'none',
      lockId: areaLockId
    });

    // Generate secure file ID
    const fileId = crypto.randomBytes(16).toString('hex');
    const originalExtension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const uploadDir = path.join(process.cwd(), 'public/uploads');
    
    // Ensure upload directory exists
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
      console.log(`[Upload:${uploadId}] Created uploads directory: ${uploadDir}`);
    }
      
    // Step 1: Store original file in temp location
    const bytes = await file.arrayBuffer();
    const originalBuffer = Buffer.from(bytes);
      
    const tempOriginalPath = path.join(uploadDir, `temp_${fileId}.${originalExtension}`);
    await writeFile(tempOriginalPath, originalBuffer);
    console.log(`[Upload:${uploadId}] Original file saved to temp location: ${tempOriginalPath}`);
    
    // Step 2: Determine format and resize
    const targetFormat = determineOptimalFormat(originalExtension, originalBuffer.length);
    const finalFileName = `${fileId}.${targetFormat}`;
    const finalFilePath = path.join(uploadDir, finalFileName);
    const publicUrl = `/uploads/${finalFileName}`;
    
    // Apply size multiplier to store larger image than displayed
    const multiplier = IMAGE_SETTINGS.MINIMUM_SIZE_MULTIPLIER || 1;
    const storageWidth = size.width * multiplier;
    const storageHeight = size.height * multiplier;
    
    console.log(`[Upload:${uploadId}] Applying size multiplier: ${multiplier}x`, {
      requestedSize: `${size.width}x${size.height}`,
      actualStorageSize: `${storageWidth}x${storageHeight}`
    });
    
    // Resize the image
    let resizeResult;
    try {
      console.log(`[Upload:${uploadId}] Starting image resize operation to ${storageWidth}x${storageHeight}`);
      
      resizeResult = await resizeImage(
        originalBuffer,
        finalFilePath,
        {
          width: storageWidth,
          height: storageHeight,
          format: targetFormat as 'jpeg' | 'png' | 'webp' | 'avif',
          fit: IMAGE_SETTINGS.DEFAULT_FIT,
          highQuality: FEATURES.HIGH_QUALITY_IMAGES
        }
      );
      
      if (resizeResult.success) {
        console.log(`[Upload:${uploadId}] High-quality resize successful:`, {
          originalSize: `${(originalBuffer.length / 1024).toFixed(1)}KB`,
          newSize: `${(resizeResult.resizedSize / 1024).toFixed(1)}KB`,
          compressionRatio: (originalBuffer.length / resizeResult.resizedSize).toFixed(2),
          processingTime: `${resizeResult.processingTimeMs}ms`,
          format: targetFormat
        });
      } else {
        console.warn(`[Upload:${uploadId}] Resize operation failed but fallback succeeded:`, {
          reason: resizeResult.error?.message || 'Unknown error',
          usingOriginal: resizeResult.resizedSize === originalBuffer.length
        });
      }
    } catch (error) {
      console.error(`[Upload:${uploadId}] Critical resize error:`, error);
      
      // Use original as fallback
      await writeFile(finalFilePath, originalBuffer);
      console.log(`[Upload:${uploadId}] Fell back to original file after resize failure`);
      
      resizeResult = {
        success: false,
        path: finalFilePath,
        format: originalExtension,
        originalSize: originalBuffer.length,
        resizedSize: originalBuffer.length,
        width: storageWidth,
        height: storageHeight,
        processingTimeMs: 0,
        error
      };
    } finally {
      // Clean up temp file
      try {
        if (fs.existsSync(tempOriginalPath)) {
          fs.unlinkSync(tempOriginalPath);
        }
      } catch (cleanupError) {
        console.warn(`[Upload:${uploadId}] Failed to clean up temp file:`, cleanupError);
      }
    }
    
    // Step 3: Store in database - notice we store the requested size for display
    try {
      const initialStatus = IMAGE_STATUS.PENDING_PAYMENT;
      
      console.log(`[Upload:${uploadId}] Creating database record with display size: ${size.width}x${size.height}`);
      const { success, data: imageRecord, error } = await createImageRecord({
        image_location: publicUrl,
        start_position_x: position.x,
        start_position_y: position.y,
        size_x: size.width,  // Original requested width (for display)
        size_y: size.height, // Original requested height (for display)
        image_status: initialStatus,
        user_wallet: walletAddress
      });
      
      if (!success || !imageRecord) {
        console.error(`[Upload:${uploadId}] Database record creation failed:`, error);
        // Release lock since operation failed
        if (areaLockId) {
          await releaseLock(areaLockId);
        }
        
        return NextResponse.json({
          error: 'Failed to save image record in database'
        }, { status: 500 });
      }
      
      console.log(`[Upload:${uploadId}] Upload process complete. ImageID: ${imageRecord.image_id}`);
      
      // Return success with optimization info
      return NextResponse.json({
        success: true,
        url: publicUrl,
        record: imageRecord,
        optimization: {
          originalSize: resizeResult.originalSize,
          finalSize: resizeResult.resizedSize,
          format: resizeResult.format,
          processingTimeMs: resizeResult.processingTimeMs,
          compressionRatio: parseFloat((resizeResult.originalSize / resizeResult.resizedSize).toFixed(2)),
          storedSize: `${storageWidth}x${storageHeight}`,
          displaySize: `${size.width}x${size.height}`
        }
      });
    } catch (dbError) {
      console.error(`[Upload:${uploadId}] Database operation error:`, dbError);
      // Release lock since operation failed
      if (areaLockId) {
        await releaseLock(areaLockId);
      }
      
      return NextResponse.json({
        error: 'Failed to store image information in database'
      }, { status: 500 });
    }
  } catch (error) {
    console.error(`[Upload:${uploadId}] Unexpected error:`, error);
    // Release lock if acquired but not released due to error
    if (areaLockId) {
      await releaseLock(areaLockId);
    }
    
    return NextResponse.json(
      { error: 'Internal server error: ' + (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
