// src/components/canvas/Canvas.tsx
'use client';

import { useRef, useState, useEffect } from 'react';
import { CANVAS_WIDTH, CANVAS_HEIGHT, GRID_SIZE, ACTIVE_PAYMENT_TOKEN, RECIPIENT_WALLET_ADDRESS } from '@/utils/constants';
import { useImageStore } from '@/store/useImageStore';
import { useWallet } from '@solana/wallet-adapter-react';
import ConfirmPlacement from './ConfirmPlacement';
import { 
  getImageRecords, 
  createImageRecord, 
  updateImageStatus, 
  IMAGE_STATUS,
  ImageRecord
} from '@/lib/imageStorage';
import { 
  saveTransaction,
  TransactionRecord
} from '@/lib/transactionStorage';
import ModalLayout from '../shared/ModalLayout';
import { WalletConnectButton } from '@/components/solana/WalletConnectButton';
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

const PAYMENT_TIMEOUT_MS = 120000; // 120 seconds (2 minutes)

export default function Canvas({ className = '' }: { className?: string }) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [placedImages, setPlacedImages] = useState<PlacedImage[]>([]);
  const [tempImage, setTempImage] = useState<PlacedImage | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState<PlacedImage | null>(null);
  const [successInfo, setSuccessInfo] = useState<SuccessInfo | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [isPaymentProcessing, setIsPaymentProcessing] = useState(false);
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [paymentTimeoutId, setPaymentTimeoutId] = useState<NodeJS.Timeout | null>(null);
  const imageToPlace = useImageStore(state => state.imageToPlace);
  const setImageToPlace = useImageStore(state => state.setImageToPlace);
  const { publicKey, signTransaction, connected } = useWallet();

  useEffect(() => {
    // Clear any existing timeout when component unmounts
    return () => {
      if (paymentTimeoutId) {
        clearTimeout(paymentTimeoutId);
      }
    };
  }, [paymentTimeoutId]);

  useEffect(() => {
    const loadPlacedImages = async () => {
      try {
        // Get images with status 1 (confirmed) or 2 (pending payment)
        const records = await getImageRecords();
        
        if (records && Array.isArray(records)) {
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
      }
    };

    loadPlacedImages();
  }, []);

  useEffect(() => {
    if (imageToPlace) {
      console.log("ImageToPlace cost:", imageToPlace.cost);
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
      console.log("TempImage cost:", imageToPlace.cost || 0);
      setImageToPlace(null);
    }
  }, [imageToPlace, setImageToPlace]);

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
    window.location.reload();
  };
  
  const handleBack = () => {
    setTempImage(null);
    setPendingConfirmation(null);
    setImageToPlace({
      file: tempImage?.file!,
      width: tempImage?.width!,
      height: tempImage?.height!,
      previewUrl: tempImage?.src!,
      cost: tempImage?.cost
    });
  };
  
  const handlePaymentProcess = async (imageId: number): Promise<PaymentResult> => {
    if (!pendingConfirmation?.cost || !publicKey || !signTransaction) {
      return { 
        success: false, 
        error: !connected ? 'Wallet not connected' : 'Missing payment information' 
      };
    }
    
    try {
      setIsPaymentProcessing(true);
      console.log(`Processing payment of ${pendingConfirmation.cost} ${ACTIVE_PAYMENT_TOKEN}`);
      
      // Set payment timeout - cancel after 120 seconds
      const timeout = setTimeout(() => {
        // Cancel payment process if it's taking too long
        if (isPaymentProcessing) {
          console.log("Payment timed out after", PAYMENT_TIMEOUT_MS, "ms");
          setPaymentError("Payment timed out. Please try again.");
          setIsPaymentProcessing(false);
          
          // Update image status to PAYMENT_TIMEOUT
          updateImageStatus(imageId, IMAGE_STATUS.PAYMENT_TIMEOUT)
            .catch(err => console.error("Failed to update image status to timeout:", err));
        }
      }, PAYMENT_TIMEOUT_MS);
      
      setPaymentTimeoutId(timeout);
      
      const result = await processPayment(
        pendingConfirmation.cost,
        publicKey,
        signTransaction
      );
      
      // Clear timeout since we got a result
      clearTimeout(timeout);
      setPaymentTimeoutId(null);
      
      return result;
    } catch (error) {
      console.error('Payment processing error:', error);
      
      // Clear any existing timeout
      if (paymentTimeoutId) {
        clearTimeout(paymentTimeoutId);
        setPaymentTimeoutId(null);
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
    if (!tempImage?.file) {
      console.error("No file to upload");
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
      setPaymentError("Failed to upload image. Please try again.");
      return;
    }
    
    if (!imageRecord) {
      console.error("No image record created");
      setPaymentError("Failed to create image record. Please try again.");
      return;
    }
    
    // STEP 2: Process payment
    const imageId = parseInt(imageRecord.image_id.toString());
    const paymentResult = await handlePaymentProcess(imageId);
    console.log("Payment result:", paymentResult);
    
    if (!paymentResult.success) {
      // STEP 2.1: Payment failed - update image status
      try {
        await updateImageStatus(imageId, IMAGE_STATUS.PAYMENT_FAILED);
      } catch (updateError) {
        console.error("Failed to update image status after payment failure:", updateError);
      }
      
      setPaymentError(paymentResult.error || 'Payment failed');
      
      // Remove the pending image from the canvas
      setPlacedImages(prev => prev.filter(img => img.id !== imageId.toString()));
      
      return;
    }
    
    // STEP 3: Payment successful - record transaction and update image status
    try {
      // Create transaction record
      const transactionRecord: TransactionRecord = {
        image_id: imageId,
        sender_wallet: publicKey.toString(),
        recipient_wallet: RECIPIENT_WALLET_ADDRESS,
        transaction_hash: paymentResult.transaction_hash!,
        transaction_status: 'success',
        amount: cost,
        token: ACTIVE_PAYMENT_TOKEN
      };
      
      // Save transaction record
      const saveResult = await saveTransaction(transactionRecord);
      console.log("Transaction save result:", saveResult);
      
      if (!saveResult.success) {
        dbWarning = "Transaction record could not be saved to the database, but payment was processed successfully.";
        console.error("Failed to save transaction record:", saveResult.error);
        
        // Try to update image status directly
        try {
          await updateImageStatus(imageId, IMAGE_STATUS.CONFIRMED, true);
        } catch (updateError) {
          console.error("Failed to update image status after payment:", updateError);
        }
      }
      
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
      
    } catch (error) {
      console.error("Error processing transaction record:", error);
      
      // Show a limited success message since payment succeeded but record failed
      setSuccessInfo({
        timestamp: new Date().toLocaleString(),
        imageName: tempImage.file.name,
        position: { x: tempImage.x, y: tempImage.y },
        transactionHash: paymentResult.transaction_hash,
        dbWarning: "There was an error recording the transaction details, but your payment was completed successfully."
      });
    }
  };

  const handleCancelPlacement = () => {
    setPendingConfirmation(null);
  };

  const handleDone = () => {
    setSuccessInfo(null);
    window.location.reload();
  };

  const canvasStyle = {
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    overflow: 'hidden',
    backgroundImage: `url('/patterns/magicpattern-starry-night-1740456570988.png')`,
    backgroundSize: '400px 400px',
    backgroundRepeat: 'repeat',
  };

  return (
    <>
      <div
        ref={canvasRef}
        className={`relative border border-gray-300 ${className}`}
        style={canvasStyle}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        
        {placedImages.map((image) => (
          <div
            key={image.id}
            className="absolute"
            style={{
              left: image.x,
              top: image.y,
              width: image.width,
              height: image.height,
            }}
          >
            <img
              src={image.src}
              alt=""
              className={`w-full h-full object-cover pointer-events-none ${
                image.status === IMAGE_STATUS.PENDING_PAYMENT 
                  ? 'opacity-70 outline outline-2 outline-red-500'
                  : ''
              }`}
              draggable={false}
            />
            {image.status === IMAGE_STATUS.PENDING_PAYMENT && (
              <div className="absolute inset-0 bg-red-500 bg-opacity-10 flex items-center justify-center">
                <span className="bg-white bg-opacity-70 text-red-600 text-xs font-bold px-2 py-1 rounded-sm">
                  Payment Pending
                </span>
              </div>
            )}
          </div>
        ))}

        {tempImage && !pendingConfirmation && (
          <div
            className="absolute cursor-move"
            style={{
              left: tempImage.x,
              top: tempImage.y,
              width: tempImage.width,
              height: tempImage.height,
            }}
          >
            <img
              src={tempImage.src}
              alt=""
              className="w-full h-full object-cover pointer-events-none"
              draggable={false}
            />
          </div>
        )}
      </div>

      {pendingConfirmation && (
        <ConfirmPlacement
          position={{ x: pendingConfirmation.x, y: pendingConfirmation.y }}
          cost={pendingConfirmation.cost || 0}
          onConfirm={handleConfirmPlacement}
          onCancel={handleCancel}
          onBack={handleBack}
          onReposition={() => setPendingConfirmation(null)}
        />
      )}

      {paymentError && (
        <ModalLayout
          isOpen={true}
          title="Payment Error"
          onClose={() => setPaymentError(null)}
          customButtons={
            <div className="flex justify-end mt-4">
              <button
                onClick={() => setPaymentError(null)}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                Try Again
              </button>
            </div>
          }
        >
          <div className="text-center p-4">
            <p className="text-red-600 font-semibold">Unable to process payment</p>
            <p className="mt-2 text-gray-700">{paymentError}</p>
            
            {!connected && (
              <div className="mt-4">
                <p className="mb-2">Connect your wallet to continue:</p>
                <div className="flex justify-center">
                  <WalletConnectButton />
                </div>
              </div>
            )}
          </div>
        </ModalLayout>
      )}

      {isPaymentProcessing && (
        <ModalLayout
          isOpen={true}
          title="Processing Payment"
          onClose={() => {}}
        >
          <div className="text-center p-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p>Please approve the transaction in your wallet...</p>
            <p className="text-sm text-gray-500 mt-2">Do not close this window until the transaction is complete</p>
            <p className="text-sm text-gray-500 mt-2">Payment will time out after 2 minutes if not completed</p>
          </div>
        </ModalLayout>
      )}

      {successInfo && (
        <ModalLayout
          isOpen={true}
          title="Congratulations!"
          onClose={handleDone}
          customButtons={
            <div className="flex justify-end mt-6">
              <button
                onClick={handleDone}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                Done
              </button>
            </div>
          }
        >
          <div className="text-center">
            <p className="text-lg font-semibold text-green-600">Image uploaded successfully!</p>
            <div className="mt-4 text-left text-sm">
              <p>Timestamp: {successInfo.timestamp}</p>
              <p>Image: {successInfo.imageName}</p>
              <p>Position: ({successInfo.position.x}, {successInfo.position.y})</p>
              {successInfo.transactionHash && (
                <div className="mt-2">
                  <p className="font-semibold">Transaction Hash:</p>
                  <p className="text-xs font-mono break-all bg-gray-100 p-2 rounded">
                    {successInfo.transactionHash}
                  </p>
                  <p className="mt-2 text-sm text-gray-600">
                    View on{" "}
                    <a
                      href={`https://explorer.solana.com/tx/${successInfo.transactionHash}?cluster=devnet`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-500 hover:underline"
                    >
                      Solana Explorer
                    </a>
                  </p>
                </div>
              )}
              
              {successInfo.dbWarning && (
                <div className="mt-4 p-2 bg-yellow-50 border border-yellow-200 rounded-md">
                  <p className="text-yellow-700 text-xs">{successInfo.dbWarning}</p>
                </div>
              )}
            </div>
          </div>
        </ModalLayout>
      )}
    </>
  );
}