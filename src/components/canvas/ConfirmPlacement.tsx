// src/components/canvas/ConfirmPlacement.tsx
"use client";

import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import ModalLayout from '../shared/ModalLayout';
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
    <ModalLayout
      isOpen={true}
      title="Confirm Placement & Payment"
      onClose={onCancel}
      customButtons={
        <div className="flex justify-end items-center gap-2 mt-6">
          <button
            onClick={onBack}
            className="px-4 py-2 border rounded hover:bg-gray-100"
          >
            Back
          </button>
          <button
            onClick={onReposition}
            className="px-4 py-2 border rounded hover:bg-gray-100"
          >
            Reposition
          </button>
          {connected ? (
            <button
              onClick={onConfirm}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Pay & Confirm
            </button>
          ) : (
            <WalletMultiButton className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
              Connect Wallet to Continue
            </WalletMultiButton>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-center">
          Confirm image placement at position ({position.x}, {position.y})?
        </p>
        
        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
          <h3 className="font-semibold text-lg mb-2">Payment Details</h3>
          <p className="text-sm mb-2">Cost: <span className="font-bold">{cost} {ACTIVE_PAYMENT_TOKEN}</span></p>
          <p className="text-sm mb-2">Recipient: <span className="text-xs font-mono">{RECIPIENT_WALLET_ADDRESS}</span></p>
          
          {!connected && (
            <p className="text-red-500 text-sm mt-2">
              Please connect your wallet to complete this transaction.
            </p>
          )}
        </div>
      </div>
    </ModalLayout>
  );
}