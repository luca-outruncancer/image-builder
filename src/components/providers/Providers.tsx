// src/components/providers/Providers.tsx
'use client';

import React from 'react';
import WalletProviders from './WalletProviders';

export interface ProvidersProps {
  children: React.ReactNode;
}

export default function Providers({ children }: ProvidersProps) {
  return (
    <WalletProviders>
      {children}
    </WalletProviders>
  );
}
