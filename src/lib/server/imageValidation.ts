// src/lib/server/imageValidation.ts
import { MAX_FILE_SIZE } from '@/utils/constants';
import { imageLogger } from '@/utils/logger';

export interface ImageValidationResult {
  isValid: boolean;
  error?: string;
  dimensions?: {
    width: number;
    height: number;
  };
}

export interface ImageMetadata {
  width: number;
  height: number;
  format: string;
}

const VALID_FORMATS = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Validate image file and optionally get dimensions
 */
export const validateImage = (file: File, getDimensions = false): Promise<ImageValidationResult> => {
  return new Promise((resolve) => {
    // Size validation
    if (file.size > MAX_FILE_SIZE) {
      const error = `File size must be less than ${MAX_FILE_SIZE / (1024 * 1024)}MB`;
      imageLogger.warn('File size validation failed', { size: file.size, maxSize: MAX_FILE_SIZE });
      resolve({
        isValid: false,
        error
      });
      return;
    }

    // Format validation
    if (!VALID_FORMATS.includes(file.type)) {
      const error = 'Invalid file format. Supported formats: JPG, PNG, WebP';
      imageLogger.warn('File format validation failed', { type: file.type });
      resolve({
        isValid: false,
        error
      });
      return;
    }

    // If dimensions not needed, return early
    if (!getDimensions) {
      resolve({ isValid: true });
      return;
    }

    // Get dimensions if needed
    const img = new Image();
    img.onload = () => {
      const dimensions = {
        width: img.width,
        height: img.height
      };
      
      imageLogger.debug('Image dimensions obtained', { 
        filename: file.name,
        ...dimensions
      });
      
      resolve({
        isValid: true,
        dimensions
      });
      URL.revokeObjectURL(img.src); // Cleanup
    };

    img.onerror = () => {
      const error = 'Failed to read image file';
      imageLogger.error('Image load failed', new Error(error), { filename: file.name });
      resolve({
        isValid: false,
        error
      });
    };

    img.src = URL.createObjectURL(file);
  });
}; 