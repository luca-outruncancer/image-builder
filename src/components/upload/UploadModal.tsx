// src/components/upload/UploadModal.tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { X } from 'lucide-react';
import { PRESET_SIZES, calculateCost, ACTIVE_PAYMENT_TOKEN } from '@/utils/constants';
import { useImageStore } from '@/store/useImageStore';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

export default function UploadModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [selectedSize, setSelectedSize] = useState(PRESET_SIZES[0]);
  const [isCustomSize, setIsCustomSize] = useState(false);
  const [customSize, setCustomSize] = useState({ width: 100, height: 100 });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ url: string } | null>(null);
  const [step, setStep] = useState<'select' | 'preview'>('select');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const setImageToPlace = useImageStore(state => state.setImageToPlace);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 1024 * 1024) {
        alert('File size must be less than 1MB');
        return;
      }
      if (!file.type.startsWith('image/')) {
        alert('Only image files are allowed');
        return;
      }
      setSelectedFile(file);
    }
  };

  useEffect(() => {
    if (!selectedFile) return;
    const objectUrl = URL.createObjectURL(selectedFile);
    setPreview({ url: objectUrl });
    return () => URL.revokeObjectURL(objectUrl);
  }, [selectedFile]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    }
  }, [isOpen]);

  // Handle escape key press
  useEffect(() => {
    const handleEscapeKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscapeKey);
    return () => document.removeEventListener("keydown", handleEscapeKey);
  }, [isOpen, onClose]);

  const handleNext = () => {
    if (selectedFile) setStep('preview');
  };

  const handleBack = () => {
    setStep('select');
  };

  const handleConfirm = () => {
    if (!selectedFile || !preview) return;
    
    const dimensions = isCustomSize ? customSize : selectedSize;
    // Calculate the cost based on dimensions
    const cost = calculateCost(dimensions.width, dimensions.height);
    
    setImageToPlace({
      file: selectedFile,
      width: dimensions.width,
      height: dimensions.height,
      previewUrl: preview.url,
      cost: cost
    });
    onClose();
  };

  // Calculate the current cost
  const currentCost = isCustomSize 
    ? calculateCost(customSize.width, customSize.height) 
    : calculateCost(selectedSize.width, selectedSize.height);

  if (!isOpen) return null;

  const renderContent = () => {
    if (step === 'select') {
      return (
        <>
          <div className="mb-4">
            <h3 className="font-medium mb-2">Select Size</h3>
            <div className="grid grid-cols-2 gap-2">
            {PRESET_SIZES.map((size) => {
              const cost = calculateCost(size.width, size.height);
              return (
                <button
                  key={`${size.width}x${size.height}`}
                  className={`p-2 border rounded transition-colors ${
                    !isCustomSize && selectedSize === size ? 'bg-blue-500 text-white' : 'border-gray-200 hover:bg-gray-50'
                  }`}
                  onClick={() => {
                    setSelectedSize(size);
                    setIsCustomSize(false);
                  }}
                >
                  {size.width} × {size.height}
                  <div className="mt-1 text-xs font-semibold">
                    {cost} {ACTIVE_PAYMENT_TOKEN}
                  </div>
                </button>
              );
            })}
              <button
                className={`p-2 border rounded transition-colors ${isCustomSize ? 'bg-blue-500 text-white' : 'border-gray-200 hover:bg-gray-50'}`}
                onClick={() => setIsCustomSize(true)}
              >
                Custom Size
              </button>
            </div>
          </div>

          {isCustomSize && (
            <div className="mb-4">
              <div className="flex gap-2">
                <div>
                  <label className="block text-sm mb-1">Width (px)</label>
                  <input
                    type="number"
                    value={customSize.width}
                    onChange={(e) => setCustomSize(prev => ({ ...prev, width: parseInt(e.target.value) }))}
                    className="border rounded p-2 w-full"
                    min="10"
                    max="2000"
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1">Height (px)</label>
                  <input
                    type="number"
                    value={customSize.height}
                    onChange={(e) => setCustomSize(prev => ({ ...prev, height: parseInt(e.target.value) }))}
                    className="border rounded p-2 w-full"
                    min="10"
                    max="1000"
                  />
                </div>
              </div>
              <div className="mt-2 text-right">
                <span className="font-bold text-blue-600">{currentCost} {ACTIVE_PAYMENT_TOKEN}</span>
              </div>
            </div>
          )}

          <div className="mb-4">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              accept="image/*"
              className="hidden"
            />
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="w-full p-4 border-2 border-dashed border-gray-200 rounded-lg hover:border-blue-500 transition-colors"
            >
              {selectedFile ? selectedFile.name : 'Click to upload image'}
            </button>
          </div>
        </>
      );
    }

    return (
      <>
        {preview && (
          <div className="mb-4">
            <div className="border rounded p-2 bg-gray-50">
              <img
                src={preview.url}
                alt="Preview"
                style={{
                  width: isCustomSize ? customSize.width : selectedSize.width,
                  height: isCustomSize ? customSize.height : selectedSize.height,
                  objectFit: 'cover'
                }}
                className="mx-auto"
              />
            </div>
            <div className="text-sm text-gray-600 mt-2 text-center">
              <p>
                {isCustomSize ? customSize.width : selectedSize.width} × {isCustomSize ? customSize.height : selectedSize.height} pixels
              </p>
              <p className="font-bold text-blue-600 mt-1">
                Cost: {currentCost} {ACTIVE_PAYMENT_TOKEN}
              </p>
            </div>
          </div>
        )}
      </>
    );
  };

  const renderButtons = () => {
    if (step === 'select') {
      return (
        <Button
          className="bg-blue-500 hover:bg-blue-600 text-white"
          onClick={handleNext}
          disabled={!selectedFile}
        >
          Next
        </Button>
      );
    }

    return (
      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          onClick={handleBack}
        >
          Back
        </Button>
        <Button
          className="bg-blue-500 hover:bg-blue-600 text-white"
          onClick={handleConfirm}
        >
          Next
        </Button>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop with blur effect */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-all duration-300"
        onClick={onClose}
      />

      {/* Modal container */}
      <div
        className="relative z-50 flex flex-col w-full max-w-md rounded-xl border border-gray-200 bg-white shadow-xl animate-in fade-in-0 zoom-in-95 duration-200 max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex flex-col space-y-1.5 p-6 pb-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold leading-none tracking-tight">{step === 'select' ? 'Upload Image' : 'Preview Image'}</h2>
            <button
              onClick={onClose}
              className="inline-flex items-center justify-center rounded-full w-8 h-8 transition-colors hover:bg-gray-100"
            >
              <X className="h-4 w-4 text-gray-500 hover:text-gray-900" />
              <span className="sr-only">Close</span>
            </button>
          </div>
        </div>

        <Separator />

        {/* Content with scrolling */}
        <div className="flex-1 overflow-auto p-6 pt-4">
          {renderContent()}
        </div>

        {/* Footer */}
        <Separator />
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 p-6 pt-4">
          {renderButtons()}
        </div>
      </div>
    </div>
  );
}
