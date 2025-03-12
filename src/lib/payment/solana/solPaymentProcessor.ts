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

// Memo Program ID
const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

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
    // -- EXTREMELOGGING
    console.log('🔍 [PAYMENT-DEBUG] Starting SOL payment process', {
      paymentId,
      amount,
      recipientWallet,
      metadata,
      walletPublicKey: walletConfig.publicKey?.toString()
    });
    
    blockchainLogger.info(`Processing SOL payment for amount ${amount} SOL`, {
      paymentId,
      amount,
      recipientWallet: request.recipientWallet
    });
    
    if (!walletConfig.publicKey || !walletConfig.signTransaction) {
      throw new Error('Wallet not connected or missing required methods');
    }
    
    // Create connection to Solana
    const connection = new Connection(RPC_ENDPOINT, {
      commitment: 'confirmed' as Commitment,
      confirmTransactionInitialTimeout: CONNECTION_TIMEOUT
    });
    
    // -- EXTREMELOGGING
    console.log('🔍 [PAYMENT-DEBUG] Created Solana connection', {
      endpoint: RPC_ENDPOINT,
      timeout: CONNECTION_TIMEOUT
    });
    
    // Check SOL balance
    let balance;
    try {
      balance = await connection.getBalance(walletConfig.publicKey);
      // -- EXTREMELOGGING
      console.log('🔍 [PAYMENT-DEBUG] Retrieved wallet balance', {
        balanceInLamports: balance,
        balanceInSOL: balance / LAMPORTS_PER_SOL
      });
    } catch (balanceError) {
      // -- EXTREMELOGGING
      console.error('🔍 [PAYMENT-DEBUG] Failed to check balance', balanceError);
      throw new Error('Failed to check SOL balance');
    }
    
    const solBalance = balance / LAMPORTS_PER_SOL;
    blockchainLogger.info(`Current SOL balance: ${solBalance.toFixed(6)}`, {
      paymentId,
      balance: solBalance,
      required: amount
    });
    
    if (solBalance < amount) {
      throw new Error(`Insufficient SOL balance. Required: ${amount}, Available: ${solBalance}`);
    }
    
    // Calculate lamports (1 SOL = 1,000,000,000 lamports)
    const lamports = Math.floor(amount * LAMPORTS_PER_SOL);
    
    // -- EXTREMELOGGING
    console.log('🔍 [PAYMENT-DEBUG] Creating transaction', {
      amountInSOL: amount,
      amountInLamports: lamports,
      from: walletConfig.publicKey.toString(),
      to: recipientWallet
    });
    
    // Create transaction
    const transaction = new Transaction();
    
    // Generate unique nonce for this transaction
    const nonce = generateUniqueNonce(metadata.imageId, 0);
    
    // -- EXTREMELOGGING
    console.log('🔍 [PAYMENT-DEBUG] Generated nonce', {
      nonce,
      imageId: metadata.imageId
    });
    
    // Verify transaction uniqueness
    const isUnique = await verifyTransactionUniqueness(metadata.imageId, nonce);
    
    // -- EXTREMELOGGING
    console.log('🔍 [PAYMENT-DEBUG] Verified transaction uniqueness', {
      isUnique,
      nonce,
      imageId: metadata.imageId
    });
    
    if (!isUnique) {
      blockchainLogger.warn(`Duplicate transaction detected with nonce: ${nonce}`, {
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

    blockchainLogger.info(`Creating transaction with unique nonce: ${nonce}`, {
      paymentId,
      nonce
    });
    
    // Add the main transfer instruction
    const mainTransferInstruction = SystemProgram.transfer({
      fromPubkey: walletConfig.publicKey,
      toPubkey: new PublicKey(recipientWallet),
      lamports: lamports,
    });
    
    // -- EXTREMELOGGING
    console.log('🔍 [PAYMENT-DEBUG] Created transfer instruction', {
      from: walletConfig.publicKey.toString(),
      to: recipientWallet,
      lamports,
      instructionData: mainTransferInstruction.data.toString('hex')
    });
    
    transaction.add(mainTransferInstruction);
    
    // Add nonce as memo instruction
    const memoInstruction = new TransactionInstruction({
      keys: [],
      programId: MEMO_PROGRAM_ID,
      data: Buffer.from(nonce, 'utf8')
    });
    
    // -- EXTREMELOGGING
    console.log('🔍 [PAYMENT-DEBUG] Added memo instruction', {
      nonce,
      memoData: memoInstruction.data.toString()
    });
    
    transaction.add(memoInstruction);
    
    // Get recent blockhash with retry
    let blockHash;
    let blockHashRetries = 0;
    const maxBlockHashRetries = 3;
    
    while (blockHashRetries < maxBlockHashRetries) {
      try {
        blockHash = await connection.getLatestBlockhash('confirmed');
        // -- EXTREMELOGGING
        console.log('🔍 [PAYMENT-DEBUG] Got blockhash', {
          blockhash: blockHash.blockhash,
          lastValidBlockHeight: blockHash.lastValidBlockHeight,
          attempt: blockHashRetries + 1
        });
        break;
      } catch (blockHashError) {
        // -- EXTREMELOGGING
        console.error('🔍 [PAYMENT-DEBUG] Failed to get blockhash', {
          attempt: blockHashRetries + 1,
          error: blockHashError
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
    
    // -- EXTREMELOGGING
    console.log('🔍 [PAYMENT-DEBUG] Transaction prepared for signing', {
      blockhash: transaction.recentBlockhash,
      feePayer: transaction.feePayer.toString(),
      numInstructions: transaction.instructions.length
    });
    
    // Sign transaction
    let signedTransaction;
    try {
      signedTransaction = await walletConfig.signTransaction(transaction);
      // -- EXTREMELOGGING
      console.log('🔍 [PAYMENT-DEBUG] Transaction signed successfully', {
        signatures: signedTransaction.signatures.map(sig => ({
          publicKey: sig.publicKey.toString(),
          signature: sig.signature?.toString('hex')
        }))
      });
    } catch (signError) {
      // -- EXTREMELOGGING
      console.error('🔍 [PAYMENT-DEBUG] Transaction signing failed', signError);
      
      if (isUserRejectionError(signError)) {
        blockchainLogger.info(`User declined to sign transaction`, { paymentId });
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
    blockchainLogger.debug(`Transaction details:`, {
      paymentId,
      nonce,
      blockhash: transaction.recentBlockhash,
      instructions: transaction.instructions.length,
      signers: transaction.signatures.length
    });
    
    // Send transaction with retry logic
    let signature: string | undefined;
    let retryCount = 0;
    const maxRetries = 2;
    
    while (retryCount <= maxRetries) {
      try {
        // Clear any cached transaction data before sending
        clearSessionBlockhashData();
        
        // Get fresh blockhash for each attempt
        const freshBlockhash = await connection.getLatestBlockhash('confirmed');
        transaction.recentBlockhash = freshBlockhash.blockhash;
        
        // Re-sign transaction with new blockhash
        signedTransaction = await walletConfig.signTransaction(transaction);
        
        // -- EXTREMELOGGING
        console.log('🔍 [PAYMENT-DEBUG] Attempting to send transaction', {
          attempt: retryCount + 1,
          maxAttempts: maxRetries + 1,
          paymentId,
          nonce,
          newBlockhash: freshBlockhash.blockhash,
          serializedSize: signedTransaction.serialize().length
        });
        
        signature = await connection.sendRawTransaction(signedTransaction.serialize(), {
          skipPreflight: false,
          preflightCommitment: 'confirmed'
        });
        
        // -- EXTREMELOGGING
        console.log('🔍 [PAYMENT-DEBUG] Transaction sent successfully', {
          signature,
          attempt: retryCount + 1,
          paymentId
        });
        
        // -- EXTREMELOGGING
        console.log('🔍 [PAYMENT-DEBUG] Waiting for confirmation...');
        
        // Wait for confirmation with new blockhash
        const confirmation = await connection.confirmTransaction({
          signature,
          blockhash: freshBlockhash.blockhash,
          lastValidBlockHeight: freshBlockhash.lastValidBlockHeight
        });
        
        // -- EXTREMELOGGING
        console.log('🔍 [PAYMENT-DEBUG] Transaction confirmation received', {
          signature,
          confirmed: !confirmation.value?.err,
          err: confirmation.value?.err,
          slot: confirmation.context.slot
        });
        
        if (confirmation.value?.err) {
          // -- EXTREMELOGGING
          console.error('🔍 [PAYMENT-DEBUG] Transaction confirmed but has error', {
            error: confirmation.value.err,
            signature
          });
          throw new Error(`Transaction confirmed with error: ${JSON.stringify(confirmation.value.err)}`);
        }
        
        break;
      } catch (sendError) {
        // -- EXTREMELOGGING
        const errorDetails = {
          attempt: retryCount + 1,
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

          // Additional details for SendTransactionError
          if (sendError instanceof SendTransactionError) {
            // -- EXTREMELOGGING
            console.log('🔍 [PAYMENT-DEBUG] Getting logs from SendTransactionError');
            
            let parsedError = null;
            let errorMessage = sendError.message;
            
            // Try to extract any JSON content from the error message
            const jsonMatch = errorMessage.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              try {
                parsedError = JSON.parse(jsonMatch[0]);
              } catch (parseError) {
                // -- EXTREMELOGGING
                console.log('🔍 [PAYMENT-DEBUG] Found JSON-like content but failed to parse:', jsonMatch[0]);
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
            
            // -- EXTREMELOGGING
            console.log('🔍 [PAYMENT-DEBUG] Transaction error details:', {
              logs: sendError.logs,
              message: errorMessage,
              parsedError,
              error: sendError
            });
          }
        }

        // -- EXTREMELOGGING
        console.error('🔍 [PAYMENT-DEBUG] Error in send/confirm cycle:', errorDetails);
        
        blockchainLogger.error(`Error sending transaction (attempt ${retryCount + 1}):`, sendError, {
          paymentId,
          attempt: retryCount + 1,
          errorDetails
        });
        
        // Check if this is a "Transaction already processed" error
        if (isTxAlreadyProcessedError(sendError)) {
          // -- EXTREMELOGGING
          console.log('🔍 [PAYMENT-DEBUG] Transaction already processed error detected', {
            error: sendError instanceof Error ? sendError.message : String(sendError),
            paymentId
          });
          
          // Try to extract the signature from the error
          const existingSignature = extractSignatureFromError(sendError);
          if (existingSignature) {
            // -- EXTREMELOGGING
            console.log('🔍 [PAYMENT-DEBUG] Found existing signature in error', {
              signature: existingSignature,
              paymentId
            });
            
            signature = existingSignature;
            break;
          }
        }
        
        retryCount++;
        if (retryCount > maxRetries) {
          // -- EXTREMELOGGING
          console.error('🔍 [PAYMENT-DEBUG] Max retries exceeded', {
            maxRetries,
            paymentId,
            lastError: sendError instanceof Error ? sendError.message : String(sendError)
          });
          throw sendError;
        }
        
        // -- EXTREMELOGGING
        console.log('🔍 [PAYMENT-DEBUG] Will retry transaction', {
          nextAttempt: retryCount + 1,
          maxRetries: maxRetries + 1,
          paymentId
        });
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
      }
    }
    
    if (!signature) {
      throw new Error('Failed to send transaction after all retries');
    }
    
    // -- EXTREMELOGGING
    console.log('🔍 [PAYMENT-DEBUG] Payment process completed successfully', {
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
    blockchainLogger.error(`SOL payment error:`, error, {
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
          error,
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
          error,
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
          error,
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
          error,
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
        error,
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
    blockchainLogger.error(`Error checking SOL balance:`, error);
    return { 
      balance: 0, 
      error: error instanceof Error ? error.message : 'Unknown error checking SOL balance'
    };
  }
}
