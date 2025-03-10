# Payment System Refactoring - File Structure

This document outlines the restructured file organization for the payment processing system.

```
src/lib/
├── payment/                            (Payment processing system)
│   ├── types/                          (Shared payment types)
│   │   ├── index.ts                    (Type exports)
│   │   ├── paymentTypes.ts             (Payment operation types)
│   │   └── storageTypes.ts             (Database record types)
│   ├── utils/                          (Shared utilities)
│   │   ├── index.ts                    (Utility exports)
│   │   ├── errorUtils.ts               (Error creation and handling)
│   │   ├── transactionUtils.ts         (Transaction helpers)
│   │   └── storageUtils.ts             (Database helpers)
│   ├── solana/                         (Solana blockchain interactions)
│   │   ├── index.ts                    (Provider exports)
│   │   ├── solanaPaymentProvider.ts    (Main provider facade)
│   │   ├── connectionManager.ts        (RPC connection handling)
│   │   ├── solPaymentProcessor.ts      (SOL native payments)
│   │   └── tokenPaymentProcessor.ts    (SPL token payments)
│   ├── storage/                        (Database operations)
│   │   ├── index.ts                    (Storage exports)
│   │   ├── paymentStorageProvider.ts   (Main storage facade)
│   │   ├── transactionRepository.ts    (Transaction CRUD operations)
│   │   ├── imageRepository.ts          (Image status operations)
│   │   └── statusMapper.ts             (Payment/DB status conversions)
│   ├── context/                        (React context for payments)
│   │   ├── index.ts                    (Context exports)
│   │   ├── PaymentContext.tsx          (React context provider)
│   │   └── paymentReducer.ts           (State management)
│   ├── hooks/                          (React hooks)
│   │   ├── index.ts                    (Hook exports)
│   │   └── usePayment.tsx              (Payment hook)
│   └── index.ts                        (Public API exports)
├── solana/                             (Solana utilities)
│   └── walletConfig.ts                 (Wallet configuration)
├── imageStorage.ts                     (Image storage utilities)
├── imageResizer.ts                     (Image resize operations)
├── supabase.ts                         (Supabase client)
└── utils.ts                            (General utilities)
```

## Benefits of This Structure

1. **Separation of Concerns**: Each file has a distinct responsibility
2. **Improved Maintainability**: Smaller files are easier to understand and update
3. **Better Testability**: Isolated components can be tested independently
4. **Consistent Patterns**: Similar organization across different modules
5. **Scalability**: New payment methods can be added without modifying existing code
6. **Backwards Compatibility**: Preserves the public API interfaces

This restructuring maintains all existing functionality while making the codebase more maintainable.
