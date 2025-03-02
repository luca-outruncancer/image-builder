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
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  
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
    <div className={`relative ${className}`}>
      {isLoadingImages ? (
        <div className="flex items-center justify-center h-full w-full">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
          <span className="ml-3 text-white">Loading canvas...</span>
        </div>
      ) : (
        <div 
          ref={canvasContainerRef}
          className="relative w-full h-[600px] overflow-auto scrollbar-thin scrollbar-thumb-blue-500/40 scrollbar-track-transparent"
          style={{
            maxHeight: '60vh'
          }}
        >
          <div
            ref={canvasRef}
            className="relative"
            style={{
              width: `${CANVAS_WIDTH}px`,
              height: `${CANVAS_HEIGHT}px`,
              background: 'rgba(0,0,0,0.2)',
              backgroundImage: 'linear-gradient(to right, rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.05) 1px, transparent 1px)',
              backgroundSize: '10px 10px'
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
    </div>
  );
}
