// src/components/canvas/CanvasMain.tsx
'use client';

import { useRef, useEffect, useState } from 'react';
import { CANVAS_WIDTH, CANVAS_HEIGHT, FEATURES } from '@/utils/constants';
import CanvasImageLoader from './CanvasImageLoader';
import CanvasImagePlacement from './CanvasImagePlacement';
import CanvasPaymentHandler from './CanvasPaymentHandler';
import { useCanvasState } from './hooks/useCanvasState';
import SelectionMagnifier from './SelectionMagnifier';

// Define the wallet info interface
interface WalletInfo {
  success: boolean;
  wallet?: string;
  user_wallet?: string;
  imageId?: number;
  position?: {
    x: number;
    y: number;
    width: number;
    height: number;
    clickedX: number;
    clickedY: number;
  };
  status?: string;
  image_location?: string;
}

interface CanvasMainProps {
  className?: string;
}

export default function CanvasMain({ className = '' }: CanvasMainProps) {
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const [canvasScale, setCanvasScale] = useState(1);
  const [currentWalletInfo, setCurrentWalletInfo] = useState<WalletInfo | null>(null);
  
  const {
    isLoadingImages,
    placedImages,
    tempImage,
    pendingConfirmation,
    paymentError,
    isPaymentProcessing,
    canvasRef,
    mousePosition,
    setMousePosition,
    handleMouseUp,
    handleMouseMove,
    handleCancel,
    handleBack,
    handleConfirmPlacement,
    handleCancelPlacement,
    handleDone,
    handleRetryPayment,
    setPaymentError,
    setTempImage,
    setPendingConfirmation,
  } = useCanvasState();

  // Calculate and update canvas scale based on container width
  useEffect(() => {
    if (!canvasContainerRef.current) return;

    const updateCanvasScale = () => {
      const containerWidth = canvasContainerRef.current?.clientWidth || 0;
      // Ensure we maintain at least 600px width if possible
      const minimumScale = Math.max(600 / CANVAS_WIDTH, 0.3);
      const calculatedScale = Math.max(containerWidth / CANVAS_WIDTH, minimumScale);
      setCanvasScale(Math.min(calculatedScale, 1)); // Don't exceed 1:1 scale
    };

    updateCanvasScale();
    window.addEventListener('resize', updateCanvasScale);
    
    return () => {
      window.removeEventListener('resize', updateCanvasScale);
    };
  }, []);

  // Calculate scaled dimensions
  const scaledWidth = CANVAS_WIDTH * canvasScale;
  const scaledHeight = CANVAS_HEIGHT * canvasScale;

  // Handle wallet info updates from the magnifier
  const handleWalletInfoUpdate = (info: WalletInfo | null) => {
    setCurrentWalletInfo(info);
  };

  // No format needed as we show full addresses

  return (
    <div className={`relative ${className}`}>
      {isLoadingImages ? (
        <div className="flex items-center justify-center h-[50vh] w-full">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
          <span className="ml-3 text-white">Loading canvas...</span>
        </div>
      ) : (
        <>
          <div 
            ref={canvasContainerRef}
            className="relative overflow-auto scrollbar-thin scrollbar-thumb-blue-500/40 scrollbar-track-transparent"
            style={{
              maxHeight: '70vh',
              width: '100%'
            }}
          >
            <div
              ref={canvasRef}
              className="relative mx-auto"
              style={{
                width: `${scaledWidth}px`,
                height: `${scaledHeight}px`,
                background: 'rgba(0,0,0,0.2)',
                backgroundImage: 'linear-gradient(to right, rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.05) 1px, transparent 1px)',
                backgroundSize: `${10 * canvasScale}px ${10 * canvasScale}px`,
                transform: `scale(${canvasScale})`,
                transformOrigin: 'top left'
              }}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              {/* Display all placed images */}
              <CanvasImageLoader placedImages={placedImages} />

              {/* Handle temporary image positioning */}
              {tempImage && !pendingConfirmation && <CanvasImagePlacement tempImage={tempImage} />}
              
              {/* Magnifier Component - Only show when not in placement confirmation mode */}
              {FEATURES.IMAGE_MAGNIFIER_ENABLED && !tempImage && !pendingConfirmation && (
                <SelectionMagnifier
                  canvasRef={canvasRef}
                  containerRef={canvasRef}
                  isEnabled={true}
                  onWalletInfoUpdate={handleWalletInfoUpdate}
                />
              )}
            </div>
          </div>
          
        </>
      )}

      {/* Placement confirmation UI */}
      {pendingConfirmation && (
        <CanvasPaymentHandler
          pendingConfirmation={pendingConfirmation}
          onConfirm={handleConfirmPlacement}
          onCancel={handleCancel}
          onBack={handleBack}
          onReposition={() => setPendingConfirmation(null)}
          onCloseError={() => setPaymentError(null)}
          onRetry={handleRetryPayment}
          onDone={handleDone}
        />
      )}
    </div>
  );
}