// src/utils/constants.ts
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';

// Canvas and grid constants
export const CANVAS_WIDTH = 1000;
export const CANVAS_HEIGHT = 1000;
export const GRID_SIZE = 10;
export const MAX_FILE_SIZE = 1024 * 1024; // 1MB

// Feature flags
export const FEATURES = {
  IMAGE_MAGNIFIER_ENABLED: true,     // Toggle magnifier functionality
  SHOW_OWNER_WALLET: true,           // Show owner wallet address in magnifier
};

// Magnifier settings
export const MAGNIFIER = {
  ZOOM_FACTOR: 10.0,      // 10x magnification for the hover magnifier
  HOVER_DELAY_MS: 500,    // Delay before showing magnifier on hover
  BORDER_COLOR: '#3B82F6', // Border color (blue)
  BORDER_WIDTH: 2,        // Border width in pixels
};

// Network configuration
export const ACTIVE_NETWORK = WalletAdapterNetwork.Devnet; // Change to Mainnet when going live

// Recipient wallet address
export const RECIPIENT_WALLET_ADDRESS = "6ghQYEsbBRC4udcJThSDGoGkKWmrFdDDE6hjXWReG4LC";

// Payment related constants
export const PAYMENT_TIMEOUT_MS = 180000; // 180 seconds (3 minutes)
export const MAX_RETRIES = 2; // Maximum retry attempts for payment

// Token configuration
export const PAYMENT_TOKENS = {
  SOL: {
    name: "SOL",
    decimals: 9,
    // SOL doesn't need mint addresses
  },
  USDC: {
    name: "USDC",
    // Different mint addresses for different networks
    mint: {
      [WalletAdapterNetwork.Devnet]: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
      [WalletAdapterNetwork.Mainnet]: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    },
    decimals: 6,
  }
};

// Active payment token - change to use different tokens
export const ACTIVE_PAYMENT_TOKEN = "SOL"; // Options: "SOL", "USDC"

// Cost per pixel in different tokens
export const PIXEL_COST = {
  SOL: 0.000070,  // 0.000070 SOL per pixel
  USDC: 0.01,     // 0.01 USDC per pixel
};

// Export the current mint address for backward compatibility
export const MINT_ADDRESS = ACTIVE_PAYMENT_TOKEN === "SOL" 
  ? null 
  : PAYMENT_TOKENS[ACTIVE_PAYMENT_TOKEN].mint[ACTIVE_NETWORK];

// Get active mint address based on current network and token
export const getMintAddress = () => {
  if (ACTIVE_PAYMENT_TOKEN === "SOL") return null; // SOL doesn't use a mint
  
  return PAYMENT_TOKENS[ACTIVE_PAYMENT_TOKEN].mint[ACTIVE_NETWORK];
};

// Calculate cost for a given size
export const calculateCost = (width: number, height: number): number => {
  const totalPixels = width * height;
  const costPerPixel = PIXEL_COST[ACTIVE_PAYMENT_TOKEN];
  const totalCost = totalPixels * costPerPixel;
  
  // Round to a sensible number of decimal places
  const decimals = ACTIVE_PAYMENT_TOKEN === "SOL" ? 6 : 2;
  return Number(totalCost.toFixed(decimals));
};

export const PRESET_SIZES = [
  { width: 10, height: 10 },
  { width: 20, height: 20 },
  { width: 50, height: 50 },
  { width: 100, height: 10 },
  { width: 100, height: 100 },
  { width: 200, height: 100 }
] as const;