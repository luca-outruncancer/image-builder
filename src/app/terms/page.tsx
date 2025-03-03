// src/app/terms/page.tsx
"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function TermsPage() {
  return (
    <div className="flex-1 flex items-center justify-center px-4 py-4 sm:py-6">
      <div className="w-full max-w-[1200px] min-w-[600px] mx-auto bg-white/10 backdrop-blur-md rounded-xl text-white">
        <div className="p-4 sm:p-6 md:p-8">
          <div className="mb-4 flex justify-between items-center">
            <h1 className="text-2xl sm:text-3xl font-bold">Terms and Conditions</h1>
          </div>
          
          <div className="space-y-4 sm:space-y-6">
            <p className="text-sm sm:text-base">
              These Terms and Conditions govern your use of the OUTRUN CANCER Angels' Board platform.
              By using this platform, you agree to these terms in full.
            </p>
            
            <div>
              <h2 className="text-lg sm:text-xl font-semibold mb-2">Image Guidelines</h2>
              <ul className="list-disc pl-6 space-y-2 text-sm sm:text-base">
                <li>
                  <strong>Appropriate Content</strong> - All uploaded images must be appropriate and not contain 
                  offensive, illegal, or harmful content.
                </li>
                <li>
                  <strong>Rights and Permissions</strong> - You must have the necessary rights or permissions 
                  to use and display any images you upload.
                </li>
                <li>
                  <strong>Permanence</strong> - Once an image is placed on the Angels' Board and payment is confirmed, 
                  it becomes a permanent part of the board.
                </li>
              </ul>
            </div>
            
            <div>
              <h2 className="text-lg sm:text-xl font-semibold mb-2">Payment Terms</h2>
              <p className="text-sm sm:text-base">
                All payments are processed through the Solana blockchain and are non-refundable. 
                The fee for placing an image is based on the size of the image, calculated at $1 per 10 pixels.
              </p>
            </div>
            
            <div>
              <h2 className="text-lg sm:text-xl font-semibold mb-2">Privacy & Data</h2>
              <p className="text-sm sm:text-base">
                Your wallet address will be associated with your image placement and recorded on the blockchain. 
                No personal identification information is stored beyond what is publicly visible on the blockchain.
              </p>
              <div className="mt-4">
                <Link href="/angels-board">
                  <Button className="bg-blue-700 hover:bg-blue-600">
                    Return to Angels' Board
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}