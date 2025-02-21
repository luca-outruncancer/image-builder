// src/components/layout/Header.tsx
'use client';

import { useState } from 'react';
import UploadModal from '../upload/UploadModal';

export default function Header() {
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

  const handleUploadClick = () => {
    console.log('Opening modal');
    setIsUploadModalOpen(true);
  };

  return (
    <>
      <header className="border-b border-gray-200 bg-white p-4 z-10">
        <div className="flex items-center justify-between max-w-[95vw] mx-auto">
          <img 
            src="/OutrunCancer-logo.png" 
            alt="Outrun Cancer Logo" 
            className="h-8"
          />
          <h1 className="text-3xl font-bold">Image Board</h1>
          <button 
            onClick={handleUploadClick}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Upload
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