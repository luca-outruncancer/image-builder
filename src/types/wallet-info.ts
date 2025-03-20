// src/types/wallet-info.ts

// Define the wallet info interface
export interface WalletInfo {
  success: boolean;
  wallet?: string;
  sender_wallet?: string;
  imageId?: number;
  position?: {
    x: number;
    y: number;
    width: number;
    height: number;
    clickedX: number;
    clickedY: number;
  };
  status?: string;
  image_location?: string;
} 