// src/components/solana/WalletVerification.tsx
"use client"

import React, { useState } from 'react';
import { useWalletVerification } from '@/utils/solana';
import { Button } from '@/components/ui/button';
import { useWallet } from '@solana/wallet-adapter-react';

export const WalletVerification: React.FC = () => {
  const { connected } = useWallet();
  const { verifyOwnership } = useWalletVerification();
  const [verificationStatus, setVerificationStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState<string>('');

  const handleVerify = async () => {
    if (!connected) {
      setMessage('Please connect your wallet first');
      setVerificationStatus('error');
      return;
    }

    try {
      setVerificationStatus('pending');
      const isVerified = await verifyOwnership();
      
      if (isVerified) {
        setMessage('Wallet ownership verified successfully!');
        setVerificationStatus('success');
      } else {
        setMessage('Wallet verification failed');
        setVerificationStatus('error');
      }
    } catch (error) {
      console.error('Error during verification:', error);
      setMessage('Error during verification: ' + (error instanceof Error ? error.message : String(error)));
      setVerificationStatus('error');
    }
  };

  return (
    <div className="mt-4 p-6 border rounded-lg shadow-sm">
      <h3 className="text-lg font-semibold mb-4">Wallet Verification</h3>
      <p className="mb-4 text-gray-600">
        Click the button below to sign a transaction and verify your wallet ownership
      </p>
      
      <Button 
        onClick={handleVerify} 
        disabled={!connected || verificationStatus === 'pending'}
        className="mb-4"
      >
        {verificationStatus === 'pending' ? 'Verifying...' : 'Verify Wallet Ownership'}
      </Button>
      
      {message && (
        <div className={`mt-3 p-3 rounded ${
          verificationStatus === 'success' ? 'bg-green-100 text-green-800' : 
          verificationStatus === 'error' ? 'bg-red-100 text-red-800' : 
          'bg-blue-100 text-blue-800'
        }`}>
          {message}
        </div>
      )}
    </div>
  );
};