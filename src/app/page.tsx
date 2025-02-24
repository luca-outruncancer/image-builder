"use client"

import { useState } from "react"
import { Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import Canvas from "@/components/canvas/Canvas"
import UploadModal from "@/components/upload/UploadModal"
import Image from "next/image"

export default function VisionBoard() {
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false)

  return (
    <div className="min-h-screen bg-white p-8">
      <div className="max-w-[1200px] mx-auto">
        {/* Logo and Mission Statement Area */}
        <div className="mb-12 space-y-6">
          <div className="relative w-[300px] h-[100px]">
            <Image
              src="/OutrunCancer-logo.png" 
              alt="OUTRUNCANCER: Run. Prevent. Inspire."
              fill
              className="object-contain"
            />
          </div>

          <div className="max-w-3xl text-gray-800 space-y-6">
            <p className="text-lg leading-relaxed">
              We believe in outrunning cancer - winning the race by preventing cancer.
            </p>
            <p className="text-lg leading-relaxed">
              Every $ raised through this visual board will go towards building OUTRUNCANCER 3.0. A new more effective
              way to raise awareness and funds for cancer prevention, by empowering and financially supporting
              individuals to raise funds, donate to specific prevention projects, and bring blockchain transparency
              across the board.
            </p>
          </div>
        </div>

        <div className="flex gap-12">
          {/* Tools Panel */}
          <div className="w-48 space-y-4">
            <Button
              onClick={() => setIsUploadModalOpen(true)}
              className="w-full flex items-center gap-2 bg-black text-white hover:bg-black/90"
            >
              <Upload className="w-4 h-4" />
              Upload Image
            </Button>
          </div>

          {/* Vision Board Area */}
          <div className="relative flex-1">
            <div
              className="relative w-[1000px] h-[1000px] mx-auto overflow-hidden"
              style={{
                backgroundImage: `url(https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-pVz4c3KJWStlzicztb2eNLLFldRlaV.png)`,
                backgroundSize: "cover",
                backgroundRepeat: "repeat",
                boxShadow: `
                  0 0 0 1px rgba(0, 0, 0, 0.05),
                  0 4px 6px rgba(0, 0, 0, 0.1),
                  0 10px 20px rgba(0, 0, 0, 0.1),
                  0 20px 40px rgba(0, 0, 0, 0.15),
                  inset 0 2px 6px rgba(255, 255, 255, 0.1),
                  inset 0 -2px 6px rgba(0, 0, 0, 0.1)
                `,
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

