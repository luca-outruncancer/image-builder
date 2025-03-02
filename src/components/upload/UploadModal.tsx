// src/components/upload/UploadModal.tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { X } from 'lucide-react';
import { PRESET_SIZES, calculateCost, ACTIVE_PAYMENT_TOKEN } from '@/utils/constants';
import { useImageStore } from '@/store/useImageStore';

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
    
    console.log("Calculated cost:", cost);
    
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="relative w-full max-w-lg bg-white/10 backdrop-blur-md rounded-xl text-white">
        <button 
          onClick={onClose}
          className="absolute top-3 right-3 text-white/70 hover:text-white"
        >
          <X size={20} />
        </button>
        
        <h2 className="text-xl font-bold p-6 border-b border-white/20">
          {step === 'select' ? 'Upload Image' : 'Preview Image'}
        </h2>

        <div className="p-6">
          {step === 'select' ? (
            <>
              <div className="mb-4">
                <h3 className="font-medium mb-2 text-white/90">Select Size</h3>
                <div className="grid grid-cols-2 gap-2">
                  {PRESET_SIZES.map((size) => {
                    const cost = calculateCost(size.width, size.height);
                    return (
                      <button
                        key={`${size.width}x${size.height}`}
                        className={`p-2 border rounded transition-colors ${
                          !isCustomSize && selectedSize === size 
                            ? 'bg-blue-500 border-blue-600 text-white' 
                            : 'border-white/30 hover:bg-white/10'
                        }`}
                        onClick={() => {
                          setSelectedSize(size);
                          setIsCustomSize(false);
                        }}
                      >
                        {size.width} x {size.height}
                        <div className="mt-1 text-xs font-semibold text-blue-300">
                          {cost} {ACTIVE_PAYMENT_TOKEN}
                        </div>
                      </button>
                    );
                  })}
                  <button
                    className={`p-2 border rounded transition-colors ${
                      isCustomSize 
                        ? 'bg-blue-500 border-blue-600 text-white' 
                        : 'border-white/30 hover:bg-white/10'
                    }`}
                    onClick={() => setIsCustomSize(true)}
                  >
                    Custom Size
                  </button>
                </div>
              </div>

              {isCustomSize && (
                <div className="mb-4 bg-white/5 p-3 rounded-lg">
                  <div className="flex gap-2">
                    <div>
                      <label className="block text-sm mb-1 text-white/80">Width (px)</label>
                      <input
                        type="number"
                        value={customSize.width}
                        onChange={(e) => setCustomSize(prev => ({ ...prev, width: parseInt(e.target.value) }))}
                        className="border rounded p-1 w-full bg-white/10 border-white/20 text-white"
                        min="10"
                        max="2000"
                      />
                    </div>
                    <div>
                      <label className="block text-sm mb-1 text-white/80">Height (px)</label>
                      <input
                        type="number"
                        value={customSize.height}
                        onChange={(e) => setCustomSize(prev => ({ ...prev, height: parseInt(e.target.value) }))}
                        className="border rounded p-1 w-full bg-white/10 border-white/20 text-white"
                        min="10"
                        max="1000"
                      />
                    </div>
                  </div>
                  <div className="mt-2 text-right">
                    <span className="font-bold text-blue-300">{currentCost} {ACTIVE_PAYMENT_TOKEN}</span>
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
                  className="w-full p-3 border-2 border-dashed border-white/30 rounded-lg hover:border-blue-400 transition-colors text-white/80 hover:text-white"
                >
                  {selectedFile ? selectedFile.name : 'Click to upload image'}
                </button>
              </div>
            </>
          ) : (
            preview && (
              <div className="mb-4">
                <div className="border border-white/20 rounded p-2 bg-white/5">
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
                <div className="text-sm text-white/80 mt-2 text-center">
                  <p>
                    {isCustomSize ? customSize.width : selectedSize.width} x {isCustomSize ? customSize.height : selectedSize.height} pixels
                  </p>
                  <p className="font-bold text-blue-300 mt-1">
                    Cost: {currentCost} {ACTIVE_PAYMENT_TOKEN}
                  </p>
                </div>
              </div>
            )
          )}
        </div>

        <div className="flex justify-end border-t border-white/20 p-6">
          {step === 'select' ? (
            <button
              onClick={handleNext}
              disabled={!selectedFile}
              className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
            >
              Next
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={handleBack}
                className="px-4 py-2 border border-white/30 text-white rounded-md hover:bg-white/10 font-medium transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleConfirm}
                className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 font-medium transition-colors"
              >
                Confirm
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
