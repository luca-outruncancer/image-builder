// src/app/page.tsx
"use client"

import { useState } from "react"
import Canvas from "@/components/canvas/Canvas"
import UploadModal from "@/components/upload/UploadModal"
import ToolsPanel from "@/components/tools/ToolsPanel"

export default function VisionBoard() {
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false)

  return (
    <div className="min-h-screen bg-white p-8">
      <div className="max-w-[1200px] mx-auto">
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