// src/components/canvas/hooks/useCanvasState.tsx
'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { CANVAS_WIDTH, CANVAS_HEIGHT, GRID_SIZE } from '@/utils/constants';
import { useImageStore } from '@/store/useImageStore';
import { useWallet } from '@solana/wallet-adapter-react';
import { getPlacedImages, updateImageStatus, ImageRecord } from '@/lib/imageStorage';
import { usePaymentContext } from '@/lib/payment/context';
import { PaymentStatus, ErrorCategory } from '@/lib/payment/types';
import { debounce, clearSessionBlockhashData } from '@/lib/payment/utils';
import { canvasLogger, imageLogger } from '@/utils/logger/index';
import { getImageStatusFromPaymentStatus } from '@/lib/payment/utils/storageUtils';
import { PlacedImage } from '@/types/canvas';

// Add error context interfaces
interface LoggerErrorContext {
  error?: Error;
  imageId?: number | string;
  transactionHash?: string;
  cost?: number;
}

interface LoggerContext {
  imageId?: number | string;
  transactionHash?: string;
  cost?: number;
  error?: Error;
  position?: { x: number; y: number };
  size?: { width: number; height: number };
}

// Add metadata context interface
interface LoggerMetadata {
  imageId?: number | string;
  transactionHash?: string;
  cost?: number;
  position?: { x: number; y: number };
  size?: { width: number; height: number };
}

export interface CanvasState {
  placedImages: PlacedImage[];
  tempImage: PlacedImage | null;
  pendingConfirmation: PlacedImage | null;
  paymentError: string | null;
  isPaymentProcessing: boolean;
  mousePosition: { x: number; y: number };
  isLoadingImages: boolean;
  canvasRef: React.RefObject<HTMLDivElement>;
  
  // Methods
  setPlacedImages: (images: PlacedImage[]) => void;
  setTempImage: (image: PlacedImage | null) => void;
  setPendingConfirmation: (image: PlacedImage | null) => void;
  setPaymentError: (error: string | null) => void;
  setMousePosition: (position: { x: number; y: number }) => void;
  handleMouseMove: (e: React.MouseEvent) => void;
  handleMouseUp: () => void;
  handleCancel: () => void;
  handleBack: () => void;
  handleConfirmPlacement: () => void;
  handleCancelPlacement: () => void;
  handleDone: () => void;
  handleRetryPayment: () => void;
  snapToGrid: (value: number) => number;
  isPositionEmpty: (x: number, y: number, width: number, height: number, excludeId?: string) => boolean;
  handleImageUpload: (image: PlacedImage) => Promise<{ success: boolean; imageId?: number; error?: any }>;
}

export function useCanvasState(): CanvasState {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [placedImages, setPlacedImages] = useState<PlacedImage[]>([]);
  const [tempImage, setTempImage] = useState<PlacedImage | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState<PlacedImage | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isLoadingImages, setIsLoadingImages] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const imageToPlace = useImageStore(state => state.imageToPlace);
  const setImageToPlace = useImageStore(state => state.setImageToPlace);
  const { publicKey, connected } = useWallet();
  
  // Get payment service from context
  const { 
    initializePayment, 
    processPayment, 
    cancelPayment, 
    resetPayment,
    isProcessing: isPaymentProcessing,
    error,
    successInfo
  } = usePaymentContext();

  // Reset state when payment is complete or when component unmounts
  const resetState = useCallback(() => {
    canvasLogger.debug('Resetting canvas state');
    setTempImage(null);
    setPendingConfirmation(null);
    setPaymentError(null);
    resetPayment();
    clearSessionBlockhashData();
  }, [resetPayment]);

  // Handle image record update
  const handleImageRecordUpdate = useCallback(async (imageRecord: ImageRecord | null, tempImage: PlacedImage) => {
    if (!imageRecord) {
      canvasLogger.error('Image record is null', undefined, { context: 'handleImageRecordUpdate' });
      return null;
    }

    try {
      // Map string status to PaymentStatus enum for updateImageStatus
      const status = imageRecord.status === 'CONFIRMED' 
        ? PaymentStatus.CONFIRMED 
        : PaymentStatus.PENDING;
      
      await updateImageStatus(imageRecord.image_id, status);
      
      return {
        id: imageRecord.image_id.toString(),
        src: imageRecord.image_location,
        x: imageRecord.start_position_x,
        y: imageRecord.start_position_y,
        width: imageRecord.size_x,
        height: imageRecord.size_y,
        status,
        cost: tempImage.cost
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const metadata: LoggerMetadata = {
        imageId: imageRecord.image_id
      };
      canvasLogger.error('Failed to update image status', err, metadata);
      return null;
    }
  }, []);

  // Load placed images from the database
  useEffect(() => {
    const loadPlacedImages = async () => {
      try {
        setIsLoadingImages(true);
        canvasLogger.info('Fetching placed images from database');
        
        // Get images with status CONFIRMED
        const { success, data: records, error } = await getPlacedImages();
        
        if (success && records && Array.isArray(records)) {
          canvasLogger.info('Successfully loaded placed images', {
            count: records.length,
            confirmedCount: records.filter(r => r.status === 'CONFIRMED').length,
            pendingCount: records.filter(r => r.status === 'PENDING').length
          });
          
          const loadedImages = records.map(record => ({
            id: record.image_id.toString(),
            src: record.image_location,
            x: record.start_position_x,
            y: record.start_position_y,
            width: record.size_x,
            height: record.size_y,
            status: record.status
          }));
          setPlacedImages(loadedImages);
        } else {
          canvasLogger.warn('No image records found or invalid records format', { 
            success, 
            error,
            recordsExist: !!records,
            isArray: Array.isArray(records)
          });
          
          // If there's an error with Supabase, retry after a delay
          if (error && error.message && (
              error.message.includes('Failed to fetch') || 
              error.message.includes('network') ||
              error.message.includes('Database client not available')
            )) {
            canvasLogger.info('Will retry loading images in 2 seconds');
            setTimeout(() => {
              canvasLogger.info('Retrying image load');
              loadPlacedImages();
            }, 2000);
          } else {
            setPlacedImages([]);
          }
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        canvasLogger.error('Failed to load placed images', err);
        
        // Retry after a delay for any error
        canvasLogger.info('Will retry loading images in 3 seconds after error');
        setTimeout(() => {
          canvasLogger.info('Retrying image load after error');
          loadPlacedImages();
        }, 3000);
      } finally {
        setIsLoadingImages(false);
      }
    };

    loadPlacedImages();
  }, []);

  // Handle image to place from the store
  useEffect(() => {
    if (imageToPlace) {
      canvasLogger.debug('New image to place received', {
        width: imageToPlace.width,
        height: imageToPlace.height,
        cost: imageToPlace.cost,
        hasFile: !!imageToPlace.file
      });
      
      // Clear any previous state
      resetState();
      
      setTempImage({
        id: Date.now().toString(),
        src: imageToPlace.previewUrl,
        x: 0,
        y: 0,
        width: imageToPlace.width,
        height: imageToPlace.height,
        status: 'INITIALIZED',
        file: imageToPlace.file,
        cost: imageToPlace.cost || 0
      });
      
      setImageToPlace(null);
    }
  }, [imageToPlace, setImageToPlace, resetState]);

  // Update UI when error or success changes
  useEffect(() => {
    if (error) {
      canvasLogger.warn('Payment error received', {
        errorMessage: error.message,
        errorCategory: error.category,
        errorCode: error.code
      });
      setPaymentError(error.message);
    } else {
      setPaymentError(null);
    }
  }, [error]);

  // Update placed images when payment succeeds
  useEffect(() => {
    if (successInfo && pendingConfirmation) {
      canvasLogger.info('Payment successful, updating placed images', {
        imageId: successInfo.metadata?.imageId,
        transactionHash: successInfo.transactionHash,
        timestamp: successInfo.timestamp
      });
      
      // Update the placed image status in the UI
      setPlacedImages(prev => prev.map(img => 
        img.id === successInfo.metadata?.imageId.toString()
          ? { ...img, status: 'CONFIRMED' } 
          : img
      ));
      
      // Clear temporary states
      setTempImage(null);
      setPendingConfirmation(null);
    }
  }, [successInfo, pendingConfirmation]);

  const snapToGrid = (value: number) => Math.round(value / GRID_SIZE) * GRID_SIZE;

  const isPositionEmpty = (x: number, y: number, width: number, height: number, excludeId?: string) => {
    const isEmpty = !placedImages.some(img => {
      if (img.id === excludeId) return false;
      return !(x + width <= img.x || x >= img.x + img.width ||
               y + height <= img.y || y >= img.y + img.height);
    });
    
    if (!isEmpty) {
      canvasLogger.debug('Position collision detected', {
        position: { x, y },
        size: { width, height },
        excludeId
      });
    }
    
    return isEmpty;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!canvasRef.current || !tempImage || pendingConfirmation) return; 
    
    const rect = canvasRef.current.getBoundingClientRect();
    
    // Get the current scale factor of the canvas
    const scaleX = CANVAS_WIDTH / rect.width;
    const scaleY = CANVAS_HEIGHT / rect.height;
    
    // Calculate the actual position within the original canvas dimensions
    const canvasX = (e.clientX - rect.left) * scaleX;
    const canvasY = (e.clientY - rect.top) * scaleY;
    
    // Snap to grid
    const x = snapToGrid(canvasX - tempImage.width / 2);
    const y = snapToGrid(canvasY - tempImage.height / 2);
    
    // Constrain to canvas boundaries
    const newX = Math.max(0, Math.min(x, CANVAS_WIDTH - tempImage.width));
    const newY = Math.max(0, Math.min(y, CANVAS_HEIGHT - tempImage.height));
    
    if (isPositionEmpty(newX, newY, tempImage.width, tempImage.height)) {
      setTempImage(prev => prev ? { ...prev, x: newX, y: newY } : null);
    }
    
    // Store position for other purposes (like tooltips)
    setMousePosition({ x: canvasX, y: canvasY });
  };

  const handleMouseUp = () => {
    if (tempImage) {
      canvasLogger.debug('Image placement confirmed', {
        position: { x: tempImage.x, y: tempImage.y },
        size: { width: tempImage.width, height: tempImage.height }
      });
      setPendingConfirmation(tempImage);
    }
  };

  const handleCancel = () => {
    canvasLogger.debug('User canceled image placement');
    resetState();
    window.location.reload();
  };
  
  const handleBack = () => {
    const currentTempImage = tempImage;
    canvasLogger.debug('User went back from placement confirmation', {
      hasImage: !!currentTempImage,
      position: currentTempImage ? { x: currentTempImage.x, y: currentTempImage.y } : null
    });
    
    setTempImage(null);
    setPendingConfirmation(null);
    resetPayment();
    clearSessionBlockhashData();
    
    if (currentTempImage?.file) {
      setImageToPlace({
        file: currentTempImage.file,
        width: currentTempImage.width,
        height: currentTempImage.height,
        previewUrl: currentTempImage.src,
        cost: currentTempImage.cost
      });
    }
  };

  // Debounced version of confirm placement to prevent double submissions
  const debouncedConfirmPlacement = useCallback(
    debounce(async () => {
      if (isSubmitting) {
        canvasLogger.warn("Already processing submission, ignoring duplicate request");
        return;
      }
  
      if (!tempImage?.file) {
        canvasLogger.error("No file to upload");
        setPaymentError("Missing image file");
        setIsSubmitting(false);
        return;
      }
      
      if (!connected) {
        canvasLogger.error("Wallet not connected");
        setPaymentError("Please connect your wallet to continue");
        setIsSubmitting(false);
        return;
      }
      
      if (!publicKey) {
        canvasLogger.error("No public key available");
        setPaymentError("Cannot access wallet public key");
        setIsSubmitting(false);
        return;
      }
  
      const cost = tempImage.cost;
      canvasLogger.info(`Processing payment`, { cost });
      
      if (!cost || cost <= 0) {
        const err = new Error(`Invalid cost: ${cost}`);
        canvasLogger.error(err.message, err);
        setPaymentError("Invalid payment amount");
        setIsSubmitting(false);
        return;
      }
      
      // Clear session storage before starting a new transaction
      clearSessionBlockhashData();
      
      // STEP 1: Create image record with pending payment status
      let imageRecord: ImageRecord | null = null;
      
      try {
        const formData = new FormData();
        formData.append('file', tempImage.file);
        formData.append('position', JSON.stringify({ x: tempImage.x, y: tempImage.y }));
        formData.append('size', JSON.stringify({ width: tempImage.width, height: tempImage.height }));
        
        // Add wallet address
        if (publicKey) {
          formData.append('wallet', publicKey.toString());
        }
       
        canvasLogger.info("Uploading image to server...");
        
        // Upload the image file first
        const response = await fetch('/api/upload', {
          method: 'POST',
          body: formData
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Server error: ${response.status} - ${errorText}`);
        }
        
        const data = await response.json();
        canvasLogger.debug("Upload response received", { data });
        
        if (!data.success || !data.record) {
          throw new Error("No image record created in response");
        }
        
        // Store the image record
        imageRecord = data.record;
        
        canvasLogger.info("Image uploaded successfully", { imageId: imageRecord?.image_id });
        
      } catch (uploadError) {
        const err = uploadError instanceof Error ? uploadError : new Error(String(uploadError));
        canvasLogger.error("Failed to upload image", err);
        setPaymentError(`Failed to upload image: ${err.message}`);
        setIsSubmitting(false);
        return;
      }
      
      if (!imageRecord) {
        const err = new Error("No image record created");
        canvasLogger.error(err.message, err);
        setPaymentError("Failed to create image record. Please try again.");
        setIsSubmitting(false);
        return;
      }
      
      // Add the image to the canvas with pending status
      setPlacedImages(prev => [
        ...prev,
        {
          id: imageRecord!.image_id.toString(),
          src: imageRecord!.image_location,
          x: imageRecord!.start_position_x,
          y: imageRecord!.start_position_y,
          width: imageRecord!.size_x,
          height: imageRecord!.size_y,
          status: imageRecord!.status,
          cost: tempImage.cost
        }
      ]);

      // STEP 2: Initialize payment
      const imageId = imageRecord.image_id;
      if (!imageId) {
        const err = new Error("Invalid image ID received from server");
        canvasLogger.error(err.message, err);
        setPaymentError(err.message);
        setIsSubmitting(false);
        return;
      }

      const paymentId = await initializePayment(cost, {
        imageId,
        positionX: imageRecord.start_position_x,
        positionY: imageRecord.start_position_y,
        width: imageRecord.size_x,
        height: imageRecord.size_y,
        fileName: tempImage.file.name
      });
      
      if (!paymentId) {
        const err = new Error("Failed to initialize payment");
        canvasLogger.error(err.message, err);
        
        // Update image status to error
        try {
          await updateImageStatus(imageId, PaymentStatus.FAILED);
          // Remove the pending image from the canvas
          setPlacedImages(prev => prev.filter(img => img.id !== imageId.toString()));
        } catch (updateError) {
          const err = updateError instanceof Error ? updateError : new Error(String(updateError));
          canvasLogger.error("Failed to update image status after init error", err);
        }
        
        setIsSubmitting(false);
        return;
      }
      
      // STEP 3: Process payment
      try {
        // Call processPayment and wait for result
        // Ensure we're passing a string paymentId, not the PaymentResponse object
        console.log('Processing payment with ID:', paymentId);
        
        // Extract the paymentId string if it's an object
        const paymentIdString = typeof paymentId === 'string' 
          ? paymentId 
          : (paymentId as any)?.paymentId || paymentId;
          
        const success = await processPayment(paymentIdString);
        
        if (!success) {
          // Change log level for user rejections
          if (error?.category === ErrorCategory.USER_REJECTION) {
            canvasLogger.info("User rejected the transaction");
          } else {
            const err = new Error(error?.message || "Unknown payment error");
            canvasLogger.error("Payment failed", err);
          }
          
          // Handle user rejection 
          if (error?.category === ErrorCategory.USER_REJECTION) {
            canvasLogger.info("User rejected the transaction - returning to confirmation screen");
            setIsSubmitting(false);
            return;
          }
          
          // Handle duplicate transaction error specifically
          if (error?.code === 'DUPLICATE_TRANSACTION') {
            canvasLogger.info("Detected duplicate transaction, need to refresh");
            
            // Clean up any session data
            clearSessionBlockhashData();
            
            // If we have a transaction hash, mark as success
            if (error.originalError?.transactionHash) {
              canvasLogger.info("Found transaction hash in error", { 
                transactionHash: error.originalError.transactionHash 
              });
              
              // Update image status to success
              try {
                await updateImageStatus(imageId, PaymentStatus.CONFIRMED);
                
                // Update the UI
                setPlacedImages(prev => prev.map(img => 
                  img.id === imageId.toString()
                    ? { ...img, status: PaymentStatus.CONFIRMED }
                    : img
                ));
                
                // Cleanup and reset
                setTempImage(null);
                setPendingConfirmation(null);
                resetPayment();
                
                setIsSubmitting(false);
                return;
              } catch (updateError) {
                const err = updateError instanceof Error ? updateError : new Error(String(updateError));
                canvasLogger.error("Failed to update image status after handling duplicate transaction", err);
              }
            }
            
            // If we couldn't recover, show error and ask user to refresh
            setPaymentError("Transaction already processed. Please refresh the page and try again.");
            setIsSubmitting(false);
            return;
          }
          
          // Handle timeout specifically
          if (error?.category === ErrorCategory.TIMEOUT_ERROR) {
            // Clean up any records created for this session
            try {
              await updateImageStatus(imageId, PaymentStatus.TIMEOUT);
              setPlacedImages(prev => prev.filter(img => img.id !== imageId.toString()));
            } catch (updateError) {
              const err = updateError instanceof Error ? updateError : new Error(String(updateError));
              canvasLogger.warn("Failed to update image status after timeout", err);
            }
          }
          
          // Otherwise, we update image status to failed and remove it from canvas
          try {
            await updateImageStatus(imageId, PaymentStatus.FAILED);
            // Remove the pending image from the canvas
            setPlacedImages(prev => prev.filter(img => img.id !== imageId.toString()));
          } catch (updateError) {
            const err = updateError instanceof Error ? updateError : new Error(String(updateError));
            canvasLogger.error("Failed to update image status after payment error", err);
          }
          
          setIsSubmitting(false);
          return;
        }
        
        // Clean up on successful payment
        canvasLogger.info("Payment successful, skipping page refresh for debugging");
        // window.location.reload(); // Temporarily commented out for debugging verification request
      } catch (processingError) {
        const err = processingError instanceof Error ? processingError : new Error(String(processingError));
        canvasLogger.error("Error during payment processing", err);
        setPaymentError(`Payment processing error: ${err.message}`);
        
        // Update image status to failed
        try {
          await updateImageStatus(imageId, PaymentStatus.FAILED);
          // Remove the pending image from the canvas
          setPlacedImages(prev => prev.filter(img => img.id !== imageId.toString()));
        } catch (updateError) {
          const err = updateError instanceof Error ? updateError : new Error(String(updateError));
          canvasLogger.error("Failed to update image status after payment error", err);
        }
        
        setIsSubmitting(false);
      }
    }, 500), // 500ms debounce time
    [tempImage, connected, publicKey, initializePayment, processPayment, error, resetPayment]
  );

  const handleConfirmPlacement = useCallback(async () => {
    // Check if we're already processing - prevent double clicks
    if (isPaymentProcessing || isSubmitting) {
      canvasLogger.warn("Payment already in progress, ignoring duplicate request");
      return;
    }

    // Set submitting flag to prevent duplicates
    setIsSubmitting(true);
    
    // Use our debounced version to handle the actual submission
    debouncedConfirmPlacement();
  }, [debouncedConfirmPlacement, isPaymentProcessing, isSubmitting]);

  const handleCancelPlacement = () => {
    setPendingConfirmation(null);
    resetPayment();
    clearSessionBlockhashData();
  };

  const handleDone = () => {
    canvasLogger.info("Payment complete, resetting state for new transaction");
    
    // Clean up session storage
    clearSessionBlockhashData();
    
    // Reset all state
    resetState();
    
    // Reload the page to ensure a clean state
    window.location.reload();
  };
  
  const handleRetryPayment = () => {
    setPaymentError(null);
    setIsSubmitting(false);
    
    // If there was an error about already processed transaction, reset completely
    if (error?.category === ErrorCategory.BLOCKCHAIN_ERROR && error.code === 'DUPLICATE_TRANSACTION') {
      resetState();
      window.location.reload();
      return;
    }
    
    // Clean blockchain state
    clearSessionBlockhashData();
    
    // Otherwise, try to process the payment again
    handleConfirmPlacement();
  };

  const handleImageUpload = async (tempImage: PlacedImage) => {
    try {
      const formData = new FormData();
      formData.append('file', tempImage.file!);
      formData.append('position', JSON.stringify({ x: tempImage.x, y: tempImage.y }));
      formData.append('size', JSON.stringify({ width: tempImage.width, height: tempImage.height }));

      // Add wallet address if available
      if (publicKey) {
        formData.append('wallet', publicKey.toString());
      }

      imageLogger.info({
        msg: "Uploading image to server...",
        position: { x: tempImage.x, y: tempImage.y },
        size: { width: tempImage.width, height: tempImage.height }
      });
      
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Server error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      imageLogger.debug({
        msg: "Upload response received",
        data
      });

      if (!data.success || !data.record) {
        const err = new Error("No image record created");
        imageLogger.error(err.message, err);
        return { success: false, error: "Failed to create image record" };
      }

      const imageRecord = data.record;
      imageLogger.info({
        msg: "Image uploaded successfully",
        imageId: imageRecord?.image_id,
        position: { x: imageRecord.start_position_x, y: imageRecord.start_position_y },
        size: { width: imageRecord.size_x, height: imageRecord.size_y }
      });

      setPlacedImages(prev => [
        ...prev,
        {
          id: imageRecord.image_id.toString(),
          src: imageRecord.image_location,
          x: imageRecord.start_position_x,
          y: imageRecord.start_position_y,
          width: imageRecord.size_x,
          height: imageRecord.size_y,
          status: imageRecord.status,
          cost: tempImage.cost
        }
      ]);

      return { success: true, imageId: imageRecord.image_id };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      imageLogger.error('Error uploading image', err);
      return { success: false, error: err };
    }
  };

  const handleError = (error: unknown, context: string) => {
    const err = error instanceof Error ? error : new Error(String(error));
    canvasLogger.error(`Canvas error: ${context}`, err, {
      action: context,
      position: tempImage ? { x: tempImage.x, y: tempImage.y } : undefined,
      size: tempImage ? { width: tempImage.width, height: tempImage.height } : undefined
    });
  };

  return {
    // State
    placedImages,
    tempImage,
    pendingConfirmation,
    paymentError,
    isPaymentProcessing: isPaymentProcessing || isSubmitting,
    mousePosition,
    isLoadingImages,
    canvasRef: canvasRef as React.RefObject<HTMLDivElement>,
    
    // Setters
    setPlacedImages,
    setTempImage,
    setPendingConfirmation,
    setPaymentError,
    setMousePosition,
    
    // Handlers
    handleMouseMove,
    handleMouseUp,
    handleCancel,
    handleBack,
    handleConfirmPlacement,
    handleCancelPlacement,
    handleDone,
    handleRetryPayment,
    
    // Utilities
    snapToGrid,
    isPositionEmpty,
    handleImageUpload,
  };
}