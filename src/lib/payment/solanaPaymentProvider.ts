// src/lib/payment/solanaPaymentProvider.ts
'use client';

import { 
  Connection, 
  PublicKey, 
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  Commitment,
  SendTransactionError
} from '@solana/web3.js';
import { 
  createTransferCheckedInstruction, 
  getAssociatedTokenAddress, 
  getMint
} from '@solana/spl-token';
import { 
  PaymentRequest,
  TransactionResult,
  WalletConfig,
  ErrorCategory
} from './types';
import { 
  createPaymentError,
  isUserRejectionError,
  isNetworkError,
  isBalanceError,
  retryWithBackoff,
  isTxAlreadyProcessedError,
  getNonce
} from './utils';
import { RPC_ENDPOINT, CONNECTION_TIMEOUT } from '@/lib/solana/walletConfig';

/**
 * Manages payment transactions on Solana blockchain
 */
export class SolanaPaymentProvider {
  private connection: Connection;
  private wallet: WalletConfig;
  private cachedTransactions: Map<string, string> = new Map(); // paymentId -> signature
  private pendingSignatures: Set<string> = new Set(); // currently processing signatures
  
  constructor(wallet: WalletConfig) {
    this.wallet = wallet;
    this.connection = new Connection(RPC_ENDPOINT, {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: CONNECTION_TIMEOUT
    });
  }

  /**
   * Process payment with token type selection and retry logic
   */
  public async processPayment(request: PaymentRequest, mintAddress?: string | null): Promise<TransactionResult> {
    try {
      const paymentId = request.metadata?.paymentId || 'unknown';
      console.log(`Processing payment [ID: ${paymentId}]`, {
        amount: request.amount,
        token: request.token
      });
      
      // Check for existing cached transaction
      const existingSignature = await this.checkExistingTransaction(paymentId);
      if (existingSignature) {
        console.log(`Using existing transaction: ${existingSignature}`);
        return {
          success: true,
          transactionHash: existingSignature,
          blockchainConfirmation: true,
          reused: true
        };
      }
      
      // Basic validations
      if (!this.wallet.publicKey || !this.wallet.signTransaction) {
        return this.createErrorResult(ErrorCategory.WALLET_ERROR, 'Wallet not connected');
      }
      
      // Process based on token type
      return await retryWithBackoff(async () => {
        if (request.token === 'SOL') {
          return await this.processSolPayment(request);
        } else if (mintAddress) {
          return await this.processTokenPayment(request, mintAddress);
        } else {
          throw new Error(`Unsupported payment token: ${request.token}`);
        }
      }, 2); // Maximum 2 retries
    } catch (error) {
      return this.handlePaymentError(error, request.metadata?.paymentId);
    }
  }
  
  /**
   * Process SOL payment
   */
  private async processSolPayment(request: PaymentRequest): Promise<TransactionResult> {
    const { amount, recipientWallet, metadata } = request;
    const paymentId = metadata?.paymentId || 'unknown';
    
    // Check balance
    const balance = await this.connection.getBalance(this.wallet.publicKey);
    const solBalance = balance / LAMPORTS_PER_SOL;
    
    if (solBalance < amount) {
      return this.createErrorResult(
        ErrorCategory.BALANCE_ERROR,
        `Insufficient SOL balance. You have ${solBalance.toFixed(6)} SOL but need ${amount} SOL`
      );
    }
    
    // Create and configure transaction
    const transaction = new Transaction();
    
    // Add main transfer instruction
    transaction.add(SystemProgram.transfer({
      fromPubkey: this.wallet.publicKey,
      toPubkey: new PublicKey(recipientWallet),
      lamports: Math.floor(amount * LAMPORTS_PER_SOL)
    }));
    
    // Add unique identifier to prevent duplicates
    transaction.add(SystemProgram.transfer({
      fromPubkey: this.wallet.publicKey,
      toPubkey: this.wallet.publicKey,
      lamports: 0
    }));
    
    // Process the transaction
    return await this.signAndSendTransaction(transaction, paymentId);
  }
  
  /**
   * Process token payment
   */
  private async processTokenPayment(request: PaymentRequest, mintAddress: string): Promise<TransactionResult> {
    const { amount, recipientWallet, metadata, token } = request;
    const paymentId = metadata?.paymentId || 'unknown';
    
    try {
      // Get token accounts and mint info
      const tokenMint = new PublicKey(mintAddress);
      const mintInfo = await getMint(this.connection, tokenMint);
      const recipient = new PublicKey(recipientWallet);
      
      // Get token accounts
      const recipientTokenAccount = await getAssociatedTokenAddress(tokenMint, recipient);
      const payerTokenAccount = await getAssociatedTokenAddress(tokenMint, this.wallet.publicKey);
      
      // Check token account exists
      const payerTokenInfo = await this.connection.getAccountInfo(payerTokenAccount);
      if (!payerTokenInfo) {
        return this.createErrorResult(
          ErrorCategory.WALLET_ERROR,
          `You don't have a ${token} token account`
        );
      }
      
      // Check token balance
      const balance = await this.connection.getTokenAccountBalance(payerTokenAccount);
      if ((balance.value.uiAmount || 0) < amount) {
        return this.createErrorResult(
          ErrorCategory.BALANCE_ERROR,
          `Insufficient ${token} balance. You have ${balance.value.uiAmount} ${token} but need ${amount}`
        );
      }
      
      // Create transaction
      const transaction = new Transaction();
      
      // Add token transfer instruction
      transaction.add(createTransferCheckedInstruction(
        payerTokenAccount,
        tokenMint,
        recipientTokenAccount,
        this.wallet.publicKey,
        Math.floor(amount * (10 ** mintInfo.decimals)),
        mintInfo.decimals
      ));
      
      // Add nonce instruction to prevent duplicates
      transaction.add(SystemProgram.transfer({
        fromPubkey: this.wallet.publicKey,
        toPubkey: this.wallet.publicKey,
        lamports: 0
      }));
      
      // Process the transaction
      return await this.signAndSendTransaction(transaction, paymentId);
    } catch (error) {
      if (error instanceof Error && error.message.includes("account not found")) {
        return this.createErrorResult(
          ErrorCategory.WALLET_ERROR,
          `Token account not found. Please add ${token} to your wallet first.`
        );
      }
      throw error;
    }
  }
  
  /**
   * Sign and send a transaction with proper error handling
   */
  private async signAndSendTransaction(transaction: Transaction, paymentId: string): Promise<TransactionResult> {
    // Add unique nonce to transaction
    const uniqueId = `${paymentId}-${Date.now()}-${getNonce()}`;
    console.log(`Transaction [ID: ${paymentId}] created with ID: ${uniqueId.substring(0, 12)}...`);
    
    // Get recent blockhash
    const blockHash = await this.connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = blockHash.blockhash;
    transaction.feePayer = this.wallet.publicKey;
    
    // Sign transaction
    let signedTransaction;
    try {
      signedTransaction = await this.wallet.signTransaction(transaction);
    } catch (signError) {
      if (isUserRejectionError(signError)) {
        return this.createErrorResult(
          ErrorCategory.USER_REJECTION,
          'Transaction was declined by user',
          signError,
          false
        );
      }
      throw signError;
    }
    
    // Track transaction signature to prevent duplicates
    const transactionSignature = signedTransaction.signatures[0].signature;
    const signatureKey = transactionSignature ? transactionSignature.toString('base64') : uniqueId;
    
    if (this.pendingSignatures.has(signatureKey)) {
      return this.createErrorResult(
        ErrorCategory.BLOCKCHAIN_ERROR,
        'Duplicate transaction detected',
        null,
        false,
        'DUPLICATE_TRANSACTION'
      );
    }
    
    this.pendingSignatures.add(signatureKey);
    const transactionBuffer = signedTransaction.serialize();
    
    try {
      // Send transaction
      const signature = await this.connection.sendRawTransaction(transactionBuffer, {
        skipPreflight: false,
        preflightCommitment: 'confirmed'
      });
      
      // Cache the signature
      this.cachedTransactions.set(paymentId, signature);
      
      // Confirm transaction
      const confirmation = await this.connection.confirmTransaction({
        signature,
        blockhash: blockHash.blockhash,
        lastValidBlockHeight: blockHash.lastValidBlockHeight
      }, 'confirmed');
      
      if (confirmation.value.err) {
        return this.createErrorResult(
          ErrorCategory.BLOCKCHAIN_ERROR,
          `Transaction failed: ${confirmation.value.err.toString()}`,
          confirmation.value.err
        );
      }
      
      return {
        success: true,
        transactionHash: signature,
        blockchainConfirmation: true
      };
    } catch (error) {
      // Handle "already processed" errors with potential recovery
      if (isTxAlreadyProcessedError(error)) {
        const existingSig = this.extractExistingSignature(error, paymentId);
        if (existingSig && await this.verifyTransaction(existingSig)) {
          return {
            success: true,
            transactionHash: existingSig,
            blockchainConfirmation: true,
            reused: true
          };
        }
        
        return this.createErrorResult(
          ErrorCategory.BLOCKCHAIN_ERROR,
          'Transaction already processed. Please try again.',
          error,
          false,
          'DUPLICATE_TRANSACTION'
        );
      }
      throw error;
    } finally {
      // Always remove from pending signatures
      setTimeout(() => {
        this.pendingSignatures.delete(signatureKey);
      }, 5000);
    }
  }
  
  /**
   * Create error result with consistent format
   */
  private createErrorResult(
    category: ErrorCategory,
    message: string, 
    originalError?: any,
    retryable: boolean = true,
    code?: string
  ): TransactionResult {
    return {
      success: false,
      error: createPaymentError(category, message, originalError, retryable, code)
    };
  }
  
  /**
   * Handle common payment errors
   */
  private handlePaymentError(error: any, paymentId?: string): TransactionResult {
    if (isUserRejectionError(error)) {
      return this.createErrorResult(
        ErrorCategory.USER_REJECTION,
        'Transaction was declined by user',
        error,
        false
      );
    }
    
    if (isBalanceError(error)) {
      return this.createErrorResult(
        ErrorCategory.BALANCE_ERROR,
        error instanceof Error ? error.message : 'Insufficient funds',
        error,
        false
      );
    }
    
    if (isNetworkError(error)) {
      return this.createErrorResult(
        ErrorCategory.NETWORK_ERROR,
        'Network error during payment processing',
        error,
        true
      );
    }
    
    return this.createErrorResult(
      ErrorCategory.UNKNOWN_ERROR,
      error instanceof Error ? error.message : 'Unknown payment error',
      error,
      true
    );
  }
  
  /**
   * Try to extract existing signature from error
   */
  private extractExistingSignature(error: any, paymentId: string): string | null {
    // Check cached signature first
    const cachedSig = this.cachedTransactions.get(paymentId);
    if (cachedSig) return cachedSig;
    
    // Try to extract from logs
    if (error instanceof SendTransactionError && error.logs) {
      for (const log of error.logs) {
        const sigMatch = log.match(/signature: ([A-Za-z0-9]+)/);
        if (sigMatch && sigMatch[1]) return sigMatch[1];
      }
    }
    
    return null;
  }
  
  /**
   * Check if transaction exists and is valid
   */
  private async checkExistingTransaction(paymentId: string): Promise<string | null> {
    const cachedSignature = this.cachedTransactions.get(paymentId);
    if (cachedSignature && await this.verifyTransaction(cachedSignature)) {
      return cachedSignature;
    }
    this.cachedTransactions.delete(paymentId);
    return null;
  }
  
  /**
   * Verify if a transaction is valid and successful
   */
  private async verifyTransaction(signature: string): Promise<boolean> {
    try {
      const status = await this.connection.getSignatureStatus(signature);
      return !!(status && status.value && !status.value.err);
    } catch (error) {
      console.error("Error verifying transaction:", error);
      return false;
    }
  }
  
  /**
   * Clear transaction caches
   */
  public clearTransactionCache(): void {
    this.cachedTransactions.clear();
    this.pendingSignatures.clear();
  }
}

export default SolanaPaymentProvider;
