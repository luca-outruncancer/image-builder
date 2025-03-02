// src/components/layout/Header.tsx
import Image from 'next/image';
import Link from 'next/link';
import { WalletConnectButton } from '@/components/solana/WalletConnectButton';

export default function Header() {
  return (
    <>
      <div className="flex flex-col items-center justify-center py-10 px-4 text-center bg-transparent relative z-10">
        <div className="absolute top-4 right-4">
          <WalletConnectButton />
        </div>
        <h1 className="text-4xl sm:text-5xl font-extrabold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-gray-200 to-white drop-shadow-[0_5px_5px_rgba(0,0,0,0.5)]">
            OUTRUN CANCER
          </h1>
      </div>
    </>
  );
}
