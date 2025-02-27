// src/components/canvas/CanvasImagePlacement.tsx
'use client';

interface PlacedImage {
  id: string;
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
  status: number;
  file?: File;
  cost?: number;
}

interface CanvasImagePlacementProps {
  tempImage: PlacedImage;
}

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
