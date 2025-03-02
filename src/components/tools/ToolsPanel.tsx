// src/components/tools/ToolsPanel.tsx 
import { Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useWallet } from '@solana/wallet-adapter-react'
import { WalletConnectButton } from '@/components/solana/WalletConnectButton'

interface ToolsPanelProps {
  onUploadClick: () => void
}

export default function ToolsPanel({ onUploadClick }: ToolsPanelProps) {
  const { connected } = useWallet();

  return (
    <div className="w-56 p-4">
      <div className="mb-4">
        <h3 className="font-medium text-sm mb-2 text-white">
          Upload an image to secure your spot on this board. Forever on this page and the Solana blockchain.
          <br />
          <br />
          <span className="text-blue-300 font-bold">$1 per 10 pixels</span>
        </h3>
      </div>
      
      {/* Show connect wallet button if not connected */}
      {!connected ? (
        <div className="mb-4">
          <p className="text-sm text-red-400 mb-2">Connect your wallet first</p>
          <WalletConnectButton />
        </div>
      ) : (
        <Button
          onClick={onUploadClick}
          className="w-full flex items-center gap-2 bg-blue-600 text-white hover:bg-blue-500"
        >
          <Upload className="w-4 h-4" />
          Upload Image
        </Button>
      )}
      
      <div className="mb-4 mt-6">
        <h2 className="text-sm font-medium mb-2 text-white">
          <span className="font-bold text-blue-300 border-b border-blue-500 pb-1">How it works</span>
          <br />
          <br />
          <span className="font-bold text-blue-200">1.</span> Connect your wallet to get started.<br />
          <span className="font-bold text-blue-200">2.</span> Upload your PFP, logo, or preferred image and resize it to your desired
          dimensions. <br />
          <span className="font-bold text-blue-200">3.</span> Place it anywhere free on the canvas. <br />
          <span className="font-bold text-blue-200">4.</span> Confirm the transaction in your wallet. <br />
          <span className="font-bold text-blue-200">5. Congrats!</span> You are now an{" "}
          <span className="text-green-400 font-bold">OUTRUNCANCER angel</span>.
          <br />
          Your image is permanently locked on this page and the Solana blockchain. <br />
        </h2>
      </div>
    </div>
  )
}
