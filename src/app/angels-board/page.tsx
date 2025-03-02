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
`

export default function AngelsBoard() {
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false)
  const [isHowItWorksOpen, setIsHowItWorksOpen] = useState(false)
  const { connected } = useWallet()

  return (
    <main className="min-h-screen flex items-center justify-center py-8">
      <style jsx global>
        {backgroundStyle}
      </style>
      <div className="bg-pattern"></div>
      
      <div className="content w-full max-w-5xl mx-auto px-4">
        {/* Centered container with same styling as about page */}
        <div className="bg-white/10 backdrop-blur-md rounded-xl text-white p-8">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold">OUTRUN CANCER - Angels Board</h1>
            
            <div className="flex gap-2 items-center">
              <Button
                variant="ghost"
                size="sm"
                className="text-white hover:bg-white/10"
                onClick={() => setIsHowItWorksOpen(true)}
              >
                <Info className="mr-1 h-4 w-4" />
                How It Works
              </Button>
              
              {connected ? (
                <Button
                  onClick={() => setIsUploadModalOpen(true)}
                  className="flex items-center gap-1 bg-blue-700 hover:bg-blue-600 text-white"
                  size="sm"
                >
                  <Upload className="w-4 h-4" />
                  Upload Image
                </Button>
              ) : (
                <WalletConnectButton />
              )}
            </div>
          </div>
          
          <div className="mb-3 flex justify-between">
            <div className="text-sm text-blue-300">
              <span className="font-bold">$1 per 10 pixels</span>
              <span className="mx-2 text-white/60">|</span>
              <span className="text-white/80">Upload an image to secure your spot</span>
            </div>
          </div>
          
          {/* Canvas container with fixed dimensions */}
          <div className="relative w-full bg-black/20 backdrop-blur-sm rounded-lg border border-white/10 p-2 shadow-lg">
            <div style={{ position: 'relative', width: '100%', height: '600px' }}>
              <Canvas className="w-full h-full" />
            </div>
          </div>
          
          <div className="mt-4 text-center text-sm text-white/60">
            Images are permanently stored on this page and the Solana blockchain
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
    </main>
  )
}
