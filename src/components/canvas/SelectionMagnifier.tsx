// src/components/canvas/SelectionMagnifier.tsx
'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { MAGNIFIER, CANVAS_WIDTH, CANVAS_HEIGHT, GRID_SIZE } from '@/utils/constants';

interface HoverMagnifierProps {
  canvasRef: React.RefObject<HTMLDivElement>;
  containerRef: React.RefObject<HTMLDivElement>;
  isEnabled: boolean;
}

/**
 * HoverMagnifier component shows a magnification of a grid cell when
 * the mouse hovers over it for a specified duration
 */
const SelectionMagnifier: React.FC<HoverMagnifierProps> = ({
  canvasRef,
  containerRef,
  isEnabled
}) => {
  // Current mouse position
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  // Current grid cell (snapped)
  const [currentCell, setCurrentCell] = useState({ x: 0, y: 0 });
  // Timer for hover delay
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  // Whether magnifier is visible
  const [isVisible, setIsVisible] = useState(false);
  // Last time mouse moved
  const lastMouseMoveRef = useRef(Date.now());

  // Handle mouse movement
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!canvasRef.current || !isEnabled) return;
    
    // Get mouse position relative to canvas
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Update mouse position state
    setMousePosition({ x, y });
    
    // Calculate grid cell (snapped to GRID_SIZE)
    const cellX = Math.floor(x / GRID_SIZE) * GRID_SIZE;
    const cellY = Math.floor(y / GRID_SIZE) * GRID_SIZE;
    
    // Check if we moved to a new cell
    if (cellX !== currentCell.x || cellY !== currentCell.y) {
      // Clear existing timer
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      
      // Hide magnifier during movement
      setIsVisible(false);
      
      // Update current cell
      setCurrentCell({ x: cellX, y: cellY });
      
      // Set timer for hover delay (500ms)
      timerRef.current = setTimeout(() => {
        setIsVisible(true);
      }, 500);
    }
    
    // Update last mouse move time
    lastMouseMoveRef.current = Date.now();
  }, [canvasRef, isEnabled, currentCell.x, currentCell.y]);

  // Handle mouse leave
  const handleMouseLeave = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setIsVisible(false);
  }, []);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  // Early return if feature is disabled
  if (!isEnabled) return null;

  // Render the component
  return (
    <>
      {/* Magnifier */}
      {isVisible && (
        <div 
          className="absolute rounded-lg overflow-hidden border-2 border-blue-500 pointer-events-none z-50 bg-white shadow-lg"
          style={{
            width: GRID_SIZE * 10, // 10x magnification of a grid cell
            height: GRID_SIZE * 10,
            left: currentCell.x + GRID_SIZE + 10, // Position to the right of the cell
            top: currentCell.y,
            // Ensure magnifier stays within canvas bounds
            ...(currentCell.x + GRID_SIZE * 11 > CANVAS_WIDTH && { left: currentCell.x - GRID_SIZE * 10 - 10 }),
            ...(currentCell.y + GRID_SIZE * 10 > CANVAS_HEIGHT && { top: CANVAS_HEIGHT - GRID_SIZE * 10 }),
          }}
        >
          {/* Grid background */}
          <div 
            className="w-full h-full relative"
            style={{
              backgroundColor: 'rgba(0,0,0,0.2)', // Match canvas background
              backgroundImage: 'linear-gradient(to right, rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.05) 1px, transparent 1px)',
              backgroundSize: `${GRID_SIZE}px ${GRID_SIZE}px`, // Keep grid size the same
              backgroundPosition: `${-currentCell.x * 10 + GRID_SIZE * 5}px ${-currentCell.y * 10 + GRID_SIZE * 5}px` // Center on the current cell
            }}
          >
            {/* If we want to render placed images here, we would need to clone and scale them */}
            {canvasRef.current && 
              Array.from(canvasRef.current.querySelectorAll('img, [style*="background-image"]')).map((element, index) => {
                const elementStyle = window.getComputedStyle(element as HTMLElement);
                const rect = (element as HTMLElement).getBoundingClientRect();
                const canvasRect = canvasRef.current!.getBoundingClientRect();
                
                // Calculate position relative to canvas
                const elementX = rect.left - canvasRect.left;
                const elementY = rect.top - canvasRect.top;
                
                // Calculate position within magnifier view
                const relativeX = (elementX - currentCell.x) * 10;
                const relativeY = (elementY - currentCell.y) * 10;
                
                // Only show if element is visible within the magnified area
                const isInView = 
                  relativeX < GRID_SIZE * 10 && 
                  relativeY < GRID_SIZE * 10 && 
                  relativeX + rect.width * 10 > 0 && 
                  relativeY + rect.height * 10 > 0;
                
                if (!isInView) return null;
                
                return (
                  <div
                    key={index}
                    className="absolute"
                    style={{
                      left: `${relativeX}px`,
                      top: `${relativeY}px`,
                      width: `${rect.width * 10}px`,
                      height: `${rect.height * 10}px`,
                      backgroundImage: elementStyle.backgroundImage,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      // Handle both background images and actual images
                      ...(element.tagName === 'IMG' && {
                        backgroundImage: `url(${(element as HTMLImageElement).src})`,
                      })
                    }}
                  />
                );
              })
            }
          </div>
        </div>
      )}
      
      {/* Transparent overlay to capture mouse events */}
      <div
        className="absolute inset-0 z-20"
        style={{ pointerEvents: isEnabled ? 'auto' : 'none' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      />
    </>
  );
};

export default SelectionMagnifier;