// src/components/canvas/HowItWorksModal.tsx
'use client';

import { X } from 'lucide-react';

interface HowItWorksModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function HowItWorksModal({ isOpen, onClose }: HowItWorksModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="relative w-full max-w-lg p-6 bg-[#00A86B]/85 backdrop-blur-sm rounded-xl text-white">
        <button 
          onClick={onClose}
          className="absolute top-3 right-3 text-white/70 hover:text-white"
        >
          <X size={20} />
        </button>
        
        <h2 className="text-xl font-bold mb-4 border-b border-white/20 pb-2">How It Works</h2>
        
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="bg-[#004E32] text-white rounded-full w-6 h-6 flex items-center justify-center mt-0.5 flex-shrink-0">1</div>
            <p>Connect your wallet to get started.</p>
          </div>
          
          <div className="flex items-start gap-3">
            <div className="bg-[#004E32] text-white rounded-full w-6 h-6 flex items-center justify-center mt-0.5 flex-shrink-0">2</div>
            <p>Upload your PFP, logo, or preferred image and resize it to your desired dimensions.</p>
          </div>
          
          <div className="flex items-start gap-3">
            <div className="bg-[#004E32] text-white rounded-full w-6 h-6 flex items-center justify-center mt-0.5 flex-shrink-0">3</div>
            <p>Place it anywhere free on the canvas.</p>
          </div>
          
          <div className="flex items-start gap-3">
            <div className="bg-[#004E32] text-white rounded-full w-6 h-6 flex items-center justify-center mt-0.5 flex-shrink-0">4</div>
            <p>Confirm the transaction in your wallet.</p>
          </div>
          
          <div className="flex items-start gap-3">
            <div className="bg-[#004E32] text-white rounded-full w-6 h-6 flex items-center justify-center mt-0.5 flex-shrink-0">5</div>
            <p>Congrats! You are now an <span className="text-emerald-300 font-bold">OUTRUNCANCER angel</span>. Your image is permanently locked on this page and the Solana blockchain.</p>
          </div>
        </div>
        
        <div className="mt-6 pt-4 border-t border-white/20">
          <p className="text-emerald-300 font-bold">$1 per 10 pixels</p>
          <p className="text-sm text-white/70 mt-1">
            Upload an image to secure your spot on this board. Forever on this page and the Solana blockchain.
          </p>
        </div>
      </div>
    </div>
  );
}