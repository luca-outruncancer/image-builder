// src/components/canvas/CanvasMain.tsx
'use client';

import { useRef } from 'react';
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

  return (
    <>
      {isLoadingImages ? (
        <div className="flex items-center justify-center h-full w-full">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
          <span className="ml-3 text-white">Loading canvas...</span>
        </div>
      ) : (
        <div
          ref={canvasRef}
          className={`relative overflow-hidden ${className}`}
          style={{
            width: '100%',
            height: '100%',
            background: 'rgba(0,0,0,0.2)',
          }}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {/* Display all placed images */}
          <CanvasImageLoader placedImages={placedImages} />

          {/* Handle temporary image positioning */}
          {tempImage && !pendingConfirmation && <CanvasImagePlacement tempImage={tempImage} />}
        </div>
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
    </>
  );
}
