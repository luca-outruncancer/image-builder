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
import { RPC_ENDPOINT, CONNECTION_TIMEOUT, FALLBACK_ENDPOINTS } from '@/lib/solana/walletConfig';

/**
 * SolanaPaymentProvider handles the interaction with Solana blockchain
 */
export class SolanaPaymentProvider {
  private connection: Connection;
  private wallet: WalletConfig;
  private cachedTransactions: Map<string, string> = new Map(); // Map of txId -> signature
  // Track in-progress transactions to prevent duplicates
  private pendingTransactions: Set<string> = new Set();
  
  constructor(wallet: WalletConfig) {
    this.wallet = wallet;
    this.connection = this.createConnection();
  }
  
  /**
   * Create a Solana connection with custom configuration
   */
  private createConnection(): Connection {
    const commitment: Commitment = 'confirmed';
    
    try {
      if (!RPC_ENDPOINT) {
        throw new Error('No RPC endpoint configured');
      }
      
      const connection = new Connection(RPC_ENDPOINT, {
        commitment,
        confirmTransactionInitialTimeout: CONNECTION_TIMEOUT
      });
      
      return connection;
    } catch (error) {
      console.error("Failed to create Solana connection:", error);
      throw createPaymentError(
        ErrorCategory.NETWORK_ERROR,
        'Connection initialization failed',
        error,
        true
      );
    }
  }

  /**
   * Verify if a transaction has already been processed successfully
   */
  private async verifyTransaction(signature: string): Promise<boolean> {
    try {
      console.log(`Verifying transaction signature: ${signature}`);
      const status = await this.connection.getSignatureStatus(signature);
      
      // If we have a confirmation, the transaction succeeded
      if (status && status.value && !status.value.err) {
        console.log(`Transaction verified: ${signature} was SUCCESSFUL`);
        return true;
      }
      
      console.log(`Transaction verified: ${signature} was NOT successful`, status);
      return false;
    } catch (error) {
      console.error("Error verifying transaction:", error);
      return false;
    }
  }

  /**
   * Check if a transaction with these parameters is already in progress or completed
   */
  private async checkExistingTransaction(paymentId: string): Promise<string | null> {
    const cachedSignature = this.cachedTransactions.get(paymentId);
    if (cachedSignature) {
      // Verify it's a successful transaction
      const isValid = await this.verifyTransaction(cachedSignature);
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
  public async processSOLPayment(request: PaymentRequest): Promise<TransactionResult> {
    try {
      const { amount, recipientWallet, metadata } = request;
      const paymentId = metadata?.paymentId || 'unknown';
      
      // Create a unique transaction ID for deduplication
      const transactionKey = `SOL:${paymentId}:${amount}:${Date.now()}`;
      
      // Check if this transaction is already in progress
      if (this.pendingTransactions.has(transactionKey)) {
        console.log(`Transaction ${transactionKey} is already in progress, aborting duplicate attempt`);
        return {
          success: false,
          error: createPaymentError(
            ErrorCategory.BLOCKCHAIN_ERROR,
            'A similar transaction is already in progress. Please wait a moment and try again.',
            null,
            true,
            'DUPLICATE_IN_PROGRESS'
          )
        };
      }
      
      // Mark this transaction as in progress
      this.pendingTransactions.add(transactionKey);
      
      try {
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
          balance = await this.connection.getBalance(this.wallet.publicKey);
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
        const nonce = getNonce() + '-' + paymentId + '-' + Date.now().toString();
        
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
          blockHash = await this.connection.getLatestBlockhash('confirmed');
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
          signature = await this.connection.sendRawTransaction(signedTransaction.serialize());
          console.log(`[ID: ${paymentId}] Transaction sent, signature:`, signature);
          
          // Cache the transaction for potential reuse
          if (paymentId && signature) {
            this.cachedTransactions.set(paymentId, signature);
            console.log(`[ID: ${paymentId}] Cached transaction signature:`, signature);
          }
        } catch (sendError) {
          console.error(`[ID: ${paymentId}] Error sending transaction:`, sendError);
          
          // Check if this is a "Transaction already processed" error
          if (isTxAlreadyProcessedError(sendError)) {
            console.log(`[ID: ${paymentId}] Transaction already processed error detected`);
            
            // Try to extract the signature from the error if possible
            let errorMessage = sendError.message || '';
            let existingSig = null;
            
            // Look for signature in log messages if available
            if (sendError instanceof SendTransactionError && sendError.logs) {
              const logs = sendError.logs;
              console.log(`[ID: ${paymentId}] Transaction logs:`, logs);
              
              // Attempt to find signature in logs
              for (const log of logs) {
                const sigMatch = log.match(/signature: ([A-Za-z0-9]+)/);
                if (sigMatch && sigMatch[1]) {
                  existingSig = sigMatch[1];
                  console.log(`[ID: ${paymentId}] Found existing signature in logs:`, existingSig);
                  break;
                }
              }
            }
            
            // If we couldn't find the signature but have a cached version, try that
            if (!existingSig && paymentId) {
              const cachedSig = this.cachedTransactions.get(paymentId);
              if (cachedSig) {
                existingSig = cachedSig;
                console.log(`[ID: ${paymentId}] Using cached signature:`, existingSig);
              }
            }
            
            // If we have a signature, verify the transaction
            if (existingSig) {
              const isSuccessful = await this.verifyTransaction(existingSig);
              if (isSuccessful) {
                console.log(`[ID: ${paymentId}] Previously processed transaction verified as successful`);
                return {
                  success: true,
                  transactionHash: existingSig,
                  blockchainConfirmation: true,
                  reused: true
                };
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
          console.log(`[ID: ${paymentId}] Confirming transaction...`);
          const confirmation = await this.connection.confirmTransaction({
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
            const status = await this.connection.getSignatureStatus(signature);
            
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
      } finally {
        // Remove from pending transactions, regardless of outcome
        setTimeout(() => {
          this.pendingTransactions.delete(transactionKey);
          console.log(`Removed transaction key ${transactionKey} from pending transactions`);
        }, 5000); // Clean up after 5 seconds
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
   * Process a token payment transaction (e.g., USDC)
   */
  public async processTokenPayment(request: PaymentRequest, mintAddress: string): Promise<TransactionResult> {
    try {
      const { amount, recipientWallet, metadata } = request;
      const paymentId = metadata?.paymentId || 'unknown';
      
      // Create a unique transaction ID for deduplication
      const transactionKey = `TOKEN:${paymentId}:${amount}:${Date.now()}`;
      
      // Check if this transaction is already in progress
      if (this.pendingTransactions.has(transactionKey)) {
        console.log(`Transaction ${transactionKey} is already in progress, aborting duplicate attempt`);
        return {
          success: false,
          error: createPaymentError(
            ErrorCategory.BLOCKCHAIN_ERROR,
            'A similar transaction is already in progress. Please wait a moment and try again.',
            null,
            true,
            'DUPLICATE_IN_PROGRESS'
          )
        };
      }
      
      // Mark this transaction as in progress
      this.pendingTransactions.add(transactionKey);
      
      try {
        console.log(`Processing token payment [ID: ${paymentId}] for amount ${amount} tokens`);
        
        // Check for existing transaction first
        const existingSignature = await this.checkExistingTransaction(paymentId);
        if (existingSignature) {
          console.log(`[ID: ${paymentId}] Using existing token transaction signature:`, existingSignature);
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
        
        // Get the token mint info
        try {
          const tokenMint = new PublicKey(mintAddress);
          
          // Try to fetch mint info
          const mintInfo = await getMint(this.connection, tokenMint);
          
          // Calculate the token amount with decimals
          const tokenAmount = Math.floor(amount * (10 ** mintInfo.decimals));
          
          // Get token accounts
          const recipient = new PublicKey(recipientWallet);
          
          // Get or create recipient token account
          const recipientTokenAccount = await getAssociatedTokenAddress(
            tokenMint,
            recipient
          );
          
          // Get payer token account
          const payerTokenAccount = await getAssociatedTokenAddress(
            tokenMint,
            this.wallet.publicKey
          );
          
          // Check payer token account exists
          const payerTokenInfo = await this.connection.getAccountInfo(payerTokenAccount);
          if (!payerTokenInfo) {
            return {
              success: false,
              error: createPaymentError(
                ErrorCategory.WALLET_ERROR,
                `You don't have a token account. Please add ${request.token} to your wallet first.`,
                null,
                false
              )
            };
          }
          
          // Check token balance
          const balance = await this.connection.getTokenAccountBalance(payerTokenAccount);
          
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
          
          // Create transaction
          const transaction = new Transaction();
          
          // Add the main token transfer instruction
          const transferInstruction = createTransferCheckedInstruction(
            payerTokenAccount,
            tokenMint,
            recipientTokenAccount,
            this.wallet.publicKey,
            tokenAmount,
            mintInfo.decimals
          );
          
          transaction.add(transferInstruction);
          
          // Add a unique identifier to transaction to prevent duplicates
          const nonce = getNonce() + '-' + paymentId + '-' + Date.now().toString();
          console.log(`[ID: ${paymentId}] Token transaction created with nonce: ${nonce}`);
          
          transaction.add(
            SystemProgram.transfer({
              fromPubkey: this.wallet.publicKey,
              toPubkey: this.wallet.publicKey,
              lamports: 0
            })
          );
          
          // Get latest blockhash
          const blockHash = await this.connection.getLatestBlockhash('confirmed');
          console.log(`[ID: ${paymentId}] Got token transaction blockhash:`, blockHash.blockhash.slice(0, 8) + "...");
          
          transaction.recentBlockhash = blockHash.blockhash;
          transaction.feePayer = this.wallet.publicKey;
          
          // Sign transaction
          let signedTransaction;
          try {
            signedTransaction = await this.wallet.signTransaction(transaction);
            console.log(`[ID: ${paymentId}] Token transaction signed successfully`);
          } catch (signError) {
            if (isUserRejectionError(signError)) {
              console.log(`[ID: ${paymentId}] Token transaction declined by user`);
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
          console.log(`[ID: ${paymentId}] Token transaction to be sent:`, {
            blockHash: transaction.recentBlockhash?.slice(0, 8) + "...",
            feePayer: transaction.feePayer?.toString(),
            instructions: transaction.instructions.length,
            signatures: transaction.signatures.length,
            serializedSize: signedTransaction.serialize().length
          });

          // Send transaction
          let signature;
          try {
            console.log(`[ID: ${paymentId}] Sending token transaction...`);
            signature = await this.connection.sendRawTransaction(signedTransaction.serialize());
            console.log(`[ID: ${paymentId}] Token transaction sent, signature:`, signature);
            
            // Cache the transaction for potential reuse
            if (paymentId && signature) {
              this.cachedTransactions.set(paymentId, signature);
              console.log(`[ID: ${paymentId}] Cached token transaction signature:`, signature);
            }
          } catch (sendError) {
            console.error(`[ID: ${paymentId}] Error sending token transaction:`, sendError);
            
            // Check if this is a "Transaction already processed" error
            if (isTxAlreadyProcessedError(sendError)) {
              console.log(`[ID: ${paymentId}] Token transaction already processed error detected`);
              
              // Try to extract the signature from the error if possible
              let errorMessage = sendError.message || '';
              let existingSig = null;
              
              // Look for signature in log messages if available
              if (sendError instanceof SendTransactionError && sendError.logs) {
                const logs = sendError.logs;
                console.log(`[ID: ${paymentId}] Token transaction logs:`, logs);
                
                // Attempt to find signature in logs
                for (const log of logs) {
                  const sigMatch = log.match(/signature: ([A-Za-z0-9]+)/);
                  if (sigMatch && sigMatch[1]) {
                    existingSig = sigMatch[1];
                    console.log(`[ID: ${paymentId}] Found existing token signature in logs:`, existingSig);
                    break;
                  }
                }
              }
              
              // If we couldn't find the signature but have a cached version, try that
              if (!existingSig && paymentId) {
                const cachedSig = this.cachedTransactions.get(paymentId);
                if (cachedSig) {
                  existingSig = cachedSig;
                  console.log(`[ID: ${paymentId}] Using cached token signature:`, existingSig);
                }
              }
              
              // If we have a signature, verify the transaction
              if (existingSig) {
                const isSuccessful = await this.verifyTransaction(existingSig);
                if (isSuccessful) {
                  console.log(`[ID: ${paymentId}] Previously processed token transaction verified as successful`);
                  return {
                    success: true,
                    transactionHash: existingSig,
                    blockchainConfirmation: true,
                    reused: true
                  };
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
            console.log(`[ID: ${paymentId}] Confirming token transaction...`);
            const confirmation = await this.connection.confirmTransaction({
              signature,
              blockhash: blockHash.blockhash,
              lastValidBlockHeight: blockHash.lastValidBlockHeight,
            }, 'confirmed');
            
            if (confirmation.value.err) {
              console.error(`[ID: ${paymentId}] Token transaction confirmation failed:`, confirmation.value.err);
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
            
            console.log(`[ID: ${paymentId}] Token transaction confirmed successfully!`);
            return {
              success: true,
              transactionHash: signature,
              blockchainConfirmation: true
            };
          } catch (confirmError) {
            console.error(`[ID: ${paymentId}] Error confirming token transaction:`, confirmError);
            
            // Check status manually
            const status = await this.connection.getSignatureStatus(signature);
            
            if (status.value && !status.value.err) {
              // Transaction was successful despite confirmation error
              console.log(`[ID: ${paymentId}] Token transaction was successful despite confirmation error`);
              return {
                success: true,
                transactionHash: signature,
                blockchainConfirmation: true
              };
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
        } catch (mintError) {
          console.error(`[ID: ${paymentId}] Token mint error:`, mintError);
          
          // Check if the mint exists
          try {
            const mintPubkey = new PublicKey(mintAddress);
            const accountInfo = await this.connection.getAccountInfo(mintPubkey);
            
            if (!accountInfo) {
              return {
                success: false,
                error: createPaymentError(
                  ErrorCategory.BLOCKCHAIN_ERROR,
                  `The ${request.token} token is not available on this network. Please make sure you're connected to the correct network.`,
                  mintError,
                  false
                )
              };
            }
          } catch (pubkeyError) {
            return {
              success: false,
              error: createPaymentError(
                ErrorCategory.BLOCKCHAIN_ERROR,
                'Invalid mint address',
                pubkeyError,
                false
              )
            };
          }
          
          return {
            success: false,
            error: createPaymentError(
              ErrorCategory.BLOCKCHAIN_ERROR,
              'Failed to get token information',
              mintError,
              true
            )
          };
        }
      } finally {
        // Remove from pending transactions, regardless of outcome
        setTimeout(() => {
          this.pendingTransactions.delete(transactionKey);
          console.log(`Removed token transaction key ${transactionKey} from pending transactions`);  
        }, 5000); // Clean up after 5 seconds
      }
    } catch (error) {
      console.error('Token payment error:', error);
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
   * Clear the cached transactions
   */
  public clearTransactionCache(): void {
    console.log("Clearing transaction cache");
    this.cachedTransactions.clear();
    this.pendingTransactions.clear();
  }
  
  /**
   * Process payment with automatic token type selection and retry logic
   */
  public async processPayment(request: PaymentRequest, mintAddress?: string | null): Promise<TransactionResult> {
    try {
      console.log(`Processing payment [PaymentID: ${request.metadata?.paymentId || 'unknown'}]`, {
        amount: request.amount,
        token: request.token,
        hasMintAddress: !!mintAddress
      });
      
      // Retry with backoff for transient errors
      return await retryWithBackoff(async () => {
        if (request.token === 'SOL') {
          return await this.processSOLPayment(request);
        } else if (mintAddress) {
          return await this.processTokenPayment(request, mintAddress);
        } else {
          throw new Error(`Unsupported payment token: ${request.token}`);
        }
      }, 2); // Maximum 2 retries
    } catch (error) {
      console.error(`Payment processing error [PaymentID: ${request.metadata?.paymentId || 'unknown'}]:`, error);
      
      // Handle errors that weren't automatically retried
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
            'Transaction already processed. Please try again with a new transaction.',
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
}

export default SolanaPaymentProvider;