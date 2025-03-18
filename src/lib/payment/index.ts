// src/lib/payment/index.ts

// Export all types
export * from './types';

// Export utilities
export * from './utils';

// Export context components
export { PaymentProvider, usePaymentContext } from './context';

// Export hooks
export { usePayment } from './hooks';

// Export the ClientPaymentService class for direct use
export { default as ClientPaymentService } from './clientPaymentService';

// DEPRECATED: This export is deprecated and will be removed in a future update
// Use ClientPaymentService instead which uses server API endpoints
export { default as PaymentService } from './ZZZ_paymentService';

// Export sub-modules
export * from './solana';
export * from './storage';
