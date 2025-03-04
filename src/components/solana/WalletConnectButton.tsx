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
          className="px-4 py-2 bg-gradient-to-r from-[#004E32] to-[#00A86B] hover:from-[#003D27] hover:to-[#00835C] text-white font-semibold rounded-lg shadow-lg transition-all border border-emerald-400/30"
        >
          {connecting ? 'Connecting...' : 'Connect Wallet'}
        </Button>
      ) : (
        <div className="flex items-center gap-2">
          <span className="hidden sm:inline px-3 py-1 bg-[#004E32]/70 text-emerald-200 border border-emerald-500/30 rounded-full text-sm font-medium shadow-md">
            {shortenAddress(publicKey.toString())}
          </span>
          <Button
            onClick={handleDisconnect}
            variant="outline"
            className="px-4 py-2 border border-red-500/50 bg-red-900/20 text-red-400 hover:bg-red-900/40 font-semibold rounded-lg transition-all shadow-md"
          >
            Disconnect
          </Button>
        </div>
      )}
    </div>
  );
};