'use client';

import { useState, useEffect, useRef } from 'react';
import { WalletConnectButton } from '@/components/solana/WalletConnectButton';
import { TextScramble } from './RainingLetters';
import Link from 'next/link';

export default function Header() {
  const elementRef = useRef<HTMLHeadingElement>(null);
  const scramblerRef = useRef<TextScramble | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (elementRef.current && !scramblerRef.current) {
      scramblerRef.current = new TextScramble(elementRef.current);
      setMounted(true);
    }
  }, []);

  useEffect(() => {
    if (mounted && scramblerRef.current) {
      const phrases = [
        'We believe in outrunning cancer'
      ];
      
      let counter = 0;
      const next = () => {
        if (scramblerRef.current) {
          scramblerRef.current.setText(phrases[counter]).then(() => {
            setTimeout(next, 5000);
          });
          counter = (counter + 1) % phrases.length;
        }
      };

      next();
    }
  }, [mounted]);

  return (
    <header className="w-full py-4 px-6 flex justify-between items-center relative z-20 bg-black bg-opacity-50 backdrop-blur-sm border-b border-green-900/30">
      <div className="flex items-center">
        <Link href="/" className="mr-8">
          <h1 
            ref={elementRef}
            className="text-white text-2xl font-bold tracking-wider font-mono"
          >
            We believe in outrunning cancer
          </h1>
        </Link>
        
        <nav className="space-x-6">
          <Link href="/about" className="text-white hover:text-green-400 transition-colors">
            About
          </Link>
          <Link href="/terms" className="text-white hover:text-green-400 transition-colors">
            Terms & Conditions
          </Link>
        </nav>
      </div>
      
      <WalletConnectButton />
    </header>
  );
}
