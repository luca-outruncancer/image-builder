// src/components/upload/UploadFlow.tsx
'use client';

import { useState, useRef } from 'react';
import { PRESET_SIZES } from '@/utils/constants';
import { useImageStore } from '@/store/useImageStore';
import ModalLayout from '../shared/ModalLayout';

export default function UploadFlow({ isOpen }: { isOpen: boolean }) {
  const [step, setStep] = useState<'size' | 'preview'>('size');
  const [selectedSize, setSelectedSize] = useState(PRESET_SIZES[0]);
  const [isCustomSize, setIsCustomSize] = useState(false);
  const [customSize, setCustomSize] = useState({ width: 100, height: 100 });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ url: string } | null>(null);
  const setImageToPlace = useImageStore(state => state.setImageToPlace);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      const url = URL.createObjectURL(file);
      setPreview({ url });
    }
  };

  const handleNext = () => {
    if (step === 'size' && selectedFile) {
      setStep('preview');
    } else if (step === 'preview') {
      const dimensions = isCustomSize ? customSize : selectedSize;
      setImageToPlace({
        file: selectedFile!,
        width: dimensions.width,
        height: dimensions.height,
        previewUrl: preview!.url
      });
      window.location.reload();
    }
  };

  return (
    <ModalLayout
      isOpen={isOpen}
      title={step === 'size' ? 'Upload Image' : 'Preview Image'}
      onNext={selectedFile ? handleNext : undefined}
      nextLabel={step === 'preview' ? 'Continue' : 'Next'}
    >
      {step === 'size' ? (
        <>
          <div className="mb-4">
            <h3 className="font-medium mb-2">Select Size</h3>
            <div className="grid grid-cols-2 gap-2">
              {PRESET_SIZES.map((size) => (
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
                </button>
              ))}
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
            </div>
          )}

          <div className="mb-4">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              accept="image/*"
              className="hidden"
              id="file-upload"
            />
            <label 
              htmlFor="file-upload"
              className="block w-full p-2 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-500 transition-colors cursor-pointer text-center"
            >
              {selectedFile ? selectedFile.name : 'Click to upload image'}
            </label>
          </div>
        </>
      ) : (
        <div className="mb-4">
          <div className="p-4 flex items-center justify-center">
            <img
              src={preview?.url}
              alt="Preview"
              style={{
                width: isCustomSize ? customSize.width : selectedSize.width,
                height: isCustomSize ? customSize.height : selectedSize.height,
                objectFit: 'cover',
                border: '1px solid black'
              }}
            />
          </div>
          <p className="text-sm text-gray-600 mt-2 text-center">
            {isCustomSize ? customSize.width : selectedSize.width} x {isCustomSize ? customSize.height : selectedSize.height} pixels
          </p>
        </div>
      )}
    </ModalLayout>
  );
}