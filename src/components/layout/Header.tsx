// src/components/layout/Header.tsx
'use client';

import { useState } from 'react';
import UploadModal from '../upload/UploadModal';
import { Upload } from 'lucide-react';

export default function Header() {
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

  const handleUploadClick = () => {
    console.log('Opening modal');
    setIsUploadModalOpen(true);
  };

  return (
    <>
      <header className="sticky top-0 border-b border-gray-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center">
            <img 
              src="/OutrunCancer-logo.png" 
              alt="Outrun Cancer Logo" 
              className="h-8 w-auto"
            />
          </div>
          
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl hidden sm:block">
            Image Board
          </h1>

          <button 
            onClick={handleUploadClick}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 active:scale-95"
          >
            <Upload size={18} />
            <span>Upload</span>
          </button>
        </div>
      </header>
      <UploadModal 
        isOpen={isUploadModalOpen} 
        onClose={() => setIsUploadModalOpen(false)} 
      />
    </>
  );
}