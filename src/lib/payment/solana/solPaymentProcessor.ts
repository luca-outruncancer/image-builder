// src/lib/payment/solana/solPaymentProcessor.ts
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
    
    // Check SOL balance
    let balance;
    try {
      balance = await connection.getBalance(walletConfig.publicKey);
    } catch (balanceError) {
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
    
    // Create transaction
    const transaction = new Transaction();
    
    // Add a unique identifier to transaction to prevent duplicates
    const nonce = getNonce();
    const timestamp = Date.now();
    const uniqueId = `${nonce}_${timestamp}`;
    
    blockchainLogger.info(`Creating transaction with unique ID: ${uniqueId}`, {
      paymentId,
      uniqueId
    });
    
    // Add the main transfer instruction
    const mainTransferInstruction = SystemProgram.transfer({
      fromPubkey: walletConfig.publicKey,
      toPubkey: new PublicKey(recipientWallet),
      lamports: lamports,
    });
    
    transaction.add(mainTransferInstruction);
    
    // Add a unique transfer to make transaction unique
    // Use a combination of nonce and timestamp to ensure uniqueness
    const uniqueLamports = (nonce % 1000) + (timestamp % 1000);
    const nonceInstruction = SystemProgram.transfer({
      fromPubkey: walletConfig.publicKey,
      toPubkey: walletConfig.publicKey,
      lamports: uniqueLamports
    });
    
    transaction.add(nonceInstruction);
    
    // Get recent blockhash with retry
    let blockHash;
    let blockHashRetries = 0;
    const maxBlockHashRetries = 3;
    
    while (blockHashRetries < maxBlockHashRetries) {
      try {
        blockHash = await connection.getLatestBlockhash('confirmed');
        blockchainLogger.info(`Got blockhash: ${blockHash.blockhash.slice(0, 8)}...`, {
          paymentId,
          blockhash: blockHash.blockhash,
          lastValidBlockHeight: blockHash.lastValidBlockHeight
        });
        break;
      } catch (blockHashError) {
        blockHashRetries++;
        if (blockHashRetries === maxBlockHashRetries) {
          throw new Error('Failed to get recent blockhash after multiple attempts');
        }
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, 1000 * blockHashRetries));
      }
    }
    
    if (!blockHash) {
      throw new Error('Failed to get recent blockhash');
    }
    
    // Set transaction parameters
    transaction.recentBlockhash = blockHash.blockhash;
    transaction.feePayer = walletConfig.publicKey;
    
    // Sign transaction
    let signedTransaction;
    try {
      signedTransaction = await walletConfig.signTransaction(transaction);
      blockchainLogger.info(`Transaction signed successfully`, { paymentId });
    } catch (signError) {
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
      uniqueId,
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
        
        blockchainLogger.info(`Sending transaction (attempt ${retryCount + 1}/${maxRetries + 1})...`, {
          paymentId,
          attempt: retryCount + 1,
          maxAttempts: maxRetries + 1
        });
        
        blockchainLogger.debug(`Transaction details:`, {
          paymentId,
          uniqueId,
          attempt: retryCount + 1,
          blockhash: transaction.recentBlockhash
        });
        
        signature = await connection.sendRawTransaction(signedTransaction.serialize(), {
          skipPreflight: false,
          preflightCommitment: 'confirmed'
        });
        
        blockchainLogger.info(`Transaction sent, signature: ${signature}`, {
          paymentId,
          signature,
          attempt: retryCount + 1
        });
        break;
      } catch (sendError) {
        blockchainLogger.error(`Error sending transaction (attempt ${retryCount + 1}):`, sendError, {
          paymentId,
          attempt: retryCount + 1
        });
        
        // Check if this is a "Transaction already processed" error
        if (isTxAlreadyProcessedError(sendError)) {
          blockchainLogger.info(`Transaction already processed error detected`, {
            paymentId,
            error: sendError instanceof Error ? sendError.message : String(sendError)
          });
          
          // Try to extract the signature from the error
          const existingSig = extractSignatureFromError(sendError);
          
          if (existingSig) {
            blockchainLogger.info(`Found existing signature: ${existingSig}`, {
              paymentId,
              signature: existingSig
            });
            
            // Verify if the transaction was successful
            try {
              const status = await connection.getSignatureStatus(existingSig);
              
              if (status && status.value && !status.value.err) {
                blockchainLogger.info(`Found successful existing transaction`, {
                  paymentId,
                  signature: existingSig,
                  status: status.value
                });
                return {
                  success: true,
                  transactionHash: existingSig,
                  blockchainConfirmation: true,
                  reused: true
                };
              }
            } catch (statusError) {
              blockchainLogger.error(`Error checking transaction status:`, statusError, {
                paymentId,
                signature: existingSig
              });
            }
          }
          
          // If we've exhausted retries, return the error
          if (retryCount === maxRetries) {
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
          
          // For duplicate transaction errors, wait longer before retrying
          await new Promise(resolve => setTimeout(resolve, 2000 * (retryCount + 1)));
        } else {
          // For other errors, use normal retry delay
          await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
        }
        
        retryCount++;
      }
    }
    
    if (!signature) {
      return {
        success: false,
        error: createPaymentError(
          ErrorCategory.BLOCKCHAIN_ERROR,
          'Failed to send transaction after all retries',
          new Error('No signature received'),
          true
        )
      };
    }
    
    // Confirm transaction
    blockchainLogger.info(`Confirming transaction...`, {
      paymentId,
      signature
    });
    
    try {
      const confirmation = await connection.confirmTransaction({
        signature,
        blockhash: blockHash.blockhash,
        lastValidBlockHeight: blockHash.lastValidBlockHeight,
      }, 'confirmed');
      
      if (confirmation.value.err) {
        blockchainLogger.error(`Transaction confirmation failed:`, confirmation.value.err, {
          paymentId,
          signature
        });
        
        throw new Error(
          typeof confirmation.value.err === 'string' 
            ? confirmation.value.err 
            : 'Transaction confirmation failed'
        );
      }
      
      blockchainLogger.info(`Transaction confirmed successfully!`, {
        paymentId,
        signature,
        confirmationStatus: 'confirmed'
      });
      return {
        success: true,
        transactionHash: signature,
        blockchainConfirmation: true
      };
    } catch (confirmError) {
      blockchainLogger.error(`Error confirming transaction:`, confirmError, {
        paymentId,
        signature
      });
      
      // Check status manually - may have succeeded despite confirmation error
      try {
        const status = await connection.getSignatureStatus(signature);
        
        if (status.value && !status.value.err) {
          blockchainLogger.info(`Transaction succeeded despite confirmation error`, {
            paymentId,
            signature,
            status: status.value
          });
          return {
            success: true,
            transactionHash: signature,
            blockchainConfirmation: true
          };
        }
      } catch (statusError) {
        blockchainLogger.error(`Failed to check transaction status:`, statusError, {
          paymentId,
          signature
        });
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
