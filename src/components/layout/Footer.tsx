// src/components/layout/Footer.tsx
'use client';

import Link from 'next/link';
import { Twitter, Globe } from 'lucide-react';

export default function Footer({ className }: { className?: string }) {
  return (
    <footer className={`border-t border-[#004E32]/30 bg-transparent ${className || ''}`}>
      <div className="mx-auto max-w-7xl px-4 py-4 sm:py-5 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          {/* Social Links */}
          <div className="flex items-center space-x-6">
            <Link 
              href="https://x.com/outruncancer" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-white transition hover:text-white/80"
            >
              <span className="sr-only">Twitter</span>
              <Twitter size={20} className="h-5 w-5" />
            </Link>
            <Link 
              href="https://www.outruncancer.com" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-white transition hover:text-white/80"
            >
              <span className="sr-only">Website</span>
              <Globe size={20} className="h-5 w-5" />
            </Link>
          </div>

          {/* Navigation Links */}
          <nav className="flex flex-wrap justify-center gap-x-6 gap-y-2">
            <Link 
              href="/"
              className="text-sm font-medium text-white transition hover:text-white/80"
            >
              Home
            </Link>
            <Link 
              href="/angels-board"
              className="text-sm font-medium text-white transition hover:text-white/80"
            >
              Angels' Board
            </Link>
            <Link 
              href="/about"
              className="text-sm font-medium text-white transition hover:text-white/80"
            >
              About
            </Link>
            <Link 
              href="/terms"
              className="text-sm font-medium text-white transition hover:text-white/80"
            >
              Terms
            </Link>
          </nav>

          {/* Copyright */}
          <div className="text-sm text-white">
            © {new Date().getFullYear()} Outrun Cancer
          </div>
        </div>
      </div>
    </footer>
  );
}