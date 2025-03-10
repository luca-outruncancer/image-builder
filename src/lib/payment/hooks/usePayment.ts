// src/lib/payment/hooks/usePayment.ts
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import PaymentService from '../paymentService';
import { 
  PaymentStatus, 
  PaymentStatusResponse, 
  PaymentMetadata, 
  PaymentError
} from '../types';
import { RECIPIENT_WALLET_ADDRESS } from '@/utils/constants';

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
  
  // Create payment service
  const paymentService = new PaymentService({
    publicKey: wallet.publicKey,
    signTransaction: wallet.signTransaction,
    connected: wallet.connected
  });
  
  // Clean up resources when component unmounts
  useEffect(() => {
    return () => {
      paymentService.dispose();
    };
  }, []);
  
  /**
   * Initialize a new payment
   */
  const initializePayment = useCallback(async (
    amount: number,
    metadata: PaymentMetadata
  ) => {
    try {
      if (!wallet.connected) {
        setError({
          category: 'wallet_error',
          message: 'Wallet not connected',
          retryable: false
        });
        return null;
      }
      
      const response = await paymentService.initializePayment(amount, metadata);
      
      if (response.status === PaymentStatus.FAILED) {
        setError(response.error || null);
        return null;
      }
      
      setPaymentId(response.paymentId);
      setPaymentStatus(response.status);
      setError(null);
      
      return response.paymentId;
    } catch (error) {
      console.error('Failed to initialize payment:', error);
      setError({
        category: 'unknown_error',
        message: 'Payment initialization failed',
        retryable: true,
        originalError: error
      });
      return null;
    }
  }, [wallet.connected, paymentService]);
  
  /**
   * Process a payment
   */
  const processPayment = useCallback(async (paymentIdToProcess?: string) => {
    const currentPaymentId = paymentIdToProcess || paymentId;
    
    if (!currentPaymentId) {
      setError({
        category: 'unknown_error',
        message: 'No payment ID provided',
        retryable: false
      });
      return false;
    }
    
    try {
      setIsProcessing(true);
      setError(null);
      
      const response = await paymentService.processPayment(currentPaymentId);
      
      // Update status
      setPaymentStatus(response.status);
      
      if (response.status === PaymentStatus.FAILED) {
        setError(response.error || null);
        setIsProcessing(false);
        return false;
      }
      
      if (response.status === PaymentStatus.CONFIRMED) {
        setSuccessInfo(response);
        setIsProcessing(false);
        return true;
      }
      
      // Handle pending state (e.g., user rejection)
      if (response.error) {
        setError(response.error);
      }
      
      setIsProcessing(false);
      return false;
    } catch (error) {
      console.error('Failed to process payment:', error);
      setError({
        category: 'unknown_error',
        message: 'Payment processing failed',
        retryable: true,
        originalError: error
      });
      setIsProcessing(false);
      return false;
    }
  }, [paymentId, paymentService]);
  
  /**
   * Cancel a payment
   */
  const cancelPayment = useCallback(async (paymentIdToCancel?: string) => {
    const currentPaymentId = paymentIdToCancel || paymentId;
    
    if (!currentPaymentId) {
      return false;
    }
    
    try {
      const result = await paymentService.cancelPayment(currentPaymentId);
      
      if (result.success) {
        setPaymentId(null);
        setPaymentStatus(null);
        setError(null);
        setSuccessInfo(null);
        return true;
      } else {
        setError(result.error || null);
        return false;
      }
    } catch (error) {
      console.error('Failed to cancel payment:', error);
      setError({
        category: 'unknown_error',
        message: 'Payment cancellation failed',
        retryable: true,
        originalError: error
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
