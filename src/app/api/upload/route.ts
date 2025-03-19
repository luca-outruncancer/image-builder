// src/app/api/upload/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { writeFile } from 'fs/promises';
import path from 'path';
import fs from 'fs';
import { nanoid } from 'nanoid';
import { createImageRecord } from '@/lib/server/imageStorage';
import { RECIPIENT_WALLET_ADDRESS, IMAGE_SETTINGS, FEATURES, MAX_FILE_SIZE } from '@/utils/constants';
import { resizeImage, determineOptimalFormat } from '@/lib/server/imageResizer';
import { withErrorHandling, createApiError, ApiErrorType } from '@/utils/apiErrorHandler';
import { imageLogger } from '@/utils/logger/index';
import { PaymentStatus } from '@/lib/payment/types';
import { updateImageInCache } from '@/lib/server/imageCache';
import { ensureServerInitialized } from '@/lib/server/init';

export const POST = withErrorHandling(async (request: NextRequest) => {
  const requestId = request.headers.get('x-request-id') || 'unknown';
  const uploadId = nanoid(6); // Short ID for logging

  imageLogger.info(`[Upload:${uploadId}] Processing new upload request`, {
    requestId,
    uploadId
  });
  
  // Ensure server is initialized before processing the upload
  await ensureServerInitialized();
  
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const positionString = formData.get('position') as string;
    const sizeString = formData.get('size') as string;
    const walletAddress = formData.get('wallet') as string;

    // Validate required parameters
    if (!file || !positionString || !sizeString) {
      imageLogger.error(`[Upload:${uploadId}] Missing required parameters`, {
        hasFile: !!file,
        hasPosition: !!positionString,
        hasSize: !!sizeString,
        requestId
      });
      
      return createApiError(
        ApiErrorType.BAD_REQUEST,
        'File, position, and size are required',
        { missingFields: [!file && 'file', !positionString && 'position', !sizeString && 'size'].filter(Boolean) },
        undefined,
        requestId
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      imageLogger.error(`[Upload:${uploadId}] File size exceeds limit`, {
        fileSize: file.size,
        maxSize: MAX_FILE_SIZE,
        requestId
      });
      
      return createApiError(
        ApiErrorType.BAD_REQUEST,
        `File size must be less than ${MAX_FILE_SIZE / (1024 * 1024)}MB`,
        { fileSize: file.size, maxSize: MAX_FILE_SIZE },
        undefined,
        requestId
      );
    }

    // Parse position and size
    const position = JSON.parse(positionString);
    const size = JSON.parse(sizeString);

    imageLogger.info(`[Upload:${uploadId}] Request validated`, { 
      fileName: file.name, 
      fileSize: `${(file.size / 1024).toFixed(1)}KB`,
      position, 
      targetSize: size,
      wallet: walletAddress ? `${walletAddress.slice(0, 6)}...` : 'none',
      requestId
    });

    // Generate a unique ID for the file and create paths
    const fileId = nanoid();
    const originalExtension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const uploadDir = path.join(process.cwd(), 'public/uploads');
    
    // Step 1: Store original file in temp location first
    let tempOriginalPath = '';
    let originalBuffer: Buffer;
    
    try {
      // Create upload directory if needed
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
        imageLogger.info(`[Upload:${uploadId}] Created uploads directory: ${uploadDir}`, { requestId });
      }
      
      const bytes = await file.arrayBuffer();
      originalBuffer = Buffer.from(bytes);
      
      // Save to temp path first for safety
      tempOriginalPath = path.join(uploadDir, `temp_${fileId}.${originalExtension}`);
      await writeFile(tempOriginalPath, originalBuffer);
      imageLogger.debug(`[Upload:${uploadId}] Original file saved to temp location: ${tempOriginalPath}`, { requestId });
    } catch (fileError) {
      imageLogger.error(`[Upload:${uploadId}] Error saving original file`, fileError, { requestId });
      return createApiError(
        ApiErrorType.INTERNAL_ERROR,
        'Failed to save uploaded file',
        fileError,
        undefined,
        requestId
      );
    }
    
    // Step 2: Determine format for resized image - preserve quality when possible
    const targetFormat = determineOptimalFormat(originalExtension, originalBuffer.length);
    const finalFileName = `${fileId}.${targetFormat}`;
    const finalFilePath = path.join(uploadDir, finalFileName);
    const publicUrl = `/uploads/${finalFileName}`;
    
    // Step 3: Apply MINIMUM_SIZE_MULTIPLIER to prevent excessive downsizing
    // The displayed size will remain as requested, but we'll store a larger version
    const multiplier = IMAGE_SETTINGS.MINIMUM_SIZE_MULTIPLIER || 1;
    const storageWidth = size.width * multiplier;
    const storageHeight = size.height * multiplier;
    
    imageLogger.debug(`[Upload:${uploadId}] Applying size multiplier: ${multiplier}x`, {
      requestedSize: `${size.width}x${size.height}`,
      actualStorageSize: `${storageWidth}x${storageHeight}`,
      requestId
    });
    
    // Step 4: Resize the image using settings from constants and the multiplier
    let resizeResult;
    try {
      imageLogger.debug(`[Upload:${uploadId}] Starting image resize operation to ${storageWidth}x${storageHeight}`, {
        highQualityEnabled: FEATURES.HIGH_QUALITY_IMAGES && IMAGE_SETTINGS.HIGH_QUALITY_MODE,
        adaptiveQuality: IMAGE_SETTINGS.SIZE_ADAPTIVE_QUALITY,
        requestId
      });
      
      // Let the resizer determine the quality from our constants
      resizeResult = await resizeImage(
        originalBuffer,
        finalFilePath,
        {
          width: storageWidth,
          height: storageHeight,
          format: targetFormat as 'jpeg' | 'png' | 'webp' | 'avif',
          fit: IMAGE_SETTINGS.DEFAULT_FIT,
          // No explicit quality setting - let it use the constants
          highQuality: FEATURES.HIGH_QUALITY_IMAGES // Use feature flag
        }
      );
      
      if (resizeResult.success) {
        imageLogger.info(`[Upload:${uploadId}] High-quality resize successful`, {
          originalSize: `${(originalBuffer.length / 1024).toFixed(1)}KB`,
          newSize: `${(resizeResult.resizedSize / 1024).toFixed(1)}KB`,
          compressionRatio: (originalBuffer.length / resizeResult.resizedSize).toFixed(2),
          processingTime: `${resizeResult.processingTimeMs}ms`,
          format: targetFormat,
          requestId
        });
      } else {
        imageLogger.warn(`[Upload:${uploadId}] Resize operation failed but fallback succeeded`, {
          reason: resizeResult.error?.message || 'Unknown error',
          usingOriginal: resizeResult.resizedSize === originalBuffer.length,
          requestId
        });
      }
    } catch (resizeError) {
      imageLogger.error(`[Upload:${uploadId}] Critical resize error`, resizeError, { requestId });
      
      // Use original as fallback in case of complete failure
      try {
        await writeFile(finalFilePath, originalBuffer);
        imageLogger.info(`[Upload:${uploadId}] Fell back to original file after resize failure`, { requestId });
        
        resizeResult = {
          success: false,
          path: finalFilePath,
          format: originalExtension,
          originalSize: originalBuffer.length,
          resizedSize: originalBuffer.length,
          width: storageWidth,
          height: storageHeight,
          processingTimeMs: 0,
          error: resizeError
        };
      } catch (fallbackError) {
        imageLogger.error(`[Upload:${uploadId}] Complete failure - could not save fallback`, fallbackError, { requestId });
        return createApiError(
          ApiErrorType.INTERNAL_ERROR,
          'Failed to process image: could not save either original or resized version',
          { originalError: resizeError, fallbackError },
          undefined,
          requestId
        );
      }
    }
    
    // Step 5: Clean up temp file
    try {
      if (tempOriginalPath && fs.existsSync(tempOriginalPath)) {
        fs.unlinkSync(tempOriginalPath);
        imageLogger.debug(`[Upload:${uploadId}] Removed temporary file: ${tempOriginalPath}`, { requestId });
      }
    } catch (cleanupError) {
      imageLogger.warn(`[Upload:${uploadId}] Failed to clean up temp file`, cleanupError, { requestId });
      // Non-critical error, continue
    }
    
    // Step 6: Store in database (notice we store the ORIGINAL requested size, not the multiplied one)
    // This ensures that the image appears at the size the user requested on the canvas
    try {
      imageLogger.info(`[Upload:${uploadId}] Creating database record with display size: ${size.width}x${size.height}`, { requestId });
      const { success, data: imageRecord, error } = await createImageRecord({
        image_location: publicUrl,
        start_position_x: position.x,
        start_position_y: position.y,
        size_x: size.width,
        size_y: size.height,
        status: PaymentStatus.INITIALIZED,
        sender_wallet: walletAddress
      });
      
      if (!success || !imageRecord) {
        imageLogger.error(`[Upload:${uploadId}] Database record creation failed`, error, { requestId });
        
        // Still return success with the file URL and a warning since the file was saved
        return NextResponse.json({
          success: true,
          url: publicUrl,
          record: {
            image_location: publicUrl,
            start_position_x: position.x,
            start_position_y: position.y,
            size_x: size.width,
            size_y: size.height,
            status: PaymentStatus.INITIALIZED,
            created_at: new Date().toISOString()
          },
          optimization: {
            originalSize: resizeResult.originalSize,
            finalSize: resizeResult.resizedSize,
            format: resizeResult.format,
            compressionRatio: resizeResult.originalSize / resizeResult.resizedSize,
            storedSize: `${storageWidth}x${storageHeight}`,
            displaySize: `${size.width}x${size.height}`
          },
          warning: "Image record created in memory only. Database connection failed: " + error,
          requestId
        });
      }
      
      // Update the image cache with the new image
      try {
        const cacheUpdateSuccess = await updateImageInCache({
          image_id: imageRecord.image_id,
          image_location: publicUrl,
          start_position_x: position.x,
          start_position_y: position.y,
          size_x: size.width,
          size_y: size.height,
          status: PaymentStatus.INITIALIZED,
          sender_wallet: walletAddress,
          created_at: imageRecord.created_at,
          payment_attempts: 0
        });
        
        if (cacheUpdateSuccess) {
          imageLogger.debug(`[Upload:${uploadId}] Updated image cache with new image`, { 
            imageId: imageRecord.image_id,
            requestId
          });
        } else {
          imageLogger.warn(`[Upload:${uploadId}] Failed to update image cache`, { 
            imageId: imageRecord.image_id,
            requestId
          });
        }
      } catch (cacheError) {
        // Non-critical error, just log it
        imageLogger.warn(`[Upload:${uploadId}] Error updating image cache`, cacheError, { 
          imageId: imageRecord.image_id,
          requestId
        });
      }
      
      // Return success with the image record
      return NextResponse.json({
        success: true,
        url: publicUrl,
        record: imageRecord,
        optimization: {
          originalSize: resizeResult.originalSize,
          finalSize: resizeResult.resizedSize,
          format: resizeResult.format,
          compressionRatio: resizeResult.originalSize / resizeResult.resizedSize,
          storedSize: `${storageWidth}x${storageHeight}`,
          displaySize: `${size.width}x${size.height}`
        },
        requestId
      });
    } catch (dbError) {
      imageLogger.error(`[Upload:${uploadId}] Database operation error`, dbError, { requestId });
      
      // Still return success with the file URL and a warning
      return NextResponse.json({
        success: true, // Still mark as success since file was saved
        url: publicUrl,
        record: {
          image_location: publicUrl,
          start_position_x: position.x,
          start_position_y: position.y,
          size_x: size.width,
          size_y: size.height,
          status: PaymentStatus.INITIALIZED,
          created_at: new Date().toISOString()
        },
        optimization: {
          originalSize: resizeResult.originalSize,
          finalSize: resizeResult.resizedSize,
          format: resizeResult.format,
          compressionRatio: resizeResult.originalSize / resizeResult.resizedSize,
          storedSize: `${storageWidth}x${storageHeight}`,
          displaySize: `${size.width}x${size.height}`
        },
        warning: "Database operation failed. File was saved but record wasn't stored in the database.",
        requestId
      });
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    imageLogger.error('Image upload failed', err, {
      error: err.message
    });
    
    return NextResponse.json({ 
      success: false, 
      error: err.message 
    }, { 
      status: 500 
    });
  }
});
