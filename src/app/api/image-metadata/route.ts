// src/app/api/image-metadata/route.ts
import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { MAX_FILE_SIZE } from '@/utils/constants';
import { apiLogger } from '@/utils/logger';

/**
 * Simplified API endpoint to get basic metadata for an image file
 * Used by UploadModal to get original dimensions
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    if (!body.filename) {
      return NextResponse.json(
        { error: 'Filename is required' },
        { status: 400 }
      );
    }
    
    // Validate file size if provided
    if (body.size && body.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { 
          success: false,
          error: 'File size exceeds limit',
          message: `File size must be less than ${MAX_FILE_SIZE / (1024 * 1024)}MB`
        },
        { status: 400 }
      );
    }
    
    // If client uploaded image data directly
    if (body.data) {
      try {
        // Parse base64 data if present
        const imageBuffer = Buffer.from(body.data, 'base64');
        const metadata = await sharp(imageBuffer).metadata();
        
        return NextResponse.json({
          success: true,
          filename: body.filename,
          width: metadata.width,
          height: metadata.height,
          format: metadata.format
        });
      } catch (error) {
        apiLogger.error('Error processing image data', error instanceof Error ? error : new Error(String(error)));
        return NextResponse.json(
          { 
            success: false,
            error: 'Failed to process image data',
            message: error instanceof Error ? error.message : String(error)
          },
          { status: 500 }
        );
      }
    }
    
    // If we're just estimating based on file size
    if (body.size) {
      // Get extension
      const extension = body.filename.split('.').pop()?.toLowerCase();
      
      // Estimate dimensions based on file type and size
      const estimatedDimensions = estimateDimensions(extension, body.size);
      
      return NextResponse.json({
        success: true,
        filename: body.filename,
        estimated: true,
        ...estimatedDimensions
      });
    }
    
    return NextResponse.json(
      { error: 'Either image data or file size must be provided' },
      { status: 400 }
    );
  } catch (error) {
    apiLogger.error('Unexpected error', error instanceof Error ? error : new Error(String(error)));
    return NextResponse.json(
      { error: 'Failed to process request: ' + (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}

/**
 * Roughly estimate image dimensions based on file size
 * This is a fallback when actual metadata can't be obtained
 */
function estimateDimensions(extension: string | undefined, fileSize: number) {
  // These are very rough estimates
  const bytesPerPixel = {
    jpg: 0.25,
    jpeg: 0.25,
    png: 0.8,
    webp: 0.15,
    gif: 0.4,
    default: 0.3
  };
  
  const format = extension?.toLowerCase() || 'unknown';
  const pixelEstimate = fileSize / (bytesPerPixel[format as keyof typeof bytesPerPixel] || bytesPerPixel.default);
  
  // Assume square-ish image with 4:3 aspect ratio
  const estimatedWidth = Math.round(Math.sqrt(pixelEstimate * (4/3)));
  const estimatedHeight = Math.round(estimatedWidth * (3/4));
  
  return {
    width: estimatedWidth,
    height: estimatedHeight,
    format
  };
}