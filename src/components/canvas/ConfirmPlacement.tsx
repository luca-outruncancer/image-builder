// src/components/canvas/ConfirmPlacement.tsx
"use client";

import { useWallet } from '@solana/wallet-adapter-react';
import { X } from 'lucide-react';
import { RECIPIENT_WALLET_ADDRESS, ACTIVE_PAYMENT_TOKEN } from '@/utils/constants';

interface ConfirmPlacementProps {
  position: { x: number; y: number };
  cost: number;
  onConfirm: () => void;
  onReposition: () => void;
  onCancel: () => void;
  onBack: () => void;
}

export default function ConfirmPlacement({
  position,
  cost,
  onConfirm,
  onReposition,
  onCancel,
  onBack
}: ConfirmPlacementProps) {
  const { connected } = useWallet();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="relative w-full max-w-lg bg-white/10 backdrop-blur-md rounded-xl text-white">
        <button 
          onClick={onCancel}
          className="absolute top-3 right-3 text-white/70 hover:text-white"
        >
          <X size={20} />
        </button>
        
        <h2 className="text-xl font-bold p-6 border-b border-white/20">
          Confirm Placement
        </h2>

        <div className="p-6">
          <div className="space-y-4">
            <p className="text-center text-white/90">
              Confirm image placement ({position.x}, {position.y})?
            </p>
            
            <div className="bg-blue-500/10 p-4 rounded-lg border border-blue-500/20">
              <h3 className="font-semibold text-lg mb-2 text-white">Payment Details</h3>
              <p className="text-sm mb-2 text-white/90">Cost: <span className="font-bold text-blue-300">{cost} {ACTIVE_PAYMENT_TOKEN}</span></p>
              <p className="text-sm mb-2 text-white/90">Recipient: <span className="text-xs font-mono text-white/70">{RECIPIENT_WALLET_ADDRESS}</span></p>
              
              {!connected && (
                <p className="text-red-300 text-sm mt-2">
                  Please return to the main page and connect your wallet to continue.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end items-center gap-2 border-t border-white/20 p-6">
          <button
            onClick={onReposition}
            className="px-4 py-2 border border-white/30 text-white rounded-md hover:bg-white/10 font-medium transition-colors"
          >
            Reposition
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 font-medium transition-colors"
            disabled={!connected}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}