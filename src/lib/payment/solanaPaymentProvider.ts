// src/lib/payment/solanaPaymentProvider.ts
'use client';

import { 
  Connection, 
  PublicKey, 
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  Commitment
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
  retryWithBackoff
} from './utils';
import { RPC_ENDPOINT, CONNECTION_TIMEOUT } from '@/lib/solana/walletConfig';

/**
 * SolanaPaymentProvider handles the interaction with Solana blockchain
 */
export class SolanaPaymentProvider {
  private connection: Connection;
  private wallet: WalletConfig;
  
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
   * Process a SOL payment transaction
   */
  public async processSOLPayment(request: PaymentRequest): Promise<TransactionResult> {
    try {
      const { amount, recipientWallet } = request;
      
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
      
      // Get recent blockhash
      let blockHash;
      try {
        blockHash = await this.connection.getLatestBlockhash('confirmed');
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
      } catch (sendError) {
        // Check if this is a "Transaction already processed" error
        if (sendError.message && sendError.message.includes("already been processed")) {
          return {
            success: false,
            error: createPaymentError(
              ErrorCategory.BLOCKCHAIN_ERROR,
              'Transaction simulation failed: This transaction has already been processed. Please try again with a new transaction.',
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
      const { amount, recipientWallet } = request;
      
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
        } catch (sendError) {
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