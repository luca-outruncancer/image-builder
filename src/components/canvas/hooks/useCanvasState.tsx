// src/components/canvas/hooks/useCanvasState.tsx
'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { CANVAS_WIDTH, CANVAS_HEIGHT, GRID_SIZE } from '@/utils/constants';
import { useImageStore } from '@/store/useImageStore';
import { useWallet } from '@solana/wallet-adapter-react';
import { getImageRecords, updateImageStatus, IMAGE_STATUS, ImageRecord } from '@/lib/imageStorage';
import { usePaymentContext } from '@/lib/payment/PaymentContext';
import { PaymentStatus } from '@/lib/payment/types';
import { debounce, clearSessionBlockhashData } from '@/lib/payment/utils';

interface PlacedImage {
  id: string;
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
  status: number;
  file?: File;
  cost?: number;
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
  handleConfirmPlacement: () => Promise<void>;
  handleCancelPlacement: () => void;
  handleDone: () => void;
  handleRetryPayment: () => void;
  snapToGrid: (value: number) => number;
  isPositionEmpty: (x: number, y: number, width: number, height: number, excludeId?: string) => boolean;
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
    console.log("Resetting canvas state");
    setTempImage(null);
    setPendingConfirmation(null);
    setPaymentError(null);
    resetPayment();
    clearSessionBlockhashData();
  }, [resetPayment]);

  // Load placed images from the database
  useEffect(() => {
    const loadPlacedImages = async () => {
      try {
        setIsLoadingImages(true);
        console.log("Fetching placed images from database...");
        // Get images with status 1 (confirmed) or 2 (pending payment)
        const records = await getImageRecords();
        
        if (records && Array.isArray(records)) {
          console.log(`Found ${records.length} image records`);
          const loadedImages = records.map(record => ({
            id: record.image_id.toString(),
            src: record.image_location,
            x: record.start_position_x,
            y: record.start_position_y,
            width: record.size_x,
            height: record.size_y,
            status: record.image_status
          }));
          setPlacedImages(loadedImages);
        } else {
          console.warn('No image records found or invalid records format');
          setPlacedImages([]);
        }
      } catch (error) {
        console.error('Failed to load placed images:', error);
        // Continue with empty array
        setPlacedImages([]);
      } finally {
        setIsLoadingImages(false);
      }
    };

    loadPlacedImages();
  }, []);

  // Handle image to place from the store
  useEffect(() => {
    if (imageToPlace) {
      console.log("New image to place received:", {
        width: imageToPlace.width,
        height: imageToPlace.height,
        cost: imageToPlace.cost
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
        status: IMAGE_STATUS.PENDING_PAYMENT, // Initial status
        file: imageToPlace.file,
        cost: imageToPlace.cost || 0
      });
      
      setImageToPlace(null);
    }
  }, [imageToPlace, setImageToPlace, resetState]);

  // Update UI when error or success changes
  useEffect(() => {
    if (error) {
      setPaymentError(error.message);
    } else {
      setPaymentError(null);
    }
  }, [error]);

  // Update placed images when payment succeeds
  useEffect(() => {
    if (successInfo && pendingConfirmation) {
      // Update the placed image status in the UI
      setPlacedImages(prev => prev.map(img => 
        img.id === successInfo.metadata?.imageId.toString()
          ? { ...img, status: IMAGE_STATUS.CONFIRMED } 
          : img
      ));
      
      // Clear temporary states
      setTempImage(null);
      setPendingConfirmation(null);
    }
  }, [successInfo, pendingConfirmation]);

  const snapToGrid = (value: number) => Math.round(value / GRID_SIZE) * GRID_SIZE;

  const isPositionEmpty = (x: number, y: number, width: number, height: number, excludeId?: string) => {
    return !placedImages.some(img => {
      if (img.id === excludeId) return false;
      return !(x + width <= img.x || x >= img.x + img.width ||
               y + height <= img.y || y >= img.y + img.height);
    });
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
      setPendingConfirmation(tempImage);
    }
  };

  const handleCancel = () => {
    resetState();
    window.location.reload();
  };
  
  const handleBack = () => {
    const currentTempImage = tempImage;
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
        console.log("Already processing submission, ignoring duplicate request");
        return;
      }
  
      if (!tempImage?.file) {
        console.error("No file to upload");
        setPaymentError("Missing image file");
        setIsSubmitting(false);
        return;
      }
      
      if (!connected) {
        console.error("Wallet not connected");
        setPaymentError("Please connect your wallet to continue");
        setIsSubmitting(false);
        return;
      }
      
      if (!publicKey) {
        console.error("No public key available");
        setPaymentError("Cannot access wallet public key");
        setIsSubmitting(false);
        return;
      }
  
      const cost = tempImage.cost || 0;
      console.log(`Processing payment of ${cost}`);
      
      if (cost <= 0) {
        console.error("Invalid cost:", cost);
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
       
        console.log("Uploading image to server...");
        
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
        console.log("Upload response:", data);
        
        if (!data.success) {
          throw new Error(data.error || "Unknown server error");
        }
        
        // Store the image record
        imageRecord = data.record;
        
        console.log("Image uploaded successfully, ID:", imageRecord.image_id);
        
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
            status: IMAGE_STATUS.PENDING_PAYMENT,
            cost: tempImage.cost
          }
        ]);
        
      } catch (uploadError) {
        console.error("Failed to upload image:", uploadError);
        setPaymentError(`Failed to upload image: ${uploadError instanceof Error ? uploadError.message : "Server error"}`);
        setIsSubmitting(false);
        return;
      }
      
      if (!imageRecord) {
        console.error("No image record created");
        setPaymentError("Failed to create image record. Please try again.");
        setIsSubmitting(false);
        return;
      }
      
      // STEP 2: Initialize payment
      const imageId = parseInt(imageRecord.image_id.toString());
      
      const paymentId = await initializePayment(cost, {
        imageId: imageId,
        positionX: tempImage.x,
        positionY: tempImage.y,
        width: tempImage.width,
        height: tempImage.height,
        fileName: tempImage.file.name
      });
      
      if (!paymentId) {
        console.error("Failed to initialize payment");
        
        // Update image status to error
        try {
          await updateImageStatus(imageId, IMAGE_STATUS.PAYMENT_FAILED);
          // Remove the pending image from the canvas
          setPlacedImages(prev => prev.filter(img => img.id !== imageId.toString()));
        } catch (updateError) {
          console.error("Failed to update image status after init error:", updateError);
        }
        
        setIsSubmitting(false);
        return;
      }
      
      // STEP 3: Process payment
      try {
        const success = await processPayment(paymentId);
        
        if (!success) {
          // Change log level for user rejections
          if (error?.category === 'user_rejection') {
            console.log("User rejected the transaction");
          } else {
            console.error("Payment failed:", error?.message);
          }
          
          // Handle user rejection 
          if (error?.category === 'user_rejection') {
            console.log("User rejected the transaction - returning to confirmation screen");
            setIsSubmitting(false);
            return;
          }
          
          // Handle duplicate transaction error specifically
          if (error?.code === 'DUPLICATE_TRANSACTION') {
            console.log("Detected duplicate transaction, need to refresh");
            
            // Clean up any session data
            clearSessionBlockhashData();
            
            // If we have a transaction hash, mark as success
            if (error.originalError?.transactionHash) {
              console.log("Found transaction hash in error, marking as success:", error.originalError.transactionHash);
              
              // Update image status to success
              try {
                await updateImageStatus(imageId, IMAGE_STATUS.CONFIRMED, true);
                
                // Update the UI
                setPlacedImages(prev => prev.map(img => 
                  img.id === imageId.toString()
                    ? { ...img, status: IMAGE_STATUS.CONFIRMED }
                    : img
                ));
                
                // Cleanup and reset
                setTempImage(null);
                setPendingConfirmation(null);
                resetPayment();
                
                setIsSubmitting(false);
                return;
              } catch (updateError) {
                console.error("Failed to update image status after handling duplicate transaction:", updateError);
              }
            }
            
            // If we couldn't recover, show error and ask user to refresh
            setPaymentError("Transaction already processed. Please refresh the page and try again.");
            setIsSubmitting(false);
            return;
          }
          
          // Handle timeout specifically
          if (error?.category === 'timeout_error') {
            // Clean up any records created for this session
            try {
              await updateImageStatus(imageId, IMAGE_STATUS.PAYMENT_TIMEOUT);
              setPlacedImages(prev => prev.filter(img => img.id !== imageId.toString()));
            } catch (updateError) {
              console.log("Failed to update image status after timeout:", updateError);
            }
          }
          
          // Otherwise, we update image status to failed and remove it from canvas
          try {
            await updateImageStatus(imageId, IMAGE_STATUS.PAYMENT_FAILED);
            // Remove the pending image from the canvas
            setPlacedImages(prev => prev.filter(img => img.id !== imageId.toString()));
          } catch (updateError) {
            console.error("Failed to update image status after payment error:", updateError);
          }
          
          setIsSubmitting(false);
          return;
        }
        
        // Clean up on successful payment
        console.log("Payment successful, refreshing page...");
        window.location.reload();
      } catch (processingError) {
        console.error("Error during payment processing:", processingError);
        setPaymentError(`Payment processing error: ${processingError instanceof Error ? processingError.message : "Unknown error"}`);
        
        // Update image status to failed
        try {
          await updateImageStatus(imageId, IMAGE_STATUS.PAYMENT_FAILED);
          // Remove the pending image from the canvas
          setPlacedImages(prev => prev.filter(img => img.id !== imageId.toString()));
        } catch (updateError) {
          console.error("Failed to update image status after payment error:", updateError);
        }
        
        setIsSubmitting(false);
      }
    }, 500), // 500ms debounce time
    [tempImage, connected, publicKey, initializePayment, processPayment, error, resetPayment]
  );

  const handleConfirmPlacement = useCallback(async () => {
    // Check if we're already processing - prevent double clicks
    if (isPaymentProcessing || isSubmitting) {
      console.log("Payment already in progress, ignoring duplicate request");
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
    console.log("Payment complete, resetting state for new transaction");
    
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
    if (error?.category === 'blockchain_error' && error.code === 'DUPLICATE_TRANSACTION') {
      resetState();
      window.location.reload();
      return;
    }
    
    // Clean blockchain state
    clearSessionBlockhashData();
    
    // Otherwise, try to process the payment again
    handleConfirmPlacement();
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
    canvasRef,
    
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
  };
}