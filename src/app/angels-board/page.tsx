// src/app/angels-board/page.tsx
"use client"

import { useState } from "react"
import Canvas from "@/components/canvas/Canvas"
import UploadModal from "@/components/upload/UploadModal"
import { Button } from "@/components/ui/button"
import { Upload, Info } from "lucide-react"
import { useWallet } from '@solana/wallet-adapter-react'
import { WalletConnectButton } from '@/components/solana/WalletConnectButton'
import HowItWorksModal from "@/components/canvas/HowItWorksModal"
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '@/utils/constants';

const backgroundStyle = `
  .bg-pattern {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-image: 
      linear-gradient(to right, rgba(255,255,255,0.02) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(255,255,255,0.02) 1px, transparent 1px);
    background-size: 20px 20px;
    pointer-events: none;
    z-index: 1;
  }

  .content {
    position: relative;
    z-index: 2;
  }
  
  /* Custom scrollbar styles */
  .scrollbar-thin::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }
  
  .scrollbar-thin::-webkit-scrollbar-track {
    background: transparent;
  }
  
  .scrollbar-thin::-webkit-scrollbar-thumb {
    background: rgba(59, 130, 246, 0.4);
    border-radius: 4px;
  }
  
  .scrollbar-thin::-webkit-scrollbar-thumb:hover {
    background: rgba(59, 130, 246, 0.6);
  }
`

export default function AngelsBoard() {
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false)
  const [isHowItWorksOpen, setIsHowItWorksOpen] = useState(false)
  const { connected } = useWallet()

  return (
    <div className="flex-1 flex items-center justify-center px-4 py-4 sm:py-6">
      <style jsx global>
        {backgroundStyle}
      </style>
      <div className="bg-pattern"></div>
      
      <div className="content w-full mx-auto">
        {/* Container - matching width/styles with about page */}
        <div className="w-full max-w-4xl mx-auto bg-white/10 backdrop-blur-md rounded-xl text-white">
          <div className="p-4 sm:p-6 md:p-8">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-0 mb-4">
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold">OUTRUN CANCER - Angels' Board</h1>
              
              <div className="flex gap-2 items-center self-end sm:self-auto">
                <Button
                  size="sm"
                  className="text-white hover:bg-white/10"
                  onClick={() => setIsHowItWorksOpen(true)}
                >
                  <Info className="mr-1 h-4 w-4" />
                  <span className="hidden sm:inline">How It Works</span>
                  <span className="sm:hidden">Info</span>
                </Button>
                
                {connected ? (
                  <Button
                    onClick={() => setIsUploadModalOpen(true)}
                    className="flex items-center gap-1 bg-blue-700 hover:bg-blue-600 text-white"
                    size="sm"
                  >
                    <Upload className="w-4 h-4" />
                    <span className="hidden sm:inline">Upload Image</span>
                    <span className="sm:hidden">Upload</span>
                  </Button>
                ) : (
                  <WalletConnectButton />
                )}
              </div>
            </div>
            
            {/* Canvas container with scrolling */}
            <div className="relative w-full bg-black/20 backdrop-blur-sm rounded-lg border border-white/10 p-1 shadow-lg">
              <Canvas className="w-full" />
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      <UploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onUpload={(file) => {
          console.log("Uploaded file:", file)
          setIsUploadModalOpen(false)
        }}
      />
      
      <HowItWorksModal
        isOpen={isHowItWorksOpen}
        onClose={() => setIsHowItWorksOpen(false)}
      />
    </div>
  )
}