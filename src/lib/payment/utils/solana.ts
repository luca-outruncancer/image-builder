// src/lib/payment/utils/solana.ts
"use client"

import { Connection, PublicKey, Transaction, SystemProgram } from '@solana/web3.js';
import { useWallet } from '@solana/wallet-adapter-react';
import { RPC_ENDPOINT } from '@/lib/payment/solana/walletConfig';
import { blockchainLogger } from '@/utils/logger';


// Create a connection using the RPC endpoint
export const connection = new Connection(RPC_ENDPOINT);

// Simplified wallet verification that doesn't rely on deprecated methods
export const verifyWalletOwnership = async (
  publicKey: PublicKey | null, 
  signTransaction: ((transaction: Transaction) => Promise<Transaction>) | undefined
) => {
  if (!publicKey || !signTransaction) {
    throw new Error('Wallet not connected');
  }

  try {
    // Create a simple transaction that doesn't send any SOL
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: publicKey,
        toPubkey: publicKey,
        lamports: 0,
      })
    );

    // Set a recent blockhash
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = publicKey;

    // Sign the transaction (this doesn't submit it to the network)
    const signedTransaction = await signTransaction(transaction);
    
    // Verify signature
    const isValid = signedTransaction.signatures.some((sig) => 
      sig.publicKey.equals(publicKey)
    );

    return isValid;
  } catch (error) {
    blockchainLogger.error('Error verifying wallet ownership:', error instanceof Error ? error : new Error(String(error))); 
    throw error;
  }
};

export const useWalletVerification = () => {
  const { publicKey, signTransaction } = useWallet();

  const verifyOwnership = async () => {
    if (!publicKey || !signTransaction) {
      return false;
    }

    try {
      return await verifyWalletOwnership(publicKey, signTransaction);
    } catch (error) {
      blockchainLogger.error('Wallet verification failed:', error instanceof Error ? error : new Error(String(error)));
      return false;
    }
  };

  return { verifyOwnership };
}; 