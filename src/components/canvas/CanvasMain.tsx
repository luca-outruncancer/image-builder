// src/components/canvas/CanvasMain.tsx
'use client';

import { useRef, useEffect, useState } from 'react';
import { CANVAS_WIDTH, CANVAS_HEIGHT, FEATURES } from '@/utils/constants';
import CanvasImageLoader from './CanvasImageLoader';
import CanvasImagePlacement from './CanvasImagePlacement';
import CanvasPaymentHandler from './CanvasPaymentHandler';
import { useCanvasState } from './hooks/useCanvasState';
import SelectionMagnifier from './SelectionMagnifier';
import { WalletInfo } from '@/types/wallet-info';
import { usePaymentContext } from '@/lib/payment/context';
import { canvasLogger } from '@/utils/logger/index';
import ConfirmPlacement from './ConfirmPlacement';
import { clearSessionBlockhashData } from '@/lib/payment/utils/transactionUtils';

interface CanvasMainProps {
  className?: string;
}

export default function CanvasMain({ className = '' }: CanvasMainProps) {
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const [canvasScale, setCanvasScale] = useState(1);
  const [currentWalletInfo, setCurrentWalletInfo] = useState<WalletInfo | null>(null);
  
  // Get payment context for cancel function
  const { isProcessing, error, successInfo, cancelPayment } = usePaymentContext();
  
  // Determine if we need to show the payment handler (processing/result state)
  const showPaymentHandler = isProcessing || error !== null || successInfo !== null;
  
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

  // Log when payment handler visibility changes for debugging
  useEffect(() => {
    canvasLogger.debug('Payment handler visibility updated', {
      showPaymentHandler,
      isProcessing,
      hasError: error !== null,
      hasSuccessInfo: successInfo !== null,
      pendingConfirmation: !!pendingConfirmation
    });
  }, [showPaymentHandler, isProcessing, error, successInfo, pendingConfirmation]);

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

  // Handle closing the error modal with proper cleanup
  const handleCloseError = () => {
    try {
      canvasLogger.info('User cancelled payment from error modal');
      
      // Clean up blockchain session data first
      clearSessionBlockhashData();
      
      // Reset payment-related state variables
      setPaymentError(null);
      
      // Clear pendingConfirmation to reset UI state
      setPendingConfirmation(null);
      
      // Immediately call handleDone to reset everything
      // This bypasses the cancelPayment API call entirely
      handleDone();
      
      // Call cancelPayment asynchronously (fire and forget)
      // This informs the backend but doesn't block UI cleanup
      cancelPayment().catch(err => {
        canvasLogger.warn('Background payment cancellation failed', err instanceof Error ? err : new Error(String(err)));
      });
    } catch (err) {
      // Even if there's an error, we want to ensure the modal is closed
      const error = err instanceof Error ? err : new Error(String(err));
      canvasLogger.error('Error during payment cancellation cleanup:', error);
      
      // Force UI reset as fallback
      setPaymentError(null);
      setPendingConfirmation(null);
      handleDone();
    }
  };

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

      {/* Confirmation step - moved to CanvasMain */}
      {pendingConfirmation && !showPaymentHandler && (
        <ConfirmPlacement
          position={{ x: pendingConfirmation.x, y: pendingConfirmation.y }}
          cost={pendingConfirmation.cost || 0}
          onConfirm={handleConfirmPlacement}
          onCancel={handleCancel}
          onBack={handleBack}
          onReposition={() => setPendingConfirmation(null)}
        />
      )}

      {/* Payment processing and result modals */}
      {showPaymentHandler && pendingConfirmation && (
        <CanvasPaymentHandler
          pendingConfirmation={pendingConfirmation}
          onCloseError={handleCloseError}
          onRetry={handleRetryPayment}
          onDone={handleDone}
        />
      )}
    </div>
  );
}