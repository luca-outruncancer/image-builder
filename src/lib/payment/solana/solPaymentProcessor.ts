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
      
      // Log transaction details for debugging
      console.log(`[ID: ${paymentId}] Transaction to be sent:`, {
        blockHash: transaction.recentBlockhash?.slice(0, 8) + "...",
        feePayer: transaction.feePayer?.toString(),
        instructions: transaction.instructions.length,
        signatures: transaction.signatures.length,
        serializedSize: signedTransaction.serialize().length
      });

      // Send transaction
      let signature;
      try {
        console.log(`[ID: ${paymentId}] Sending transaction...`);
        const connection = connectionManager.getConnection();
        signature = await connection.sendRawTransaction(signedTransaction.serialize());
        console.log(`[ID: ${paymentId}] Transaction sent, signature:`, signature);
        
        // Cache the transaction for potential reuse
        if (paymentId && signature) {
          this.cachedTransactions.set(paymentId, signature);
          console.log(`[ID: ${paymentId}] Cached transaction signature:`, signature);
        }
      } catch (sendError) {
        console.error(`[ID: ${paymentId}] Error sending transaction:`, sendError);
        
        // Handle "Transaction already processed" error
        if (isTxAlreadyProcessedError(sendError)) {
          // Try to extract signature from error
          const extractedSig = extractSignatureFromError(sendError);
          if (extractedSig) {
            console.log(`[ID: ${paymentId}] Found signature in error:`, extractedSig);
            
            // Verify the extracted signature
            const isValid = await connectionManager.verifyTransaction(extractedSig);
            if (isValid) {
              return {
                success: true,
                transactionHash: extractedSig,
                blockchainConfirmation: true,
                reused: true
              };
            }
          }
          
          // If we couldn't recover, return specialized error
          return {
            success: false,
            error: createPaymentError(
              ErrorCategory.BLOCKCHAIN_ERROR,
              'Transaction already processed. Please try again with a new transaction.',
              sendError,
              false,
              'DUPLICATE_TRANSACTION'
            )
          };
        }
        
        return {
          success: false,
          error: createPaymentError(
            ErrorCategory.BLOCKCHAIN_ERROR,
            'Failed to send transaction',
            sendError,
            true
          )
        };
      }
      
      // Confirm transaction
      try {
        console.log(`[ID: ${paymentId}] Confirming transaction...`);
        const connection = connectionManager.getConnection();
        const confirmation = await connection.confirmTransaction({
          signature,
          blockhash: blockHash.blockhash,
          lastValidBlockHeight: blockHash.lastValidBlockHeight,
        }, 'confirmed');
        
        if (confirmation.value.err) {
          console.error(`[ID: ${paymentId}] Transaction confirmation failed:`, confirmation.value.err);
          return {
            success: false,
            error: createPaymentError(
              ErrorCategory.BLOCKCHAIN_ERROR,
              `Transaction failed: ${confirmation.value.err.toString()}`,
              confirmation.value.err,
              false
            )
          };
        }
        
        console.log(`[ID: ${paymentId}] Transaction confirmed successfully!`);
        return {
          success: true,
          transactionHash: signature,
          blockchainConfirmation: true
        };
      } catch (confirmError) {
        console.error(`[ID: ${paymentId}] Error confirming transaction:`, confirmError);
        
        // Double-check transaction status
        try {
          const connection = connectionManager.getConnection();
          const status = await connection.getSignatureStatus(signature);
          
          if (status.value && !status.value.err) {
            // Transaction was actually successful despite confirmation error
            console.log(`[ID: ${paymentId}] Transaction was successful despite confirmation error`);
            return {
              success: true,
              transactionHash: signature,
              blockchainConfirmation: true
            };
          }
        } catch (statusError) {
          console.error(`[ID: ${paymentId}] Failed to check transaction status:`, statusError);
        }
        
        return {
          success: false,
          error: createPaymentError(
            ErrorCategory.BLOCKCHAIN_ERROR,
            'Transaction confirmation failed',
            confirmError,
            true
          )
        };
      }
    } catch (error) {
      console.error('SOL payment error:', error);
      return {
        success: false,
        error: createPaymentError(
          ErrorCategory.UNKNOWN_ERROR,
          error instanceof Error ? error.message : 'Unknown payment error',
          error,
          true
        )
      };
    }
  }
  
  /**
   * Clear the transaction cache
   */
  public clearTransactionCache(): void {
    console.log("Clearing SOL transaction cache");
    this.cachedTransactions.clear();
  }
}
