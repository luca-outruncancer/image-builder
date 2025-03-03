// src/app/providers.tsx
'use client';

import React from 'react';
import { WalletProviderComponent } from '@/components/solana/WalletProviderComponent';
import { PaymentProvider } from '@/lib/payment/PaymentContext';

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WalletProviderComponent>
      <PaymentProvider>
        {children}
      </PaymentProvider>
    </WalletProviderComponent>
  );
}