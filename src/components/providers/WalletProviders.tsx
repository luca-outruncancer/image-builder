// src/components/providers/WalletProviders.tsx
'use client';

import React, { useMemo } from 'react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { 
  PhantomWalletAdapter,
  SolflareWalletAdapter,
  TorusWalletAdapter,
  LedgerWalletAdapter,
  SlopeWalletAdapter
} from '@solana/wallet-adapter-wallets';
import { clusterApiUrl } from '@solana/web3.js';

// Import styles for the wallet modal
import '@solana/wallet-adapter-react-ui/styles.css';

export const WalletProviders: React.FC<{children: React.ReactNode}> = ({ children }) => {
  // The network can be set to 'devnet', 'testnet', or 'mainnet-beta' based on environment
  const network = WalletAdapterNetwork.Devnet;

  // RPC endpoint for the selected network
  const endpoint = useMemo(() => clusterApiUrl(network), [network]);

  // Initialize wallet adapters
  const wallets = useMemo(() => [
    new PhantomWalletAdapter(),
    new SolflareWalletAdapter(),
    new TorusWalletAdapter(),
    new LedgerWalletAdapter(),
    new SlopeWalletAdapter()
  ], []);

  // Log information for debugging
  console.log('Solana Wallet Configuration:');
  console.log(`- Active Network: ${network}`);
  console.log(`- RPC Endpoint: ${endpoint}`);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          {children}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};

export default WalletProviders;