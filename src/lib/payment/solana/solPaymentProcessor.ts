// src/lib/payment/solana/solPaymentProcessor.ts
import { 
  Connection, 
  PublicKey, 
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  Commitment,
  SendTransactionError,
  TransactionInstruction,
  SignatureResult,
  TransactionError
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
  isNetworkError,
  isBalanceError,
  retryWithBackoff,
  isTxAlreadyProcessedError,
  getNonce,
  extractSignatureFromError,
  clearSessionBlockhashData
} from '../utils';
import { RPC_ENDPOINT, CONNECTION_TIMEOUT, FALLBACK_ENDPOINTS } from '@/lib/solana/walletConfig';
import { blockchainLogger } from '@/utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { generateUniqueNonce, verifyTransactionUniqueness } from '../utils/transactionUtils';
import { WalletContextState } from '@solana/wallet-adapter-react';
import { PaymentError } from '../types';

// Memo Program ID
const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

interface SendTransactionOpts {
  skipPreflight?: boolean;
  maxRetries?: number;
}

/**
 * Process a SOL payment transaction
 */
export async function processSolPayment(
  request: PaymentRequest, 
  walletConfig: WalletConfig
): Promise<TransactionResult> {
  const { amount, recipientWallet, metadata } = request;
  const paymentId = metadata?.paymentId || 'unknown';
  
  try {
    blockchainLogger.info('Starting SOL payment process', {
      paymentId,
      amount,
      recipientWallet,
      metadata,
      walletPublicKey: walletConfig.publicKey?.toString()
    });
    
    if (!walletConfig.publicKey || !walletConfig.signTransaction) {
      throw new Error('Wallet not connected or missing required methods');
    }
    
    // Create connection to Solana
    const connection = new Connection(RPC_ENDPOINT, {
      commitment: 'confirmed' as Commitment,
      confirmTransactionInitialTimeout: CONNECTION_TIMEOUT
    });
    
    // Check SOL balance
    let balance;
    try {
      balance = await connection.getBalance(walletConfig.publicKey);
      blockchainLogger.debug('Retrieved wallet balance', {
        balanceInLamports: balance,
        balanceInSOL: balance / LAMPORTS_PER_SOL
      });
    } catch (balanceError) {
      blockchainLogger.error('Failed to check balance', new Error(String(balanceError)));
      throw new Error('Failed to check SOL balance');
    }
    
    const solBalance = balance / LAMPORTS_PER_SOL;
    blockchainLogger.info('Current SOL balance', {
      paymentId,
      balance: solBalance,
      required: amount
    });
    
    if (solBalance < amount) {
      throw new Error(`Insufficient SOL balance. Required: ${amount}, Available: ${solBalance}`);
    }
    
    // Calculate lamports (1 SOL = 1,000,000,000 lamports)
    const lamports = Math.floor(amount * LAMPORTS_PER_SOL);
    
    // Create transaction
    const transaction = new Transaction();
    
    // Generate unique nonce for this transaction
    const nonce = generateUniqueNonce(metadata.imageId, 0);
    
    // Verify transaction uniqueness
    const isUnique = await verifyTransactionUniqueness(metadata.imageId, nonce);
    
    blockchainLogger.debug('Transaction uniqueness check', {
      isUnique,
      nonce,
      imageId: metadata.imageId
    });
    
    if (!isUnique) {
      blockchainLogger.warn('Duplicate transaction detected', {
        paymentId,
        imageId: metadata.imageId,
        nonce
      });
      return {
        success: false,
        error: createPaymentError(
          ErrorCategory.BLOCKCHAIN_ERROR,
          'Duplicate transaction detected',
          new Error('Transaction with this nonce already exists'),
          false,
          'DUPLICATE_TRANSACTION'
        )
      };
    }

    // Add the main transfer instruction
    const mainTransferInstruction = SystemProgram.transfer({
      fromPubkey: walletConfig.publicKey,
      toPubkey: new PublicKey(recipientWallet),
      lamports: lamports,
    });
    
    transaction.add(mainTransferInstruction);
    
    // Add nonce as memo instruction
    const memoInstruction = new TransactionInstruction({
      keys: [],
      programId: MEMO_PROGRAM_ID,
      data: Buffer.from(nonce, 'utf8')
    });
    
    transaction.add(memoInstruction);
    
    // Get recent blockhash with retry
    let blockHash;
    let blockHashRetries = 0;
    const maxBlockHashRetries = 3;
    
    while (blockHashRetries < maxBlockHashRetries) {
      try {
        blockHash = await connection.getLatestBlockhash('confirmed');
        blockchainLogger.debug('Got blockhash', {
          blockhash: blockHash.blockhash,
          lastValidBlockHeight: blockHash.lastValidBlockHeight,
          attempt: blockHashRetries + 1
        });
        break;
      } catch (blockHashError) {
        blockchainLogger.error('Failed to get blockhash', new Error(String(blockHashError)), {
          attempt: blockHashRetries + 1
        });
        blockHashRetries++;
        if (blockHashRetries === maxBlockHashRetries) {
          throw new Error('Failed to get recent blockhash after multiple attempts');
        }
        await new Promise(resolve => setTimeout(resolve, 1000 * blockHashRetries));
      }
    }
    
    if (!blockHash) {
      throw new Error('Failed to get recent blockhash');
    }
    
    // Set transaction parameters
    transaction.recentBlockhash = blockHash.blockhash;
    transaction.feePayer = walletConfig.publicKey;
    
    // Sign transaction with fresh blockhash
    let signedTransaction;
    try {
      signedTransaction = await walletConfig.signTransaction(transaction);
      blockchainLogger.debug('Transaction signed', {
        signatures: signedTransaction.signatures.map(sig => ({
          publicKey: sig.publicKey.toString(),
          signature: sig.signature?.toString('hex')
        }))
      });
    } catch (signError) {
      blockchainLogger.error('Transaction signing failed', new Error(String(signError)));
      
      if (isUserRejectionError(signError)) {
        blockchainLogger.info('User declined to sign transaction', { paymentId });
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
    
    // Send transaction
    let signature: string | undefined;
    try {
      // Get fresh blockhash right before sending
      const finalBlockhash = await connection.getLatestBlockhash('confirmed');
      
      // Update transaction with fresh blockhash
      signedTransaction.recentBlockhash = finalBlockhash.blockhash;
      
      // Log detailed transaction info before sending
      blockchainLogger.debug('Pre-send transaction details', {
        nonce,
        originalBlockhash: transaction.recentBlockhash,
        finalBlockhash: finalBlockhash.blockhash,
        lastValidBlockHeight: finalBlockhash.lastValidBlockHeight,
        numInstructions: transaction.instructions.length,
        signers: transaction.signatures.map(s => s.publicKey.toString()),
        serializedSize: signedTransaction.serialize().length,
        paymentId,
        timestamp: new Date().toISOString()
      });

      // Clear any cached transaction data before sending
      clearSessionBlockhashData();
      
      // Send immediately after getting fresh blockhash
      signature = await connection.sendRawTransaction(signedTransaction.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed'
      });
      
      blockchainLogger.info('Transaction sent', {
        signature,
        paymentId,
        nonce
      });
      
      // Wait for confirmation with the final blockhash
      const confirmation = await connection.confirmTransaction({
        signature,
        blockhash: finalBlockhash.blockhash,
        lastValidBlockHeight: finalBlockhash.lastValidBlockHeight
      });
      
      blockchainLogger.info('Transaction confirmed', {
        signature,
        confirmed: !confirmation.value?.err,
        err: confirmation.value?.err,
        slot: confirmation.context.slot
      });
      
      if (confirmation.value?.err) {
        blockchainLogger.error('Transaction confirmed with error', new Error(String(confirmation.value.err)));
        throw new Error(`Transaction confirmed with error: ${JSON.stringify(confirmation.value.err)}`);
      }
      
    } catch (sendError) {
      const errorDetails = {
        errorType: sendError instanceof Error ? sendError.constructor.name : typeof sendError,
        isTransactionError: sendError instanceof SendTransactionError,
        rawError: String(sendError),
        errorJson: JSON.stringify(sendError, Object.getOwnPropertyNames(sendError || {})),
        transactionDetails: {
          blockhash: transaction.recentBlockhash,
          numInstructions: transaction.instructions.length,
          nonce,
          paymentId
        }
      };

      if (sendError instanceof Error) {
        Object.assign(errorDetails, {
          name: sendError.name,
          message: sendError.message,
          stack: sendError.stack,
        });

        if (sendError instanceof SendTransactionError) {
          let parsedError = null;
          let errorMessage = sendError.message;
          
          const jsonMatch = errorMessage.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            try {
              parsedError = JSON.parse(jsonMatch[0]);
            } catch (parseError) {
              blockchainLogger.debug('Failed to parse error JSON content', {
                content: jsonMatch[0]
              });
            }
          }

          Object.assign(errorDetails, {
            logs: sendError.logs || [],
            message: errorMessage,
            details: {
              raw: errorMessage,
              parsed: parsedError,
              containedJson: !!parsedError
            }
          });
        }
      }

      blockchainLogger.error('Transaction failed', new Error('Transaction failed'), {
        errorType: String(errorDetails.errorType),
        isTransactionError: errorDetails.isTransactionError,
        rawError: String(errorDetails.rawError),
        errorJson: String(errorDetails.errorJson),
        transactionDetails: errorDetails.transactionDetails
      });
      
      // Check if this is a "Transaction already processed" error
      if (isTxAlreadyProcessedError(sendError)) {
        blockchainLogger.debug('Transaction already processed', {
          error: sendError instanceof Error ? sendError.message : String(sendError),
          paymentId
        });
        
        // Try to extract the signature from the error
        const existingSignature = extractSignatureFromError(sendError);
        if (existingSignature) {
          blockchainLogger.debug('Found existing signature', {
            signature: existingSignature,
            paymentId
          });
          
          signature = existingSignature;
        }
      }
    }
    
    if (!signature) {
      throw new Error('Failed to send transaction');
    }
    
    blockchainLogger.info('Payment completed', {
      signature,
      paymentId,
      nonce
    });
    
    return {
      success: true,
      transactionHash: signature,
      blockchainConfirmation: true
    };
  } catch (error) {
    blockchainLogger.error('Payment failed', new Error(String(error)), {
      paymentId,
      amount,
      recipientWallet: request.recipientWallet
    });
    
    // Map error to appropriate category
    if (isUserRejectionError(error)) {
      return {
        success: false,
        error: createPaymentError(
          ErrorCategory.USER_REJECTION,
          'Transaction was declined by user',
          error instanceof Error ? error : new Error(String(error)),
          false
        )
      };
    }
    
    if (isBalanceError(error)) {
      return {
        success: false,
        error: createPaymentError(
          ErrorCategory.BALANCE_ERROR,
          error instanceof Error ? error.message : 'Insufficient funds',
          error instanceof Error ? error : new Error(String(error)),
          false
        )
      };
    }
    
    if (isNetworkError(error)) {
      return {
        success: false,
        error: createPaymentError(
          ErrorCategory.NETWORK_ERROR,
          'Network error during payment processing',
          error instanceof Error ? error : new Error(String(error)),
          true
        )
      };
    }
    
    if (isTxAlreadyProcessedError(error)) {
      return {
        success: false,
        error: createPaymentError(
          ErrorCategory.BLOCKCHAIN_ERROR,
          'Transaction already processed',
          error instanceof Error ? error : new Error(String(error)),
          false,
          'DUPLICATE_TRANSACTION'
        )
      };
    }
    
    return {
      success: false,
      error: createPaymentError(
        ErrorCategory.UNKNOWN_ERROR,
        error instanceof Error ? error.message : 'Payment processing failed',
        error instanceof Error ? error : new Error(String(error)),
        true
      )
    };
  }
}

/**
 * Check the SOL balance of a wallet
 */
export async function checkSolBalance(walletAddress: PublicKey): Promise<{ balance: number; error?: string }> {
  try {
    // Create connection
    const connection = new Connection(RPC_ENDPOINT, {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: CONNECTION_TIMEOUT
    });
    
    // Get SOL balance
    const lamports = await connection.getBalance(walletAddress);
    const solBalance = lamports / LAMPORTS_PER_SOL;
    
    return { balance: solBalance };
  } catch (error) {
    blockchainLogger.error('Failed to check SOL balance', new Error(String(error)));
    return { 
      balance: 0, 
      error: error instanceof Error ? error.message : 'Unknown error checking SOL balance'
    };
  }
}

async function sendTransaction(
  connection: Connection,
  transaction: Transaction,
  wallet: WalletContextState,
  opts: SendTransactionOpts = {}
): Promise<{ success: boolean; signature?: string; error?: PaymentError }> {
  try {
    // Get latest blockhash
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.lastValidBlockHeight = lastValidBlockHeight;

    // Sign and send transaction
    const signature = await wallet.sendTransaction(transaction, connection);
    
    blockchainLogger.info('Transaction sent', {
      signature,
      blockhash,
      lastValidBlockHeight
    });

    return {
      success: true,
      signature
    };

  } catch (error: any) {
    blockchainLogger.error('Failed to send transaction', new Error(String(error)));

    return {
      success: false,
      error: createPaymentError(ErrorCategory.BLOCKCHAIN_ERROR, error.message, error, false)
    };
  }
}

export class SolanaPaymentProcessor {
  private logError(message: string, error: unknown, context?: Record<string, any>) {
    const err = error instanceof Error ? error : new Error(String(error));
    blockchainLogger.error(message, err, context);
  }

  private logInfo(message: string, context?: Record<string, any>) {
    blockchainLogger.info(message, context);
  }

  private logDebug(message: string, context?: Record<string, any>) {
    blockchainLogger.debug(message, context);
  }

  public async processPayment(request: PaymentRequest): Promise<TransactionResult> {
    try {
      this.logInfo('Starting payment processing', {
        amount: request.amount,
        token: request.token,
        recipient: request.recipientWallet
      });

      return await processSolPayment(request, {} as WalletConfig);
    } catch (error) {
      this.logError('Payment processing failed', error, {
        amount: request.amount,
        token: request.token
      });
      throw error;
    }
  }
}
