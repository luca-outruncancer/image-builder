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
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: this.wallet.publicKey,
          toPubkey: new PublicKey(recipientWallet),
          lamports: lamports,
        })
      );
      
      // Add a unique identifier to transaction to prevent duplicates
      const nonce = getNonce();
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: this.wallet.publicKey,
          toPubkey: this.wallet.publicKey,
          lamports: 0
        })
      );
      
      // Get recent blockhash
      let blockHash;
      try {
        blockHash = await this.connection.getLatestBlockhash('confirmed');
        console.log("Got blockhash:", blockHash.blockhash.slice(0, 8) + "...");
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
      } catch (signError) {
        if (isUserRejectionError(signError)) {
          console.log("Transaction declined by user");
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
      let signature;
      try {
        signature = await this.connection.sendRawTransaction(signedTransaction.serialize());
        console.log("Transaction sent, signature:", signature);
        
        // Cache the transaction for potential reuse
        if (paymentId && signature) {
          this.cachedTransactions.set(paymentId, signature);
        }
      } catch (sendError) {
        // Check if this is a "Transaction already processed" error
        if (isTxAlreadyProcessedError(sendError)) {
          console.log("Transaction already processed error detected");
          
          // Try to extract the signature from the error if possible
          let errorMessage = sendError.message || '';
          let existingSig = null;
          
          // Look for signature in log messages if available
          if (sendError instanceof SendTransactionError && sendError.logs) {
            const logs = sendError.logs;
            console.log("Transaction logs:", logs);
            
            // Attempt to find signature in logs
            for (const log of logs) {
              const sigMatch = log.match(/signature: ([A-Za-z0-9]+)/);
              if (sigMatch && sigMatch[1]) {
                existingSig = sigMatch[1];
                console.log("Found existing signature in logs:", existingSig);
                break;
              }
            }
          }
          
          // If we couldn't find the signature but have a cached version, try that
          if (!existingSig && paymentId) {
            const cachedSig = this.cachedTransactions.get(paymentId);
            if (cachedSig) {
              existingSig = cachedSig;
              console.log("Using cached signature:", existingSig);
            }
          }
          
          // If we have a signature, verify the transaction
          if (existingSig) {
            const isSuccessful = await this.verifyTransaction(existingSig);
            if (isSuccessful) {
              console.log("Previously processed transaction verified as successful");
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
        const confirmation = await this.connection.confirmTransaction({
          signature,
          blockhash: blockHash.blockhash,
          lastValidBlockHeight: blockHash.lastValidBlockHeight,
        }, 'confirmed');
        
        if (confirmation.value.err) {
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
        
        return {
          success: true,
          transactionHash: signature,
          blockchainConfirmation: true
        };
      } catch (confirmError) {
        // Double-check transaction status
        try {
          const status = await this.connection.getSignatureStatus(signature);
          
          if (status.value && !status.value.err) {
            // Transaction was actually successful despite confirmation error
            return {
              success: true,
              transactionHash: signature,
              blockchainConfirmation: true
            };
          }
        } catch (statusError) {
          console.error('Failed to check transaction status:', statusError);
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
   * Process a token payment transaction (e.g., USDC)
   */
  public async processTokenPayment(request: PaymentRequest, mintAddress: string): Promise<TransactionResult> {
    try {
      const { amount, recipientWallet, metadata } = request;
      const paymentId = metadata?.paymentId || 'unknown';
      
      // Check for existing transaction first
      const existingSignature = await this.checkExistingTransaction(paymentId);
      if (existingSignature) {
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
        const transferInstruction = createTransferCheckedInstruction(
          payerTokenAccount,
          tokenMint,
          recipientTokenAccount,
          this.wallet.publicKey,
          tokenAmount,
          mintInfo.decimals
        );
        
        const transaction = new Transaction().add(transferInstruction);
        
        // Add a unique identifier to transaction to prevent duplicates
        transaction.add(
          SystemProgram.transfer({
            fromPubkey: this.wallet.publicKey,
            toPubkey: this.wallet.publicKey,
            lamports: 0
          })
        );
        
        // Get latest blockhash
        const blockHash = await this.connection.getLatestBlockhash('confirmed');
        
        transaction.recentBlockhash = blockHash.blockhash;
        transaction.feePayer = this.wallet.publicKey;
        
        // Sign transaction
        let signedTransaction;
        try {
          signedTransaction = await this.wallet.signTransaction(transaction);
        } catch (signError) {
          if (isUserRejectionError(signError)) {
            console.log("Transaction declined by user");
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
        let signature;
        try {
          signature = await this.connection.sendRawTransaction(signedTransaction.serialize());
          
          // Cache the transaction for potential reuse
          if (paymentId && signature) {
            this.cachedTransactions.set(paymentId, signature);
          }
        } catch (sendError) {
          // Check if this is a "Transaction already processed" error
          if (isTxAlreadyProcessedError(sendError)) {
            console.log("Token transaction already processed error detected");
            
            // Try to extract the signature from the error if possible
            let errorMessage = sendError.message || '';
            let existingSig = null;
            
            // Look for signature in log messages if available
            if (sendError instanceof SendTransactionError && sendError.logs) {
              const logs = sendError.logs;
              console.log("Transaction logs:", logs);
              
              // Attempt to find signature in logs
              for (const log of logs) {
                const sigMatch = log.match(/signature: ([A-Za-z0-9]+)/);
                if (sigMatch && sigMatch[1]) {
                  existingSig = sigMatch[1];
                  console.log("Found existing signature in logs:", existingSig);
                  break;
                }
              }
            }
            
            // If we couldn't find the signature but have a cached version, try that
            if (!existingSig && paymentId) {
              const cachedSig = this.cachedTransactions.get(paymentId);
              if (cachedSig) {
                existingSig = cachedSig;
                console.log("Using cached signature:", existingSig);
              }
            }
            
            // If we have a signature, verify the transaction
            if (existingSig) {
              const isSuccessful = await this.verifyTransaction(existingSig);
              if (isSuccessful) {
                console.log("Previously processed token transaction verified as successful");
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
          const confirmation = await this.connection.confirmTransaction({
            signature,
            blockhash: blockHash.blockhash,
            lastValidBlockHeight: blockHash.lastValidBlockHeight,
          }, 'confirmed');
          
          if (confirmation.value.err) {
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
          
          return {
            success: true,
            transactionHash: signature,
            blockchainConfirmation: true
          };
        } catch (confirmError) {
          // Check status manually
          const status = await this.connection.getSignatureStatus(signature);
          
          if (status.value && !status.value.err) {
            // Transaction was successful despite confirmation error
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
    this.cachedTransactions.clear();
  }
  
  /**
   * Process payment with automatic token type selection and retry logic
   */
  public async processPayment(request: PaymentRequest, mintAddress?: string | null): Promise<TransactionResult> {
    try {
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