// src/lib/payment/PaymentContext.tsx
'use client';

import React, { createContext, useContext, ReactNode } from 'react';
import { usePayment } from './usePayment';
import { PaymentStatus, PaymentMetadata, PaymentError, PaymentStatusResponse } from './types';

// Define the context type
interface PaymentContextType {
  paymentId: string | null;
  paymentStatus: PaymentStatus | null;
  isProcessing: boolean;
  error: PaymentError | null;
  successInfo: PaymentStatusResponse | null;
  initializePayment: (amount: number, metadata: PaymentMetadata) => Promise<string | null>;
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