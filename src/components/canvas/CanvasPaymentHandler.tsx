// src/components/canvas/CanvasPaymentHandler.tsx
'use client';

import { useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletConnectButton } from '@/components/solana/WalletConnectButton';
import { X } from 'lucide-react';
import ConfirmPlacement from './ConfirmPlacement';
import { usePaymentContext } from '@/lib/payment/context';
import { PaymentStatus } from '@/lib/payment/types';
import { canvasLogger } from '@/utils/logger/index';
import { clearSessionBlockhashData } from '@/lib/payment/utils/transactionUtils';
import { ErrorCategory } from '@/lib/payment/types';
import { PlacedImage } from '@/types/canvas';

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
  
  // Add debug logging for success modal
  useEffect(() => {
    console.log('===== DEBUG: SUCCESS MODAL STATE =====');
    console.log('Success step conditions:', {
      successInfo,
      isSuccessStep,
      paymentStatus,
      pendingConfirmation: !!pendingConfirmation,
      isProcessing,
      hasError: error !== null
    });
    
    if (successInfo) {
      console.log('Success info details:', {
        paymentId: successInfo.paymentId,
        status: successInfo.status,
        transactionHash: successInfo.transactionHash,
        metadata: successInfo.metadata,
        timestamp: successInfo.timestamp
      });
    }
  }, [successInfo, isSuccessStep, paymentStatus, pendingConfirmation, isProcessing, error]);

  // Log state changes for debugging
  useEffect(() => {
    canvasLogger.debug('Payment handler state updated', {
      isConfirmationStep,
      isProcessingStep,
      isErrorStep,
      isSuccessStep,
      connected,
      paymentStatus,
      error: error ? {
        category: error.category,
        message: error.message,
        code: error.code
      } : undefined,
      successInfo: successInfo ? {
        transactionHash: successInfo.transactionHash,
        timestamp: successInfo.timestamp,
        metadata: {
          fileName: successInfo.metadata?.fileName,
          positionX: successInfo.metadata?.positionX,
          positionY: successInfo.metadata?.positionY
        }
      } : undefined
    });
  }, [isConfirmationStep, isProcessingStep, isErrorStep, isSuccessStep, connected, paymentStatus, error, successInfo]);

  // Clean up session storage when component unmounts
  useEffect(() => {
    return () => {
      try {
        console.log('===== DEBUG: PAYMENT HANDLER UNMOUNTING =====');
        console.log('Component state at unmount:', {
          successInfo,
          isSuccessStep,
          paymentStatus,
          pendingConfirmation: !!pendingConfirmation,
          isProcessing,
          hasError: error !== null
        });
        
        canvasLogger.debug('Cleaning up payment handler session data');
        clearSessionBlockhashData();
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        canvasLogger.error('Failed to clear session storage', err);
      }
    };
  }, [successInfo, isSuccessStep, paymentStatus, pendingConfirmation, isProcessing, error]);

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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="relative w-full max-w-lg bg-[#00A86B]/85 backdrop-blur-sm rounded-xl text-white">
            <button 
              onClick={() => {
                canvasLogger.debug('User closed error modal', { error });
                onCloseError();
              }}
              className="absolute top-3 right-3 text-white/70 hover:text-white"
            >
              <X size={20} />
            </button>
            
            <h2 className="text-xl font-bold p-6 border-b border-white/20">
              Payment Error
            </h2>

            <div className="p-6">
              <div className="text-center">
                <p className="text-red-300 font-semibold">Unable to process payment</p>
                <p className="mt-2 text-white/80">{error && getErrorMessage(error)}</p>
                
                {!connected && (
                  <div className="mt-4">
                    <p className="mb-2 text-white/90">Connect your wallet to continue:</p>
                    <div className="flex justify-center">
                      <WalletConnectButton />
                    </div>
                  </div>
                )}

                {connected && (
                  <div className="mt-4 text-sm text-white/70">
                    <p>Please make sure your wallet has sufficient balance for this transaction.</p>
                    
                    {error && error.category === ErrorCategory.BALANCE_ERROR && (
                      <div className="mt-2 p-3 bg-black/20 rounded-lg text-left">
                        <h3 className="font-semibold mb-1">Troubleshooting Tips:</h3>
                        <ul className="list-disc list-inside space-y-1">
                          <li>Your wallet needs SOL for both the payment and transaction fees</li>
                          <li>Try adding more SOL to your wallet (at least 0.05 SOL)</li>
                          <li>Reduce other activity while the transaction is processing</li>
                          <li>Try connecting a different wallet with more funds</li>
                        </ul>
                      </div>
                    )}
                    
                    {error && error.category === ErrorCategory.BLOCKCHAIN_ERROR && (
                      <div className="mt-2 p-3 bg-black/20 rounded-lg text-left">
                        <h3 className="font-semibold mb-1">Network Issues Detected:</h3>
                        <ul className="list-disc list-inside space-y-1">
                          <li>The blockchain network may be congested</li>
                          <li>Try again in a few moments</li>
                          <li>Check your wallet configuration is correct</li>
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-white/20 p-6">
              <button
                onClick={() => {
                  canvasLogger.debug('User canceled payment after error');
                  onCancel();
                }}
                className="px-4 py-2 border border-white/30 text-white rounded-md hover:bg-white/10 font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  canvasLogger.debug('User initiated payment retry', { error });
                  onRetry();
                }}
                className="px-4 py-2 bg-[#004E32] text-white rounded-md hover:bg-[#003D27] font-medium transition-colors"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment processing modal */}
      {isProcessingStep && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="relative w-full max-w-lg bg-[#00A86B]/85 backdrop-blur-sm rounded-xl text-white">
            <h2 className="text-xl font-bold p-6 border-b border-white/20">
              Processing Payment
            </h2>

            <div className="p-6">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-2 border-transparent border-b-emerald-400 mx-auto mb-4"></div>
                <p className="text-white">Please approve the transaction in your wallet...</p>
                <p className="text-sm text-white/70 mt-2">Do not close this window until the transaction is complete</p>
                <p className="text-sm text-white/70 mt-2">Payment will time out after 3 minutes if not completed</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Success modal */}
      {isSuccessStep && (() => {
        console.log('===== DEBUG: RENDERING SUCCESS MODAL =====');
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
            <div className="relative w-full max-w-lg bg-[#00A86B]/85 backdrop-blur-sm rounded-xl text-white">
              <button 
                onClick={() => {
                  canvasLogger.debug('User closed success modal', {
                    transactionHash: successInfo?.transactionHash,
                    imageId: successInfo?.metadata?.imageId
                  });
                  onDone();
                }}
                className="absolute top-3 right-3 text-white/70 hover:text-white"
              >
                <X size={20} />
              </button>
              
              <h2 className="text-xl font-bold p-6 border-b border-white/20">
                Congratulations!
              </h2>

              <div className="p-6">
                <div className="text-center">
                  <p className="text-lg font-semibold text-emerald-300">Image uploaded successfully!</p>
                  <div className="mt-4 text-left text-sm text-white/90">
                    <p>Timestamp: {successInfo?.timestamp || new Date().toLocaleString()}</p>
                    <p>Image: {successInfo?.metadata?.fileName || "Image"}</p>
                    <p>Position: ({successInfo?.metadata?.positionX || 0}, {successInfo?.metadata?.positionY || 0})</p>
                    {successInfo?.transactionHash && (
                      <div className="mt-2">
                        <p className="font-semibold text-white/90">Transaction Hash:</p>
                        <p className="text-xs font-mono break-all bg-[#004E32]/30 p-2 rounded text-white/80">
                          {successInfo.transactionHash}
                        </p>
                        <p className="mt-2 text-sm text-white/70">
                          View on{" "}
                          <a
                            href={`https://explorer.solana.com/tx/${successInfo.transactionHash}?cluster=devnet`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-emerald-300 hover:underline"
                          >
                            Solana Explorer
                          </a>
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex justify-end border-t border-white/20 p-6">
                <button
                  onClick={() => {
                    canvasLogger.debug('User completed payment flow', {
                      transactionHash: successInfo?.transactionHash,
                      imageId: successInfo?.metadata?.imageId
                    });
                    onDone();
                  }}
                  className="px-4 py-2 bg-[#004E32] text-white rounded-md hover:bg-[#003D27] font-medium transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}