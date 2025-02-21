// src/components/layout/Footer.tsx
'use client';

import Link from 'next/link';
import { Twitter, Globe } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="border-t border-gray-200 bg-white p-4">
      <div className="max-w-[95vw] mx-auto">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          {/* Social Links */}
          <div className="flex items-center gap-4">
            <Link 
              href="https://x.com/outruncancer" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-gray-600 hover:text-blue-600 transition-colors"
            >
              <Twitter size={20} />
            </Link>
            <Link 
              href="https://www.outruncancer.com" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-gray-600 hover:text-blue-600 transition-colors"
            >
              <Globe size={20} />
            </Link>
          </div>

          {/* Navigation Links */}
          <nav className="flex items-center gap-4">
            <Link 
              href="/about"
              className="text-gray-600 hover:text-blue-600 transition-colors"
            >
              About
            </Link>
            <Link 
              href="/terms"
              className="text-gray-600 hover:text-blue-600 transition-colors"
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