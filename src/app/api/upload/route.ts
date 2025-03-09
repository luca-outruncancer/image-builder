// src/app/api/upload/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { writeFile } from 'fs/promises';
import path from 'path';
import fs from 'fs';
import { nanoid } from 'nanoid';
import { createImageRecord, IMAGE_STATUS, ImageRecord } from '@/lib/imageStorage';
import { RECIPIENT_WALLET_ADDRESS } from '@/utils/constants';
import { resizeImage, determineOptimalFormat } from '@/lib/imageResizer';
import { apiLogger, imageLogger } from '@/utils/logger';
import { getRequestId } from '@/utils/logger';

export async function POST(request: NextRequest) {
  const requestId = getRequestId();
  const uploadId = nanoid(6); // Short ID for logging
  
  apiLogger.info(`Processing new image upload request`, {
    uploadId,
    requestId
  });
  
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const positionString = formData.get('position') as string;
    const sizeString = formData.get('size') as string;
    const walletAddress = formData.get('wallet') as string;

    if (!file || !positionString || !sizeString) {
      apiLogger.error(`Missing required parameters`, { 
        uploadId,
        hasFile: !!file,
        hasPosition: !!positionString,
        hasSize: !!sizeString
      });
      
      return NextResponse.json(
        { error: 'File, position, and size are required' },
        { status: 400 }
      );
    }

    const position = JSON.parse(positionString);
    const size = JSON.parse(sizeString);

    apiLogger.info(`Upload request validated`, { 
      uploadId, 
      fileName: file.name, 
      fileSize: `${(file.size / 1024).toFixed(1)}KB`,
      position, 
      targetSize: size,
      wallet: walletAddress ? `${walletAddress.slice(0, 8)}...` : 'none'
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
        apiLogger.info(`Created uploads directory`, { uploadId, path: uploadDir });
      }
      
      const bytes = await file.arrayBuffer();
      originalBuffer = Buffer.from(bytes);
      
      // Save to temp path first for safety
      tempOriginalPath = path.join(uploadDir, `temp_${fileId}.${originalExtension}`);
      await writeFile(tempOriginalPath, originalBuffer);
      
      apiLogger.debug(`Original file saved to temp location`, { 
        uploadId, 
        path: tempOriginalPath,
        size: originalBuffer.length
      });
    } catch (fileError) {
      apiLogger.error(`Error saving original file`, { uploadId, error: fileError });
      return NextResponse.json(
        { error: 'Failed to save uploaded file: ' + (fileError instanceof Error ? fileError.message : String(fileError)) },
        { status: 500 }
      );
    }
    
    // Step 2: Determine format for resized image 
    const targetFormat = determineOptimalFormat(originalExtension, originalBuffer.length);
    const finalFileName = `${fileId}.${targetFormat}`;
    const finalFilePath = path.join(uploadDir, finalFileName);
    const publicUrl = `/uploads/${finalFileName}`;
    
    apiLogger.debug(`Selected output format`, { 
      uploadId, 
      originalFormat: originalExtension, 
      targetFormat,
      originalSize: `${(originalBuffer.length / 1024).toFixed(1)}KB`
    });
    
    // Step 3: Resize the image
    let resizeResult;
    try {
      apiLogger.info(`Starting image resize operation`, { 
        uploadId, 
        targetWidth: size.width,
        targetHeight: size.height
      });
      
      resizeResult = await resizeImage(
        originalBuffer,
        finalFilePath,
        {
          width: size.width,
          height: size.height,
          format: targetFormat as 'jpeg' | 'png' | 'webp' | 'avif',
          fit: 'cover'
        }
      );
      
      if (resizeResult.success) {
        imageLogger.info(`Resize successful`, {
          uploadId,
          originalSize: `${(originalBuffer.length / 1024).toFixed(1)}KB`,
          newSize: `${(resizeResult.resizedSize / 1024).toFixed(1)}KB`,
          compressionRatio: (originalBuffer.length / resizeResult.resizedSize).toFixed(2),
          processingTime: `${resizeResult.processingTimeMs}ms`
        });
      } else {
        imageLogger.warn(`Resize operation failed but fallback succeeded`, {
          uploadId,
          reason: resizeResult.error?.message || 'Unknown error',
          usingOriginal: resizeResult.resizedSize === originalBuffer.length
        });
      }
    } catch (resizeError) {
      imageLogger.error(`Critical resize error`, { uploadId, error: resizeError });
      
      // Use original as fallback in case of complete failure
      try {
        await writeFile(finalFilePath, originalBuffer);
        apiLogger.info(`Fell back to original file after resize failure`, { uploadId });
        
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
        apiLogger.error(`Complete failure - could not save fallback`, { uploadId, error: fallbackError });
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
        apiLogger.debug(`Removed temporary file`, { uploadId, path: tempOriginalPath });
      }
    } catch (cleanupError) {
      apiLogger.warn(`Failed to clean up temp file`, { uploadId, error: cleanupError });
      // Non-critical error, continue
    }
    
    // Step 5: Store in database
    try {
      const initialStatus = IMAGE_STATUS.PENDING_PAYMENT;
      
      apiLogger.info(`Creating database record`, { uploadId });
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
        apiLogger.error(`Database record creation failed`, { uploadId, error });
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
      
      apiLogger.info(`Upload process complete`, {
        uploadId, 
        imageId: imageRecord.image_id,
        compressionRatio: resizeResult.originalSize / resizeResult.resizedSize
      });
      
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
      apiLogger.error(`Database operation error`, { uploadId, error: dbError });
      
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
    apiLogger.error(`Unexpected error in upload process`, { 
      uploadId, 
      error: error instanceof Error ? error.message : String(error) 
    });
    return NextResponse.json(
      { error: 'Failed to upload image: ' + (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}