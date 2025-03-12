// src/lib/payment/solana/tokenPaymentProcessor.ts
import { 
  Connection, 
  PublicKey, 
  Transaction,
  SystemProgram,
  SendTransactionError,
  Commitment
} from '@solana/web3.js';
import { 
  createTransferCheckedInstruction, 
  getAssociatedTokenAddress, 
  getMint,
  getAccount,
  TokenAccountNotFoundError,
  createAssociatedTokenAccountInstruction
} from '@solana/spl-token';
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
import { PAYMENT_TOKENS, ACTIVE_NETWORK } from '@/utils/constants';

/**
 * Process a token payment transaction (e.g., USDC)
 * Handles creation of token accounts if needed and token transfers
 */
export async function processTokenPayment(
  request: PaymentRequest, 
  mintAddress: string,
  walletConfig: WalletConfig
): Promise<TransactionResult> {
  const { amount, recipientWallet, metadata } = request;
  const paymentId = metadata?.paymentId || 'unknown';
  
  console.log(`[TokenPayment:${paymentId}] Processing token payment for amount ${amount} ${request.token}`);
  
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
    // Get the token mint info
    const tokenMint = new PublicKey(mintAddress);
    
    // Try to fetch mint info to get decimals
    const mintInfo = await getMint(connection, tokenMint);
    console.log(`[TokenPayment:${paymentId}] Token mint info retrieved, decimals: ${mintInfo.decimals}`);
    
    // Calculate the token amount with decimals
    const tokenAmount = Math.floor(amount * (10 ** mintInfo.decimals));
    
    // Get token accounts
    const recipient = new PublicKey(recipientWallet);
    const payer = walletConfig.publicKey;
    
    // Get the associated token accounts for both parties
    const recipientTokenAccount = await getAssociatedTokenAddress(
      tokenMint,
      recipient
    );
    
    const payerTokenAccount = await getAssociatedTokenAddress(
      tokenMint,
      payer
    );
    
    // Check if token accounts exist
    let needsRecipientAccount = false;
    let payerTokenInfo = null;
    
    try {
      // Check payer token account
      payerTokenInfo = await getAccount(connection, payerTokenAccount);
      console.log(`[TokenPayment:${paymentId}] Payer token account exists`);
    } catch (error) {
      if (error instanceof TokenAccountNotFoundError) {
        console.log(`[TokenPayment:${paymentId}] Payer doesn't have a token account`);
        return {
          success: false,
          error: createPaymentError(
            ErrorCategory.WALLET_ERROR,
            `You don't have a token account for ${request.token}. Please add ${request.token} to your wallet first.`,
            null,
            false
          )
        };
      }
      throw error;
    }
    
    try {
      // Check recipient token account
      await getAccount(connection, recipientTokenAccount);
      console.log(`[TokenPayment:${paymentId}] Recipient token account exists`);
    } catch (error) {
      if (error instanceof TokenAccountNotFoundError) {
        console.log(`[TokenPayment:${paymentId}] Recipient needs a token account - will create it`);
        needsRecipientAccount = true;
      } else {
        throw error;
      }
    }
    
    // Check token balance
    const balance = await connection.getTokenAccountBalance(payerTokenAccount);
    
    if ((balance.value.uiAmount || 0) < amount) {
      return {
        success: false,
        error: createPaymentError(
          ErrorCategory.BALANCE_ERROR,
          `Insufficient ${request.token} balance. You have ${balance.value.uiAmount} ${request.token} but need ${amount} ${request.token}`,
          null,
          false
        )
      };
    }
    
    console.log(`[TokenPayment:${paymentId}] Token balance sufficient: ${balance.value.uiAmount} ${request.token}`);
    
    // Create transaction
    const transaction = new Transaction();
    
    // Create recipient token account if needed
    if (needsRecipientAccount) {
      console.log(`[TokenPayment:${paymentId}] Adding instruction to create recipient token account`);
      transaction.add(
        createAssociatedTokenAccountInstruction(
          payer,
          recipientTokenAccount,
          recipient,
          tokenMint
        )
      );
    }
    
    // Add the main token transfer instruction
    console.log(`[TokenPayment:${paymentId}] Adding token transfer instruction for ${amount} ${request.token}`);
    const transferInstruction = createTransferCheckedInstruction(
      payerTokenAccount,
      tokenMint,
      recipientTokenAccount,
      payer,
      tokenAmount,
      mintInfo.decimals
    );
    
    transaction.add(transferInstruction);
    
    // Add a unique identifier to transaction to prevent duplicates
    const nonce = getNonce();
    console.log(`[TokenPayment:${paymentId}] Adding nonce instruction: ${nonce}`);
    
    transaction.add(
      SystemProgram.transfer({
        fromPubkey: payer,
        toPubkey: payer,
        lamports: 0
      })
    );
    
    // Get latest blockhash
    const blockHash = await connection.getLatestBlockhash('confirmed');
    console.log(`[TokenPayment:${paymentId}] Got blockhash: ${blockHash.blockhash.slice(0, 8)}...`);
    
    transaction.recentBlockhash = blockHash.blockhash;
    transaction.feePayer = payer;
    
    // Sign transaction
    let signedTransaction;
    try {
      signedTransaction = await walletConfig.signTransaction(transaction);
      console.log(`[TokenPayment:${paymentId}] Transaction signed successfully`);
    } catch (signError) {
      if (isUserRejectionError(signError)) {
        console.log(`[TokenPayment:${paymentId}] User declined to sign transaction`);
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
    console.log(`[TokenPayment:${paymentId}] Transaction details:`, {
      blockHash: transaction.recentBlockhash?.slice(0, 8) + "...",
      feePayer: transaction.feePayer?.toString().slice(0, 8) + "...",
      instructions: transaction.instructions.length,
      signatures: transaction.signatures.length,
      serializedSize: signedTransaction.serialize().length
    });
    
    // Send transaction
    let signature;
    try {
      console.log(`[TokenPayment:${paymentId}] Sending transaction...`);
      signature = await connection.sendRawTransaction(signedTransaction.serialize());
      console.log(`[TokenPayment:${paymentId}] Transaction sent, signature: ${signature}`);
    } catch (sendError) {
      console.error(`[TokenPayment:${paymentId}] Error sending transaction:`, sendError);
      
      // Check if this is a "Transaction already processed" error
      if (isTxAlreadyProcessedError(sendError)) {
        console.log(`[TokenPayment:${paymentId}] Transaction already processed error detected`);
        
        // Try to extract the signature from the error
        const existingSig = extractSignatureFromError(sendError);
        
        if (existingSig) {
          console.log(`[TokenPayment:${paymentId}] Found existing signature: ${existingSig}`);
          
          // Verify if the transaction was successful
          try {
            const status = await connection.getSignatureStatus(existingSig);
            
            if (status && status.value && !status.value.err) {
              console.log(`[TokenPayment:${paymentId}] Found successful existing transaction`);
              return {
                success: true,
                transactionHash: existingSig,
                blockchainConfirmation: true,
                reused: true
              };
            }
          } catch (statusError) {
            console.log(`[TokenPayment:${paymentId}] Error checking transaction status:`, statusError);
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
      console.log(`[TokenPayment:${paymentId}] Confirming transaction...`);
      const confirmation = await connection.confirmTransaction({
        signature,
        blockhash: blockHash.blockhash,
        lastValidBlockHeight: blockHash.lastValidBlockHeight,
      }, 'confirmed');
      
      if (confirmation.value.err) {
        console.error(`[TokenPayment:${paymentId}] Transaction confirmation failed:`, confirmation.value.err);
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
      
      console.log(`[TokenPayment:${paymentId}] Transaction confirmed successfully!`);
      return {
        success: true,
        transactionHash: signature,
        blockchainConfirmation: true
      };
    } catch (confirmError) {
      console.error(`[TokenPayment:${paymentId}] Error confirming transaction:`, confirmError);
      
      // Check status manually - may have succeeded despite confirmation error
      try {
        const status = await connection.getSignatureStatus(signature);
        
        if (status.value && !status.value.err) {
          console.log(`[TokenPayment:${paymentId}] Transaction succeeded despite confirmation error`);
          return {
            success: true,
            transactionHash: signature,
            blockchainConfirmation: true
          };
        }
      } catch (statusError) {
        console.error(`[TokenPayment:${paymentId}] Failed to check transaction status:`, statusError);
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
    console.error(`[TokenPayment:${paymentId}] Unexpected error:`, error);
    
    // Check if the mint exists or is valid
    if (error instanceof Error && 
        (error.message.includes('Invalid public key') || 
         error.message.includes('not found'))
       ) {
      return {
        success: false,
        error: createPaymentError(
          ErrorCategory.BLOCKCHAIN_ERROR,
          `The ${request.token} token is not available on this network. Please make sure you're connected to the correct network.`,
          error,
          false
        )
      };
    }
    
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
 * Check if the user has a specific token and get its balance
 */
export async function checkTokenBalance(
  walletAddress: PublicKey,
  tokenSymbol: string
): Promise<{ hasToken: boolean; balance: number; error?: string }> {
  try {
    // Get mint address for token
    const tokenData = PAYMENT_TOKENS[tokenSymbol];
    if (!tokenData || !tokenData.mint || !tokenData.mint[ACTIVE_NETWORK]) {
      return { 
        hasToken: false, 
        balance: 0, 
        error: `Token ${tokenSymbol} not configured for ${ACTIVE_NETWORK}` 
      };
    }

    const mintAddress = new PublicKey(tokenData.mint[ACTIVE_NETWORK]);
    
    // Create connection
    const connection = new Connection(RPC_ENDPOINT, {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: CONNECTION_TIMEOUT
    });
    
    // Get token account
    const tokenAccount = await getAssociatedTokenAddress(
      mintAddress,
      walletAddress
    );
    
    // Check if account exists
    try {
      const accountInfo = await getAccount(connection, tokenAccount);
      const mintInfo = await getMint(connection, mintAddress);
      
      // Get balance as UI amount (with proper decimal places)
      const rawBalance = Number(accountInfo.amount);
      const balance = rawBalance / Math.pow(10, mintInfo.decimals);
      
      return { hasToken: true, balance };
    } catch (error) {
      if (error instanceof TokenAccountNotFoundError) {
        return { hasToken: false, balance: 0 };
      }
      throw error;
    }
  } catch (error) {
    console.error(`Error checking token balance for ${tokenSymbol}:`, error);
    return { 
      hasToken: false, 
      balance: 0, 
      error: error instanceof Error ? error.message : 'Unknown error checking token balance'
    };
  }
}
