// src/components/canvas/Canvas.tsx
'use client';

import CanvasMain from './CanvasMain';

interface CanvasProps {
  className?: string;
}

/**
 * Canvas component serves as the main entry point for the image placement and payment flow.
 * This component has been modularized for easier maintenance:
 * 
 * - CanvasMain: The main container component
 * - CanvasImageLoader: Handles loading and displaying placed images
 * - CanvasImagePlacement: Handles temporary image placement
 * - CanvasPaymentHandler: Handles payment flow and UI
 * - useCanvasState: Custom hook for state management
 */
export default function Canvas({ className = '' }: CanvasProps) {
  return <CanvasMain className={className} />;
}
