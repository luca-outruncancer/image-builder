// src/app/page.tsx
"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"

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
    <main
      className="min-h-screen flex items-center justify-center"
      style={{
        background: "radial-gradient(circle at center, #1E40AF, #000000)",
      }}
    >
      <style jsx global>
        {backgroundStyle}
      </style>
      <div className="bg-pattern"></div>
      <div className="content w-full max-w-4xl mx-auto px-4">
        <div className="flex flex-col items-center justify-center space-y-8 text-center">
          <h1 className="text-4xl sm:text-5xl font-extrabold mb-4 bg-clip-text text-transparent bg-gradient-to-br from-gray-200 to-gray-600">
            OUTRUN CANCER
          </h1>
          <p className="text-lg sm:text-xl mb-8 text-gray-300 max-w-2xl">
            Every dollar raised through our Angel Board funds the creation of OUTRUNCANCER 3.0, 
            an innovative, blockchain-powered platform that empowers individuals to drive cancer prevention.
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-lg">
            <Link href="/angels-board" className="w-full">
              <Button 
                className="w-full h-16 text-lg bg-blue-700 hover:bg-blue-600 text-white"
              >
                Angels Board
              </Button>
            </Link>
            <Link href="/about" className="w-full">
              <Button 
                className="w-full h-16 text-lg bg-blue-700 hover:bg-blue-600 text-white"
              >
                About Us
              </Button>
            </Link>
          </div>
          
          <p className="text-sm text-gray-400 mt-8">
            From transparent donation tracking to community-driven project support, 
            this is the future of fundraising.
          </p>
        </div>
      </div>
    </main>
  )
}