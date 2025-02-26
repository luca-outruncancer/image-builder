// src/utils/constants.ts
export const CANVAS_WIDTH = 1000;
export const CANVAS_HEIGHT = 1000;
export const GRID_SIZE = 10;
export const MAX_FILE_SIZE = 1024 * 1024; // 1MB

// Solana payment constants
export const USDC_PER_PIXEL = 0.01; // 1 USDC per 100 pixels
export const RECIPIENT_WALLET_ADDRESS = "6ghQYEsbBRC4udcJThSDGoGkKWmrFdDDE6hjXWReG4LC";
export const MINT_ADDRESS = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"; // USDC on Solana

export const PRESET_SIZES = [
  { width: 10, height: 10 },
  { width: 20, height: 20 },
  { width: 50, height: 50 },
  { width: 100, height: 10 },
  { width: 100, height: 100 },
  { width: 200, height: 100 }
] as const;

// Calculate cost for a given size
export const calculateCost = (width: number, height: number): number => {
  const totalPixels = width * height;
  return Number((totalPixels * USDC_PER_PIXEL).toFixed(2)); // Round to 2 decimal places
};