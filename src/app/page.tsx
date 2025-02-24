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
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='200' height='200' viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.4' fill='%23e5d3b3'/%3E%3C/svg%3E")`,
                backgroundSize: '200px 200px',
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