// src/components/upload/UploadModal.tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { PRESET_SIZES, calculateCost, ACTIVE_PAYMENT_TOKEN } from '@/utils/constants';
import { useImageStore } from '@/store/useImageStore';
import ModalLayout from '@/components/shared/ModalLayout';

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
    
    console.log("Calculated cost:", cost); // Add this for debugging
    
    setImageToPlace({
      file: selectedFile,
      width: dimensions.width,
      height: dimensions.height,
      previewUrl: preview.url,
      cost: cost // Make sure cost is being set
    });
    onClose();
  };

  // Calculate the current cost
  const currentCost = isCustomSize 
    ? calculateCost(customSize.width, customSize.height) 
    : calculateCost(selectedSize.width, selectedSize.height);

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
                  className={`p-2 border rounded ${
                    !isCustomSize && selectedSize === size ? 'bg-blue-500 text-white' : 'hover:bg-gray-100'
                  }`}
                  onClick={() => {
                    setSelectedSize(size);
                    setIsCustomSize(false);
                  }}
                >
                  {size.width} x {size.height}
                  <div className="mt-1 text-xs font-semibold">
                    {cost} {ACTIVE_PAYMENT_TOKEN}
                  </div>
                </button>
              );
            })}
              <button
                className={`p-2 border rounded ${isCustomSize ? 'bg-blue-500 text-white' : 'hover:bg-gray-100'}`}
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
                    className="border p-1 w-full"
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
                    className="border p-1 w-full"
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
              className="w-full p-2 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-500 transition-colors"
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
                {isCustomSize ? customSize.width : selectedSize.width} x {isCustomSize ? customSize.height : selectedSize.height} pixels
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
        <div className="flex justify-end gap-2">
          <button
            onClick={handleNext}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300"
            disabled={!selectedFile}
          >
            Next
          </button>
        </div>
      );
    }

    return (
      <div className="flex justify-end gap-2">
        <button
          onClick={handleBack}
          className="px-4 py-2 border rounded hover:bg-gray-100"
        >
          Back
        </button>
        <button
          onClick={handleConfirm}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Next
        </button>
      </div>
    );
  };

  return (
    <ModalLayout
      isOpen={isOpen}
      title={step === 'select' ? 'Upload Image' : 'Preview Image'}
      customButtons={renderButtons()}
    >
      {renderContent()}
    </ModalLayout>
  );
}