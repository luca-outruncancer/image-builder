// src/lib/payment/hooks/usePayment.ts
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import PaymentService from '../paymentService';
import { 
  PaymentStatus, 
  PaymentStatusResponse, 
  PaymentMetadata, 
  PaymentError,
  ErrorCategory
} from '../types';
import { RECIPIENT_WALLET_ADDRESS } from '@/utils/constants';
import { paymentLogger } from '@/utils/logger';

/**
 * React hook for managing payment state and interactions
 */
export function usePayment() {
  const wallet = useWallet();
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<PaymentError | null>(null);
  const [successInfo, setSuccessInfo] = useState<PaymentStatusResponse | null>(null);
  
  // Create payment service with useMemo to prevent multiple instances
  const paymentService = useMemo(() => new PaymentService({
    publicKey: wallet.publicKey,
    signTransaction: wallet.signTransaction,
    connected: wallet.connected
  }), [wallet.publicKey, wallet.signTransaction, wallet.connected]);
  
  // Clean up resources when component unmounts
  useEffect(() => {
    return () => {
      paymentService.dispose();
    };
  }, [paymentService]); // Add paymentService to dependency array since we're using it in cleanup
  
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
  }, [wallet.connected, paymentService]);
  
  /**
   * Process the current payment
   */
  const processPayment = useCallback(async () => {
    if (!paymentId) {
      const error = new Error('No active payment to process');
      paymentLogger.error('Failed to process payment:', error);
      return;
    }

    try {
      setIsProcessing(true);
      setError(null);
      
      const response = await paymentService.processPayment(paymentId);
      
      if (response.error) {
        setError(response.error);
        setPaymentStatus(response.status);
        return;
      }
      
      setPaymentStatus(response.status);
      setSuccessInfo(response);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      paymentLogger.error('Failed to process payment:', error);
      setError({
        category: ErrorCategory.UNKNOWN_ERROR,
        message: 'Failed to process payment',
        retryable: true
      });
    } finally {
      setIsProcessing(false);
    }
  }, [paymentId, paymentService]);
  
  /**
   * Cancel the current payment
   */
  const cancelPayment = useCallback(async () => {
    if (!paymentId) {
      const error = new Error('No active payment to cancel');
      paymentLogger.error('Failed to cancel payment:', error);
      return;
    }

    try {
      const result = await paymentService.cancelPayment(paymentId);
      
      if (result.error) {
        setError(result.error);
        return;
      }
      
      setPaymentStatus(PaymentStatus.CANCELED);
      setPaymentId(null);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      paymentLogger.error('Failed to cancel payment:', error);
      setError({
        category: ErrorCategory.UNKNOWN_ERROR,
        message: 'Failed to cancel payment',
        retryable: true
      });
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
