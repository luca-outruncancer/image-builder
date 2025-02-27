// src/components/canvas/CanvasMain.tsx
'use client';

import { useRef, useEffect } from 'react';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '@/utils/constants';
import CanvasImageLoader from './CanvasImageLoader';
import CanvasImagePlacement from './CanvasImagePlacement';
import CanvasPaymentHandler from './CanvasPaymentHandler';
import { useCanvasState } from './hooks/useCanvasState';

interface CanvasMainProps {
  className?: string;
}

export default function CanvasMain({ className = '' }: CanvasMainProps) {
  const {
    isLoadingImages,
    placedImages,
    tempImage,
    pendingConfirmation,
    paymentError,
    isPaymentProcessing,
    successInfo,
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
    snapToGrid,
    isPositionEmpty,
  } = useCanvasState();

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
      {isLoadingImages ? (
        <div className="flex items-center justify-center h-full w-full">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
          <span className="ml-3">Loading canvas...</span>
        </div>
      ) : (
        <div
          ref={canvasRef}
          className={`relative border border-gray-300 ${className}`}
          style={canvasStyle}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {/* Display all placed images */}
          <CanvasImageLoader 
            placedImages={placedImages} 
          />
          
          {/* Handle temporary image positioning */}
          {tempImage && !pendingConfirmation && (
            <CanvasImagePlacement 
              tempImage={tempImage}
            />
          )}
        </div>
      )}

      {/* Placement confirmation UI */}
      {pendingConfirmation && (
        <CanvasPaymentHandler
          pendingConfirmation={pendingConfirmation}
          paymentError={paymentError}
          isPaymentProcessing={isPaymentProcessing}
          successInfo={successInfo}
          onConfirm={handleConfirmPlacement}
          onCancel={handleCancel}
          onBack={handleBack}
          onReposition={() => setPendingConfirmation(null)}
          onCloseError={() => setPaymentError(null)}
          onRetry={handleRetryPayment}
          onDone={handleDone}
        />
      )}
    </>
  );
}
