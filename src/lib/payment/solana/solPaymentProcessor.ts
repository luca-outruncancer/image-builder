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
  
  /**
   * Process a SOL payment transaction
   */
  public async processPayment(request: PaymentRequest): Promise<TransactionResult> {
    try {
      const { amount, recipientWallet, metadata } = request;
      const paymentId = metadata?.paymentId || 'unknown';
      
      console.log(`Processing SOL payment [ID: ${paymentId}] for amount ${amount} SOL`);
      
      // Check for existing transaction first
      const existingSignature = await this.checkExistingTransaction(paymentId);
      if (existingSignature) {
        console.log(`Using existing transaction signature: ${existingSignature}`);
        return {
          success: true,
          transactionHash: existingSignature,
          blockchainConfirmation: true,
          reused: true
        };
      }
      
      if (!this.wallet.publicKey || !this.wallet.signTransaction) {
        return {
          success: false,
          error: createPaymentError(
            ErrorCategory.WALLET_ERROR,
            'Wallet not connected or missing required methods',
            null,
            false
          )
        };
      }
      
      // Check SOL balance
      let balance;
      try {
        const connection = connectionManager.getConnection();
        balance = await connection.getBalance(this.wallet.publicKey);
      } catch (balanceError) {
        return {
          success: false,
          error: createPaymentError(
            ErrorCategory.NETWORK_ERROR,
            'Failed to check SOL balance',
            balanceError,
            true
          )
        };
      }
      
      const solBalance = balance / LAMPORTS_PER_SOL;
      console.log("Current SOL balance:", solBalance);
      
      if (solBalance < amount) {
        return {
          success: false,
          error: createPaymentError(
            ErrorCategory.BALANCE_ERROR,
            `Insufficient SOL balance. You have ${solBalance.toFixed(6)} SOL but need ${amount} SOL`,
            null,
            false
          )
        };
      }
      
      // Calculate lamports (1 SOL = 1,000,000,000 lamports)
      const lamports = Math.floor(amount * LAMPORTS_PER_SOL);
      
      // Create transaction
      const transaction = new Transaction();
      
      // Add a unique identifier to transaction to prevent duplicates
      const nonce = getNonce();
      
      console.log(`Transaction [ID: ${paymentId}] created with nonce: ${nonce}`);
      
      // Add the main transfer instruction
      const mainTransferInstruction = SystemProgram.transfer({
        fromPubkey: this.wallet.publicKey,
        toPubkey: new PublicKey(recipientWallet),
        lamports: lamports,
      });
      
      transaction.add(mainTransferInstruction);
      
      // Add a unique zero-value transfer to make transaction unique
      const nonceInstruction = SystemProgram.transfer({
        fromPubkey: this.wallet.publicKey,
        toPubkey: this.wallet.publicKey,
        lamports: 0
      });
      
      transaction.add(nonceInstruction);
      
      // Get recent blockhash
      let blockHash;
      try {
        const connection = connectionManager.getConnection();
        blockHash = await connection.getLatestBlockhash('confirmed');
        console.log(`[ID: ${paymentId}] Got blockhash:`, blockHash.blockhash.slice(0, 8) + "...");
      } catch (blockHashError) {
        return {
          success: false,
          error: createPaymentError(
            ErrorCategory.NETWORK_ERROR,
            'Failed to get recent blockhash',
            blockHashError,
            true
          )
        };
      }
      
      transaction.recentBlockhash = blockHash.blockhash;
      transaction.feePayer = this.wallet.publicKey;
      
      // Sign transaction
      let signedTransaction;
      try {
        signedTransaction = await this.wallet.signTransaction(transaction);
        console.log(`[ID: ${paymentId}] Transaction signed successfully`);
      } catch (signError) {
        if (isUserRejectionError(signError)) {
          console.log(`[ID: ${paymentId}] Transaction declined by user`);
          return {
            success: false,
            error: createPaymentError(
              ErrorCategory.USER_REJECTION,
              'Transaction was declined by user',
              signError,
              false
            )
          };
        }
        
        return {
          success: false,
          error: createPaymentError(
            ErrorCategory.WALLET_ERROR,
            'Failed to sign transaction',
            signError,
            true
          )
        };
      }
