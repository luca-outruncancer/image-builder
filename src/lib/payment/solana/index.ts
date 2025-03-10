// src/lib/payment/solana/index.ts

// Re-export the connectionManager singleton
export { connectionManager } from './connectionManager';

// Export the payment provider
export { default as SolanaPaymentProvider } from './solanaPaymentProvider';

// Also export the specific processors for direct access if needed
export { SolPaymentProcessor } from './solPaymentProcessor';
export { TokenPaymentProcessor } from './tokenPaymentProcessor';
