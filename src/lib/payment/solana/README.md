# Solana Payment Processors

This directory contains the payment processors for handling Solana blockchain transactions.

## Overview

The payment processors handle:
- SOL native currency transfers
- SPL Token transfers (e.g., USDC)
- Balance checking
- Transaction validation
- Error handling with retry capabilities

## Components

- `solPaymentProcessor.ts`: Handles native SOL payments
- `tokenPaymentProcessor.ts`: Handles SPL token payments
- `index.ts`: Central export that provides a unified interface

## Usage

### Basic Usage

```typescript
import { processPayment } from '@/lib/payment/solana';
import { PaymentRequest, WalletConfig } from '@/lib/payment/types';
import { getMintAddress } from '@/utils/constants';

// Setup wallet config
const walletConfig: WalletConfig = {
  publicKey: wallet.publicKey, // PublicKey from @solana/web3.js
  signTransaction: wallet.signTransaction, // From wallet adapter
  connected: wallet.connected // Boolean
};

// Create payment request
const paymentRequest: PaymentRequest = {
  amount: 0.1, // Amount in SOL or tokens
  token: 'SOL', // 'SOL' or token symbol (e.g., 'USDC')
  recipientWallet: '6ghQYEsbBRC4udcJThSDGoGkKWmrFdDDE6hjXWReG4LC', // Recipient address
  metadata: {
    imageId: 123, // Custom metadata for your application
    positionX: 100,
    positionY: 200,
    width: 300,
    height: 400,
    fileName: 'image.png',
    paymentId: 'pay_123456' // Unique ID for this payment
  }
};

// For token payments, get the mint address
const mintAddress = getMintAddress(); // For SOL, this is null

// Process the payment
const result = await processPayment(paymentRequest, walletConfig, mintAddress);

if (result.success) {
  console.log('Payment successful!');
  console.log('Transaction hash:', result.transactionHash);
} else {
  console.error('Payment failed:', result.error?.message);
}
```

### Individual Processors

You can also use the individual processors directly:

```typescript
import { processSolPayment, processTokenPayment } from '@/lib/payment/solana';

// For SOL payments
const solResult = await processSolPayment(paymentRequest, walletConfig);

// For token payments
const tokenResult = await processTokenPayment(
  paymentRequest, 
  mintAddress, 
  walletConfig
);
```

### Checking Balances

```typescript
import { checkSolBalance, checkTokenBalance } from '@/lib/payment/solana';
import { PublicKey } from '@solana/web3.js';

// Check SOL balance
const walletAddress = new PublicKey('6ghQYEsbBRC4udcJThSDGoGkKWmrFdDDE6hjXWReG4LC');
const { balance: solBalance } = await checkSolBalance(walletAddress);
console.log(`SOL Balance: ${solBalance}`);

// Check token balance
const { hasToken, balance: tokenBalance } = await checkTokenBalance(
  walletAddress,
  'USDC'
);

if (hasToken) {
  console.log(`USDC Balance: ${tokenBalance}`);
} else {
  console.log('User does not have a USDC token account');
}
```

## Error Handling

The processors return detailed error information:

```typescript
if (!result.success && result.error) {
  const { category, message, retryable } = result.error;
  
  switch (category) {
    case 'user_rejection':
      console.log('User rejected the transaction');
      break;
    case 'balance_error':
      console.log('Insufficient balance');
      break;
    case 'network_error':
      console.log('Network error, will retry automatically');
      break;
    case 'wallet_error':
      console.log('Wallet error:', message);
      break;
    case 'blockchain_error':
      console.log('Blockchain error:', message);
      break;
    default:
      console.log('Unknown error:', message);
  }
  
  if (retryable) {
    console.log('This error can be retried');
  }
}
```

## Integration with SolanaPaymentProvider

For most use cases, it's recommended to use the `SolanaPaymentProvider` class, which provides additional features:

- Transaction caching
- Automatic selection of payment processor
- Exponential backoff retry
- Transaction verification

```typescript
import { SolanaPaymentProvider } from '@/lib/payment/solanaPaymentProvider';

const provider = new SolanaPaymentProvider(walletConfig);
const result = await provider.processPayment(paymentRequest, mintAddress);
```
