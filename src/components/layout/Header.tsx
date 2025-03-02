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
        <h1 className="text-4xl font-bold tracking-tighter sm:text-5xl xl:text-6xl/none text-white">
          We believe in outrunning cancer.
        </h1>
        {/* Changed text-muted-foreground to text-gray-200 for better visibility on dark backgrounds */}
        <p className="mx-auto max-w-[1500px] text-gray-200 md:text-xl mt-6">
          Every dollar raised through this Angel board funds the creation of OUTRUNCANCER 3.0 <br></br>
          OC 3.0 is an innovative, blockchain-powered platform that empowers individuals to drive cancer prevention. <br></br>
          From transparent donation tracking to community-driven project support, this is the future of fundraising.
        </p>
      </div>
    </>
  );
}