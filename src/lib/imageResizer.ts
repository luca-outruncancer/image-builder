// src/lib/imageResizer.ts
import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
import { IMAGE_SETTINGS, FEATURES } from '@/utils/constants';
import { imageLogger } from '@/utils/logger/index';

interface ResizeOptions {
  width: number;
  height: number;
  fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
  position?: string | number;
  format?: 'jpeg' | 'png' | 'webp' | 'avif';
  quality?: number;
  background?: string;
  // Option to override global quality setting
  highQuality?: boolean;
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
 * Enhanced to prioritize image quality while still managing file size
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
    // Check if high quality processing is enabled globally
    const highQualityEnabled = typeof options.highQuality !== 'undefined' 
      ? options.highQuality 
      : IMAGE_SETTINGS.HIGH_QUALITY_MODE && FEATURES.HIGH_QUALITY_IMAGES;
    
    imageLogger.info('Starting resize operation', {
      targetPath,
      targetWidth: options.width,
      targetHeight: options.height,
      originalSize: `${(originalSize / 1024).toFixed(1)}KB`,
      format: options.format || 'original',
      highQuality: highQualityEnabled
    });

    // Get input image metadata
    const metadata = await sharp(sourceBuffer).metadata();
    imageLogger.debug('Original image metadata', {
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
      hasAlpha: metadata.hasAlpha
    });
    
    // Choose output format based on needs and settings
    const hasTransparency = metadata.hasAlpha || metadata.format === 'png' || metadata.format === 'webp';
    
    // Determine output format based on constants and image properties
    let outputFormat = options.format;
    if (!outputFormat) {
      // If a specific format is preferred in constants
      if (IMAGE_SETTINGS.FORMAT_SETTINGS.PREFER_FORMAT) {
        outputFormat = IMAGE_SETTINGS.FORMAT_SETTINGS.PREFER_FORMAT as 'jpeg' | 'png' | 'webp' | 'avif';
      } 
      // If we should preserve original format when possible
      else if (IMAGE_SETTINGS.FORMAT_SETTINGS.PREFER_ORIGINAL && metadata.format) {
        if (metadata.format === 'jpeg' || metadata.format === 'png' || 
            metadata.format === 'webp' || metadata.format === 'avif') {
          outputFormat = metadata.format as 'jpeg' | 'png' | 'webp' | 'avif';
        }
      }
      
      // If we need to preserve transparency and format doesn't support it
      if (hasTransparency && IMAGE_SETTINGS.PRESERVE_TRANSPARENCY) {
        if (outputFormat === 'jpeg') {
          outputFormat = 'png';
        }
      }
      
      // Default format if still not determined
      if (!outputFormat) {
        outputFormat = hasTransparency ? 'png' : 
          (metadata.format === 'jpeg' ? 'jpeg' : 'webp');
      }
    }
    
    // Configure Sharp with basic error handling
    let sharpInstance = sharp(sourceBuffer, { 
      failOnError: false,
    });
    
    // Apply resize operation with settings from constants
    sharpInstance = sharpInstance.resize({
      width: options.width,
      height: options.height,
      fit: options.fit || IMAGE_SETTINGS.DEFAULT_FIT,
      position: options.position || 'center',
      background: options.background || { r: 0, g: 0, b: 0, alpha: 0 },
      // Improve quality with these settings
      withoutEnlargement: false, // Allow enlargement if needed
      withoutReduction: false,
      kernel: IMAGE_SETTINGS.ADVANCED.KERNEL,
    });
    
    // Determine quality based on image size if adaptive quality is enabled
    const determineQuality = () => {
      // First check if quality was explicitly set in options
      if (options.quality) return options.quality;
      
      // Otherwise, use adaptive quality if enabled
      if (IMAGE_SETTINGS.SIZE_ADAPTIVE_QUALITY) {
        const totalPixels = options.width * options.height;
        
        if (totalPixels <= IMAGE_SETTINGS.SMALL_IMAGE_THRESHOLD) {
          return IMAGE_SETTINGS.SMALL_IMAGE_QUALITY;
        } else if (totalPixels <= IMAGE_SETTINGS.MEDIUM_IMAGE_THRESHOLD) {
          return IMAGE_SETTINGS.MEDIUM_IMAGE_QUALITY;
        } else {
          return IMAGE_SETTINGS.LARGE_IMAGE_QUALITY;
        }
      }
      
      // Fall back to the default quality setting
      return highQualityEnabled ? IMAGE_SETTINGS.QUALITY.DEFAULT : 80;
    };
    
    // Apply format-specific settings from constants
    switch(outputFormat) {
      case 'jpeg':
        sharpInstance = sharpInstance.jpeg({ 
          quality: determineQuality(),
          // Better JPEG options
          trellisQuantisation: true,
          overshootDeringing: true,
          optimiseScans: true,
          mozjpeg: IMAGE_SETTINGS.ADVANCED.MOZJPEG
        });
        break;
      case 'png':
        sharpInstance = sharpInstance.png({ 
          // Use compression level from constants
          compressionLevel: IMAGE_SETTINGS.QUALITY.PNG_COMPRESSION,
          adaptiveFiltering: true,
          palette: false 
        });
        break;
      case 'webp':
        sharpInstance = sharpInstance.webp({ 
          quality: determineQuality(),
          // Use settings from constants
          lossless: hasTransparency && IMAGE_SETTINGS.ADVANCED.USE_LOSSLESS_FOR_TRANSPARENCY,
          nearLossless: hasTransparency && IMAGE_SETTINGS.ADVANCED.USE_LOSSLESS_FOR_TRANSPARENCY,
          smartSubsample: true,
          effort: IMAGE_SETTINGS.ADVANCED.EFFORT_LEVEL
        });
        break;
      case 'avif':
        sharpInstance = sharpInstance.avif({ 
          quality: determineQuality(),
          effort: 5 // Range 0-9, lower is faster but lower quality
        });
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
    imageLogger.info('Successfully resized image', {
      path: targetPath,
      originalSize: `${(originalSize / 1024).toFixed(1)}KB`,
      newSize: `${(fileStats.size / 1024).toFixed(1)}KB`,
      compressionRatio: compressionRatio.toFixed(2),
      dimensions: `${finalMetadata.width}x${finalMetadata.height}`,
      format: outputFormat,
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
    const err = error instanceof Error ? error : new Error(String(error));
    imageLogger.error('Error resizing image', err, {
      targetPath,
      width: options.width,
      height: options.height,
      format: options.format
    });
    
    // If we have a resized buffer but writing failed, try saving it one more time
    if (resizedBuffer) {
      try {
        await fs.writeFile(targetPath, resizedBuffer);
        const fileStats = await fs.stat(targetPath);
        
        const endTime = performance.now();
        imageLogger.info('Recovered from write error on second attempt', {
          targetPath,
          size: fileStats.size,
          processingTimeMs: Math.round(endTime - startTime)
        });
        
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
      } catch (writeError) {
        const writeErr = writeError instanceof Error ? writeError : new Error(String(writeError));
        imageLogger.error('Failed to save image on second attempt', writeErr, {
          targetPath
        });
        
        // If all else fails, write the original file as a fallback
        try {
          imageLogger.warn('Falling back to original image', {
            targetPath,
            originalSize
          });
          
          await fs.writeFile(targetPath, sourceBuffer);
          const fileStats = await fs.stat(targetPath);
          const endTime = performance.now();
          
          return {
            success: false,
            path: targetPath,
            format: 'unknown',
            originalSize,
            resizedSize: fileStats.size,
            width: options.width,
            height: options.height,
            processingTimeMs: Math.round(endTime - startTime),
            error: writeErr
          };
        } catch (fallbackError) {
          const fallbackErr = fallbackError instanceof Error ? fallbackError : new Error(String(fallbackError));
          imageLogger.error('Failed to save fallback image', fallbackErr, {
            targetPath,
            originalSize
          });
          
          return {
            success: false,
            path: targetPath,
            format: 'unknown',
            originalSize,
            resizedSize: 0,
            width: options.width,
            height: options.height,
            processingTimeMs: Math.round(performance.now() - startTime),
            error: fallbackErr
          };
        }
      }
    }
    
    // If all else fails, write the original file as a fallback
    try {
      imageLogger.warn('Falling back to original image', {
        targetPath,
        originalSize
      });
      
      await fs.writeFile(targetPath, sourceBuffer);
      const fileStats = await fs.stat(targetPath);
      const endTime = performance.now();
      
      return {
        success: false,
        path: targetPath,
        format: 'unknown',
        originalSize,
        resizedSize: fileStats.size,
        width: options.width,
        height: options.height,
        processingTimeMs: Math.round(endTime - startTime),
        error: err
      };
    } catch (fallbackError) {
      const fallbackErr = fallbackError instanceof Error ? fallbackError : new Error(String(fallbackError));
      imageLogger.error('Failed to save fallback image', fallbackErr, {
        targetPath,
        originalSize
      });
      
      return {
        success: false,
        path: targetPath,
        format: 'unknown',
        originalSize,
        resizedSize: 0,
        width: options.width,
        height: options.height,
        processingTimeMs: Math.round(performance.now() - startTime),
        error: fallbackErr
      };
    }
  }
}

/**
 * Determines the optimal image format based on input size, type and quality needs
 * Uses constants for configurable behavior
 * 
 * @param originalFormat The original image format
 * @param fileSize Size in bytes
 * @returns The recommended output format
 */
export function determineOptimalFormat(originalFormat: string, fileSize: number): 'jpeg' | 'png' | 'webp' | 'avif' {
  // If a specific format is preferred in settings, use that
  if (IMAGE_SETTINGS.FORMAT_SETTINGS.PREFER_FORMAT) {
    const preferredFormat = IMAGE_SETTINGS.FORMAT_SETTINGS.PREFER_FORMAT;
    if (['jpeg', 'png', 'webp', 'avif'].includes(preferredFormat)) {
      return preferredFormat as 'jpeg' | 'png' | 'webp' | 'avif';
    }
  }
  
  // If we should prefer original format
  if (IMAGE_SETTINGS.FORMAT_SETTINGS.PREFER_ORIGINAL) {
    // Make sure it's a valid format we support
    if (['jpeg', 'jpg', 'png', 'webp', 'avif'].includes(originalFormat)) {
      // Normalize 'jpg' to 'jpeg'
      if (originalFormat === 'jpg') return 'jpeg';
      return originalFormat as 'jpeg' | 'png' | 'webp' | 'avif';
    }
  }
  
  // Standard selection logic as fallback
  
  // Preserve PNG for transparency support if enabled
  if (originalFormat === 'png' && IMAGE_SETTINGS.PRESERVE_TRANSPARENCY) {
    // For large PNGs, suggest webp which supports transparency with better compression
    return fileSize > 500 * 1024 ? 'webp' : 'png';
  }
  
  // Keep original format if it's already optimized
  if (originalFormat === 'webp') {
    return 'webp';
  }
  
  // For JPEG images
  if (originalFormat === 'jpeg' || originalFormat === 'jpg') {
    // Keep as JPEG for compatibility and quality
    return 'jpeg';
  }
  
  // Default to WebP for good balance of quality and compression
  return 'webp';
}