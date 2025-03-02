// src/app/terms/page.tsx
"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function AboutPage() {
  return (
    <main
      className="min-h-screen flex items-center justify-center"
      style={{
        background: "radial-gradient(circle at center, #1E40AF, #000000)",
      }}
    >
      <div className="max-w-4xl mx-auto p-8 bg-white/10 backdrop-blur-md rounded-xl text-white">
        <div className="mb-8 flex justify-between items-center">
          <h1 className="text-3xl font-bold">Terms and Conditions</h1>
        </div>
        
        <div className="space-y-6">
          <p>
            T & C ... 
          </p>
          
          <div>
            <h2 className="text-xl font-semibold mb-2">Our Journey</h2>
            <ul className="list-disc pl-6 space-y-2">
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
            <h2 className="text-xl font-semibold mb-2">The Angels Board</h2>
            <p>
              The Angels Board is a unique way to contribute to our cause. By securing your spot 
              on our digital board, you're helping fund the development of Outruncancer 3.0, 
              which will revolutionize how donations are tracked and projects are supported.
            </p>
            <div className="mt-4">
              <Link href="/angels-board">
                <Button className="bg-blue-700 hover:bg-blue-600">
                  Visit the Angels Board
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}