// src/lib/payment/solana/solPaymentProcessor.ts
import { 
  PublicKey, 
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  SendTransactionError
} from '@solana/web3.js';
import { 
  PaymentRequest,
  TransactionResult,
  WalletConfig,
  ErrorCategory
} from '../types';
import { 
  createPaymentError,
  isUserRejectionError,
  isTxAlreadyProcessedError,
  extractSignatureFromError,
  getNonce
} from '../utils';
import { connectionManager } from './connectionManager';

/**
 * SolPaymentProcessor handles native SOL token payment transactions
 */
export class SolPaymentProcessor {
  private wallet: WalletConfig;
  private cachedTransactions: Map<string, string> = new Map(); // Map of txId -> signature
  
  constructor(wallet: WalletConfig) {
    this.wallet = wallet;
  }
  
  /**
   * Check if a transaction with these parameters is already in progress or completed
   */
  private async checkExistingTransaction(paymentId: string): Promise<string | null> {
    const cachedSignature = this.cachedTransactions.get(paymentId);
    if (cachedSignature) {
      // Verify it's a successful transaction
      const isValid = await connectionManager.verifyTransaction(cachedSignature);
      if (isValid) {
        return cachedSignature;
      }
      // If not valid, remove from cache
      this.cachedTransactions.delete(paymentId);
    }
    return null;
  }
