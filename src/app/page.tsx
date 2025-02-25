"use client"

import { useState } from "react"
import { Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import Canvas from "@/components/canvas/Canvas"
import UploadModal from "@/components/upload/UploadModal"

export default function VisionBoard() {
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false)

  return (
    <div className="min-h-screen bg-white p-8">
      <div className="max-w-[1200px] mx-auto">
        <div className="flex gap-12">
          <div className="w-48 space-y-4">
            <Button
              onClick={() => setIsUploadModalOpen(true)}
              className="w-full flex items-center gap-2 bg-black text-white hover:bg-black/90"
            >
              <Upload className="w-4 h-4" />
              Upload Image
            </Button>
          </div>

          <div className="relative flex-1">
            <div 
              className="relative w-[1000px] h-[1000px] mx-auto overflow-hidden rounded-lg"
              style={{
                backgroundColor: '#e5d3b3',
                backgroundImage: `radial-gradient(circle at 100% 150%, #e5d3b3 24%, #d4c4a4 25%, #d4c4a4 28%, #e5d3b3 29%, #e5d3b3 36%, #d4c4a4 36%, #d4c4a4 40%, transparent 40%, transparent),
                                 radial-gradient(circle at 0 150%, #e5d3b3 24%, #d4c4a4 25%, #d4c4a4 28%, #e5d3b3 29%, #e5d3b3 36%, #d4c4a4 36%, #d4c4a4 40%, transparent 40%, transparent),
                                 radial-gradient(circle at 50% 100%, #d4c4a4 10%, #e5d3b3 11%, #e5d3b3 23%, #d4c4a4 24%, #d4c4a4 30%, #e5d3b3 31%, #e5d3b3 43%, #d4c4a4 44%, #d4c4a4 50%, #e5d3b3 51%, #e5d3b3 63%, #d4c4a4 64%, #d4c4a4 71%, transparent 71%, transparent)`,
                backgroundSize: '100px 50px',
                backgroundRepeat: 'repeat',
                boxShadow: `
                  0 0 0 1px rgba(0, 0, 0, 0.05),
                  0 4px 6px rgba(0, 0, 0, 0.1),
                  0 10px 20px rgba(0, 0, 0, 0.1),
                  0 20px 40px rgba(0, 0, 0, 0.15),
                  inset 0 2px 6px rgba(255, 255, 255, 0.1),
                  inset 0 -2px 6px rgba(0, 0, 0, 0.1)
                `
              }}
            >
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