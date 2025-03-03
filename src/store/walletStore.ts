// src/store/walletStore.ts
"use client"

import { create } from 'zustand';
import { PublicKey } from '@solana/web3.js';

interface WalletState {
  connected: boolean;
  publicKey: PublicKey | null;
  connecting: boolean;
  setConnected: (connected: boolean) => void;
  setPublicKey: (publicKey: PublicKey | null) => void;
  setConnecting: (connecting: boolean) => void;
  disconnect: () => void;
}

export const useWalletStore = create<WalletState>((set) => ({
  connected: false,
  publicKey: null,
  connecting: false,
  setConnected: (connected) => set({ connected }),
  setPublicKey: (publicKey) => set({ publicKey }),
  setConnecting: (connecting) => set({ connecting }),
  disconnect: () => set({ connected: false, publicKey: null }),
}));