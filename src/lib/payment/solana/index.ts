// src/lib/payment/solana/index.ts
import { processSolPayment, checkSolBalance } from './solPaymentProcessor';
import { processTokenPayment, checkTokenBalance } from './tokenPaymentProcessor';
import { PaymentRequest, TransactionResult, WalletConfig, ErrorCategory } from '../types';
import { ACTIVE_PAYMENT_TOKEN, getMintAddress } from '@/utils/constants';
import { paymentLogger } from '@/utils/logger';
import { createPaymentError } from '../utils/errorUtils';

/**
 * Main entry point for processing payments
 * Automatically routes to the correct processor based on token type
 */
export async function processPayment(
  request: PaymentRequest,
  walletConfig: WalletConfig,
  mintAddress?: string | null
): Promise<TransactionResult> {
  paymentLogger.info('Processing payment request', {
    token: request.token,
    amount: request.amount,
    paymentId: request.metadata?.paymentId || 'unknown',
    activeToken: ACTIVE_PAYMENT_TOKEN,
    hasMintAddress: !!mintAddress
  });
  
  if (request.token === 'SOL') {
    paymentLogger.debug('Routing to SOL payment processor', {
      paymentId: request.metadata?.paymentId,
      amount: request.amount
    });
    return processSolPayment(request, walletConfig);
  } else {
    // Ensure we have a mint address for token payments
    const tokenMintAddress = mintAddress || getMintAddress();
    
    if (!tokenMintAddress) {
      const error = createPaymentError(
        ErrorCategory.UNKNOWN_ERROR,
        `No mint address available for ${request.token}`,
        null,
        false
      );
      
      paymentLogger.error('Token payment failed - missing mint address', {
        token: request.token,
        paymentId: request.metadata?.paymentId,
        error
      });
      
      return {
        success: false,
        error
      };
    }
    
    paymentLogger.debug('Routing to token payment processor', {
      token: request.token,
      paymentId: request.metadata?.paymentId,
      amount: request.amount,
      mintAddress: tokenMintAddress
    });
    
    return processTokenPayment(request, tokenMintAddress, walletConfig);
  }
}

export {
  processSolPayment,
  processTokenPayment,
  checkSolBalance,
  checkTokenBalance
};
