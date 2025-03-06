// src/components/canvas/SelectionMagnifier.tsx
'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { MAGNIFIER } from '@/utils/constants';
import html2canvas from 'html2canvas';

interface MagnifierPosition {
  x: number;
  y: number;
}

interface MagnifierState {
  x: number;
  y: number;
  size: number;
  selected: boolean;
  zoomFactor: number;
  borderColor: string;
  borderWidth: number;
}

interface SelectionMagnifierProps {
  canvasRef: React.RefObject<HTMLDivElement>;
  containerRef: React.RefObject<HTMLDivElement>;
  isEnabled: boolean;
}

/**
 * SelectionMagnifier component allows users to draw a selection rectangle
 * that becomes a magnifier for that area of the canvas
 */
const SelectionMagnifier: React.FC<SelectionMagnifierProps> = ({
  canvasRef,
  containerRef,
  isEnabled
}) => {
  // States for drawing selection
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<MagnifierPosition>({ x: 0, y: 0 });
  const [endPoint, setEndPoint] = useState<MagnifierPosition>({ x: 0, y: 0 });
  
  // State for magnifier 
  const [magnifier, setMagnifier] = useState<MagnifierState | null>(null);
  
  // States for magnifier interactions
  const [isDraggingMagnifier, setIsDraggingMagnifier] = useState(false);
  const [isResizingMagnifier, setIsResizingMagnifier] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [resizeCorner, setResizeCorner] = useState<string | null>(null);
  const [resizeStartData, setResizeStartData] = useState<{
    startX: number;
    startY: number;
    startSize: number;
    startMagnifierX: number;
    startMagnifierY: number;
  } | null>(null);

  // Canvas screenshot for magnifier
  const [canvasImage, setCanvasImage] = useState<string | null>(null);
  const [lastCaptureTime, setLastCaptureTime] = useState(0);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  
  // Refs
  const magnifierRef = useRef<HTMLDivElement>(null);
  const resizeHandleRefs = useRef<(HTMLDivElement | null)[]>([null, null, null, null]);
  
  // Function to capture canvas as image
  const captureCanvas = useCallback(async () => {
    if (!canvasRef.current) return;
    
    try {
      // Limit captures to avoid performance issues (max once per second)
      const now = Date.now();
      if (now - lastCaptureTime < 1000 && canvasImage) {
        return;
      }
      
      const canvas = await html2canvas(canvasRef.current, {
        backgroundColor: null,
        scale: 1,
        logging: false,
        allowTaint: true,
        useCORS: true
      });
      
      setCanvasImage(canvas.toDataURL());
      setCanvasSize({
        width: canvasRef.current.clientWidth,
        height: canvasRef.current.clientHeight
      });
      setLastCaptureTime(now);
      
      console.log('Canvas captured:', {
        width: canvasRef.current.clientWidth,
        height: canvasRef.current.clientHeight
      });
    } catch (error) {
      console.error('Error capturing canvas:', error);
    }
  }, [canvasRef, lastCaptureTime, canvasImage]);
  
  // Capture canvas when component mounts
  useEffect(() => {
    if (isEnabled && canvasRef.current) {
      captureCanvas();
    }
  }, [isEnabled, canvasRef, captureCanvas]);

  // Update canvas capture when magnifier moves
  useEffect(() => {
    if (magnifier && !isResizingMagnifier && !isDraggingMagnifier) {
      captureCanvas();
    }
  }, [magnifier?.x, magnifier?.y, isResizingMagnifier, isDraggingMagnifier, captureCanvas]);
  
  // Handle key press for deleting magnifier
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (magnifier?.selected && (e.key === "Escape" || e.key === "Delete" || e.key === "Backspace")) {
        setMagnifier(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [magnifier]);
  
  // Early return if the feature is disabled
  if (!isEnabled) return null;
  
  // Handle mouse down to start drawing or interact with magnifier
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!canvasRef.current || !containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Check if clicking inside magnifier for dragging
    if (magnifier) {
      const dx = x - magnifier.x;
      const dy = y - magnifier.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance <= magnifier.size / 2) {
        setIsDraggingMagnifier(true);
        setDragOffset({ x: dx, y: dy });
        setMagnifier({
          ...magnifier,
          selected: true
        });
        return;
      } else {
        // Clicked outside magnifier, deselect it
        setMagnifier({
          ...magnifier,
          selected: false
        });
      }
    }
    
    // Start drawing new selection
    setIsDrawing(true);
    setStartPoint({ x, y });
    setEndPoint({ x, y });
  };
  
  // Handle mouse move for drawing or dragging
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Handle magnifier dragging
    if (isDraggingMagnifier && magnifier) {
      const newX = Math.max(0, Math.min(rect.width, x - dragOffset.x));
      const newY = Math.max(0, Math.min(rect.height, y - dragOffset.y));
      
      setMagnifier({
        ...magnifier,
        x: newX,
        y: newY
      });
      return;
    }
    
    // Handle magnifier resizing with improved logic
    if (isResizingMagnifier && magnifier && resizeCorner && resizeStartData) {
      let newSize = magnifier.size;
      let newX = magnifier.x;
      let newY = magnifier.y;
      
      // Calculate distance from current mouse position to original center
      const dx = x - resizeStartData.startMagnifierX;
      const dy = y - resizeStartData.startMagnifierY;
      
      if (resizeCorner === "bottomRight") {
        // Bottom right - just adjust size based on distance
        const distance = Math.sqrt(dx * dx + dy * dy) * 2;
        newSize = Math.max(MAGNIFIER.MIN_SIZE, distance);
      } else if (resizeCorner === "topLeft") {
        // Top left - move in opposite direction of resize
        const distance = Math.sqrt(dx * dx + dy * dy) * 2;
        newSize = Math.max(MAGNIFIER.MIN_SIZE, distance);
        
        // Calculate the angle to maintain direction
        const angle = Math.atan2(dy, dx);
        // Move center in the opposite direction of resize
        newX = resizeStartData.startMagnifierX - (Math.cos(angle) * (newSize - resizeStartData.startSize)) / 2;
        newY = resizeStartData.startMagnifierY - (Math.sin(angle) * (newSize - resizeStartData.startSize)) / 2;
      } else if (resizeCorner === "topRight") {
        // Top right - adjust Y position and size
        const distance = Math.sqrt(dx * dx + dy * dy) * 2;
        newSize = Math.max(MAGNIFIER.MIN_SIZE, distance);
        
        // Calculate the angle to maintain direction
        const angle = Math.atan2(dy, dx);
        // Only adjust Y position
        newY = resizeStartData.startMagnifierY - (Math.sin(angle) * (newSize - resizeStartData.startSize)) / 2;
      } else if (resizeCorner === "bottomLeft") {
        // Bottom left - adjust X position and size
        const distance = Math.sqrt(dx * dx + dy * dy) * 2;
        newSize = Math.max(MAGNIFIER.MIN_SIZE, distance);
        
        // Calculate the angle to maintain direction
        const angle = Math.atan2(dy, dx);
        // Only adjust X position
        newX = resizeStartData.startMagnifierX - (Math.cos(angle) * (newSize - resizeStartData.startSize)) / 2;
      }
      
      // Ensure magnifier stays within bounds
      newX = Math.max(0, Math.min(rect.width, newX));
      newY = Math.max(0, Math.min(rect.height, newY));
      
      setMagnifier({
        ...magnifier,
        x: newX,
        y: newY,
        size: newSize
      });
      return;
    }
    
    // Handle drawing selection
    if (isDrawing) {
      // Calculate the size for a square
      const width = Math.abs(x - startPoint.x);
      const height = Math.abs(y - startPoint.y);
      const size = Math.max(width, height);
      
      // Adjust the end point to make it a square
      let newX = x;
      let newY = y;
      
      if (x >= startPoint.x) {
        newX = startPoint.x + size;
      } else {
        newX = startPoint.x - size;
      }
      
      if (y >= startPoint.y) {
        newY = startPoint.y + size;
      } else {
        newY = startPoint.y - size;
      }
      
      setEndPoint({ x: newX, y: newY });
    }
  };
  
  // Handle mouse up to finish drawing or dragging
  const handleMouseUp = () => {
    // Handle finishing dragging
    if (isDraggingMagnifier) {
      setIsDraggingMagnifier(false);
      captureCanvas(); // Update canvas capture
      return;
    }
    
    // Handle finishing resize
    if (isResizingMagnifier) {
      setIsResizingMagnifier(false);
      setResizeCorner(null);
      setResizeStartData(null);
      captureCanvas(); // Update canvas capture
      return;
    }
    
    // Handle finishing drawing
    if (isDrawing) {
      setIsDrawing(false);
      
      // Create magnifier from the selection
      const size = Math.abs(endPoint.x - startPoint.x);
      const centerX = Math.min(startPoint.x, endPoint.x) + size / 2;
      const centerY = Math.min(startPoint.y, endPoint.y) + size / 2;
      
      // Only create if it's a meaningful size
      if (size > MAGNIFIER.MIN_SIZE) {
        setMagnifier({
          x: centerX,
          y: centerY,
          size: size,
          selected: true,
          zoomFactor: MAGNIFIER.ZOOM_FACTOR,
          borderColor: MAGNIFIER.BORDER_COLOR,
          borderWidth: MAGNIFIER.BORDER_WIDTH
        });
        
        // Capture canvas after creating magnifier
        setTimeout(captureCanvas, 100);
      }
    }
  };
  
  // Handle resize start
  const handleResizeStart = (e: React.MouseEvent, corner: string) => {
    e.stopPropagation();
    e.preventDefault();
    
    if (!magnifier || !containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    setIsResizingMagnifier(true);
    setResizeCorner(corner);
    setResizeStartData({
      startX: mouseX,
      startY: mouseY,
      startSize: magnifier.size,
      startMagnifierX: magnifier.x,
      startMagnifierY: magnifier.y
    });
  };
  
  // Render the component
  return (
    <>
      {/* Selection rectangle during drawing */}
      {isDrawing && (
        <div
          className="absolute border-2 border-blue-500 bg-blue-200 bg-opacity-20 pointer-events-none"
          style={{
            left: Math.min(startPoint.x, endPoint.x),
            top: Math.min(startPoint.y, endPoint.y),
            width: Math.abs(endPoint.x - startPoint.x),
            height: Math.abs(endPoint.y - startPoint.y)
          }}
        />
      )}
      
      {/* Magnifier */}
      {magnifier && canvasRef.current && (
        <>
          {/* Selection square when selected */}
          {magnifier.selected && (
            <div
              className="absolute border border-blue-500 pointer-events-none"
              style={{
                left: magnifier.x - magnifier.size / 2,
                top: magnifier.y - magnifier.size / 2,
                width: magnifier.size,
                height: magnifier.size
              }}
            />
          )}
          
          {/* Magnifier circle */}
          <div
            ref={magnifierRef}
            className="absolute rounded-full overflow-hidden cursor-move"
            style={{
              left: magnifier.x - magnifier.size / 2,
              top: magnifier.y - magnifier.size / 2,
              width: magnifier.size,
              height: magnifier.size,
              border: `${magnifier.borderWidth}px solid ${magnifier.borderColor}`,
              boxShadow: magnifier.selected ? "0 0 0 1px #3b82f6" : "none"
            }}
          >
            {/* Magnified content using canvas screenshot */}
            <div 
              className="w-full h-full relative overflow-hidden rounded-full"
              style={{
                backgroundColor: 'rgba(0,0,0,0.2)', // Fallback
                backgroundImage: canvasImage ? `url(${canvasImage})` : 'none',
                backgroundSize: canvasImage ? 
                  `${canvasSize.width * magnifier.zoomFactor}px ${canvasSize.height * magnifier.zoomFactor}px` : 
                  'auto',
                backgroundPosition: canvasImage ? 
                  `-${(magnifier.x * magnifier.zoomFactor) - magnifier.size / 2}px -${(magnifier.y * magnifier.zoomFactor) - magnifier.size / 2}px` : 
                  'center'
              }}
            />
          </div>
          
          {/* Resize handles when selected */}
          {magnifier.selected && (
            <>
              <div
                ref={(el) => (resizeHandleRefs.current[0] = el)}
                className="absolute bg-white border border-blue-500 rounded-sm cursor-nwse-resize z-10 w-3 h-3"
                style={{
                  top: magnifier.y - magnifier.size / 2 - 4,
                  left: magnifier.x - magnifier.size / 2 - 4
                }}
                onMouseDown={(e) => handleResizeStart(e, "topLeft")}
              />
              <div
                ref={(el) => (resizeHandleRefs.current[1] = el)}
                className="absolute bg-white border border-blue-500 rounded-sm cursor-nesw-resize z-10 w-3 h-3"
                style={{
                  top: magnifier.y - magnifier.size / 2 - 4,
                  left: magnifier.x + magnifier.size / 2 - 4
                }}
                onMouseDown={(e) => handleResizeStart(e, "topRight")}
              />
              <div
                ref={(el) => (resizeHandleRefs.current[2] = el)}
                className="absolute bg-white border border-blue-500 rounded-sm cursor-nesw-resize z-10 w-3 h-3"
                style={{
                  top: magnifier.y + magnifier.size / 2 - 4,
                  left: magnifier.x - magnifier.size / 2 - 4
                }}
                onMouseDown={(e) => handleResizeStart(e, "bottomLeft")}
              />
              <div
                ref={(el) => (resizeHandleRefs.current[3] = el)}
                className="absolute bg-white border border-blue-500 rounded-sm cursor-nwse-resize z-10 w-3 h-3"
                style={{
                  top: magnifier.y + magnifier.size / 2 - 4,
                  left: magnifier.x + magnifier.size / 2 - 4
                }}
                onMouseDown={(e) => handleResizeStart(e, "bottomRight")}
              />
            </>
          )}
        </>
      )}
      
      {/* Transparent overlay to capture events */}
      <div
        className="absolute inset-0 z-20"
        style={{ pointerEvents: isEnabled ? 'auto' : 'none' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />
    </>
  );
};

export default SelectionMagnifier;