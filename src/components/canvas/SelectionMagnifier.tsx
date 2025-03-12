'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { MAGNIFIER, CANVAS_WIDTH, CANVAS_HEIGHT, GRID_SIZE, FEATURES } from '@/utils/constants';
import Image from 'next/image';

interface WalletInfo {
  success: boolean;
  wallet?: string;
  sender_wallet?: string;
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

interface HoverMagnifierProps {
  canvasRef: React.RefObject<HTMLDivElement>;
  containerRef: React.RefObject<HTMLDivElement>;
  isEnabled: boolean;
  onWalletInfoUpdate?: (info: WalletInfo | null) => void;
}

const SelectionMagnifier: React.FC<HoverMagnifierProps> = ({
  canvasRef,
  containerRef,
  isEnabled,
  onWalletInfoUpdate
}) => {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [currentCell, setCurrentCell] = useState({ x: 0, y: 0 });
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const lastMouseMoveRef = useRef(Date.now());
  const [walletInfo, setWalletInfo] = useState<WalletInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const lastQueriedCellRef = useRef({ x: -1, y: -1 });

  // Fetch info about image at current position
  const fetchImageInfo = useCallback(async (x: number, y: number) => {
    if (lastQueriedCellRef.current.x === x && lastQueriedCellRef.current.y === y) return;
    
    lastQueriedCellRef.current = { x, y };
    setIsLoading(true);
    
    try {
      const response = await fetch('/api/image-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x, y }),
      });
      
      if (!response.ok) throw new Error(`API error: ${response.status}`);
      
      const data: WalletInfo = await response.json();
      setWalletInfo(data);
      
      if (data.success && onWalletInfoUpdate) {
        onWalletInfoUpdate(data);
      } else if (!data.success && onWalletInfoUpdate) {
        onWalletInfoUpdate(null);
      }
    } catch (error) {
      console.error('Error fetching image info:', error);
      setWalletInfo(null);
      if (onWalletInfoUpdate) onWalletInfoUpdate(null);
    } finally {
      setIsLoading(false);
    }
  }, [onWalletInfoUpdate]);

  // Handle mouse movement
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!canvasRef.current || !isEnabled) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    if (x < 0 || y < 0 || x > CANVAS_WIDTH || y > CANVAS_HEIGHT) {
      if (isVisible) setIsVisible(false);
      return;
    }
    
    setMousePosition({ x, y });
    
    const cellX = Math.floor(x / GRID_SIZE) * GRID_SIZE;
    const cellY = Math.floor(y / GRID_SIZE) * GRID_SIZE;
    
    if (cellX !== currentCell.x || cellY !== currentCell.y) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      
      setIsVisible(false);
      setCurrentCell({ x: cellX, y: cellY });
      
      timerRef.current = setTimeout(() => {
        setIsVisible(true);
        fetchImageInfo(cellX, cellY);
      }, MAGNIFIER.HOVER_DELAY_MS);
    }
    
    lastMouseMoveRef.current = Date.now();
  }, [canvasRef, currentCell.x, currentCell.y, fetchImageInfo, isEnabled, isVisible]);

  // Handle mouse leave
  const handleMouseLeave = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setIsVisible(false);
    if (onWalletInfoUpdate) onWalletInfoUpdate(null);
  }, [onWalletInfoUpdate]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // Out of bounds check
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      if (now - lastMouseMoveRef.current > 100 && isVisible) {
        const x = mousePosition.x;
        const y = mousePosition.y;
        if (x < 0 || y < 0 || x > CANVAS_WIDTH || y > CANVAS_HEIGHT) {
          setIsVisible(false);
          if (onWalletInfoUpdate) onWalletInfoUpdate(null);
        }
      }
    }, 100);
    
    return () => clearInterval(interval);
  }, [isVisible, mousePosition.x, mousePosition.y, onWalletInfoUpdate]);

  // Calculate magnifier dimensions and position
  const magnifierSize = GRID_SIZE * MAGNIFIER.ZOOM_FACTOR;
  
  // Calculate the portion of the image to display in the magnifier
  const calculateMagnifierView = () => {
    if (!walletInfo?.success || !walletInfo.position || !walletInfo.image_location) {
      return null;
    }
    
    const imagePos = walletInfo.position;
    const clickedPos = { x: currentCell.x, y: currentCell.y };
    
    // Adjust for image position
    if (clickedPos.x < imagePos.x || 
        clickedPos.y < imagePos.y || 
        clickedPos.x >= imagePos.x + imagePos.width || 
        clickedPos.y >= imagePos.y + imagePos.height) {
      // Not within image bounds
      return null;
    }
    
    // Calculate relative position within the image
    const relX = clickedPos.x - imagePos.x;
    const relY = clickedPos.y - imagePos.y;
    
    // Return the image and positioning information
    return {
      imageUrl: walletInfo.image_location,
      position: {
        x: relX,
        y: relY
      },
      imageDimensions: {
        width: imagePos.width,
        height: imagePos.height
      }
    };
  };
  
  const magnifierView = calculateMagnifierView();
  
  if (!isEnabled) return null;

  return (
    <>
      {/* Magnifier */}
      {isVisible && (
        <div 
          className="absolute rounded-lg overflow-hidden pointer-events-none z-50 bg-white shadow-lg"
          style={{
            width: magnifierSize,
            height: magnifierSize + (FEATURES.SHOW_OWNER_WALLET ? 60 : 0),
            left: currentCell.x + GRID_SIZE + 10,
            top: currentCell.y,
            border: `${MAGNIFIER.BORDER_WIDTH}px solid ${MAGNIFIER.BORDER_COLOR}`,
            ...(currentCell.x + GRID_SIZE + magnifierSize + 10 > CANVAS_WIDTH && { 
              left: currentCell.x - magnifierSize - 10 
            }),
            ...(currentCell.y + magnifierSize + (FEATURES.SHOW_OWNER_WALLET ? 60 : 0) > CANVAS_HEIGHT && { 
              top: CANVAS_HEIGHT - magnifierSize - (FEATURES.SHOW_OWNER_WALLET ? 60 : 0)
            }),
          }}
        >
          {/* Magnifier content */}
          <div 
            className="w-full relative"
            style={{ 
              height: magnifierSize,
              backgroundColor: MAGNIFIER.EMPTY_BLOCK_COLOR,
              backgroundImage: `linear-gradient(to right, ${MAGNIFIER.GRID_COLOR} 1px, transparent 1px), linear-gradient(to bottom, ${MAGNIFIER.GRID_COLOR} 1px, transparent 1px)`,
              backgroundSize: `${GRID_SIZE}px ${GRID_SIZE}px`
            }}
          >
            {/* Display the image if available */}
            {walletInfo?.success && magnifierView ? (
              <div 
                className="absolute inset-0 overflow-hidden" 
                style={{ 
                  backgroundImage: `url(${magnifierView.imageUrl})`,
                  backgroundSize: `${magnifierView.imageDimensions.width * MAGNIFIER.ZOOM_FACTOR}px ${magnifierView.imageDimensions.height * MAGNIFIER.ZOOM_FACTOR}px`,
                  backgroundPosition: `${-magnifierView.position.x * MAGNIFIER.ZOOM_FACTOR}px ${-magnifierView.position.y * MAGNIFIER.ZOOM_FACTOR}px`,
                  imageRendering: MAGNIFIER.RENDER_QUALITY as 'auto' | 'pixelated' | 'crisp-edges'
                }}
              />
            ) : (
              // Empty area indicator - white block with gridlines
              <div className="absolute inset-0 flex items-center justify-center">
                <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect x="5" y="5" width="30" height="30" stroke="#aaa" strokeWidth="1" fill="none" strokeDasharray="3 3"/>
                  <text x="20" y="22" textAnchor="middle" fontSize="6" fill="#999">No image</text>
                </svg>
              </div>
            )}
            
            {/* Cell highlight */}
            <div
              className="absolute border-2 border-yellow-400 bg-yellow-100 bg-opacity-20"
              style={{
                width: '100%',
                height: '100%',
                left: 0,
                top: 0,
              }}
            />
          </div>
          
          {/* Information display */}
          {FEATURES.SHOW_OWNER_WALLET && (
            <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-75 text-white text-xs flex flex-col items-center justify-center overflow-hidden">
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin my-1"></div>
              ) : (
                <>
                  <div className="w-full text-left whitespace-nowrap overflow-hidden text-ellipsis px-1">
                    x: {walletInfo?.position?.clickedX || currentCell.x}, y: {walletInfo?.position?.clickedY || currentCell.y}
                  </div>
                  <div className="w-full text-left whitespace-nowrap overflow-hidden text-ellipsis px-1">
                    {walletInfo?.image_location || 'Unknown'}
                  </div>
                  <p className="w-full text-left whitespace-nowrap overflow-hidden text-ellipsis px-1">
                    {walletInfo?.wallet || 'Unknown'}
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      )}
      
      {/* Cell highlight on canvas */}
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
      
      {/* Mouse event overlay */}
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