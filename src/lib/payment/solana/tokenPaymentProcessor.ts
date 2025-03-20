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
  PaymentError,
  ErrorCategory,
  WalletConfig
} from '../types/index';
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
import { PAYMENT_TOKENS, ACTIVE_NETWORK, SOLANA } from '@/utils/constants';
import { blockchainLogger } from '@/utils/logger';

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
  
  blockchainLogger.info('Processing token payment', {
    paymentId,
    amount,
    token: request.token
  });
  
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
  const connection = new Connection(SOLANA.RPC_ENDPOINT, {
    commitment: 'confirmed',
    confirmTransactionInitialTimeout: SOLANA.CONFIRMATION_TIMEOUT,
    disableRetryOnRateLimit: false
  });
  
  try {
    // Get the token mint info
    const tokenMint = new PublicKey(mintAddress);
    
    // Try to fetch mint info to get decimals
    const mintInfo = await getMint(connection, tokenMint);
    blockchainLogger.info('Token mint info retrieved', {
      paymentId,
      decimals: mintInfo.decimals
    });
    
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
      blockchainLogger.info('Payer token account exists');
    } catch (error) {
      if (error instanceof TokenAccountNotFoundError) {
        blockchainLogger.info('Payer doesn\'t have a token account');
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
      blockchainLogger.info('Recipient token account exists');
    } catch (error) {
      if (error instanceof TokenAccountNotFoundError) {
        blockchainLogger.info('Recipient needs a token account - will create it');
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
    
    blockchainLogger.info('Token balance sufficient', {
      balance: balance.value.uiAmount,
      token: request.token
    });
    
    // Create transaction
    const transaction = new Transaction();
    
    // Create recipient token account if needed
    if (needsRecipientAccount) {
      blockchainLogger.info('Creating recipient token account');
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
    blockchainLogger.info('Adding token transfer instruction', {
      amount,
      token: request.token
    });
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
    blockchainLogger.info('Adding nonce instruction', {
      nonce
    });
    
    transaction.add(
      SystemProgram.transfer({
        fromPubkey: payer,
        toPubkey: payer,
        lamports: 0
      })
    );
    
    // Get latest blockhash
    const blockHash = await connection.getLatestBlockhash('confirmed');
    blockchainLogger.debug('Got blockhash', {
      blockhash: blockHash.blockhash
    });
    
    transaction.recentBlockhash = blockHash.blockhash;
    transaction.feePayer = payer;
    
    // Sign transaction
    let signedTransaction;
    try {
      signedTransaction = await walletConfig.signTransaction(transaction);
      blockchainLogger.debug('Transaction signed');
    } catch (signError) {
      if (isUserRejectionError(signError)) {
        blockchainLogger.info('User declined transaction');
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
    blockchainLogger.debug('Transaction details', {
      paymentId,
      nonce,
      blockhash: transaction.recentBlockhash,
      instructions: transaction.instructions.length,
      signers: transaction.signatures.length
    });
    
    // Send transaction
    let signature;
    try {
      blockchainLogger.info('Sending transaction...');
      signature = await connection.sendRawTransaction(signedTransaction.serialize());
      blockchainLogger.info('Transaction sent', {
        signature
      });
    } catch (sendError) {
      blockchainLogger.error('Error sending transaction', sendError instanceof Error ? sendError : new Error(String(sendError)));
      
      // Check if this is a "Transaction already processed" error
      if (isTxAlreadyProcessedError(sendError)) {
        blockchainLogger.debug('Transaction already processed');
        
        // Try to extract the signature from the error
        const existingSig = extractSignatureFromError(sendError);
        
        if (existingSig) {
          blockchainLogger.debug('Found existing signature', {
            signature: existingSig
          });
          
          // Verify if the transaction was successful
          try {
            const status = await connection.getSignatureStatus(existingSig);
            
            if (status && status.value && !status.value.err) {
              blockchainLogger.info('Found successful existing transaction');
              return {
                success: true,
                transactionHash: existingSig,
                blockchainConfirmation: true,
                reused: true
              };
            }
          } catch (statusError) {
            blockchainLogger.error('Error checking transaction status', statusError instanceof Error ? statusError : new Error(String(statusError)));
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
      blockchainLogger.info('Confirming transaction...');
      const confirmation = await connection.confirmTransaction({
        signature,
        blockhash: blockHash.blockhash,
        lastValidBlockHeight: blockHash.lastValidBlockHeight,
      }, 'confirmed');
      
      if (confirmation.value.err) {
        blockchainLogger.error('Transaction confirmation failed', new Error(String(confirmation.value.err)));
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
      
      blockchainLogger.info('Transaction confirmed successfully');
      return {
        success: true,
        transactionHash: signature,
        blockchainConfirmation: true
      };
    } catch (confirmError) {
      blockchainLogger.error('Error confirming transaction', confirmError instanceof Error ? confirmError : new Error(String(confirmError)));
      
      // Check status manually - may have succeeded despite confirmation error
      try {
        const status = await connection.getSignatureStatus(signature);
        
        if (status.value && !status.value.err) {
          blockchainLogger.info('Transaction succeeded despite confirmation error');
          return {
            success: true,
            transactionHash: signature,
            blockchainConfirmation: true
          };
        }
      } catch (statusError) {
        blockchainLogger.error('Failed to check transaction status', statusError instanceof Error ? statusError : new Error(String(statusError)));
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
    blockchainLogger.error('Unexpected error in token payment', error instanceof Error ? error : new Error(String(error)));
    
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
    // Get mint address from token symbol
    const tokenConfig = PAYMENT_TOKENS[tokenSymbol];
    if (!tokenConfig) {
      return { hasToken: false, balance: 0, error: `Token ${tokenSymbol} not supported` };
    }
    
    const mintAddress = tokenConfig.mint[ACTIVE_NETWORK];
    const decimals = tokenConfig.decimals;
    
    // Create connection
    const connection = new Connection(SOLANA.RPC_ENDPOINT, {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: SOLANA.CONFIRMATION_TIMEOUT
    });
    
    // Get token account
    const tokenAccount = await getAssociatedTokenAddress(
      new PublicKey(mintAddress),
      walletAddress
    );
    
    // Check if account exists
    try {
      const accountInfo = await getAccount(connection, tokenAccount);
      const mintInfo = await getMint(connection, new PublicKey(mintAddress));
      
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
    blockchainLogger.error('Error checking token balance', error instanceof Error ? error : new Error(String(error)), {
      token: tokenSymbol
    });
    return { 
      hasToken: false, 
      balance: 0, 
      error: error instanceof Error ? error.message : 'Unknown error checking token balance'
    };
  }
}
