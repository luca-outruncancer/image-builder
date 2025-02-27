// src/app/layout.tsx
import type React from "react"
import "@/app/globals.css"
import { Inter } from 'next/font/google';
import { cn } from '@/lib/utils';
import { WalletProviderComponent } from '@/components/solana/WalletProviderComponent';
import RainingLettersLayout from '@/components/layout/RainingLettersLayout';

const inter = Inter({ subsets: ['latin'] });

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="h-full">
      <body className={cn(inter.className, 'relative min-h-full bg-black')}>
        <WalletProviderComponent>
          <RainingLettersLayout>
            {children}
          </RainingLettersLayout>
        </WalletProviderComponent>
        
        {/* Global styles for the raining letters */}
        <style jsx global>{`
          .dud {
            color: #0f0;
            opacity: 0.7;
          }
          
          /* Apply dark theme to entire site */
          body {
            color: white;
            background-color: black;
          }
        `}</style>
      </body>
    </html>
  );
}
