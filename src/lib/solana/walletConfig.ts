// src/lib/solana/walletConfig.ts
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { ACTIVE_NETWORK } from '@/utils/constants';

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

// Export the RPC endpoint based on the active network
export const RPC_ENDPOINT = RPC_ENDPOINTS[ACTIVE_NETWORK];
export const FALLBACK_ENDPOINTS = FALLBACK_RPC_ENDPOINTS[ACTIVE_NETWORK];

// Set connection timeouts
export const CONNECTION_TIMEOUT = 40000; // 40 seconds
export const CONFIRMATION_TIMEOUT = 60000; // 60 seconds 

// Set RPC retry attempts
export const MAX_RPC_RETRIES = 3;

// Log the active configuration for debugging
console.log('Solana Wallet Configuration:');
console.log(`- Active Network: ${ACTIVE_NETWORK}`);
console.log(`- Primary RPC Endpoint: ${RPC_ENDPOINT}`);
console.log(`- Fallback Endpoints: ${FALLBACK_ENDPOINTS.join(', ')}`);
console.log(`- Connection Timeout: ${CONNECTION_TIMEOUT / 1000}s`);
