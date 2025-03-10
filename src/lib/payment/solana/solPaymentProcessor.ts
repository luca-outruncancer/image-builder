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
  extractSignatureFromError
} from '../utils';
import { RPC_ENDPOINT, CONNECTION_TIMEOUT, FALLBACK_ENDPOINTS } from '@/lib/solana/walletConfig';

/**
 * Process a SOL payment transaction
 */
export async function processSolPayment(
  request: PaymentRequest, 
  walletConfig: WalletConfig
): Promise<TransactionResult> {
  const { amount, recipientWallet, metadata } = request;
  const paymentId = metadata?.paymentId || 'unknown';
  
  console.log(`[SolPayment:${paymentId}] Processing SOL payment for amount ${amount} SOL`);
  
  if (!walletConfig.publicKey || !walletConfig.signTransaction) {
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
  
  // Create connection to Solana
  const connection = new Connection(RPC_ENDPOINT, {
    commitment: 'confirmed' as Commitment,
    confirmTransactionInitialTimeout: CONNECTION_TIMEOUT
  });
  
  try {
    // Check SOL balance
    let balance;
    try {
      balance = await connection.getBalance(walletConfig.publicKey);
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
    console.log(`[SolPayment:${paymentId}] Current SOL balance: ${solBalance.toFixed(6)}`);
    
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
    
    console.log(`[SolPayment:${paymentId}] Creating transaction with nonce: ${nonce}`);
    
    // Add the main transfer instruction
    const mainTransferInstruction = SystemProgram.transfer({
      fromPubkey: walletConfig.publicKey,
      toPubkey: new PublicKey(recipientWallet),
      lamports: lamports,
    });
    
    transaction.add(mainTransferInstruction);
    
    // Add a unique zero-value transfer to make transaction unique
    const nonceInstruction = SystemProgram.transfer({
      fromPubkey: walletConfig.publicKey,
      toPubkey: walletConfig.publicKey,
      lamports: 0
    });
    
    transaction.add(nonceInstruction);
    
    // Get recent blockhash
    let blockHash;
    try {
      blockHash = await connection.getLatestBlockhash('confirmed');
      console.log(`[SolPayment:${paymentId}] Got blockhash: ${blockHash.blockhash.slice(0, 8)}...`);
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
    transaction.feePayer = walletConfig.publicKey;
    
    // Sign transaction
    let signedTransaction;
    try {
      signedTransaction = await walletConfig.signTransaction(transaction);
      console.log(`[SolPayment:${paymentId}] Transaction signed successfully`);
    } catch (signError) {
      if (isUserRejectionError(signError)) {
        console.log(`[SolPayment:${paymentId}] User declined to sign transaction`);
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
    console.log(`[SolPayment:${paymentId}] Transaction details:`, {
      blockHash: transaction.recentBlockhash?.slice(0, 8) + "...",
      feePayer: transaction.feePayer?.toString().slice(0, 8) + "...",
      instructions: transaction.instructions.length,
      signatures: transaction.signatures.length,
      serializedSize: signedTransaction.serialize().length
    });
    
    // Send transaction
    let signature;
    try {
      console.log(`[SolPayment:${paymentId}] Sending transaction...`);
      signature = await connection.sendRawTransaction(signedTransaction.serialize());
      console.log(`[SolPayment:${paymentId}] Transaction sent, signature: ${signature}`);
    } catch (sendError) {
      console.error(`[SolPayment:${paymentId}] Error sending transaction:`, sendError);
      
      // Check if this is a "Transaction already processed" error
      if (isTxAlreadyProcessedError(sendError)) {
        console.log(`[SolPayment:${paymentId}] Transaction already processed error detected`);
        
        // Try to extract the signature from the error
        const existingSig = extractSignatureFromError(sendError);
        
        if (existingSig) {
          console.log(`[SolPayment:${paymentId}] Found existing signature: ${existingSig}`);
          
          // Verify if the transaction was successful
          try {
            const status = await connection.getSignatureStatus(existingSig);
            
            if (status && status.value && !status.value.err) {
              console.log(`[SolPayment:${paymentId}] Found successful existing transaction`);
              return {
                success: true,
                transactionHash: existingSig,
                blockchainConfirmation: true,
                reused: true
              };
            }
          } catch (statusError) {
            console.log(`[SolPayment:${paymentId}] Error checking transaction status:`, statusError);
          }
        }
        
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
      console.log(`[SolPayment:${paymentId}] Confirming transaction...`);
      const confirmation = await connection.confirmTransaction({
        signature,
        blockhash: blockHash.blockhash,
        lastValidBlockHeight: blockHash.lastValidBlockHeight,
      }, 'confirmed');
      
      if (confirmation.value.err) {
        console.error(`[SolPayment:${paymentId}] Transaction confirmation failed:`, confirmation.value.err);
        return {
          success: false,
          error: createPaymentError(
            ErrorCategory.BLOCKCHAIN_ERROR,
            `Transaction error: ${confirmation.value.err.toString()}`,
            confirmation.value.err,
            true
          )
        };
      }
      
      console.log(`[SolPayment:${paymentId}] Transaction confirmed successfully!`);
      return {
        success: true,
        transactionHash: signature,
        blockchainConfirmation: true
      };
    } catch (confirmError) {
      console.error(`[SolPayment:${paymentId}] Error confirming transaction:`, confirmError);
      
      // Check status manually - may have succeeded despite confirmation error
      try {
        const status = await connection.getSignatureStatus(signature);
        
        if (status.value && !status.value.err) {
          console.log(`[SolPayment:${paymentId}] Transaction succeeded despite confirmation error`);
          return {
            success: true,
            transactionHash: signature,
            blockchainConfirmation: true
          };
        }
      } catch (statusError) {
        console.error(`[SolPayment:${paymentId}] Failed to check transaction status:`, statusError);
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
    console.error(`[SolPayment:${paymentId}] SOL payment error:`, error);
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
    console.error(`Error checking SOL balance:`, error);
    return { 
      balance: 0, 
      error: error instanceof Error ? error.message : 'Unknown error checking SOL balance'
    };
  }
}
