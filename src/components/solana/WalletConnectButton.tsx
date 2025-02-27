// src/components/solana/WalletConnectButton.tsx
"use client"

import React, { useCallback, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useWalletStore } from '@/store/walletStore';
import { Button } from '@/components/ui/button';

export const WalletConnectButton: React.FC = () => {
  const { setVisible } = useWalletModal();
  const { publicKey, connected, connecting, disconnect } = useWallet();
  const {
    setConnected,
    setPublicKey,
    setConnecting,
  } = useWalletStore();

  useEffect(() => {
    if (connected && publicKey) {
      setConnected(true);
      setPublicKey(publicKey);
    } else {
      setConnected(false);
      setPublicKey(null);
    }
  }, [connected, publicKey, setConnected, setPublicKey]);

  useEffect(() => {
    setConnecting(connecting);
  }, [connecting, setConnecting]);

  const handleConnect = useCallback(() => {
    setVisible(true);
  }, [setVisible]);

  const handleDisconnect = useCallback(() => {
    disconnect();
  }, [disconnect]);

  const shortenAddress = (address: string) => {
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  return (
    <div>
      {!connected ? (
        <Button
          onClick={handleConnect}
          disabled={connecting}
          className="px-4 py-2 bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white font-semibold rounded-lg shadow-md transition-all"
        >
          {connecting ? 'Connecting...' : 'Connect Wallet'}
        </Button>
      ) : (
        <div className="flex items-center gap-2">
          <span className="hidden sm:inline px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
            {shortenAddress(publicKey.toString())}
          </span>
          <Button
            onClick={handleDisconnect}
            variant="outline"
            className="px-4 py-2 border border-red-300 text-red-600 hover:bg-red-50 font-semibold rounded-lg transition-all"
          >
            Disconnect
          </Button>
        </div>
      )}
    </div>
  );
};