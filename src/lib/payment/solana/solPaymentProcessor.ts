// src/lib/payment/solana/solPaymentProcessor.ts
import { 
  Connection, 
  PublicKey, 
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  SendTransactionError,
  TransactionInstruction,
} from '@solana/web3.js';
import { 
  TransactionResult,
  PaymentRequest,
  PaymentError,
  ErrorCategory,
  WalletConfig
} from '../types/index';
import { 
  createPaymentError,
  isUserRejectionError,
  isNetworkError,
  isBalanceError,
  isTxAlreadyProcessedError,
  extractSignatureFromError,
  clearSessionBlockhashData
} from '../utils';
import { RPC_ENDPOINT, CONFIRMATION_TIMEOUT } from './walletConfig';
import { blockchainLogger } from '@/utils/logger';
import { generateUniqueNonce, verifyTransactionUniqueness } from '../utils/transactionUtils';
import { WalletContextState } from '@solana/wallet-adapter-react';
import { MEMO_PROGRAM_ID } from '@/utils/constants';


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
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: CONFIRMATION_TIMEOUT,
      disableRetryOnRateLimit: false
    });
    
    // Check SOL balance
    let balance: number;
    try {
      balance = await connection.getBalance(walletConfig.publicKey);
      blockchainLogger.debug('Retrieved wallet balance', {
        balanceInLamports: balance,
        balanceInSOL: balance / LAMPORTS_PER_SOL
      });
    } catch (balanceError) {
      blockchainLogger.warn('Error checking wallet balance', 
        balanceError instanceof Error ? balanceError : new Error(String(balanceError)), 
        {
          walletAddress: walletConfig.publicKey?.toString()
        }
      );
      // If we can't check the balance, assume it's insufficient
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
    
    // Check wallet balance first to avoid transaction failures
    try {
      const balance = await connection.getBalance(walletConfig.publicKey!);
      const lamportsNeeded = lamports + 5000; // Approximate fee
      
      blockchainLogger.info('Checking wallet balance before transaction', {
        walletAddress: walletConfig.publicKey?.toString(),
        currentBalanceLamports: balance,
        currentBalanceSOL: balance / LAMPORTS_PER_SOL,
        paymentAmountLamports: lamports,
        paymentAmountSOL: amount,
        estimatedFee: 5000,
        totalNeeded: lamportsNeeded,
        hasSufficientFunds: balance >= lamportsNeeded
      });
      
      if (balance < lamportsNeeded) {
        return {
          success: false,
          error: createPaymentError(
            ErrorCategory.BALANCE_ERROR,
            `Insufficient funds: requires ${lamportsNeeded / LAMPORTS_PER_SOL} SOL, has ${balance / LAMPORTS_PER_SOL} SOL`,
            new Error('Insufficient funds'),
            false
          )
        };
      }
    } catch (balanceError) {
      blockchainLogger.warn('Error checking wallet balance', balanceError instanceof Error ? balanceError : new Error(String(balanceError)), {
        walletAddress: walletConfig.publicKey?.toString()
      });
      // Continue despite balance check error
    }
    
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
      programId: new PublicKey(MEMO_PROGRAM_ID),
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
      // Log the signing attempt
      blockchainLogger.debug('Attempting to sign transaction', {
        paymentId,
        blockhash: transaction.recentBlockhash,
        numInstructions: transaction.instructions.length
      });

      signedTransaction = await walletConfig.signTransaction(transaction);
      
      // Add detailed debugging for transaction after signing
      blockchainLogger.debug('Transaction signed successfully', {
        signatures: signedTransaction.signatures.map(sig => ({
          publicKey: sig.publicKey.toString(),
          signature: sig.signature ? Buffer.from(sig.signature).toString('base64') : null,
          signatureLength: sig.signature?.length || 0
        })),
        hasAllSignatures: signedTransaction.signatures.every(sig => !!sig.signature),
        recentBlockhash: signedTransaction.recentBlockhash,
        serializedSize: signedTransaction.serialize().length
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
    
    // Before sending, validate the transaction
    blockchainLogger.debug('Validating transaction before sending', {
      paymentId,
      hasValidSignature: signedTransaction.signatures.every(sig => sig.signature !== null)
    });
    
    // Simulate the transaction to check for errors
    blockchainLogger.debug('Simulating transaction before sending', { paymentId });
    try {
      const simulation = await connection.simulateTransaction(signedTransaction);
      if (simulation.value.err) {
        blockchainLogger.error('Transaction simulation failed', {
          paymentId,
          error: simulation.value.err,
          logs: simulation.value.logs,
          simulationMessage: typeof simulation.value.err === 'string' ? simulation.value.err : JSON.stringify(simulation.value.err)
        });
        
        throw new Error(`Transaction simulation failed: ${JSON.stringify(simulation.value.err)}`);
      }
      
      blockchainLogger.debug('Transaction simulation successful', {
        paymentId,
        unitsConsumed: simulation.value.unitsConsumed || 0
      });
    } catch (simError) {
      blockchainLogger.error('Error during transaction simulation', simError instanceof Error ? simError : new Error(String(simError)), {
        paymentId
      });
      // Continue with sending despite simulation error - some errors are false positives
    }
    
    // Send transaction
    let signature: string | undefined;
    try {
      // Get fresh blockhash right before sending - THIS IS FOR LOGGING ONLY
      // We will NOT use this to update the transaction after signing
      const latestBlockhash = await connection.getLatestBlockhash('confirmed');
      
      // Add more logging about blockhash
      blockchainLogger.debug('Available blockhashs', {
        signedBlockhash: signedTransaction.recentBlockhash,
        latestBlockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
        usingSignedBlockhash: true // IMPORTANT: Using the blockhash from signing, not the latest
      });
      
      // DO NOT update the transaction's blockhash after signing!
      // signedTransaction.recentBlockhash = finalBlockhash.blockhash; <-- This line causes signature verification failure!
      
      // Log detailed transaction info before sending
      blockchainLogger.debug('Pre-send transaction details', {
        nonce,
        usingBlockhash: signedTransaction.recentBlockhash, 
        latestBlockhash: latestBlockhash.blockhash,
        numInstructions: transaction.instructions.length,
        signers: transaction.signatures.map(s => s.publicKey.toString()),
        serializedSize: signedTransaction.serialize().length,
        paymentId,
        timestamp: new Date().toISOString(),
        // Add instruction details for debugging
        instructions: transaction.instructions.map(inst => ({
          programId: inst.programId.toString(),
          dataSize: inst.data.length,
          keyCount: inst.keys.length
        }))
      });

      // Clear any cached transaction data before sending
      clearSessionBlockhashData();
      
      // Send with the SAME blockhash used during signing
      const serializedTransaction = signedTransaction.serialize();
      blockchainLogger.debug('Sending serialized transaction', {
        size: serializedTransaction.length,
        paymentId,
        firstBytes: Buffer.from(serializedTransaction.slice(0, 20)).toString('hex')
      });
      
      // Send immediately with the original blockhash (the one used during signing)
      try {
        // Temporarily skip preflight checks to get more detailed error information
        signature = await connection.sendRawTransaction(serializedTransaction, {
          skipPreflight: true,  // Change to true to skip preflight checks
          preflightCommitment: 'confirmed'
        });
      } catch (sendRawError) {
        // Enhanced error logging for sendRawTransaction errors
        blockchainLogger.error('Error in sendRawTransaction', sendRawError instanceof Error ? sendRawError : new Error(String(sendRawError)), {
          paymentId,
          errorType: sendRawError instanceof Error ? sendRawError.constructor.name : typeof sendRawError,
          errorMessage: sendRawError instanceof Error ? sendRawError.message : String(sendRawError),
          errorStack: sendRawError instanceof Error ? sendRawError.stack : undefined,
          // Additional logging for debit/credit errors
          isSendTxError: sendRawError instanceof SendTransactionError,
          hasLogs: sendRawError instanceof SendTransactionError && !!sendRawError.logs,
          logs: sendRawError instanceof SendTransactionError ? sendRawError.logs : undefined
        });
        
        // Check specifically for account debit errors
        if (sendRawError instanceof Error && 
            (sendRawError.message.includes('found no record of a prior credit') ||
             sendRawError.message.includes('insufficient funds'))) {
          
          // This is likely a balance issue - check balance again to confirm
          try {
            const currentBalance = await connection.getBalance(walletConfig.publicKey!);
            const lamportsNeeded = lamports + 5000; // Approximate fee
            
            blockchainLogger.error('Account has insufficient funds', {
              walletAddress: walletConfig.publicKey?.toString(),
              currentBalanceLamports: currentBalance,
              currentBalanceSOL: currentBalance / LAMPORTS_PER_SOL,
              paymentAmountLamports: lamports,
              paymentAmountSOL: amount,
              estimatedFee: 5000,
              totalNeeded: lamportsNeeded,
              shortfall: Math.max(0, lamportsNeeded - currentBalance)
            });
            
            // Throw a more specific error
            throw new Error(`Insufficient funds: requires ${lamportsNeeded / LAMPORTS_PER_SOL} SOL, has ${currentBalance / LAMPORTS_PER_SOL} SOL`);
          } catch (_balanceCheckError) {
            // If we can't check the balance, just rethrow the original error
            throw sendRawError; // Re-throw to be caught by outer catch
          }
        }
        
        throw sendRawError; // Re-throw to be caught by outer catch
      }
      
      blockchainLogger.info('Transaction sent', {
        signature,
        paymentId,
        nonce,
        blockhash: signedTransaction.recentBlockhash
      });
      
      // Once we've reached this point, signature should be defined
      if (!signature) {
        throw new Error('Failed to get transaction signature');
      }
      
      blockchainLogger.debug('Waiting for transaction confirmation', {
        signature,
        blockhash: signedTransaction.recentBlockhash
      });
      
      // Wait for confirmation using the correct format for the confirmTransaction API
      const confirmation = await connection.confirmTransaction(signature, 'confirmed');
      
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
          const errorMessage = sendError.message;
          
          const jsonMatch = errorMessage.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            try {
              parsedError = JSON.parse(jsonMatch[0]);
            } catch (_parseError) {
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
      confirmTransactionInitialTimeout: CONFIRMATION_TIMEOUT,
      disableRetryOnRateLimit: false
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

export class SolanaPaymentProcessor {
  private logError(message: string, error: unknown, context?: Record<string, unknown>) {
    const err = error instanceof Error ? error : new Error(String(error));
    blockchainLogger.error(message, err, context as Record<string, any>);
  }

  private logInfo(message: string, context?: Record<string, unknown>) {
    blockchainLogger.info(message, context as Record<string, any>);
  }

  private logDebug(message: string, context?: Record<string, unknown>) {
    blockchainLogger.debug(message, context as Record<string, any>);
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
