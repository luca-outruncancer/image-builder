// src/lib/payment/hooks/usePayment.ts
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import ClientPaymentService from '../clientPaymentService';
import { 
  PaymentStatus, 
  PaymentStatusResponse, 
  PaymentMetadata, 
  PaymentError,
  ErrorCategory
} from '../types';
import { RECIPIENT_WALLET_ADDRESS } from '@/utils/constants';
import { paymentLogger } from '@/utils/logger';

// Local storage keys
const STORAGE_KEYS = {
  PAYMENT_ID: 'image_board_payment_id',
  PAYMENT_STATUS: 'image_board_payment_status',
  TRANSACTION_ID: 'image_board_transaction_id',
  PAYMENT_INFO: 'image_board_payment_info'
};

/**
 * React hook for managing payment state and interactions
 * This uses the ClientPaymentService which interacts with APIs instead of direct database access
 */
export function usePayment() {
  const wallet = useWallet();
  const [paymentId, setPaymentId] = useState<string | null>(() => {
    // Try to get paymentId from localStorage on initial load
    if (typeof window !== 'undefined') {
      return localStorage.getItem(STORAGE_KEYS.PAYMENT_ID);
    }
    return null;
  });
  
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus | null>(() => {
    // Try to get paymentStatus from localStorage on initial load
    if (typeof window !== 'undefined') {
      const savedStatus = localStorage.getItem(STORAGE_KEYS.PAYMENT_STATUS);
      return savedStatus as PaymentStatus | null;
    }
    return null;
  });
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<PaymentError | null>(null);
  const [successInfo, setSuccessInfo] = useState<PaymentStatusResponse | null>(null);
  
  // Create payment service with useMemo to prevent multiple instances
  const paymentService = useMemo(() => {
    const service = new ClientPaymentService({
      publicKey: wallet.publicKey,
      signTransaction: wallet.signTransaction,
      connected: wallet.connected
    });
    
    // Restore active payment from localStorage if exists
    if (typeof window !== 'undefined' && paymentId) {
      const savedPaymentInfo = localStorage.getItem(STORAGE_KEYS.PAYMENT_INFO);
      if (savedPaymentInfo) {
        try {
          const paymentInfo = JSON.parse(savedPaymentInfo);
          service.restorePaymentSession(paymentId, paymentInfo);
          paymentLogger.info('Restored payment session from storage', { 
            paymentId, 
            status: paymentStatus 
          });
        } catch (err) {
          paymentLogger.warn('Failed to restore payment session', err instanceof Error ? err : new Error(String(err)));
        }
      }
    }
    
    return service;
  }, [wallet.publicKey, wallet.signTransaction, wallet.connected, paymentId, paymentStatus]);
  
  // Persist payment ID and status to localStorage when they change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (paymentId) {
        localStorage.setItem(STORAGE_KEYS.PAYMENT_ID, paymentId);
      } else {
        localStorage.removeItem(STORAGE_KEYS.PAYMENT_ID);
      }
    }
  }, [paymentId]);
  
  // Persist payment status to localStorage when it changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (paymentStatus) {
        localStorage.setItem(STORAGE_KEYS.PAYMENT_STATUS, paymentStatus);
      } else {
        localStorage.removeItem(STORAGE_KEYS.PAYMENT_STATUS);
      }
    }
  }, [paymentStatus]);
  
  // Clean up resources when component unmounts
  useEffect(() => {
    return () => {
      paymentService.dispose();
    };
  }, [paymentService]);
  
  /**
   * Initialize a new payment
   */
  const initializePayment = useCallback(async (
    amount: number,
    metadata: PaymentMetadata
  ) => {
    try {
      if (!wallet.connected) {
        paymentLogger.error('Failed to initialize payment:', new Error('Wallet not connected'));
        throw new Error('Wallet not connected');
      }

      setError(null);
      const response = await paymentService.initializePayment(amount, metadata);
      
      if (response.error) {
        setError(response.error);
        return null;
      }
      
      setPaymentId(response.paymentId);
      setPaymentStatus(response.status);
      
      // Save payment info to localStorage
      if (typeof window !== 'undefined' && response.paymentId) {
        try {
          const paymentInfo = {
            paymentId: response.paymentId,
            transactionId: response.transactionId,
            status: response.status,
            amount,
            imageId: metadata.imageId,
            walletAddress: wallet.publicKey?.toString(),
            timestamp: new Date().toISOString() // Add timestamp for debugging
          };
          
          // Store different aspects of the payment info
          localStorage.setItem(STORAGE_KEYS.PAYMENT_INFO, JSON.stringify(paymentInfo));
          localStorage.setItem(STORAGE_KEYS.PAYMENT_ID, response.paymentId);
          localStorage.setItem(STORAGE_KEYS.TRANSACTION_ID, String(response.transactionId));
          localStorage.setItem(STORAGE_KEYS.PAYMENT_STATUS, response.status);
          
          // Also store just the transactionId by paymentId for easy lookup
          const paymentIdMapping = `payment_mapping_${response.paymentId}`;
          localStorage.setItem(paymentIdMapping, String(response.transactionId));
          
          paymentLogger.info('Saved payment info to storage', { 
            paymentId: response.paymentId 
          });
        } catch (err) {
          paymentLogger.warn('Failed to save payment info to storage', err instanceof Error ? err : new Error(String(err)));
        }
      }
      
      return response;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      paymentLogger.error('Failed to initialize payment:', error);
      setError({
        category: ErrorCategory.UNKNOWN_ERROR,
        message: 'Failed to initialize payment',
        retryable: true
      });
      return null;
    }
  }, [wallet.connected, paymentService, wallet.publicKey]);
  
  /**
   * Process the current payment
   */
  const processPayment = useCallback(async (providedPaymentId?: string) => {
    // Use provided paymentId or fallback to state
    const paymentIdToUse = providedPaymentId || paymentId;
    
    if (!paymentIdToUse) {
      const error = new Error('No active payment to process');
      paymentLogger.error('Failed to process payment:', error);
      return false;
    }

    try {
      setIsProcessing(true);
      setError(null);
      
      console.log('===== DEBUG: usePayment.processPayment =====');
      console.log('Using paymentId:', paymentIdToUse);
      
      // Try to restore payment info from localStorage if needed
      if (typeof window !== 'undefined') {
        // First check if we have a transaction mapping for this payment
        const paymentIdMapping = `payment_mapping_${paymentIdToUse}`;
        const mappedTransactionId = localStorage.getItem(paymentIdMapping);
        
        if (mappedTransactionId) {
          console.log('Found transaction ID mapping in localStorage:', mappedTransactionId);
        }
        
        const savedPaymentId = localStorage.getItem(STORAGE_KEYS.PAYMENT_ID);
        const savedTransactionId = localStorage.getItem(STORAGE_KEYS.TRANSACTION_ID);
        
        console.log('Stored payment data in localStorage:', {
          savedPaymentId,
          savedTransactionId,
          mappedTransactionId
        });
        
        const savedPaymentInfo = localStorage.getItem(STORAGE_KEYS.PAYMENT_INFO);
        if (savedPaymentInfo) {
          try {
            const paymentInfo = JSON.parse(savedPaymentInfo);
            console.log('Parsed payment info from localStorage:', paymentInfo);
            
            // Only restore if the payment IDs match
            if (paymentInfo.paymentId === paymentIdToUse) {
              paymentService.restorePaymentSession(paymentIdToUse, paymentInfo);
              paymentLogger.info('Restored payment session before processing', { 
                paymentId: paymentIdToUse
              });
            } else if (mappedTransactionId) {
              // If we have a transaction ID mapping but payment IDs don't match,
              // create a synthetic payment info object
              const syntheticPaymentInfo = {
                paymentId: paymentIdToUse,
                transactionId: mappedTransactionId,
                amount: paymentInfo.amount, // Use amount from stored payment as fallback
                status: PaymentStatus.INITIALIZED
              };
              
              console.log('Created synthetic payment info from mapping:', syntheticPaymentInfo);
              paymentService.restorePaymentSession(paymentIdToUse, syntheticPaymentInfo);
            }
          } catch (err) {
            paymentLogger.warn('Failed to restore payment session before processing', 
              err instanceof Error ? err : new Error(String(err)));
          }
        }
      }
      
      const response = await paymentService.processPayment(paymentIdToUse);
      
      if (response.error) {
        setError(response.error);
        setPaymentStatus(response.status);
        return false;
      }
      
      console.log('===== DEBUG: SETTING SUCCESS INFO =====');
      console.log('Payment response:', {
        paymentId: response.paymentId,
        status: response.status,
        transactionHash: response.transactionHash
      });
      
      // Set payment status before success info to ensure order
      setPaymentStatus(response.status);
      
      // Set success info with extra debugging
      try {
        console.log('Setting successInfo state with:', response);
        setSuccessInfo(response);
        console.log('Successfully set successInfo state');
        
        // Add timeout to check if state persists
        setTimeout(() => {
          console.log('===== DEBUG: SUCCESS INFO STATE CHECK (500ms later) =====');
          // We can't directly access the successInfo state here, 
          // but we can log that this timeout fired
          console.log('Timeout check executed - successInfo should still be set');
        }, 500);
      } catch (err) {
        console.error('Error setting successInfo state:', err);
      }
      
      // If payment was successful or failed, clean up localStorage
      if (
        response.status === PaymentStatus.CONFIRMED || 
        response.status === PaymentStatus.FAILED || 
        response.status === PaymentStatus.CANCELED
      ) {
        console.log('===== DEBUG: PAYMENT CLEANUP =====');
        console.log('Payment status triggering cleanup:', response.status);
        console.log('Before cleanup - localStorage keys:', {
          paymentInfo: localStorage.getItem(STORAGE_KEYS.PAYMENT_INFO),
          paymentId: localStorage.getItem(STORAGE_KEYS.PAYMENT_ID),
          paymentStatus: localStorage.getItem(STORAGE_KEYS.PAYMENT_STATUS),
          transactionId: localStorage.getItem(STORAGE_KEYS.TRANSACTION_ID)
        });
        
        if (typeof window !== 'undefined') {
          try {
            // Try to get mapping key for this payment
            const paymentIdMapping = `payment_mapping_${response.paymentId}`;
            const hasMappingKey = localStorage.getItem(paymentIdMapping) !== null;
            
            // Remove all items
            localStorage.removeItem(STORAGE_KEYS.PAYMENT_INFO);
            localStorage.removeItem(STORAGE_KEYS.PAYMENT_ID);
            localStorage.removeItem(STORAGE_KEYS.PAYMENT_STATUS);
            localStorage.removeItem(STORAGE_KEYS.TRANSACTION_ID);
            
            // Also remove the mapping if it exists
            if (hasMappingKey) {
              localStorage.removeItem(paymentIdMapping);
            }
            
            console.log('Cleanup completed - removed localStorage keys');
            console.log('After cleanup - localStorage keys:', {
              paymentInfo: localStorage.getItem(STORAGE_KEYS.PAYMENT_INFO),
              paymentId: localStorage.getItem(STORAGE_KEYS.PAYMENT_ID),
              paymentStatus: localStorage.getItem(STORAGE_KEYS.PAYMENT_STATUS),
              transactionId: localStorage.getItem(STORAGE_KEYS.TRANSACTION_ID),
              mappingKey: paymentIdMapping,
              mappingValue: localStorage.getItem(paymentIdMapping)
            });
          } catch (err) {
            console.error('Error during localStorage cleanup:', err);
          }
        } else {
          console.log('Window is undefined, skipping localStorage cleanup');
        }
      } else {
        console.log('Payment status does not trigger cleanup:', response.status);
      }
      
      return response.status === PaymentStatus.CONFIRMED;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      paymentLogger.error('Failed to process payment:', error);
      setError({
        category: ErrorCategory.UNKNOWN_ERROR,
        message: 'Failed to process payment',
        retryable: true
      });
      return false;
    } finally {
      setIsProcessing(false);
    }
  }, [paymentId, paymentService]);
  
  /**
   * Cancel the current payment
   */
  const cancelPayment = useCallback(async (providedPaymentId?: string) => {
    // Use provided paymentId or fallback to state
    const paymentIdToUse = providedPaymentId || paymentId;
    
    if (!paymentIdToUse) {
      const error = new Error('No active payment to cancel');
      paymentLogger.error('Failed to cancel payment:', error);
      return false;
    }

    try {
      const result = await paymentService.cancelPayment(paymentIdToUse);
      
      if (result.error) {
        setError(result.error);
        return false;
      }
      
      setPaymentStatus(PaymentStatus.CANCELED);
      setPaymentId(null);
      
      // Clean up localStorage
      if (typeof window !== 'undefined') {
        localStorage.removeItem(STORAGE_KEYS.PAYMENT_INFO);
        localStorage.removeItem(STORAGE_KEYS.PAYMENT_ID);
        localStorage.removeItem(STORAGE_KEYS.PAYMENT_STATUS);
        localStorage.removeItem(STORAGE_KEYS.TRANSACTION_ID);
      }
      
      return true;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      paymentLogger.error('Failed to cancel payment:', error);
      setError({
        category: ErrorCategory.UNKNOWN_ERROR,
        message: 'Failed to cancel payment',
        retryable: true
      });
      return false;
    }
  }, [paymentId, paymentService]);
  
  /**
   * Reset payment state
   */
  const resetPayment = useCallback(() => {
    setPaymentId(null);
    setPaymentStatus(null);
    setError(null);
    setSuccessInfo(null);
    setIsProcessing(false);
    
    // Clean up localStorage
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEYS.PAYMENT_INFO);
      localStorage.removeItem(STORAGE_KEYS.PAYMENT_ID);
      localStorage.removeItem(STORAGE_KEYS.PAYMENT_STATUS);
      localStorage.removeItem(STORAGE_KEYS.TRANSACTION_ID);
    }
  }, []);
  
  /**
   * Get a user-friendly error message
   */
  const getErrorMessage = useCallback((paymentError: PaymentError | null = null) => {
    const errorToFormat = paymentError || error;
    if (!errorToFormat) return '';
    
    return paymentService.getFormattedErrorMessage(errorToFormat);
  }, [error, paymentService]);
  
  return {
    paymentId,
    paymentStatus,
    isProcessing,
    error,
    successInfo,
    initializePayment,
    processPayment,
    cancelPayment,
    resetPayment,
    getErrorMessage,
    isWalletConnected: wallet.connected,
    walletPublicKey: wallet.publicKey?.toString(),
    recipientWallet: RECIPIENT_WALLET_ADDRESS
  };
}

export default usePayment;
