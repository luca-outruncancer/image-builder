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
  HIGH_QUALITY_IMAGES: true,         // Toggle for high-quality image processing
};

// Logging configuration
export enum LogLevel {
  DEBUG = 0,  // Most verbose
  INFO = 1,   // Standard information
  WARN = 2,   // Warnings
  ERROR = 3,  // Errors only
  NONE = 4    // No logging
}

export const LOGGING: {
  ENABLE_CONSOLE_LOGGING: boolean;
  LEVEL: string;
  APP_PREFIX: string;
  ENVIRONMENT: string;
  COMPONENTS: {
    PAYMENT: string;
    BLOCKCHAIN: string;
    WALLET: string;
    CANVAS: string;
    IMAGE: string;
    API: string;
    STORAGE: string;
    AUTH: string;
    SYSTEM: string;
  };
  PINO: {
    TRANSPORT: {
      OPTIONS: {
        colorize: boolean;
        translateTime: string;
        ignore: string;
      };
    };
    REDACT: {
      paths: string[];
      remove: boolean;
    };
  };
} = {
  // General settings
  ENABLE_CONSOLE_LOGGING: true,     // Enable logging to console
  LEVEL: process.env.NODE_ENV === 'development' ? 'debug' : 'info',  // Current log level
  APP_PREFIX: 'IMGBLDR',            // Application prefix for logs
  ENVIRONMENT: process.env.NODE_ENV || 'development',  // Current environment
  
  // Component names for logging context
  COMPONENTS: {
    PAYMENT: 'PAYMENT',             // Payment processing
    BLOCKCHAIN: 'BLOCKCHAIN',       // Blockchain interactions
    WALLET: 'WALLET',               // Wallet management
    CANVAS: 'CANVAS',               // Canvas operations
    IMAGE: 'IMAGE',                 // Image processing
    API: 'API',                     // API endpoints
    STORAGE: 'STORAGE',             // Storage operations
    AUTH: 'AUTH',                   // Authentication
    SYSTEM: 'SYSTEM',               // System operations
  },

  // Pino specific configuration
  PINO: {
    TRANSPORT: {
      OPTIONS: {
        colorize: true,
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname'
      }
    },
    REDACT: {
      paths: ['wallet.privateKey', '*.privateKey', 'password'],
      remove: true
    }
  }
};

// Image resize and compression settings
export const IMAGE_SETTINGS = {
  // General options
  HIGH_QUALITY_MODE: true,           // Master toggle for high quality processing
  PRESERVE_TRANSPARENCY: true,       // Keep transparency in images when possible
  DEFAULT_FIT: 'cover' as const,     // How images are fit when resizing
  
  // Size multiplier to prevent excessive downsizing
  MINIMUM_SIZE_MULTIPLIER: 10,       // Multiply requested dimensions by this value for actual stored image
  
  // Format specific settings
  FORMAT_SETTINGS: {
    PREFER_ORIGINAL: true,           // Try to keep original format when possible
    PREFER_FORMAT: '',               // Force specific format if not empty ('webp', 'jpeg', 'png')
  },
  
  // Quality settings
  QUALITY: {
    DEFAULT: 90,                     // Default quality setting
    JPEG: 92,                        // JPEG quality (0-100)
    WEBP: 90,                        // WebP quality (0-100)
    PNG_COMPRESSION: 4,              // PNG compression level (0-9), lower is better quality
    AVIF: 85,                        // AVIF quality (0-100)
  },
  
  // Size-adaptive quality (override DEFAULT based on image size)
  SIZE_ADAPTIVE_QUALITY: true,       // Enable size-based quality adjustments
  SMALL_IMAGE_THRESHOLD: 10000,      // <= 10,000 pixels (e.g., 100x100)
  SMALL_IMAGE_QUALITY: 95,           // Quality for small images
  MEDIUM_IMAGE_THRESHOLD: 40000,     // <= 40,000 pixels (e.g., 200x200)
  MEDIUM_IMAGE_QUALITY: 90,          // Quality for medium images
  LARGE_IMAGE_QUALITY: 85,           // Quality for large images
  
  // Advanced settings
  ADVANCED: {
    KERNEL: 'lanczos3' as const,     // Resampling kernel for resize (lanczos3 is highest quality)
    MOZJPEG: true,                   // Use mozjpeg for better JPEG compression/quality balance
    USE_LOSSLESS_FOR_TRANSPARENCY: true, // Use lossless compression for images with transparency
    EFFORT_LEVEL: 4,                 // Compression effort level (0-6 for WebP)
  }
};

// Magnifier settings
export const MAGNIFIER = {
  ZOOM_FACTOR: 10, // 10x magnification for the hover magnifier
  HOVER_DELAY_MS: 500, // Delay before showing magnifier on hover
  BORDER_WIDTH: 2, // Border width in pixels
  BORDER_COLOR: '#3b82f6',  //border color
  RENDER_QUALITY: 'pixelated',
  EMPTY_BLOCK_COLOR: 'white',
  GRID_COLOR: 'rgba(200,200,200,0.2)'
};

// Network configuration
export const ACTIVE_NETWORK = WalletAdapterNetwork.Devnet; // Change to Mainnet when going live

// Recipient wallet address
export const RECIPIENT_WALLET_ADDRESS = "6ghQYEsbBRC4udcJThSDGoGkKWmrFdDDE6hjXWReG4LC";

// Payment related constants
export const PAYMENT_TIMEOUT_MS = 180000; // 180 seconds (3 minutes)

// Payment token configuration
type NetworkAddresses = {
  [key in 'mainnet' | 'devnet' | 'testnet']: string;
};

type PaymentToken = {
  name: string;
  symbol: string;
  decimals: number;
  mint: NetworkAddresses;
};

type PaymentTokens = {
  [key: string]: PaymentToken;
};

export const PAYMENT_TOKENS: PaymentTokens = {
  SOL: {
    name: 'Solana',
    symbol: 'SOL',
    decimals: 9,
    mint: {
      mainnet: '',
      devnet: '',
      testnet: ''
    }
  },
  // Add other tokens as needed
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