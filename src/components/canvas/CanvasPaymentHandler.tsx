// src/components/canvas/CanvasPaymentHandler.tsx
'use client';

import { useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletConnectButton } from '@/components/solana/WalletConnectButton';
import ConfirmPlacement from './ConfirmPlacement';
import ModalLayout from '../shared/ModalLayout';
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

  return (
    <>
      {/* Confirmation step */}
      {isConfirmationStep && (
        <ConfirmPlacement
          position={{ x: pendingConfirmation.x, y: pendingConfirmation.y }}
          cost={pendingConfirmation.cost || 0}
          onConfirm={onConfirm}
          onCancel={onCancel}
          onBack={onBack}
          onReposition={onReposition}
        />
      )}

      {/* Payment error modal */}
      {isErrorStep && (
        <ModalLayout
          isOpen={true}
          title="Payment Error"
          onClose={onCloseError}
          customButtons={
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={onCancel}
                className="px-4 py-2 bg-gray-300 text-gray-800 rounded hover:bg-gray-400"
              >
                Cancel
              </button>
              <button
                onClick={onRetry}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                Try Again
              </button>
            </div>
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
        </ModalLayout>
      )}

      {/* Payment processing modal */}
      {isProcessingStep && (
        <ModalLayout
          isOpen={true}
          title="Processing Payment"
          onClose={() => {}}
        >
          <div className="text-center p-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p>Please approve the transaction in your wallet...</p>
            <p className="text-sm text-gray-500 mt-2">Do not close this window until the transaction is complete</p>
            <p className="text-sm text-gray-500 mt-2">Payment will time out after 3 minutes if not completed</p>
          </div>
        </ModalLayout>
      )}

      {/* Success modal */}
      {isSuccessStep && (
        <ModalLayout
          isOpen={true}
          title="Congratulations!"
          onClose={onDone}
          customButtons={
            <div className="flex justify-end mt-6">
              <button
                onClick={onDone}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                Done
              </button>
            </div>
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
        </ModalLayout>
      )}
    </>
  );
}