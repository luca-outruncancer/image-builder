// src/components/upload/UploadModal.tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { X, FileImage } from 'lucide-react';
import { PRESET_SIZES, calculateCost, ACTIVE_PAYMENT_TOKEN, MAX_FILE_SIZE } from '@/utils/constants';
import { useImageStore, type ImageToPlace } from '@/store/useImageStore';
import { imageLogger } from '@/utils/logger';
import { validateImage } from '@/lib/server/imageValidation';
import { clearSessionBlockhashData } from '@/lib/payment/utils';

interface ImageInfo {
  width?: number;
  height?: number;
  format?: string;
}

interface Size {
  width: number;
  height: number;
}

export default function UploadModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [selectedSize, setSelectedSize] = useState<Size>(PRESET_SIZES[0]);
  const [isCustomSize, setIsCustomSize] = useState(false);
  const [customSize, setCustomSize] = useState<Size>({ width: 100, height: 100 });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ url: string } | null>(null);
  const [step, setStep] = useState<'select' | 'preview'>('select');
  const [imageInfo, setImageInfo] = useState<ImageInfo>({});
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const setImageToPlace = useImageStore(state => state.setImageToPlace);
  const [showErrorPopup, setShowErrorPopup] = useState(false);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setShowErrorPopup(false);
    setIsValidating(true);
    
    try {
      // Validate file and get dimensions
      const result = await validateImage(file, true);
      
      if (!result.isValid) {
        setError(result.error || 'Invalid file');
        setSelectedFile(null);
        setImageInfo({});
        
        if (result.error && result.error.includes('File size must be less than')) {
          setShowErrorPopup(true);
        }
        return;
      }
      
      if (result.dimensions) {
        setImageInfo({
          width: result.dimensions.width,
          height: result.dimensions.height,
          format: file.type.split('/')[1]
        });
      }
      
      setSelectedFile(file);
    } catch (err) {
      setError('Failed to process image');
      setSelectedFile(null);
      setImageInfo({});
    } finally {
      setIsValidating(false);
    }
  };

  useEffect(() => {
    if (!selectedFile) return;
    const objectUrl = URL.createObjectURL(selectedFile);
    setPreview({ url: objectUrl });
    return () => URL.revokeObjectURL(objectUrl);
  }, [selectedFile]);

  const handleNext = () => {
    imageLogger.debug('handleNext called', { 
      hasSelectedFile: !!selectedFile,
      currentStep: step,
      fileInfo: selectedFile ? {
        name: selectedFile.name,
        size: selectedFile.size
      } : null
    });
    
    if (selectedFile) {
      setStep('preview');
      imageLogger.debug('Step updated to preview');
    }
  };

  const handleBack = () => {
    setStep('select');
  };

  const handleConfirm = () => {
    if (!selectedFile || !preview) return;
    
    const dimensions = isCustomSize ? customSize : selectedSize;
    // Calculate the cost based on dimensions
    const cost = calculateCost(dimensions.width, dimensions.height);
    
    imageLogger.info('Calculated cost for image', {
      dimensions,
      cost,
      token: ACTIVE_PAYMENT_TOKEN
    });
    
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
      <div className="relative w-full max-w-lg bg-[#00A86B]/85 backdrop-blur-sm rounded-xl text-white">
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
                            ? 'bg-[#004E32] border-[#005E42] text-white' 
                            : 'border-white/30 hover:bg-white/10'
                        }`}
                        onClick={() => {
                          setSelectedSize(size);
                          setIsCustomSize(false);
                        }}
                      >
                        {size.width} x {size.height}
                        <div className="mt-1 text-xs font-semibold text-emerald-300">
                          {cost} {ACTIVE_PAYMENT_TOKEN}
                        </div>
                      </button>
                    );
                  })}
                  <button
                    className={`p-2 border rounded transition-colors ${
                      isCustomSize 
                        ? 'bg-[#004E32] border-[#005E42] text-white' 
                        : 'border-white/30 hover:bg-white/10'
                    }`}
                    onClick={() => setIsCustomSize(true)}
                  >
                    Custom Size
                  </button>
                </div>
              </div>

              {isCustomSize && (
                <div className="mb-4 bg-[#004E32]/20 p-3 rounded-lg">
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
                    <span className="font-bold text-emerald-300">{currentCost} {ACTIVE_PAYMENT_TOKEN}</span>
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
                  className="w-full p-3 border-2 border-dashed border-white/30 rounded-lg hover:border-emerald-400 transition-colors text-white/80 hover:text-white"
                >
                  {selectedFile ? (
                    <div className="flex items-center justify-center">
                      <FileImage className="mr-2" size={20} />
                      <span>{selectedFile.name}</span>
                    </div>
                  ) : 'Click to upload image (maxsize 1MB)'}
                </button>
                
                {isValidating && (
                  <div className="mt-2 text-xs text-white/70 text-center">
                    <div className="animate-pulse">Validating image...</div>
                  </div>
                )}
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
                  <p className="font-bold text-emerald-300 mt-1">
                    Cost: {currentCost} {ACTIVE_PAYMENT_TOKEN}
                  </p>
                </div>
              </div>
            )
          )}
        </div>

        <div className="flex justify-end border-t border-white/20 p-6">
          {step === 'select' ? (
            <>
              {error && error.includes('Payment already in progress') && (
                <button
                  onClick={() => {
                    clearSessionBlockhashData();
                    setError(null);
                  }}
                  className="px-4 py-2 border border-white/30 text-white rounded-md hover:bg-white/10 font-medium transition-colors mr-2"
                >
                  Reset Payment
                </button>
              )}
              <button
                onClick={() => {
                  imageLogger.debug('Next button clicked', {
                    hasSelectedFile: !!selectedFile,
                    isDisabled: !selectedFile,
                    currentStep: step
                  });
                  handleNext();
                }}
                disabled={!selectedFile}
                className="px-4 py-2 bg-[#004E32] text-white rounded-md hover:bg-[#003D27] disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
              >
                Next
              </button>
            </>
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
                className="px-4 py-2 bg-[#004E32] text-white rounded-md hover:bg-[#003D27] font-medium transition-colors"
              >
                Confirm
              </button>
            </div>
          )}
        </div>

        {showErrorPopup && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80">
            <div className="w-full max-w-md bg-[#00A86B]/85 backdrop-blur-sm rounded-xl text-white p-6 shadow-lg border border-white/20">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-xl font-bold">File Too Large</h3>
                <button 
                  onClick={() => setShowErrorPopup(false)}
                  className="text-white/70 hover:text-white"
                >
                  <X size={24} />
                </button>
              </div>
              
              <div className="py-4">
                <p className="mb-4">{error}</p>
                <p className="text-sm text-white/80">Please select a smaller image file and try again.</p>
              </div>
              
              <div className="flex justify-end mt-4">
                <button
                  onClick={() => setShowErrorPopup(false)}
                  className="px-4 py-2 bg-[#004E32] text-white rounded-md hover:bg-[#003D27] font-medium transition-colors"
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}