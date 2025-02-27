'use client';

import { ReactNode } from 'react';
import RainingLetters from './RainingLetters';
import Header from './Header';
import Footer from './Footer';

interface RainingLettersLayoutProps {
  children: ReactNode;
}

export default function RainingLettersLayout({ children }: RainingLettersLayoutProps) {
  return (
    <div className="flex flex-col min-h-screen relative">
      {/* The raining letters background */}
      <RainingLetters />
      
      {/* Header */}
      <Header />
      
      {/* Main content */}
      <main className="flex-1 relative z-10 pt-4 mx-auto w-full max-w-7xl px-4">
        {children}
      </main>
      
      {/* Footer */}
      <Footer />
    </div>
  );
}
