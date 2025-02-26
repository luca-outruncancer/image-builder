// src/components/canvas/Canvas.tsx
'use client';

import { useRef, useState, useEffect } from 'react';
import { CANVAS_WIDTH, CANVAS_HEIGHT, GRID_SIZE } from '@/utils/constants';
import { useImageStore } from '@/store/useImageStore';
import { useWallet } from '@solana/wallet-adapter-react';
import ConfirmPlacement from './ConfirmPlacement';
import { getImageRecords } from '@/lib/imageStorage';
import { saveTransaction, updateImagePaymentStatus } from '@/lib/transactionStorage';
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
  locked: boolean;
  file?: File;
  cost?: number;
}

interface SuccessInfo {
  timestamp: string;
  imageName: string;
  position: { x: number; y: number };
  transactionHash?: string;
}

export default function Canvas({ className = '' }: { className?: string }) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [placedImages, setPlacedImages] = useState<PlacedImage[]>([]);
  const [tempImage, setTempImage] = useState<PlacedImage | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState<PlacedImage | null>(null);
  const [successInfo, setSuccessInfo] = useState<SuccessInfo | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [isPaymentProcessing, setIsPaymentProcessing] = useState(false);
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const imageToPlace = useImageStore(state => state.imageToPlace);
  const setImageToPlace = useImageStore(state => state.setImageToPlace);
  const { publicKey, signTransaction, connected } = useWallet();

  useEffect(() => {
    const loadPlacedImages = async () => {
      try {
        const records = await getImageRecords();
        const loadedImages = records.map(record => ({
          id: record.image_id.toString(),
          src: record.image_location,
          x: record.start_position_x,
          y: record.start_position_y,
          width: record.size_x,
          height: record.size_y,
          locked: record.active
        }));
        setPlacedImages(loadedImages);
      } catch (error) {
        console.error('Failed to load placed images:', error);
      }
    };
    const processPayment = async (): Promise<PaymentResult> => {
      if (!pendingConfirmation?.cost || !publicKey || !signTransaction) {
        return { 
          success: false, 
          error: !connected ? 'Wallet not connected' : 'Missing payment information' 
        };
      }
      
      try {
        setIsPaymentProcessing(true);
        
        // Use the unified processPayment function
        const result = await processPayment(
          pendingConfirmation.cost,
          publicKey,
          signTransaction
        );
        
        return result;
      } catch (error) {
        console.error('Payment processing error:', error);
        return { 
          success: false, 
          error: error instanceof Error ? error.message : 'Unknown payment error'
        };
      } finally {
        setIsPaymentProcessing(false);
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
        locked: false,
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
    if (!canvasRef.current || !tempImage || pendingConfirmation) return; // Add pendingConfirmation check  
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
      previewUrl: tempImage?.src!
    });
  };
  
  const processPayment = async (): Promise<PaymentResult> => {
    if (!pendingConfirmation?.cost || !publicKey || !signTransaction) {
      return { 
        success: false, 
        error: !connected ? 'Wallet not connected' : 'Missing payment information' 
      };
    }
    
    try {
      setIsPaymentProcessing(true);
      const result = await sendUSDCPayment(
        pendingConfirmation.cost,
        publicKey,
        signTransaction
      );
      
      return result;
    } catch (error) {
      console.error('Payment processing error:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown payment error'
      };
    } finally {
      setIsPaymentProcessing(false);
    }
  };

  const handleConfirmPlacement = async () => {
    if (!tempImage?.file) return;
    
    console.log("Connected:", connected);
    console.log("Public Key:", publicKey?.toString());
    console.log("SignTransaction available:", !!signTransaction);
    
    // First process payment
    const paymentResult = await processPayment();
    
    console.log("Payment result:", paymentResult);
    
    if (!paymentResult.success) {
      setPaymentError(paymentResult.error || 'Payment failed');
      return;
    }
    
    // If payment successful, proceed with image upload
    try {
      const formData = new FormData();
      formData.append('file', tempImage.file);
      formData.append('position', JSON.stringify({ x: tempImage.x, y: tempImage.y }));
      formData.append('size', JSON.stringify({ width: tempImage.width, height: tempImage.height }));
      formData.append('payment', JSON.stringify({ 
        wallet: publicKey?.toString(),
        transaction_hash: paymentResult.transaction_hash,
        amount: tempImage.cost,
        currency: 'USDC'
      }));
  
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });
  
      const data = await response.json();
      if (!data.success) throw new Error(data.error);
  
      // Save transaction to database
      if (data.record?.image_id && paymentResult.transaction_hash) {
        await saveTransaction({
          image_id: data.record.image_id,
          solana_wallet: publicKey!.toString(),
          transaction_hash: paymentResult.transaction_hash,
          amount: tempImage.cost || 0,
          currency: 'USDC'
        });
        
        // Update image payment status
        await updateImagePaymentStatus(data.record.image_id, paymentResult.transaction_hash);
      }
  
      setPlacedImages(prev => [...prev, { ...tempImage, src: data.url, locked: true, id: data.record.image_id.toString() }]);
      setTempImage(null);
      setPendingConfirmation(null);
      
      setSuccessInfo({
        timestamp: new Date().toLocaleString(),
        imageName: tempImage.file.name,
        position: { x: tempImage.x, y: tempImage.y },
        transactionHash: paymentResult.transaction_hash
      });
    } catch (error) {
      console.error('Failed to save placement:', error);
      setPaymentError('Image upload failed after payment was processed');
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
              className="w-full h-full object-cover pointer-events-none"
              draggable={false}
            />
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
        onBack={() => {
          setTempImage(null);
          setPendingConfirmation(null);
          setImageToPlace({
            file: tempImage?.file!,
            width: tempImage?.width!,
            height: tempImage?.height!,
            previewUrl: tempImage?.src!
          });
        }}
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
            <p>Image uploaded successfully!</p>
            <div className="mt-4 text-left text-sm">
              <p>Timestamp: {successInfo.timestamp}</p>
              <p>Image: {successInfo.imageName}</p>
              <p>Position: ({successInfo.position.x}, {successInfo.position.y})</p>
              <p>Transaction Hash: ({successInfo.transactionHash})</p>
            </div>
          </div>
        </ModalLayout>
        )}
    </>
  );
}