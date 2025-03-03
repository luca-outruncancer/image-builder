// src/app/about/page.tsx
"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function AboutPage() {
  return (
    <div className="flex-1 flex items-center justify-center px-4 py-4 sm:py-6">
      <div className="w-full max-w-[1200px] min-w-[600px] mx-auto bg-[#00A86B]/85 backdrop-blur-sm rounded-xl text-white">
        <div className="p-4 sm:p-6 md:p-8">
          <div className="mb-4 flex justify-between items-center">
            <h1 className="text-2xl sm:text-3xl font-bold">About OUTRUN CANCER</h1>
          </div>
          
          <div className="space-y-4 sm:space-y-6">
            <p className="text-sm sm:text-base">
              Outruncancer was founded in 2011 to raise awareness and funds for cancer prevention, 
              research and specific projects. To date, Outruncancer has raised over A$1m for 
              different initiatives and charities.
            </p>
            
            <div>
              <h2 className="text-lg sm:text-xl font-semibold mb-2">Our Journey</h2>
              <ul className="list-disc pl-6 space-y-2 text-sm sm:text-base">
                <li>
                  <strong>Outruncancer 1.0</strong> - Was all about a single person's desire to make a difference, 
                  raising funds by combining a passion for running marathons.
                </li>
                <li>
                  <strong>Outruncancer 2.0</strong> - Expanded our mission through community engagement 
                  and partnerships with healthcare organizations.
                </li>
                <li>
                  <strong>Outruncancer 3.0</strong> - The future - an innovative, blockchain-powered 
                  platform that empowers individuals to drive cancer prevention. 
                  From transparent donation tracking to community-driven project support.
                </li>
              </ul>
            </div>
            
            <div>
              <h2 className="text-lg sm:text-xl font-semibold mb-2">The Angels Board</h2>
              <p className="text-sm sm:text-base">
                The Angels Board is a unique way to contribute to our cause. By securing your spot 
                on our digital board, you're helping fund the development of Outruncancer 3.0, 
                which will revolutionize how donations are tracked and projects are supported.
              </p>
              <div className="mt-4">
                <Link href="/angels-board">
                  <Button className="bg-[#004E32] hover:bg-[#003D27]">
                    Visit the Angels Board
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