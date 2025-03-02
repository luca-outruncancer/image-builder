// src/components/canvas/CanvasPaymentHandler.tsx
'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletConnectButton } from '@/components/solana/WalletConnectButton';
import ConfirmPlacement from './ConfirmPlacement';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { usePaymentContext } from '@/lib/payment/PaymentContext';
import { PaymentStatus } from '@/lib/payment/types';

interface PlacedImage {
  id: string;
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
  status: number;
  file?: File;
  cost?: number;
}

interface CanvasPaymentHandlerProps {
  pendingConfirmation: PlacedImage;
  onConfirm: () => void;
  onCancel: () => void;
  onBack: () => void;
  onReposition: () => void;
  onCloseError: () => void;
  onRetry: () => void;
  onDone: () => void;
}

export default function CanvasPaymentHandler({
  pendingConfirmation,
  onConfirm,
  onCancel,
  onBack,
  onReposition,
  onCloseError,
  onRetry,
  onDone
}: CanvasPaymentHandlerProps) {
  const { connected } = useWallet();
  const { 
    paymentStatus, 
    isProcessing, 
    error, 
    successInfo,
    getErrorMessage
  } = usePaymentContext();

  // Determine current payment step/status
  const isConfirmationStep = pendingConfirmation && !isProcessing && !error && !successInfo;
  const isProcessingStep = isProcessing;
  const isErrorStep = error !== null;
  const isSuccessStep = successInfo !== null;

  // Clean up session storage when component unmounts
  useEffect(() => {
    return () => {
      try {
        if (typeof window !== 'undefined') {
          const keysToRemove = [];
          for (let i = 0; i < sessionStorage.length; i++) {
            const key = sessionStorage.key(i);
            if (key && (key.includes('blockhash') || key.includes('transaction'))) {
              keysToRemove.push(key);
            }
          }
          keysToRemove.forEach(key => sessionStorage.removeItem(key));
        }
      } catch (e) {
        console.error("Failed to clear session storage:", e);
      }
    };
  }, []);

  // Lock body scroll when any modal is open
  useEffect(() => {
    if (isProcessingStep || isErrorStep || isSuccessStep) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isProcessingStep, isErrorStep, isSuccessStep]);

  if (isConfirmationStep) {
    return (
      <ConfirmPlacement
        position={{ x: pendingConfirmation.x, y: pendingConfirmation.y }}
        cost={pendingConfirmation.cost || 0}
        onConfirm={onConfirm}
        onCancel={onCancel}
        onBack={onBack}
        onReposition={onReposition}
      />
    );
  }

  // Common modal structure for all states
  const ModalTemplate = ({ 
    title, 
    children, 
    onClose, 
    buttons 
  }: { 
    title: string;
    children: React.ReactNode;
    onClose?: () => void;
    buttons?: React.ReactNode;
  }) => (
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
            <h2 className="text-2xl font-semibold leading-none tracking-tight">{title}</h2>
            {onClose && (
              <button
                onClick={onClose}
                className="inline-flex items-center justify-center rounded-full w-8 h-8 transition-colors hover:bg-gray-100"
              >
                <X className="h-4 w-4 text-gray-500 hover:text-gray-900" />
                <span className="sr-only">Close</span>
              </button>
            )}
          </div>
        </div>

        <Separator />

        {/* Content with scrolling */}
        <div className="flex-1 overflow-auto p-6 pt-4">
          {children}
        </div>

        {/* Footer with buttons if provided */}
        {buttons && (
          <>
            <Separator />
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 p-6 pt-4">
              {buttons}
            </div>
          </>
        )}
      </div>
    </div>
  );

  if (isErrorStep) {
    return (
      <ModalTemplate
        title="Payment Error"
        onClose={onCloseError}
        buttons={
          <>
            <Button
              variant="outline"
              onClick={onCancel}
            >
              Cancel
            </Button>
            <Button
              className="bg-blue-500 hover:bg-blue-600 text-white"
              onClick={onRetry}
            >
              Try Again
            </Button>
          </>
        }
      >
        <div className="text-center p-4">
          <p className="text-red-600 font-semibold">Unable to process payment</p>
          <p className="mt-2 text-gray-700">{error && getErrorMessage(error)}</p>
          
          {!connected && (
            <div className="mt-4">
              <p className="mb-2">Connect your wallet to continue:</p>
              <div className="flex justify-center">
                <WalletConnectButton />
              </div>
            </div>
          )}

          {connected && (
            <div className="mt-4 text-sm text-gray-600">
              <p>Please make sure your wallet has sufficient balance for this transaction.</p>
            </div>
          )}
        </div>
      </ModalTemplate>
    );
  }

  if (isProcessingStep) {
    return (
      <ModalTemplate
        title="Processing Payment"
      >
        <div className="text-center p-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p>Please approve the transaction in your wallet...</p>
          <p className="text-sm text-gray-500 mt-2">Do not close this window until the transaction is complete</p>
          <p className="text-sm text-gray-500 mt-2">Payment will time out after 3 minutes if not completed</p>
        </div>
      </ModalTemplate>
    );
  }

  if (isSuccessStep) {
    return (
      <ModalTemplate
        title="Congratulations!"
        onClose={onDone}
        buttons={
          <Button
            className="bg-blue-500 hover:bg-blue-600 text-white"
            onClick={onDone}
          >
            Done
          </Button>
        }
      >
        <div className="text-center">
          <p className="text-lg font-semibold text-green-600">Image uploaded successfully!</p>
          <div className="mt-4 text-left text-sm">
            <p>Timestamp: {successInfo?.timestamp || new Date().toLocaleString()}</p>
            <p>Image: {successInfo?.metadata?.fileName || "Image"}</p>
            <p>Position: ({successInfo?.metadata?.positionX || 0}, {successInfo?.metadata?.positionY || 0})</p>
            {successInfo?.transactionHash && (
              <div className="mt-2">
                <p className="font-semibold">Transaction Hash:</p>
                <p className="text-xs font-mono break-all bg-gray-100 p-2 rounded">
                  {successInfo.transactionHash}
                </p>
                <p className="mt-2 text-sm text-gray-600">
                  View on{" "}
                  <a
                    href={`https://explorer.solana.com/tx/${successInfo.transactionHash}?cluster=devnet`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-500 hover:underline"
                  >
                    Solana Explorer
                  </a>
                </p>
              </div>
            )}
          </div>
        </div>
      </ModalTemplate>
    );
  }

  return null;
}
