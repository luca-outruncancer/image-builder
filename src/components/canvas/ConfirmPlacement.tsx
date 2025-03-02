// src/components/canvas/ConfirmPlacement.tsx
"use client";

import { useEffect } from 'react';
import { X } from 'lucide-react';
import { useWallet } from '@solana/wallet-adapter-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
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

  // Lock body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    }
  }, []);

  // Handle escape key press
  useEffect(() => {
    const handleEscapeKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
      }
    };

    document.addEventListener("keydown", handleEscapeKey);
    return () => document.removeEventListener("keydown", handleEscapeKey);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop with blur effect */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-all duration-300"
        onClick={onCancel}
      />

      {/* Modal container */}
      <div
        className="relative z-50 flex flex-col w-full max-w-md rounded-xl border border-gray-200 bg-white shadow-xl animate-in fade-in-0 zoom-in-95 duration-200 max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex flex-col space-y-1.5 p-6 pb-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold leading-none tracking-tight">Confirm Placement</h2>
            <button
              onClick={onCancel}
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
          <div className="space-y-4">
            <p className="text-center">
              Confirm image placement ({position.x}, {position.y})?
            </p>
            
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
              <h3 className="font-semibold text-lg mb-2">Payment Details</h3>
              <p className="text-sm mb-2">Cost: <span className="font-bold">{cost} {ACTIVE_PAYMENT_TOKEN}</span></p>
              <p className="text-sm mb-2">Recipient: <span className="text-xs font-mono">{RECIPIENT_WALLET_ADDRESS}</span></p>
              
              {!connected && (
                <p className="text-red-500 text-sm mt-2">
                  Please return to the main page and connect your wallet to continue.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <Separator />
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 p-6 pt-4">
          <Button
            variant="outline"
            onClick={onReposition}
          >
            Reposition
          </Button>
          <Button
            className="bg-blue-500 hover:bg-blue-600 text-white"
            onClick={onConfirm}
            disabled={!connected}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
