// src/components/layout/Footer.tsx
'use client';

import Link from 'next/link';
import { Twitter, Globe } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="border-t border-gray-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
          {/* Social Links */}
          <div className="flex items-center space-x-6">
            <Link 
              href="https://x.com/outruncancer" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-gray-500 transition hover:text-blue-500"
            >
              <span className="sr-only">Twitter</span>
              <Twitter size={22} className="h-6 w-6" />
            </Link>
            <Link 
              href="https://www.outruncancer.com" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-gray-500 transition hover:text-blue-500"
            >
              <span className="sr-only">Website</span>
              <Globe size={22} className="h-6 w-6" />
            </Link>
          </div>

          {/* Navigation Links */}
          <nav className="flex space-x-8">
            <Link 
              href="/"
              className="text-sm font-medium text-gray-700 transition hover:text-blue-500"
            >
              Home
            </Link>
            <Link 
              href="/about"
              className="text-sm font-medium text-gray-700 transition hover:text-blue-500"
            >
              About
            </Link>
            <Link 
              href="/terms"
              className="text-sm font-medium text-gray-700 transition hover:text-blue-500"
            >
              Terms and Conditions
            </Link>
          </nav>

          {/* Copyright */}
          <div className="text-sm text-gray-500">
            © {new Date().getFullYear()} Outrun Cancer. All rights reserved.
          </div>
        </div>
      </div>
    </footer>
  );
}