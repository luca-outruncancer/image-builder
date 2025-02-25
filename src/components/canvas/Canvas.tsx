// src/components/canvas/Canvas.tsx
'use client';

import { useRef, useState, useEffect } from 'react';
import { CANVAS_WIDTH, CANVAS_HEIGHT, GRID_SIZE } from '@/utils/constants';
import { useImageStore } from '@/store/useImageStore';
import GridOverlay from './GridOverlay';
import ConfirmPlacement from './ConfirmPlacement';
import { getImageRecords } from '@/lib/imageStorage';
import ModalLayout from '../shared/ModalLayout';

interface PlacedImage {
  id: string;
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
  locked: boolean;
  file?: File;
}

interface SuccessInfo {
  timestamp: string;
  imageName: string;
  position: { x: number; y: number };
}

export default function Canvas({ className = '' }: { className?: string }) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [placedImages, setPlacedImages] = useState<PlacedImage[]>([]);
  const [tempImage, setTempImage] = useState<PlacedImage | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState<PlacedImage | null>(null);
  const [successInfo, setSuccessInfo] = useState<SuccessInfo | null>(null);
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const imageToPlace = useImageStore(state => state.imageToPlace);
  const setImageToPlace = useImageStore(state => state.setImageToPlace);

  useEffect(() => {
    const loadPlacedImages = async () => {
      try {
        const records = await getImageRecords();
        const loadedImages = records.map(record => ({
          id: record.image_id.toString(),
          src: record.image_location,
          x: record.start_position_x,
          y: record.start_position_y,
          width: record.size_x,
          height: record.size_y,
          locked: record.active
        }));
        setPlacedImages(loadedImages);
      } catch (error) {
        console.error('Failed to load placed images:', error);
      }
    };

    loadPlacedImages();
  }, []);

  useEffect(() => {
    if (imageToPlace) {
      setTempImage({
        id: Date.now().toString(),
        src: imageToPlace.previewUrl,
        x: 0,
        y: 0,
        width: imageToPlace.width,
        height: imageToPlace.height,
        locked: false,
        file: imageToPlace.file
      });
      setImageToPlace(null);
    }
  }, [imageToPlace, setImageToPlace]);

  const snapToGrid = (value: number) => Math.round(value / GRID_SIZE) * GRID_SIZE;

  const isPositionEmpty = (x: number, y: number, width: number, height: number, excludeId?: string) => {
    return !placedImages.some(img => {
      if (img.id === excludeId) return false;
      return !(x + width <= img.x || x >= img.x + img.width ||
               y + height <= img.y || y >= img.y + img.height);
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!canvasRef.current || !tempImage || pendingConfirmation) return; // Add pendingConfirmation check  
    const rect = canvasRef.current.getBoundingClientRect();
    const x = snapToGrid(e.clientX - rect.left - tempImage.width / 2);
    const y = snapToGrid(e.clientY - rect.top - tempImage.height / 2);
    
    const newX = Math.max(0, Math.min(x, CANVAS_WIDTH - tempImage.width));
    const newY = Math.max(0, Math.min(y, CANVAS_HEIGHT - tempImage.height));
    
    if (isPositionEmpty(newX, newY, tempImage.width, tempImage.height)) {
      setTempImage(prev => prev ? { ...prev, x: newX, y: newY } : null);
    }
    setMousePosition({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const handleMouseUp = () => {
    if (tempImage) {
      setPendingConfirmation(tempImage);
    }
  };

  const handleCancel = () => {
    window.location.reload();
  };
  
  const handleBack = () => {
    setTempImage(null);
    setPendingConfirmation(null);
    setImageToPlace({
      file: tempImage?.file!,
      width: tempImage?.width!,
      height: tempImage?.height!,
      previewUrl: tempImage?.src!
    });
  };
  

  const handleConfirmPlacement = async () => {
    if (!tempImage?.file) return;

    try {
      const formData = new FormData();
      formData.append('file', tempImage.file);
      formData.append('position', JSON.stringify({ x: tempImage.x, y: tempImage.y }));
      formData.append('size', JSON.stringify({ width: tempImage.width, height: tempImage.height }));

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });

      const data = await response.json();
      if (!data.success) throw new Error(data.error);

      setPlacedImages(prev => [...prev, { ...tempImage, src: data.url, locked: true, id: data.record.image_id.toString() }]);
      setTempImage(null);
      setPendingConfirmation(null);
      
      setSuccessInfo({
        timestamp: new Date().toLocaleString(),
        imageName: tempImage.file.name,
        position: { x: tempImage.x, y: tempImage.y }
      });
    } catch (error) {
      console.error('Failed to save placement:', error);
      alert('Failed to save image placement');
    }
  };

  const handleCancelPlacement = () => {
    setPendingConfirmation(null);
  };

  const handleDone = () => {
    setSuccessInfo(null);
    window.location.reload();
  };

  const canvasStyle = {
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    overflow: 'hidden',
    backgroundImage: `url('/patterns/cork-board-background.jpeg')`,
    backgroundSize: '400px 400px',
    backgroundRepeat: 'repeat',
  };

  return (
    <>
      <div
        ref={canvasRef}
        className={`relative border border-gray-300 ${className}`}
        style={canvasStyle}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <GridOverlay />
        
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
              className="w-full h-full object-cover pointer-events-none"
              draggable={false}
            />
          </div>
        ))}

        {tempImage && !pendingConfirmation && (
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
        )}
      </div>

      {pendingConfirmation && (
        <ConfirmPlacement
        position={{ x: pendingConfirmation.x, y: pendingConfirmation.y }}
        onConfirm={handleConfirmPlacement}
        onCancel={handleCancel}
        onBack={() => {
          setTempImage(null);
          setPendingConfirmation(null);
          setImageToPlace({
            file: tempImage?.file!,
            width: tempImage?.width!,
            height: tempImage?.height!,
            previewUrl: tempImage?.src!
          });
        }}
        onReposition={() => setPendingConfirmation(null)}
      />
      )}

        {successInfo && (
        <ModalLayout
            isOpen={true}
            title="Congratulations!"
            onClose={handleDone}
            customButtons={
            <div className="flex justify-end mt-6">
                <button
                onClick={handleDone}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                >
                Done
                </button>
            </div>
            }
        >
          <div className="text-center">
            <p>Image uploaded successfully!</p>
            <div className="mt-4 text-left text-sm">
              <p>Timestamp: {successInfo.timestamp}</p>
              <p>Image: {successInfo.imageName}</p>
              <p>Position: ({successInfo.position.x}, {successInfo.position.y})</p>
            </div>
          </div>
        </ModalLayout>
        )}
    </>
  );
}