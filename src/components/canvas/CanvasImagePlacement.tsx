// src/components/canvas/CanvasImagePlacement.tsx
'use client';

import { PlacedImage, CanvasImagePlacementProps } from '@/types/canvas';

export default function CanvasImagePlacement({ tempImage }: CanvasImagePlacementProps) {
  return (
    <div
      className="absolute cursor-move"
      style={{
        left: tempImage.x,
        top: tempImage.y,
        width: tempImage.width,
        height: tempImage.height,
      }}
    >
      <img
        src={tempImage.src}
        alt=""
        className="w-full h-full object-cover pointer-events-none"
        draggable={false}
      />
    </div>
  );
}
