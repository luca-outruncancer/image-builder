// src/app/api/upload/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { writeFile } from 'fs/promises';
import path from 'path';
import fs from 'fs';
import { nanoid } from 'nanoid';
import { createImageRecord, IMAGE_STATUS } from '@/lib/imageStorage';
import { RECIPIENT_WALLET_ADDRESS, IMAGE_SETTINGS, FEATURES } from '@/utils/constants';
import { resizeImage, determineOptimalFormat } from '@/lib/imageResizer';

export async function POST(request: NextRequest) {
  const uploadId = nanoid(6); // Short ID for logging
  console.log(`[Upload:${uploadId}] Processing new upload request`);
  
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const positionString = formData.get('position') as string;
    const sizeString = formData.get('size') as string;
    const walletAddress = formData.get('wallet') as string;

    if (!file || !positionString || !sizeString) {
      console.log(`[Upload:${uploadId}] Missing required parameters`);
      return NextResponse.json(
        { error: 'File, position, and size are required' },
        { status: 400 }
      );
    }

    const position = JSON.parse(positionString);
    const size = JSON.parse(sizeString);

    console.log(`[Upload:${uploadId}] Request validated:`, { 
      fileName: file.name, 
      fileSize: `${(file.size / 1024).toFixed(1)}KB`,
      position, 
      targetSize: size,
      wallet: walletAddress ? `${walletAddress.slice(0, 6)}...` : 'none'
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
        console.log(`[Upload:${uploadId}] Created uploads directory: ${uploadDir}`);
      }
      
      const bytes = await file.arrayBuffer();
      originalBuffer = Buffer.from(bytes);
      
      // Save to temp path first for safety
      tempOriginalPath = path.join(uploadDir, `temp_${fileId}.${originalExtension}`);
      await writeFile(tempOriginalPath, originalBuffer);
      console.log(`[Upload:${uploadId}] Original file saved to temp location: ${tempOriginalPath}`);
    } catch (fileError) {
      console.error(`[Upload:${uploadId}] Error saving original file:`, fileError);
      return NextResponse.json(
        { error: 'Failed to save uploaded file: ' + (fileError instanceof Error ? fileError.message : String(fileError)) },
        { status: 500 }
      );
    }
    
    // Step 2: Determine format for resized image - preserve quality when possible
    const targetFormat = determineOptimalFormat(originalExtension, originalBuffer.length);
    const finalFileName = `${fileId}.${targetFormat}`;
    const finalFilePath = path.join(uploadDir, finalFileName);
    const publicUrl = `/uploads/${finalFileName}`;
    
    // Step 3: Resize the image using settings from constants
    let resizeResult;
    try {
      console.log(`[Upload:${uploadId}] Starting image resize operation to ${size.width}x${size.height} with quality settings:`, {
        highQualityEnabled: FEATURES.HIGH_QUALITY_IMAGES && IMAGE_SETTINGS.HIGH_QUALITY_MODE,
        adaptiveQuality: IMAGE_SETTINGS.SIZE_ADAPTIVE_QUALITY
      });
      
      // Let the resizer determine the quality from our constants
      resizeResult = await resizeImage(
        originalBuffer,
        finalFilePath,
        {
          width: size.width,
          height: size.height,
          format: targetFormat as 'jpeg' | 'png' | 'webp' | 'avif',
          fit: IMAGE_SETTINGS.DEFAULT_FIT,
          // No explicit quality setting - let it use the constants
          highQuality: FEATURES.HIGH_QUALITY_IMAGES // Use feature flag
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
    } catch (resizeError) {
      console.error(`[Upload:${uploadId}] Critical resize error:`, resizeError);
      
      // Use original as fallback in case of complete failure
      try {
        await writeFile(finalFilePath, originalBuffer);
        console.log(`[Upload:${uploadId}] Fell back to original file after resize failure`);
        
        resizeResult = {
          success: false,
          path: finalFilePath,
          format: originalExtension,
          originalSize: originalBuffer.length,
          resizedSize: originalBuffer.length,
          width: size.width,
          height: size.height,
          processingTimeMs: 0,
          error: resizeError
        };
      } catch (fallbackError) {
        console.error(`[Upload:${uploadId}] Complete failure - could not save fallback:`, fallbackError);
        return NextResponse.json(
          { error: 'Failed to process image: could not save either original or resized version' },
          { status: 500 }
        );
      }
    }
    
    // Step 4: Clean up temp file
    try {
      if (tempOriginalPath && fs.existsSync(tempOriginalPath)) {
        fs.unlinkSync(tempOriginalPath);
        console.log(`[Upload:${uploadId}] Removed temporary file: ${tempOriginalPath}`);
      }
    } catch (cleanupError) {
      console.warn(`[Upload:${uploadId}] Failed to clean up temp file:`, cleanupError);
      // Non-critical error, continue
    }
    
    // Step 5: Store in database
    try {
      const initialStatus = IMAGE_STATUS.PENDING_PAYMENT;
      
      console.log(`[Upload:${uploadId}] Creating database record`);
      const { success, data: imageRecord, error } = await createImageRecord({
        image_location: publicUrl,
        start_position_x: position.x,
        start_position_y: position.y,
        size_x: size.width,
        size_y: size.height,
        image_status: initialStatus,
        user_wallet: walletAddress
      });
      
      if (!success || !imageRecord) {
        console.error(`[Upload:${uploadId}] Database record creation failed:`, error);
        return NextResponse.json({
          success: true, // Still count as success since file was saved
          url: publicUrl,
          record: {
            image_id: Date.now(),
            image_location: publicUrl,
            start_position_x: position.x,
            start_position_y: position.y,
            size_x: size.width,
            size_y: size.height,
            image_status: initialStatus,
            created_at: new Date().toISOString()
          },
          optimization: {
            originalSize: resizeResult.originalSize,
            finalSize: resizeResult.resizedSize,
            format: resizeResult.format,
            compressionRatio: resizeResult.originalSize / resizeResult.resizedSize
          },
          warning: "Image record created in memory only. Database connection failed: " + error
        });
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
          compressionRatio: parseFloat((resizeResult.originalSize / resizeResult.resizedSize).toFixed(2))
        }
      });
    } catch (dbError) {
      console.error(`[Upload:${uploadId}] Database operation error:`, dbError);
      
      // Still return success with the file URL and a warning
      return NextResponse.json({
        success: true, // Still mark as success since file was saved
        url: publicUrl,
        record: {
          image_id: Date.now(),
          image_location: publicUrl,
          start_position_x: position.x,
          start_position_y: position.y,
          size_x: size.width,
          size_y: size.height,
          image_status: IMAGE_STATUS.PENDING_PAYMENT,
          created_at: new Date().toISOString()
        },
        optimization: {
          originalSize: resizeResult.originalSize,
          finalSize: resizeResult.resizedSize,
          format: resizeResult.format,
          compressionRatio: resizeResult.originalSize / resizeResult.resizedSize
        },
        warning: "Database operation failed. File was saved but record wasn't stored in the database."
      });
    }
  } catch (error) {
    console.error(`[Upload:${uploadId}] Unexpected error:`, error);
    return NextResponse.json(
      { error: 'Failed to upload image: ' + (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}