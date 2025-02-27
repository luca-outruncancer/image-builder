'use client';

import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="w-full py-4 px-6 mt-8 relative z-20 bg-black bg-opacity-50 backdrop-blur-sm border-t border-green-900/30">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center">
        <div className="mb-4 md:mb-0">
          <p className="text-white text-sm">
            &copy; {new Date().getFullYear()} Outrun Cancer Initiative. All rights reserved.
          </p>
        </div>
        
        <nav className="flex gap-6">
          <Link href="/privacy" className="text-white hover:text-green-400 transition-colors text-sm">
            Privacy Policy
          </Link>
          <Link href="/terms" className="text-white hover:text-green-400 transition-colors text-sm">
            Terms of Service
          </Link>
          <Link href="/about" className="text-white hover:text-green-400 transition-colors text-sm">
            About Us
          </Link>
        </nav>
      </div>
    </footer>
  );
}
