// src/components/canvas/CanvasImageLoader.tsx
'use client';

import { PlacedImage, CanvasImageLoaderProps } from '@/types/canvas';

export default function CanvasImageLoader({ placedImages }: CanvasImageLoaderProps) {
  return (
    <>
      {placedImages.map((image) => (
        <div
          key={image.id}
          className="absolute"
          style={{
            left: `${image.x}px`,
            top: `${image.y}px`,
            width: `${image.width}px`,
            height: `${image.height}px`,
          }}
        >
          <img
            src={image.src}
            alt=""
            className={`w-full h-full object-cover pointer-events-none ${
              image.status === 'PENDING' || 
              image.status === 'PROCESSING'
                ? 'opacity-70 outline outline-2 outline-red-500'
                : ''
            }`}
            draggable={false}
          />
          {(image.status === 'PENDING' || image.status === 'PROCESSING') && (
            <div className="absolute inset-0 bg-red-500 bg-opacity-10 flex items-center justify-center">
              <span className="bg-white bg-opacity-70 text-red-600 text-xs font-bold px-2 py-1 rounded-sm">
                {image.status === 'PROCESSING' 
                  ? 'Payment Processing...' 
                  : 'Payment Pending'}
              </span>
            </div>
          )}
        </div>
      ))}
    </>
  );
}
