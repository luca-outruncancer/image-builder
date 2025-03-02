// src/app/angels-board/page.tsx
"use client"

import { useState } from "react"
import Link from "next/link"
import Canvas from "@/components/canvas/Canvas"
import UploadModal from "@/components/upload/UploadModal"
import ToolsPanel from "@/components/tools/ToolsPanel"
import { Button } from "@/components/ui/button"

export default function VisionBoard() {
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false)

  return (
    <div className="min-h-screen bg-white p-8">
      <div className="max-w-[1200px] mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">OUTRUN CANCER - Angels Board</h1>
          <Link href="/">
            <Button variant="outline">Back to Home</Button>
          </Link>
        </div>
        
        <div className="flex gap-12">
          {/* Tools Panel */}
          <ToolsPanel onUploadClick={() => setIsUploadModalOpen(true)} />

          {/* Vision Board Area */}
          <div className="relative flex-1">
            <div className="relative w-[1000px] h-[1000px] mx-auto overflow-hidden rounded-lg shadow-lg">
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
  )
}