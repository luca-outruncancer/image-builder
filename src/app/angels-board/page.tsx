// src/app/angels-board/page.tsx
"use client"

import { useState } from "react"
import Link from "next/link"
import Canvas from "@/components/canvas/Canvas"
import UploadModal from "@/components/upload/UploadModal"
import ToolsPanel from "@/components/tools/ToolsPanel"
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

export default function VisionBoard() {
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false)

  return (
    <main
      className="min-h-screen"
      style={{
        background: "radial-gradient(circle at center, #1E40AF, #000000)",
      }}
    >
      <style jsx global>
        {backgroundStyle}
      </style>
      <div className="bg-pattern"></div>
      <div className="content p-8">
        <div className="max-w-[1200px] mx-auto">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold text-white">OUTRUN CANCER - Angels Board</h1>
          </div>
          
          <div className="flex gap-8 flex-col md:flex-row">
            {/* Tools Panel */}
            <div className="bg-black/40 backdrop-blur-sm p-4 rounded-lg shadow-lg border border-white/10">
              <ToolsPanel onUploadClick={() => setIsUploadModalOpen(true)} />
            </div>

            {/* Vision Board Area */}
            <div className="relative flex-1">
              <div className="relative w-full max-w-[1000px] h-[800px] mx-auto overflow-hidden rounded-lg shadow-lg border border-white/10">
                <Canvas />
              </div>
            </div>
          </div>
        </div>

        <UploadModal
          isOpen={isUploadModalOpen}
          onClose={() => setIsUploadModalOpen(false)}
          onUpload={(file) => {
            console.log("Uploaded file:", file)
            setIsUploadModalOpen(false)
          }}
        />
      </div>
    </main>
  )
}