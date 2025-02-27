// src/components/tools/ToolsPanel.tsx 
import { Upload } from "lucide-react"
import { Button } from "@/components/ui/button"

interface ToolsPanelProps {
  onUploadClick: () => void
}

export default function ToolsPanel({ onUploadClick }: ToolsPanelProps) {
  return (
    <div className="w-48 p-4 bg-white">
      <div className="mb-4">
        <h3 className="font-small text-sm mb-2 text-black">
          Upload an image to secure your spot on this board. Forever on this page and the Solana blockchain.
          <br />
          <br />
          $1 per 10 pixels<br></br>
        </h3>
      </div>
      <Button
        onClick={onUploadClick}
        className="w-full flex items-center gap-2 bg-blue text-black hover:bg-green-400 hover:text-black"
      >
        <Upload className="w-4 h-4" />
        Upload Image
      </Button>
      <div className="mb-4">
        <h2 className="text-sm font-small mb-2 text-black">
          <br />
          <span className="font-bold">How it works</span>
          <br />
          <br />
          <span className="font-bold">1.</span> Upload your PFP, logo, or preferred image and resize it to your desired
          dimensions. <br />
          <span className="font-bold">2.</span> Place it anywhere free on the canvas. <br />
          <span className="font-bold">3.</span> Confirm the transaction in your wallet. <br />
          <span className="font-bold">4. Congrats!</span> You are now an{" "}
          <span className="text-green-400 font-bold">OUTRUNCANCER angel</span>.
          <br />
          Your image is permanently locked on this page and the Solana blockchain. <br />
        </h2>
      </div>
    </div>
  )
}

