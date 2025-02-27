// src/components/canvas/CanvasImageLoader.tsx
'use client';

import { IMAGE_STATUS } from '@/lib/imageStorage';

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

interface CanvasImageLoaderProps {
  placedImages: PlacedImage[];
}

export default function CanvasImageLoader({ placedImages }: CanvasImageLoaderProps) {
  return (
    <>
      {placedImages.map((image) => (
        <div
          key={image.id}
          className="absolute"
          style={{
            left: image.x,
            top: image.y,
            width: image.width,
            height: image.height,
          }}
        >
          <img
            src={image.src}
            alt=""
            className={`w-full h-full object-cover pointer-events-none ${
              image.status === IMAGE_STATUS.PENDING_PAYMENT || 
              image.status === IMAGE_STATUS.PAYMENT_RETRY
                ? 'opacity-70 outline outline-2 outline-red-500'
                : ''
            }`}
            draggable={false}
          />
          {(image.status === IMAGE_STATUS.PENDING_PAYMENT || image.status === IMAGE_STATUS.PAYMENT_RETRY) && (
            <div className="absolute inset-0 bg-red-500 bg-opacity-10 flex items-center justify-center">
              <span className="bg-white bg-opacity-70 text-red-600 text-xs font-bold px-2 py-1 rounded-sm">
                {image.status === IMAGE_STATUS.PAYMENT_RETRY 
                  ? 'Payment Retrying...' 
                  : 'Payment Pending'}
              </span>
            </div>
          )}
        </div>
      ))}
    </>
  );
}
