// src/lib/payment/solana/index.ts
import { processSolPayment, checkSolBalance } from './solPaymentProcessor';
import { processTokenPayment, checkTokenBalance } from './tokenPaymentProcessor';
import { PaymentRequest, TransactionResult, WalletConfig } from '../types';
import { ACTIVE_PAYMENT_TOKEN, getMintAddress } from '@/utils/constants';

/**
 * Main entry point for processing payments
 * Automatically routes to the correct processor based on token type
 */
export async function processPayment(
  request: PaymentRequest,
  walletConfig: WalletConfig,
  mintAddress?: string | null
): Promise<TransactionResult> {
  console.log(`Routing payment for ${request.token}`, {
    amount: request.amount,
    paymentId: request.metadata?.paymentId || 'unknown'
  });
  
  if (request.token === 'SOL') {
    return processSolPayment(request, walletConfig);
  } else {
    // Ensure we have a mint address for token payments
    const tokenMintAddress = mintAddress || getMintAddress();
    
    if (!tokenMintAddress) {
      return {
        success: false,
        error: {
          category: 'unknown_error',
          message: `No mint address available for ${request.token}`,
          retryable: false
        }
      };
    }
    
    return processTokenPayment(request, tokenMintAddress, walletConfig);
  }
}

export {
  processSolPayment,
  processTokenPayment,
  checkSolBalance,
  checkTokenBalance
};
