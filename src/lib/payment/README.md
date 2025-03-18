# Payment System Architecture

This directory contains the payment system for the image-board application. The architecture has been redesigned to properly separate client and server responsibilities.

## Architecture Overview

### Client-Side Components

1. **ClientPaymentService** (`clientPaymentService.ts`):
   - Handles wallet connection and transaction signing
   - Uses API endpoints for all database operations
   - Manages client-side payment state

2. **usePayment Hook** (`hooks/usePayment.ts`):
   - React hook for integrating payments into components
   - Uses the ClientPaymentService
   - Provides a simple interface for initializing and processing payments

### Server-Side Components

The server-side components are now implemented as API endpoints in the `/api/payment/` directory:

1. **Initialize Endpoint** (`/api/payment/initialize`):
   - Creates payment records in the database
   - Ensures server is initialized before database operations

2. **Update Endpoint** (`/api/payment/update`):
   - Updates payment status in the database
   - Updates image status when payments are confirmed/failed

3. **Verify Endpoint** (`/api/payment/verify`):
   - Verifies transactions on the blockchain
   - Updates database records with confirmation status

## Deprecated Components

Files prefixed with `ZZZ_` are deprecated and will be removed in a future update:

- `ZZZ_paymentService.ts` - Old payment service that accessed the database directly
- `storage/ZZZ_paymentStorageProvider.ts` - Old storage provider
- `storage/ZZZ_imageRepository.ts` - Old image repository
- `storage/ZZZ_transactionRepository.ts` - Old transaction repository

These components have been replaced by the server-side API endpoints.

## Usage

To process payments in a component:

```tsx
import { usePayment } from '@/lib/payment';

function PaymentComponent() {
  const {
    initializePayment,
    processPayment,
    isProcessing,
    error,
    successInfo
  } = usePayment();

  const handlePayment = async () => {
    const response = await initializePayment(amount, {
      imageId: 123,
      positionX: 0,
      positionY: 0,
      width: 100,
      height: 100
    });

    if (response) {
      await processPayment();
    }
  };

  return (
    // Component JSX
  );
}
```

The payment system handles all the communication with the server APIs and the blockchain. 