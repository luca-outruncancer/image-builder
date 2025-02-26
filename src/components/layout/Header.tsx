// src/components/layout/Header.tsx
import Image from 'next/image';
import Link from 'next/link';
import { WalletConnectButton } from '@/components/solana/WalletConnectButton';

export default function Header() {
  return (
    <>
      <div className="flex flex-col items-center justify-center py-10 px-4 text-center bg-white/50 relative">
        <div className="absolute top-4 right-4">
          <WalletConnectButton />
        </div>
        <h1 className="text-4xl font-bold tracking-tighter sm:text-5xl xl:text-6xl/none bg-clip-text text-transparent bg-gradient-to-r from-black to-muted-foreground">
          We believe in outrunning cancer.
        </h1>
        <p className="mx-auto max-w-[1500px] text-muted-foreground md:text-xl mt-6">
          Every dollar raised through this Angel board funds the creation of OUTRUNCANCER 3.0 <br></br>
          OC 3.0 is an innovative, blockchain-powered platform that empowers individuals to drive cancer prevention. <br></br>
          From transparent donation tracking to community-driven project support, this is the future of fundraising.
        </p>
      </div>
    </>
  );
}