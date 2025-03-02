// src/components/layout/Header.tsx
import Image from 'next/image';
import Link from 'next/link';
import { WalletConnectButton } from '@/components/solana/WalletConnectButton';

export default function Header() {
  return (
    <>
      {/* Changed background from bg-white/50 to transparent (bg-transparent) and text colors to white */}
      <div className="flex flex-col items-center justify-center py-10 px-4 text-center bg-transparent relative z-10">
        <div className="absolute top-4 right-4">
          <WalletConnectButton />
        </div>
        <h1 className="text-4xl sm:text-5xl font-extrabold mb-4 bg-clip-text text-transparent bg-gradient-to-br from-gray-200 to-gray-600">
            OUTRUN CANCER
          </h1>
        {/* Changed text-muted-foreground to text-gray-200 for better visibility on dark backgrounds */}
      </div>
    </>
  );
}