// src/app/page.tsx
"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"

// Grid pattern style
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

export default function Home() {
  return (
    <div className="flex-1 flex items-center justify-center px-4 py-4 sm:py-6">
      <style jsx global>
        {backgroundStyle}
      </style>
      <div className="bg-pattern"></div>
      
      {/* Container with no background (made invisible) but same dimensions */}
      <div className="w-full max-w-[1200px] min-w-[600px] mx-auto rounded-xl text-white">
        <div className="p-4 sm:p-6 md:p-8">
          <div className="flex flex-col items-center justify-center space-y-6 text-center">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4">
              OUTRUN CANCER
            </h1>
            
            <p className="text-sm sm:text-base md:text-lg text-white/90 max-w-2xl">
              Every dollar raised through our Angel Board funds the creation of OUTRUNCANCER 3.0, 
              an innovative, blockchain-powered platform that empowers individuals to drive cancer prevention.
            </p>
            
            <p className="text-sm sm:text-base text-white/80 max-w-2xl mb-4">
              From transparent donation tracking to community-driven project support, this is the future of fundraising.
            </p>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-md mt-4">
              <Link href="/angels-board" className="w-full">
                <Button 
                  className="w-full h-12 sm:h-14 text-base sm:text-lg bg-blue-700 hover:bg-blue-600 text-white"
                >
                  Angels' Board
                </Button>
              </Link>
              <Link href="/about" className="w-full">
                <Button 
                  className="w-full h-12 sm:h-14 text-base sm:text-lg bg-blue-700 hover:bg-blue-600 text-white"
                >
                  About Us
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}