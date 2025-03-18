// src/lib/solana/walletConfig.ts
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { walletLogger } from '@/utils/logger/index';

// Define RPC endpoints for different networks with rate limit handling
const RPC_ENDPOINTS = {
  [WalletAdapterNetwork.Devnet]: 'https://api.devnet.solana.com',
  [WalletAdapterNetwork.Mainnet]: 'https://api.mainnet-beta.solana.com',
  [WalletAdapterNetwork.Testnet]: 'https://api.testnet.solana.com',
};

// Optional fallback RPC endpoints when primary fails
const FALLBACK_RPC_ENDPOINTS = {
  [WalletAdapterNetwork.Devnet]: [
    'https://devnet.solana.rpcpool.com',
    'https://api.devnet.solana.com'
  ],
  [WalletAdapterNetwork.Mainnet]: [
    'https://solana-api.projectserum.com',
    'https://api.mainnet-beta.solana.com'
  ],
  [WalletAdapterNetwork.Testnet]: [
    'https://api.testnet.solana.com'
  ],
};

// Network configuration
export const ACTIVE_NETWORK = process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet';
export const RPC_ENDPOINT = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';
export const FALLBACK_ENDPOINTS = process.env.NEXT_PUBLIC_SOLANA_FALLBACK_URLS 
  ? process.env.NEXT_PUBLIC_SOLANA_FALLBACK_URLS.split(',')
  : [];

// Connection settings
export const CONNECTION_TIMEOUT = 30000; // 30 seconds

// Set confirmation timeouts
export const CONFIRMATION_TIMEOUT = 60000; // 60 seconds 

// Set RPC retry attempts
export const MAX_RPC_RETRIES = 3;

// Log configuration for debugging
walletLogger.info('Solana Wallet Configuration:', {
  activeNetwork: ACTIVE_NETWORK,
  primaryRpcEndpoint: RPC_ENDPOINT,
  fallbackEndpoints: FALLBACK_ENDPOINTS,
  connectionTimeout: `${CONNECTION_TIMEOUT / 1000}s`
});
