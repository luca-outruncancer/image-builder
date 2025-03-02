// src/components/layout/Footer.tsx
'use client';

import Link from 'next/link';
import { Twitter, Globe } from 'lucide-react';

export default function Footer({ className }: { className?: string }) {
  return (
    // Changed from bg-white to bg-transparent and border-gray-200 to border-gray-500
    <footer className={`border-t border-gray-500/30 bg-transparent ${className || ''}`}>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
          {/* Social Links - updated colors */}
          <div className="flex items-center space-x-6">
            <Link 
              href="https://x.com/outruncancer" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-gray-300 transition hover:text-white"
            >
              <span className="sr-only">Twitter</span>
              <Twitter size={22} className="h-6 w-6" />
            </Link>
            <Link 
              href="https://www.outruncancer.com" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-gray-300 transition hover:text-white"
            >
              <span className="sr-only">Website</span>
              <Globe size={22} className="h-6 w-6" />
            </Link>
          </div>

          {/* Navigation Links - updated colors */}
          <nav className="flex space-x-8">
            <Link 
              href="/"
              className="text-sm font-medium text-gray-300 transition hover:text-white"
            >
              Home
            </Link>
            <Link 
              href="/angels-board"
              className="text-sm font-medium text-gray-300 transition hover:text-white"
            >
              Angels' Board
            </Link>
            <Link 
              href="/about"
              className="text-sm font-medium text-gray-300 transition hover:text-white"
            >
              About
            </Link>
            <Link 
              href="/terms"
              className="text-sm font-medium text-gray-300 transition hover:text-white"
            >
              Terms and Conditions
            </Link>
          </nav>

          {/* Copyright - updated colors */}
          <div className="text-sm text-gray-300">
            © {new Date().getFullYear()} Outrun Cancer. All rights reserved.
          </div>
        </div>
      </div>
    </footer>
  );
}