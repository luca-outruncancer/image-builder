// src/components/canvas/Magnifier.tsx
'use client';

import { useRef, useEffect } from 'react';
import { MAGNIFIER } from '@/utils/constants';

interface MagnifierProps {
  mousePosition: { x: number, y: number };
  canvasRef: React.RefObject<HTMLDivElement>;
  visible: boolean;
  zoomFactor?: number;
  size?: number;
  borderWidth?: number;
  borderColor?: string;
}

/**
 * Magnifier component provides zoomed view of canvas content at mouse position
 * 
 * @param mousePosition - Current mouse coordinates on canvas
 * @param canvasRef - Reference to the canvas container element
 * @param visible - Whether the magnifier should be displayed
 * @param zoomFactor - Level of magnification (default from MAGNIFIER.ZOOM_FACTOR)
 * @param size - Size of the magnifier in pixels (default from MAGNIFIER.SIZE)
 * @param borderWidth - Width of the border in pixels (default from MAGNIFIER.BORDER_WIDTH)
 * @param borderColor - Color of the border (default from MAGNIFIER.BORDER_COLOR)
 */
const Magnifier: React.FC<MagnifierProps> = ({
  mousePosition,
  canvasRef,
  visible,
  zoomFactor = MAGNIFIER.ZOOM_FACTOR,
  size = MAGNIFIER.SIZE,
  borderWidth = MAGNIFIER.BORDER_WIDTH,
  borderColor = MAGNIFIER.BORDER_COLOR,
}) => {
  const magnifierRef = useRef<HTMLDivElement>(null);

  // Early return if not visible
  if (!visible) return null;

  // Calculate position ensuring magnifier stays within viewport
  const calculatePosition = () => {
    if (!canvasRef.current) return { left: 0, top: 0 };
    
    const canvasRect = canvasRef.current.getBoundingClientRect();
    
    // Position magnifier at right-top of cursor by default
    let left = mousePosition.x + 20;
    let top = mousePosition.y - size - 10;
    
    // Adjust if too close to right edge
    if (left + size > canvasRect.width) {
      left = mousePosition.x - size - 20;
    }
    
    // Adjust if too close to top edge
    if (top < 0) {
      top = mousePosition.y + 20;
    }
    
    return { left, top };
  };

  const position = calculatePosition();

  return (
    <div
      ref={magnifierRef}
      className="absolute rounded-full overflow-hidden pointer-events-none z-50"
      style={{
        left: position.left,
        top: position.top,
        width: size,
        height: size,
        border: `${borderWidth}px solid ${borderColor}`,
        boxShadow: '0 2px 10px rgba(0, 0, 0, 0.3)',
      }}
    >
      <div
        className="w-full h-full"
        style={{
          background: '#fff',
          backgroundImage: canvasRef.current 
            ? `url(${getCanvasBackground(canvasRef.current)})`
            : 'none',
          backgroundPosition: `${-mousePosition.x * zoomFactor + size / 2}px ${-mousePosition.y * zoomFactor + size / 2}px`,
          backgroundSize: canvasRef.current
            ? `${canvasRef.current.clientWidth * zoomFactor}px ${canvasRef.current.clientHeight * zoomFactor}px`
            : '0px 0px',
          backgroundRepeat: 'no-repeat',
        }}
      />
    </div>
  );
};

/**
 * Utility function to capture the canvas as a data URL
 */
const getCanvasBackground = (canvas: HTMLElement): string => {
  try {
    // Create a canvas element to draw the content
    const tempCanvas = document.createElement('canvas');
    const ctx = tempCanvas.getContext('2d');
    
    if (!ctx) return '';
    
    tempCanvas.width = canvas.clientWidth;
    tempCanvas.height = canvas.clientHeight;
    
    // Add a clean background 
    ctx.fillStyle = canvas.style.background || 'rgba(0,0,0,0.2)';
    ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
    
    // Draw the grid pattern if present in the original canvas
    if (canvas.style.backgroundImage) {
      // This is a simplified version, actual grid drawing would be more complex
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 1;
      
      // Draw horizontal lines
      for (let y = 0; y < tempCanvas.height; y += 10) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(tempCanvas.width, y);
        ctx.stroke();
      }
      
      // Draw vertical lines
      for (let x = 0; x < tempCanvas.width; x += 10) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, tempCanvas.height);
        ctx.stroke();
      }
    }
    
    // Convert all children to an image and draw them
    // This is a complex process and may need HTML2Canvas for accuracy
    // For now we just capture the basic structure
    
    // Convert to data URL
    return tempCanvas.toDataURL();
  } catch (error) {
    console.error('Error generating canvas background:', error);
    return '';
  }
};

export default Magnifier;