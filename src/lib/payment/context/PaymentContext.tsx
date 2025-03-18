// src/lib/payment/context/PaymentContext.tsx
'use client';

import React, { createContext, useContext, ReactNode, useEffect } from 'react';
import { usePayment } from '../hooks/usePayment';
import { PaymentStatus, PaymentMetadata, PaymentError, PaymentStatusResponse, PaymentResponse } from '../types';
import { paymentLogger } from '@/utils/logger/index';

// Define the context type
interface PaymentContextType {
  paymentId: string | null;
  paymentStatus: PaymentStatus | null;
  isProcessing: boolean;
  error: PaymentError | null;
  successInfo: PaymentStatusResponse | null;
  initializePayment: (amount: number, metadata: PaymentMetadata) => Promise<PaymentResponse | null>;
  processPayment: (paymentId?: string) => Promise<boolean>;
  cancelPayment: (paymentId?: string) => Promise<boolean>;
  resetPayment: () => void;
  getErrorMessage: (error?: PaymentError | null) => string;
  isWalletConnected: boolean;
  walletPublicKey: string | undefined;
  recipientWallet: string;
}

// Create the context
const PaymentContext = createContext<PaymentContextType | undefined>(undefined);

// Provider component
export function PaymentProvider({ children }: { children: ReactNode }) {
  const payment = usePayment();
  
  // Log when payment state changes for debugging
  useEffect(() => {
    if (payment.paymentId) {
      paymentLogger.info('PaymentContext - Payment state changed:', {
        paymentId: payment.paymentId,
        status: payment.paymentStatus
      });
    }
  }, [payment.paymentId, payment.paymentStatus]);
  
  return (
    <PaymentContext.Provider value={payment}>
      {children}
    </PaymentContext.Provider>
  );
}

// Hook for consuming the context
export function usePaymentContext() {
  const context = useContext(PaymentContext);
  
  if (context === undefined) {
    throw new Error('usePaymentContext must be used within a PaymentProvider');
  }
  
  return context;
}

export default PaymentContext;
