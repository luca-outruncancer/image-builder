# Solana Payment Integration

This document outlines how the Solana payment system is integrated in the Image Builder application.

## Overview

The payment system allows users to pay for image placements on the canvas using Solana (SOL) or USDC tokens. The system uses Solana Web3.js and SPL Token libraries to process payments and interacts with the Solana blockchain.

## Components

### 1. Configuration Files

- **`src/utils/constants.ts`**: Contains payment-related constants including wallet addresses, token configurations, and pricing.
- **`src/lib/solana/walletConfig.ts`**: Defines RPC endpoints and connection parameters for the Solana network.

### 2. Payment Processing

- **`src/utils/solanaPayment.ts`**: Handles the payment processing logic for both SOL and USDC payments. It includes functions to:
  - Create and sign transactions
  - Send transactions to the Solana network
  - Check wallet balances
  - Verify transaction confirmations

### 3. Database Integration

- **`src/lib/imageStorage.ts`**: Manages the image records in the database, including tracking payment status.
- **`src/lib/transactionStorage.ts`**: Handles storing and retrieving transaction records.
- **`src/database/schema.sql`**: Database schema defining the tables and relationships.

### 4. UI Components

- **`src/components/canvas/Canvas.tsx`**: The main component that integrates the payment system with the UI, handling:
  - User interaction for placing images
  - Integrating with wallet connection
  - Managing payment flow and states
  - Error handling and retry logic

## Payment Flow

1. **Image Selection**: User selects an image and dimensions
2. **Position Selection**: User positions the image on the canvas
3. **Confirm Placement**: User confirms position and sees cost
4. **Database Record**: Image is saved to the database with 'PENDING_PAYMENT' status
5. **Payment Processing**: 
   - Wallet connection is verified
   - Payment amount is calculated
   - Transaction is created and sent to the blockchain
   - User approves transaction in their wallet
6. **Confirmation**:
   - Transaction success: Image is marked as 'CONFIRMED'
   - Transaction failure: System offers retry options (max 2 retries)
   - Timeout: After 3 minutes without confirmation, transaction is marked as 'TIMEOUT'

## Error Handling

The payment system includes robust error handling:

1. **Connection Issues**: Detects and handles RPC connection problems
2. **Wallet Errors**: Handles wallet not connected, insufficient balance, etc.
3. **Transaction Failures**: Provides clear error messages and retry options
4. **Timeouts**: Automatically handles transactions that take too long
5. **Database Failures**: Graceful fallbacks when database operations fail

## Retry Logic

If a payment fails, the system can retry the transaction up to 2 times:

1. User is shown an error message with the option to retry
2. The image status is updated to 'PAYMENT_RETRY' in the database
3. The retry counter is incremented
4. A new payment transaction is attempted
5. After 2 retries, if payment still fails, the image is marked as 'PAYMENT_FAILED'

## Status Codes

The system uses the following status codes to track payment state:

**Image Status**:
- `CONFIRMED` (1): Payment successful
- `PENDING_PAYMENT` (2): Awaiting payment
- `PAYMENT_FAILED` (3): Payment attempt failed
- `PAYMENT_TIMEOUT` (4): Payment timed out
- `NOT_INITIATED` (5): Payment not initiated
- `PAYMENT_RETRY` (6): Payment being retried

**Transaction Status**:
- `SUCCESS`: Transaction completed successfully
- `FAILED`: Transaction failed
- `PENDING`: Transaction in progress
- `TIMEOUT`: Transaction timed out

## Troubleshooting Guide

### Common Issues and Solutions

#### 1. Transaction Timeouts
- **Issue**: Transaction takes too long or appears stuck
- **Solution**: 
  - Verify RPC endpoint is responsive
  - Check Solana network status
  - Increase `CONNECTION_TIMEOUT` in walletConfig.ts

#### 2. Wallet Connection Issues
- **Issue**: Cannot connect to wallet or wallet disconnects
- **Solution**:
  - Ensure Solana wallet extension is installed and up to date
  - Check that browser permissions are set correctly
  - Try reconnecting the wallet

#### 3. Transaction Failures
- **Issue**: Transaction fails with error
- **Solution**:
  - Check error message for specific issues (insufficient balance, etc.)
  - Verify recipient wallet address is correct
  - Check token configuration matches the active network

#### 4. Database Synchronization Issues
- **Issue**: Payment succeeds but image status is not updated
- **Solution**:
  - Check database connection
  - Verify transaction hash was properly recorded
  - Manually update image status if necessary

## Testing

When testing the payment system:

1. **Devnet Testing**: Use Solana Devnet for testing with test tokens
2. **Test Wallets**: Create dedicated test wallets with small amounts of SOL
3. **Error Simulation**: Test various error conditions to ensure proper handling
4. **Timeout Testing**: Verify timeout handling by simulating slow connections
5. **Retry Testing**: Ensure retry mechanism works correctly

## Future Improvements

Potential enhancements to the payment system:

1. **Webhook Support**: Add webhook notifications for transaction status changes
2. **Transaction Logs**: Implement a more detailed transaction logging system
3. **Alternative Tokens**: Support additional tokens beyond SOL and USDC
4. **Batch Payments**: Allow batch payments for multiple placements
5. **Payment Verification**: Enhanced on-chain verification of payments
6. **Refund Support**: Add functionality for refunding failed transactions

## Dependencies

- `@solana/web3.js`: Core Solana blockchain interaction
- `@solana/spl-token`: For USDC token interaction
- `@solana/wallet-adapter-react`: Wallet connection integration
