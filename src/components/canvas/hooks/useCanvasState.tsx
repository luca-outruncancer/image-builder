// src/components/canvas/hooks/useCanvasState.tsx
'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { 
  CANVAS_WIDTH, 
  CANVAS_HEIGHT, 
  GRID_SIZE, 
  ACTIVE_PAYMENT_TOKEN, 
  RECIPIENT_WALLET_ADDRESS,
  PAYMENT_TIMEOUT_MS,
  MAX_RETRIES
} from '@/utils/constants';
import { useImageStore } from '@/store/useImageStore';
import { useWallet } from '@solana/wallet-adapter-react';
import { 
  getImageRecords, 
  updateImageStatus, 
  IMAGE_STATUS,
  ImageRecord
} from '@/lib/imageStorage';
import { 
  saveTransaction,
  initializeTransaction,
  updateTransactionStatus,
  TRANSACTION_STATUS,
  TransactionRecord
} from '@/lib/transactionStorage';
import { processPayment, PaymentResult } from '@/utils/solanaPayment';

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

interface SuccessInfo {
  timestamp: string;
  imageName: string;
  position: { x: number; y: number };
  transactionHash?: string;
  dbWarning?: string;
}

export interface CanvasState {
  placedImages: PlacedImage[];
  tempImage: PlacedImage | null;
  pendingConfirmation: PlacedImage | null;
  successInfo: SuccessInfo | null;
  paymentError: string | null;
  isPaymentProcessing: boolean;
  mousePosition: { x: number; y: number };
  paymentRetries: number;
  isLoadingImages: boolean;
  canvasRef: React.RefObject<HTMLDivElement>;
  
  // Methods
  setPlacedImages: (images: PlacedImage[]) => void;
  setTempImage: (image: PlacedImage | null) => void;
  setPendingConfirmation: (image: PlacedImage | null) => void;
  setSuccessInfo: (info: SuccessInfo | null) => void;
  setPaymentError: (error: string | null) => void;
  setIsPaymentProcessing: (processing: boolean) => void;
  setMousePosition: (position: { x: number; y: number }) => void;
  setPaymentRetries: (retries: number) => void;
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

// Generate a unique session ID to track this client instance
const SESSION_ID = Math.random().toString(36).substring(2, 15);

export function useCanvasState(): CanvasState {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [placedImages, setPlacedImages] = useState<PlacedImage[]>([]);
  const [tempImage, setTempImage] = useState<PlacedImage | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState<PlacedImage | null>(null);
  const [successInfo, setSuccessInfo] = useState<SuccessInfo | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [isPaymentProcessing, setIsPaymentProcessing] = useState(false);
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [paymentTimeoutId, setPaymentTimeoutId] = useState<NodeJS.Timeout | null>(null);
  const [paymentRetries, setPaymentRetries] = useState(0);
  const [isLoadingImages, setIsLoadingImages] = useState(true);
  // Use a ref to track current transaction to avoid stale closures in async functions
  const currentTransactionRef = useRef<string | null>(null);
  // Keep track of the current transaction ID in the database
  const currentDbTransactionIdRef = useRef<number | null>(null);
  
  const imageToPlace = useImageStore(state => state.imageToPlace);
  const setImageToPlace = useImageStore(state => state.setImageToPlace);
  const { publicKey, signTransaction, connected } = useWallet();

  // Log the session ID for debugging
  useEffect(() => {
    console.log(`Canvas Session ID: ${SESSION_ID}`);
  }, []);

  // Clear any existing timeout when component unmounts
  useEffect(() => {
    return () => {
      if (paymentTimeoutId) {
        clearTimeout(paymentTimeoutId);
      }
    };
  }, [paymentTimeoutId]);

  // Reset state when payment is complete or when component unmounts
  const resetState = useCallback(() => {
    console.log("Resetting canvas state");
    setTempImage(null);
    setPendingConfirmation(null);
    setSuccessInfo(null);
    setPaymentError(null);
    setIsPaymentProcessing(false);
    setPaymentRetries(0);
    currentTransactionRef.current = null;
    currentDbTransactionIdRef.current = null;
    
    if (paymentTimeoutId) {
      clearTimeout(paymentTimeoutId);
      setPaymentTimeoutId(null);
    }
  }, [paymentTimeoutId]);

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
    const x = snapToGrid(e.clientX - rect.left - tempImage.width / 2);
    const y = snapToGrid(e.clientY - rect.top - tempImage.height / 2);
    
    const newX = Math.max(0, Math.min(x, CANVAS_WIDTH - tempImage.width));
    const newY = Math.max(0, Math.min(y, CANVAS_HEIGHT - tempImage.height));
    
    if (isPositionEmpty(newX, newY, tempImage.width, tempImage.height)) {
      setTempImage(prev => prev ? { ...prev, x: newX, y: newY } : null);
    }
    setMousePosition({ x: e.clientX - rect.left, y: e.clientY - rect.top });
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
    setTempImage(null);
    setPendingConfirmation(null);
    setPaymentRetries(0);
    
    if (tempImage?.file) {
      setImageToPlace({
        file: tempImage.file,
        width: tempImage.width,
        height: tempImage.height,
        previewUrl: tempImage.src,
        cost: tempImage.cost
      });
    }
  };

  const handlePaymentProcess = async (imageId: number, transactionDbId: number): Promise<PaymentResult> => {
    if (!pendingConfirmation?.cost || !publicKey || !signTransaction) {
      return { 
        success: false, 
        error: !connected ? 'Wallet not connected' : 'Missing payment information' 
      };
    }
    
    try {
      // Generate a unique transaction ID for this payment attempt
      const transactionId = `${SESSION_ID}_${Date.now()}_${imageId}`;
      currentTransactionRef.current = transactionId;
      
      // Update transaction status to IN_PROGRESS
      await updateTransactionStatus(transactionDbId, TRANSACTION_STATUS.IN_PROGRESS);
      
      setIsPaymentProcessing(true);
      console.log(`Processing payment of ${pendingConfirmation.cost} ${ACTIVE_PAYMENT_TOKEN} (ID: ${transactionId}, DB ID: ${transactionDbId})`);
      console.log(`Attempt ${paymentRetries + 1} of ${MAX_RETRIES + 1}`);
      
      // Set payment timeout - cancel after PAYMENT_TIMEOUT_MS
      const timeout = setTimeout(() => {
        // Cancel payment process if it's taking too long
        if (isPaymentProcessing && currentTransactionRef.current === transactionId) {
          console.log(`Payment timed out after ${PAYMENT_TIMEOUT_MS / 1000} seconds (ID: ${transactionId})`);
          setPaymentError(`Payment timed out. Please try again.`);
          setIsPaymentProcessing(false);
          
          // Update transaction status to TIMEOUT
          updateTransactionStatus(transactionDbId, TRANSACTION_STATUS.TIMEOUT)
            .catch(err => console.error(`Failed to update transaction status to timeout (ID: ${transactionId}):`, err));
            
          // Update image status to PAYMENT_TIMEOUT
          updateImageStatus(imageId, IMAGE_STATUS.PAYMENT_TIMEOUT)
            .catch(err => console.error(`Failed to update image status to timeout (ID: ${transactionId}):`, err));
        }
      }, PAYMENT_TIMEOUT_MS);
      
      setPaymentTimeoutId(timeout);
      
      const result = await processPayment(
        pendingConfirmation.cost,
        publicKey,
        signTransaction
      );
      
      // Check if this is still the current transaction (prevents race conditions)
      if (currentTransactionRef.current !== transactionId) {
        console.log(`Transaction ${transactionId} was superseded, ignoring result`);
        return { success: false, error: 'Transaction was superseded by another attempt' };
      }
      
      // Clear timeout since we got a result
      clearTimeout(timeout);
      setPaymentTimeoutId(null);
      
      // Update the transaction status based on result
      if (result.success && result.transaction_hash) {
        await updateTransactionStatus(
          transactionDbId, 
          TRANSACTION_STATUS.SUCCESS, 
          result.transaction_hash, 
          true
        );
      } else if (result.error) {
        await updateTransactionStatus(
          transactionDbId, 
          TRANSACTION_STATUS.FAILED, 
          undefined, 
          false
        );
      }
      
      return result;
    } catch (error) {
      console.error('Payment processing error:', error);
      
      // Clear any existing timeout
      if (paymentTimeoutId) {
        clearTimeout(paymentTimeoutId);
        setPaymentTimeoutId(null);
      }
      
      // Update transaction status to FAILED
      if (currentDbTransactionIdRef.current) {
        try {
          await updateTransactionStatus(
            currentDbTransactionIdRef.current, 
            TRANSACTION_STATUS.FAILED
          );
        } catch (updateError) {
          console.error("Failed to update transaction status after error:", updateError);
        }
      }
      
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown payment error'
      };
    } finally {
      setIsPaymentProcessing(false);
    }
  };

  const handleConfirmPlacement = async () => {
    // Check if we're already processing - prevent double clicks
    if (isPaymentProcessing) {
      console.log("Payment already in progress, ignoring duplicate request");
      return;
    }
    
    if (!tempImage?.file) {
      console.error("No file to upload");
      setPaymentError("Missing image file");
      return;
    }
    
    if (!connected) {
      console.error("Wallet not connected");
      setPaymentError("Please connect your wallet to continue");
      return;
    }
    
    if (!publicKey) {
      console.error("No public key available");
      setPaymentError("Cannot access wallet public key");
      return;
    }
    
    if (!signTransaction) {
      console.error("Sign transaction function not available");
      setPaymentError("Cannot access wallet signing function");
      return;
    }

    const cost = tempImage.cost || 0;
    console.log(`Processing payment of ${cost} ${ACTIVE_PAYMENT_TOKEN}`);
    
    if (cost <= 0) {
      console.error("Invalid cost:", cost);
      setPaymentError("Invalid payment amount");
      return;
    }
    
    // STEP 1: Create image record with pending payment status
    let imageRecord: ImageRecord | null = null;
    let dbWarning: string | null = null;
    
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
      
      if (data.warning) {
        dbWarning = data.warning;
      }
      
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
      return;
    }
    
    if (!imageRecord) {
      console.error("No image record created");
      setPaymentError("Failed to create image record. Please try again.");
      return;
    }
    
    // STEP 1.5: Initialize transaction record in database (PRE-COMMIT)
    const imageId = parseInt(imageRecord.image_id.toString());
    
    try {
      console.log(`Initializing transaction record for image ${imageId}`);
      
      const initResult = await initializeTransaction(
        imageId,
        publicKey.toString(),
        RECIPIENT_WALLET_ADDRESS,
        cost,
        ACTIVE_PAYMENT_TOKEN
      );
      
      if (!initResult.success || !initResult.transactionId) {
        console.error("Failed to initialize transaction record:", initResult.error);
        setPaymentError("Failed to initialize transaction record. Please try again.");
        return;
      }
      
      console.log(`Transaction record initialized with ID: ${initResult.transactionId}`);
      currentDbTransactionIdRef.current = initResult.transactionId;
    } catch (initError) {
      console.error("Error initializing transaction:", initError);
      setPaymentError("Failed to initialize transaction. Please try again.");
      
      // Update image status to error
      try {
        await updateImageStatus(imageId, IMAGE_STATUS.PAYMENT_FAILED);
        // Remove the pending image from the canvas
        setPlacedImages(prev => prev.filter(img => img.id !== imageId.toString()));
      } catch (updateError) {
        console.error("Failed to update image status after init error:", updateError);
      }
      
      return;
    }
    
    // STEP 2: Process payment
    if (!currentDbTransactionIdRef.current) {
      console.error("Missing transaction database ID");
      setPaymentError("Transaction initialization incomplete. Please try again.");
      return;
    }
    
    const paymentResult = await handlePaymentProcess(imageId, currentDbTransactionIdRef.current);
    console.log("Payment result:", paymentResult);
    
    if (!paymentResult.success) {
      // Check if the transaction was rejected by the user
      if (paymentResult.userRejected) {
        console.log("User rejected the transaction - returning to confirmation screen");
        
        // Just return to confirmation screen without error message or retry
        setIsPaymentProcessing(false);
        setPaymentError(null);
        
        // Mark transaction as cancelled in DB
        try {
          await updateTransactionStatus(
            currentDbTransactionIdRef.current!, 
            TRANSACTION_STATUS.FAILED,
            undefined,
            false
          );
        } catch (updateError) {
          console.error("Failed to update transaction status after user rejection:", updateError);
        }
        
        return;
      }
    
      // Check for specific "already processed" error
      if (paymentResult.error && paymentResult.error.includes("already been processed")) {
        console.error("Detected transaction already processed error - state needs to be reset");
        setPaymentError(`${paymentResult.error}. Please try again.`);
        
        // Marking the image as failed temporarily so we can reset state
        try {
          await updateImageStatus(imageId, IMAGE_STATUS.PAYMENT_FAILED);
          // Remove the pending image from the canvas
          setPlacedImages(prev => prev.filter(img => img.id !== imageId.toString()));
        } catch (updateError) {
          console.error("Failed to update image status after payment error:", updateError);
        }
        
        // Reset state completely
        resetState();
        return;
      }
      
      // Check if we should retry the payment
      if (paymentRetries < MAX_RETRIES) {
        console.log(`Payment failed, retrying (${paymentRetries + 1}/${MAX_RETRIES})...`);
        setPaymentRetries(prev => prev + 1);
        
        // Update status to indicate retry
        try {
          await updateImageStatus(imageId, IMAGE_STATUS.PAYMENT_RETRY);
        } catch (updateError) {
          console.error("Failed to update image status for retry:", updateError);
        }
        
        setPaymentError(`${paymentResult.error || 'Payment failed'}. Retrying...`);
        // We'll let the user manually retry by closing the error modal
        return;
      }
      
      // STEP 2.1: Payment failed and no more retries - update image status
      try {
        await updateImageStatus(imageId, IMAGE_STATUS.PAYMENT_FAILED);
      } catch (updateError) {
        console.error("Failed to update image status after payment failure:", updateError);
      }
      
      setPaymentError(paymentResult.error || 'Payment failed after multiple attempts');
      setPaymentRetries(0); // Reset for potential new attempt
      
      // Remove the pending image from the canvas
      setPlacedImages(prev => prev.filter(img => img.id !== imageId.toString()));
      
      return;
    }
    
    // Reset retry counter on success
    setPaymentRetries(0);
    
    // STEP 3: Payment successful - image and transaction status already updated in handlePaymentProcess
    try {
      // Already updated the transaction status in handlePaymentProcess
      // but we need to update the UI
      
      // Update the placed image status in the UI
      setPlacedImages(prev => prev.map(img => 
        img.id === imageId.toString() 
          ? { ...img, status: IMAGE_STATUS.CONFIRMED } 
          : img
      ));
      
      // Clear temporary states
      setTempImage(null);
      setPendingConfirmation(null);
      
      // Show success info
      setSuccessInfo({
        timestamp: new Date().toLocaleString(),
        imageName: tempImage.file.name,
        position: { x: tempImage.x, y: tempImage.y },
        transactionHash: paymentResult.transaction_hash,
        dbWarning: dbWarning || undefined
      });
      
      // Reset transaction ID since we're done with this transaction
      currentTransactionRef.current = null;
      
      // Clear session storage of any blockhash or transaction data
      try {
        if (typeof window !== 'undefined') {
          const keysToRemove = [];
          for (let i = 0; i < sessionStorage.length; i++) {
            const key = sessionStorage.key(i);
            if (key && (key.includes('blockhash') || key.includes('transaction'))) {
              keysToRemove.push(key);
            }
          }
          keysToRemove.forEach(key => sessionStorage.removeItem(key));
          console.log(`Cleared ${keysToRemove.length} items from session storage`);
        }
      } catch (e) {
        console.error("Failed to clear session storage:", e);
      }
      
      // Immediately refresh the page after successful payment
      console.log("Payment successful, refreshing page...");
      window.location.reload();
      
    } catch (error) {
      console.error("Error processing transaction record:", error);
      
      // Even if there was an error with the transaction record,
      // still refresh the page to start with a clean state
      console.log("Payment appears successful despite record error, refreshing page...");
      window.location.reload();
    }
  };

  const handleCancelPlacement = () => {
    setPendingConfirmation(null);
    setPaymentRetries(0);
  };

  // Updated handleDone method to properly reset state for a new transaction
  const handleDone = () => {
    console.log("Payment complete, resetting state for new transaction");
    
    // Clear session storage of any blockhash or transaction data
    try {
      if (typeof window !== 'undefined') {
        const keysToRemove = [];
        for (let i = 0; i < sessionStorage.length; i++) {
          const key = sessionStorage.key(i);
          if (key && (key.includes('blockhash') || key.includes('transaction'))) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach(key => sessionStorage.removeItem(key));
        console.log(`Cleared ${keysToRemove.length} items from session storage`);
      }
    } catch (e) {
      console.error("Failed to clear session storage:", e);
    }
    
    // Complete reset of all state variables
    resetState();
    
    // Reload the page to ensure a clean state
    window.location.reload();
  };
  
  const handleRetryPayment = () => {
    setPaymentError(null);
    
    // If the error was about already processed transaction, we should reset completely
    if (paymentError && paymentError.includes("already been processed")) {
      resetState();
      window.location.reload();
      return;
    }
    
    handleConfirmPlacement();
  };

  return {
    // State
    placedImages,
    tempImage,
    pendingConfirmation,
    successInfo,
    paymentError,
    isPaymentProcessing,
    mousePosition,
    paymentRetries,
    isLoadingImages,
    canvasRef,
    
    // Setters
    setPlacedImages,
    setTempImage,
    setPendingConfirmation,
    setSuccessInfo,
    setPaymentError,
    setIsPaymentProcessing,
    setMousePosition,
    setPaymentRetries,
    
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