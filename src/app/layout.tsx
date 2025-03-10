// src/app/layout.tsx
import type React from "react"
import "@/app/globals.css"
import { Inter } from 'next/font/google';
import Footer from '@/components/layout/Footer';
import Header from '@/components/layout/Header';
import { cn } from '@/lib/utils';
import Providers from './providers';
import dynamic from 'next/dynamic';

// Dynamic import with no SSR for ErrorBoundary (client-only component)
const ErrorBoundary = dynamic(() => import('@/components/ErrorBoundary'), { ssr: false });

const inter = Inter({ subsets: ['latin'] });

// Style for the gradient background that applies to the entire page
const pageStyle = `
  .page-gradient {
    background: radial-gradient(circle at center, #00F49C, #00A86B);
    min-height: 100vh;
    width: 100%;
    position: relative;
    display: flex;
    flex-direction: column;
  }

  .main-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding-bottom: 4rem; /* Reduced space for footer */
  }

  @media (max-width: 640px) {
    .main-content {
      padding-bottom: 8rem; /* More space on mobile for stacked footer */
    }
  }
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="h-full">
      <head>
        <style>{pageStyle}</style>
      </head>
      <body className={cn(inter.className, 'relative min-h-full')}>
        <Providers>
          <ErrorBoundary componentName="ApplicationRoot">
            <div className="page-gradient">
              <Header />
              <div className="main-content">{children}</div>
              <Footer className="w-full mt-auto" />
            </div>
          </ErrorBoundary>
        </Providers>
      </body>
    </html>
  );
}