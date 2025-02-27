// src/lib/solana/walletConfig.ts
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { ACTIVE_NETWORK } from '@/utils/constants';

// Define RPC endpoints for different networks
const RPC_ENDPOINTS = {
  [WalletAdapterNetwork.Devnet]: 'https://api.devnet.solana.com',
  [WalletAdapterNetwork.Mainnet]: 'https://api.mainnet-beta.solana.com',
  [WalletAdapterNetwork.Testnet]: 'https://api.testnet.solana.com',
};

// Export the RPC endpoint based on the active network
export const RPC_ENDPOINT = RPC_ENDPOINTS[ACTIVE_NETWORK];

// Set connection timeout
export const CONNECTION_TIMEOUT = 30000; // 30 seconds

// Log the active configuration for debugging
console.log('Solana Wallet Configuration:');
console.log(`- Active Network: ${ACTIVE_NETWORK}`);
console.log(`- RPC Endpoint: ${RPC_ENDPOINT}`);
