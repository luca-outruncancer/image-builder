// src/components/canvas/CanvasNavigator.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '@/utils/constants';

interface CanvasNavigatorProps {
  containerRef: React.RefObject<HTMLDivElement>;
  placedImages: any[]; // Array of placed images for minimap
}

export default function CanvasNavigator({ containerRef, placedImages }: CanvasNavigatorProps) {
  const [viewportRect, setViewportRect] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const minimapRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  
  // Scale for minimap (minimap is 150px wide)
  const MINIMAP_WIDTH = 150;
  const scale = MINIMAP_WIDTH / CANVAS_WIDTH;
  
  useEffect(() => {
    const updateViewportRect = () => {
      if (!containerRef.current) return;
      
      const container = containerRef.current;
      const { scrollLeft, scrollTop, clientWidth, clientHeight } = container;
      
      setViewportRect({
        x: scrollLeft * scale,
        y: scrollTop * scale,
        width: clientWidth * scale,
        height: clientHeight * scale
      });
    };
    
    // Update initially and on scroll
    updateViewportRect();
    
    const container = containerRef.current;
    if (container) {
      container.addEventListener('scroll', updateViewportRect);
      window.addEventListener('resize', updateViewportRect);
      
      return () => {
        container.removeEventListener('scroll', updateViewportRect);
        window.removeEventListener('resize', updateViewportRect);
      };
    }
  }, [containerRef, scale]);
  
  const handleMinimapClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!minimapRef.current || !containerRef.current) return;
    
    const minimap = minimapRef.current;
    const { left, top } = minimap.getBoundingClientRect();
    
    // Calculate click position relative to minimap
    const x = e.clientX - left;
    const y = e.clientY - top;
    
    // Convert to full canvas coordinates and center the viewport
    const container = containerRef.current;
    const targetX = (x / scale) - (container.clientWidth / 2);
    const targetY = (y / scale) - (container.clientHeight / 2);
    
    // Scroll to that position
    container.scrollTo({
      left: Math.max(0, targetX),
      top: Math.max(0, targetY),
      behavior: 'smooth'
    });
  };
  
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    isDragging.current = true;
    handleMinimapClick(e);
  };
  
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isDragging.current) {
      handleMinimapClick(e);
    }
  };
  
  const handleMouseUp = () => {
    isDragging.current = false;
  };
  
  useEffect(() => {
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);
  
  return (
    <div className="absolute bottom-4 right-4 z-20 bg-black/50 backdrop-blur-sm border border-white/20 rounded-md p-1 shadow-lg">
      <div 
        ref={minimapRef}
        className="relative w-[150px] h-[150px] cursor-pointer bg-black/30"
        onClick={handleMinimapClick}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        style={{
          backgroundImage: 'linear-gradient(to right, rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.05) 1px, transparent 1px)',
          backgroundSize: `${10 * scale}px ${10 * scale}px` // Grid size scaled
        }}
      >
        {/* Render minimap images */}
        {placedImages.map((img) => (
          <div
            key={img.id}
            className="absolute bg-blue-500/40"
            style={{
              left: img.x * scale,
              top: img.y * scale,
              width: img.width * scale,
              height: img.height * scale
            }}
          />
        ))}
        
        {/* Viewport indicator */}
        <div
          className="absolute border-2 border-white pointer-events-none"
          style={{
            left: viewportRect.x,
            top: viewportRect.y,
            width: viewportRect.width,
            height: viewportRect.height
          }}
        />
      </div>
    </div>
  );
}
