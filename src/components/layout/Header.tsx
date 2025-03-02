// src/components/layout/Header.tsx
import Image from 'next/image';
import Link from 'next/link';
import { WalletConnectButton } from '@/components/solana/WalletConnectButton';

export default function Header() {
  return (
    <header className="flex flex-col items-center justify-center py-4 sm:py-6 px-4 text-center bg-transparent relative z-10">
      <div className="absolute top-2 sm:top-4 right-2 sm:right-4">
        <WalletConnectButton />
      </div>
      <Link href="/" className="inline-block">
        <h1 className="text-3xl sm:text-5xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-gray-200 to-white drop-shadow-[0_3px_3px_rgba(0,0,0,0.5)]">
          OUTRUN CANCER
        </h1>
      </Link>
    </header>
  );
}