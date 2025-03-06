// src/components/canvas/SelectionMagnifier.tsx
'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { MAGNIFIER, CANVAS_WIDTH, CANVAS_HEIGHT, GRID_SIZE, FEATURES } from '@/utils/constants';

interface WalletInfo {
  success: boolean;
  wallet?: string;
  imageId?: number;
  position?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  status?: string;
}

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
  // Current cell owner address
  const [cellOwner, setCellOwner] = useState<string | null>(null);
  // Loading state for wallet info
  const [isLoading, setIsLoading] = useState(false);
  // Last queried cell
  const lastQueriedCellRef = useRef({ x: -1, y: -1 });

  // Fetch wallet info for current cell
  const fetchWalletInfo = useCallback(async (x: number, y: number) => {
    if (!FEATURES.SHOW_OWNER_WALLET) return;
    
    // Skip if we've already queried this cell
    if (lastQueriedCellRef.current.x === x && lastQueriedCellRef.current.y === y) return;
    
    // Update last queried cell
    lastQueriedCellRef.current = { x, y };
    
    try {
      setIsLoading(true);
      
      const response = await fetch('/api/wallet-info', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ x, y }),
      });
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const data: WalletInfo = await response.json();
      
      if (data.success && data.wallet) {
        setCellOwner(data.wallet);
      } else {
        setCellOwner(null);
      }
    } catch (error) {
      console.error('Error fetching wallet info:', error);
      setCellOwner(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Handle mouse movement
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!canvasRef.current || !isEnabled) return;
    
    // Get mouse position relative to canvas
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Make sure coordinates are within canvas bounds
    if (x < 0 || y < 0 || x > CANVAS_WIDTH || y > CANVAS_HEIGHT) {
      if (isVisible) setIsVisible(false);
      return;
    }
    
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
      
      // Set timer for hover delay
      timerRef.current = setTimeout(() => {
        setIsVisible(true);
        // Fetch wallet info when we hover on a cell
        fetchWalletInfo(cellX, cellY);
      }, MAGNIFIER.HOVER_DELAY_MS);
    }
    
    // Update last mouse move time
    lastMouseMoveRef.current = Date.now();
  }, [canvasRef, isEnabled, currentCell.x, currentCell.y, isVisible, fetchWalletInfo]);

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

  // Handle mouse out of canvas cells
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      if (now - lastMouseMoveRef.current > 100 && isVisible) {
        const x = mousePosition.x;
        const y = mousePosition.y;
        if (x < 0 || y < 0 || x > CANVAS_WIDTH || y > CANVAS_HEIGHT) {
          setIsVisible(false);
        }
      }
    }, 100);
    
    return () => clearInterval(interval);
  }, [isVisible, mousePosition.x, mousePosition.y]);

  // Format wallet address for display
  const formatWalletAddress = (address: string | null): string => {
    if (!address || address === 'Unknown') return 'No owner';
    
    // Format as first 6...last 4 characters for display
    if (address.length > 12) {
      return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
    }
    
    return address;
  };

  // Early return if feature is disabled
  if (!isEnabled) return null;

  // Render the component
  return (
    <>
      {/* Magnifier */}
      {isVisible && (
        <div 
          className="absolute rounded-lg overflow-hidden pointer-events-none z-50 bg-white shadow-lg"
          style={{
            width: GRID_SIZE * MAGNIFIER.ZOOM_FACTOR,
            height: GRID_SIZE * MAGNIFIER.ZOOM_FACTOR + (FEATURES.SHOW_OWNER_WALLET ? 20 : 0), // Add height for wallet display
            left: currentCell.x + GRID_SIZE + 10, // Position to the right of the cell
            top: currentCell.y,
            border: `${MAGNIFIER.BORDER_WIDTH}px solid ${MAGNIFIER.BORDER_COLOR}`,
            // Ensure magnifier stays within canvas bounds
            ...(currentCell.x + GRID_SIZE * (MAGNIFIER.ZOOM_FACTOR + 1) + 10 > CANVAS_WIDTH && { 
              left: currentCell.x - GRID_SIZE * MAGNIFIER.ZOOM_FACTOR - 10 
            }),
            ...(currentCell.y + GRID_SIZE * MAGNIFIER.ZOOM_FACTOR + (FEATURES.SHOW_OWNER_WALLET ? 20 : 0) > CANVAS_HEIGHT && { 
              top: CANVAS_HEIGHT - GRID_SIZE * MAGNIFIER.ZOOM_FACTOR - (FEATURES.SHOW_OWNER_WALLET ? 20 : 0)
            }),
          }}
        >
          {/* Grid background */}
          <div 
            className="w-full h-full relative"
            style={{
              backgroundColor: 'rgba(0,0,0,0.2)', // Match canvas background
              backgroundImage: 'linear-gradient(to right, rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.05) 1px, transparent 1px)',
              backgroundSize: `${GRID_SIZE}px ${GRID_SIZE}px`, // Keep grid size the same
              backgroundPosition: `${-currentCell.x * MAGNIFIER.ZOOM_FACTOR + GRID_SIZE * MAGNIFIER.ZOOM_FACTOR/2}px ${-currentCell.y * MAGNIFIER.ZOOM_FACTOR + GRID_SIZE * MAGNIFIER.ZOOM_FACTOR/2}px`, // Center on the current cell
              height: GRID_SIZE * MAGNIFIER.ZOOM_FACTOR
            }}
          >
            {/* Try to render placed images in the magnified view */}
            {canvasRef.current && 
              Array.from(canvasRef.current.querySelectorAll('img, [style*="background-image"]')).map((element, index) => {
                try {
                  const elementStyle = window.getComputedStyle(element as HTMLElement);
                  const rect = (element as HTMLElement).getBoundingClientRect();
                  const canvasRect = canvasRef.current!.getBoundingClientRect();
                  
                  // Calculate position relative to canvas
                  const elementX = rect.left - canvasRect.left;
                  const elementY = rect.top - canvasRect.top;
                  
                  // Calculate position within magnifier view
                  const relativeX = (elementX - currentCell.x) * MAGNIFIER.ZOOM_FACTOR;
                  const relativeY = (elementY - currentCell.y) * MAGNIFIER.ZOOM_FACTOR;
                  
                  // Calculate magnifier viewport
                  const viewportWidth = GRID_SIZE * MAGNIFIER.ZOOM_FACTOR;
                  const viewportHeight = GRID_SIZE * MAGNIFIER.ZOOM_FACTOR;
                  
                  // Only show if element is visible within the magnified area
                  const isInView = 
                    relativeX < viewportWidth && 
                    relativeY < viewportHeight && 
                    relativeX + rect.width * MAGNIFIER.ZOOM_FACTOR > 0 && 
                    relativeY + rect.height * MAGNIFIER.ZOOM_FACTOR > 0;
                  
                  if (!isInView) return null;
                  
                  // Render the element in the magnifier
                  return (
                    <div
                      key={index}
                      className="absolute"
                      style={{
                        left: `${relativeX}px`,
                        top: `${relativeY}px`,
                        width: `${rect.width * MAGNIFIER.ZOOM_FACTOR}px`,
                        height: `${rect.height * MAGNIFIER.ZOOM_FACTOR}px`,
                        backgroundImage: elementStyle.backgroundImage,
                        backgroundSize: 'cover',
                        backgroundPosition: elementStyle.backgroundPosition,
                        // Handle both background images and actual images
                        ...(element.tagName === 'IMG' && {
                          backgroundImage: `url(${(element as HTMLImageElement).src})`,
                        })
                      }}
                    />
                  );
                } catch (error) {
                  console.error('Error rendering element in magnifier:', error);
                  return null;
                }
              })
            }
            
            {/* Add a highlight for the current cell */}
            <div
              className="absolute border-2 border-yellow-400 bg-yellow-100 bg-opacity-20"
              style={{
                width: GRID_SIZE * MAGNIFIER.ZOOM_FACTOR,
                height: GRID_SIZE * MAGNIFIER.ZOOM_FACTOR,
                left: 0,
                top: 0,
              }}
            />
          </div>
          
          {/* Wallet address display */}
          {FEATURES.SHOW_OWNER_WALLET && (
            <div className="absolute bottom-0 left-0 right-0 h-5 bg-black bg-opacity-75 text-white text-xs flex items-center justify-center overflow-hidden">
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mr-1"></div>
              ) : (
                <div 
                  className="w-full text-center whitespace-nowrap overflow-hidden text-ellipsis px-1" 
                  title={cellOwner || 'No owner'}
                >
                  {cellOwner ? cellOwner : 'No owner'}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      
      {/* Highlight for the current cell in the main view */}
      {isVisible && (
        <div
          className="absolute border border-yellow-400 bg-yellow-100 bg-opacity-10 pointer-events-none"
          style={{
            width: GRID_SIZE,
            height: GRID_SIZE,
            left: currentCell.x,
            top: currentCell.y,
          }}
        />
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