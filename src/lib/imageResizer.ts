// src/lib/imageResizer.ts
import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';

interface ResizeOptions {
  width: number;
  height: number;
  fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
  position?: string | number;
  format?: 'jpeg' | 'png' | 'webp' | 'avif';
  quality?: number;
  background?: string;
}

export interface ResizeResult {
  success: boolean;
  path: string;
  format: string;
  originalSize: number;
  resizedSize: number;
  width: number;
  height: number;
  processingTimeMs: number;
  error?: any;
}

/**
 * Resizes an image with detailed error handling and logging
 * 
 * @param sourceBuffer - Original image buffer
 * @param targetPath - Path to save the resized image
 * @param options - Resize options (width, height, fit, format, etc.)
 * @returns ResizeResult with success status and metadata
 */
export async function resizeImage(
  sourceBuffer: Buffer,
  targetPath: string,
  options: ResizeOptions
): Promise<ResizeResult> {
  const startTime = performance.now();
  const originalSize = sourceBuffer.length;
  let resizedBuffer: Buffer | null = null;
  
  try {
    console.log(`[ImageResizer] Starting resize operation for ${targetPath}`, {
      targetWidth: options.width,
      targetHeight: options.height,
      originalSize: `${(originalSize / 1024).toFixed(1)}KB`,
      format: options.format || 'original'
    });

    // Get input image metadata
    const metadata = await sharp(sourceBuffer).metadata();
    console.log(`[ImageResizer] Original image: ${metadata.width}x${metadata.height}, format: ${metadata.format}`);
    
    // Choose output format - prefer WebP for better compression unless specified
    const outputFormat = options.format || (metadata.size && metadata.size > 100000 ? 'webp' : metadata.format);
    
    // Configure Sharp with basic error handling
    let sharpInstance = sharp(sourceBuffer, { failOnError: false });
    
    // Apply resize operation
    sharpInstance = sharpInstance.resize({
      width: options.width,
      height: options.height,
      fit: options.fit || 'cover',
      position: options.position || 'center',
      background: options.background || { r: 0, g: 0, b: 0, alpha: 0 }
    });
    
    // Apply format-specific settings
    switch(outputFormat) {
      case 'jpeg':
        sharpInstance = sharpInstance.jpeg({ quality: options.quality || 85 });
        break;
      case 'png':
        sharpInstance = sharpInstance.png({ compressionLevel: 9 });
        break;
      case 'webp':
        sharpInstance = sharpInstance.webp({ quality: options.quality || 80 });
        break;
      case 'avif':
        sharpInstance = sharpInstance.avif({ quality: options.quality || 75 });
        break;
    }
    
    // Process the image
    resizedBuffer = await sharpInstance.toBuffer();
    
    // Ensure output directory exists
    const targetDir = path.dirname(targetPath);
    await fs.mkdir(targetDir, { recursive: true });
    
    // Save to disk
    await fs.writeFile(targetPath, resizedBuffer);
    
    // Get file stats from the output
    const fileStats = await fs.stat(targetPath);
    const finalMetadata = await sharp(resizedBuffer).metadata();
    
    const endTime = performance.now();
    const processingTimeMs = Math.round(endTime - startTime);
    
    // Log success with optimization metrics
    const compressionRatio = originalSize / fileStats.size;
    console.log(`[ImageResizer] Successfully resized image:`, {
      path: targetPath,
      originalSize: `${(originalSize / 1024).toFixed(1)}KB`,
      newSize: `${(fileStats.size / 1024).toFixed(1)}KB`,
      compressionRatio: compressionRatio.toFixed(2),
      dimensions: `${finalMetadata.width}x${finalMetadata.height}`,
      processingTimeMs
    });
    
    return {
      success: true,
      path: targetPath,
      format: outputFormat || finalMetadata.format || 'unknown',
      originalSize,
      resizedSize: fileStats.size,
      width: finalMetadata.width || options.width,
      height: finalMetadata.height || options.height,
      processingTimeMs
    };
  } catch (error) {
    console.error(`[ImageResizer] Error resizing image:`, error);
    
    // If we have a resized buffer but writing failed, try saving it one more time
    if (resizedBuffer) {
      try {
        await fs.writeFile(targetPath, resizedBuffer);
        const fileStats = await fs.stat(targetPath);
        
        const endTime = performance.now();
        console.log(`[ImageResizer] Recovered from write error on second attempt`);
        
        return {
          success: true,
          path: targetPath,
          format: options.format || 'unknown',
          originalSize,
          resizedSize: fileStats.size,
          width: options.width,
          height: options.height,
          processingTimeMs: Math.round(endTime - startTime)
        };
      } catch (secondError) {
        console.error(`[ImageResizer] Failed second write attempt:`, secondError);
      }
    }
    
    // If all else fails, write the original file as a fallback
    try {
      console.log(`[ImageResizer] Falling back to original image`);
      await fs.writeFile(targetPath, sourceBuffer);
      const fileStats = await fs.stat(targetPath);
      
      const endTime = performance.now();
      
      return {
        success: false,
        path: targetPath,
        format: 'original',
        originalSize,
        resizedSize: fileStats.size,
        width: options.width,
        height: options.height,
        processingTimeMs: Math.round(endTime - startTime),
        error
      };
    } catch (fallbackError) {
      console.error(`[ImageResizer] Complete failure, could not save original:`, fallbackError);
      
      return {
        success: false,
        path: targetPath,
        format: 'unknown',
        originalSize,
        resizedSize: 0,
        width: options.width,
        height: options.height,
        processingTimeMs: Math.round(performance.now() - startTime),
        error: error
      };
    }
  }
}

/**
 * Determines the optimal image format based on input size and type
 * 
 * @param originalFormat The original image format
 * @param fileSize Size in bytes
 * @returns The recommended output format
 */
export function determineOptimalFormat(originalFormat: string, fileSize: number): 'jpeg' | 'png' | 'webp' | 'avif' {
  // For small files, preserve transparency if needed
  if (fileSize < 100 * 1024 && (originalFormat === 'png' || originalFormat === 'webp')) {
    return originalFormat === 'webp' ? 'webp' : 'png';
  }
  
  // For medium-sized files use WebP for good balance
  if (fileSize < 500 * 1024) {
    return 'webp';
  }
  
  // For really large files, consider more aggressive compression
  return 'webp';
}
