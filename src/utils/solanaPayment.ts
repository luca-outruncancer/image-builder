// src/utils/solanaPayment.ts
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
import { RECIPIENT_WALLET_ADDRESS, MINT_ADDRESS, ACTIVE_PAYMENT_TOKEN } from '@/utils/constants';
import { RPC_ENDPOINT, CONNECTION_TIMEOUT } from '@/lib/solana/walletConfig';

export interface PaymentResult {
  success: boolean;
  transaction_hash?: string;
  error?: string;
  userRejected?: boolean; 
}

// Create a connection with a custom commitment level and timeout
function createConnection() {
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
    throw new Error(`Connection initialization failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Generate a unique transaction ID to help prevent duplicate transactions
function generateUniqueTransactionId() {
  return `tx_${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
}

// Manages user rejection
function isUserRejection(error: any): boolean {
  if (!error) return false;
  
  const errorMessage = error.message || String(error);
  return (
    errorMessage.includes("rejected") || 
    errorMessage.includes("cancelled") || 
    errorMessage.includes("canceled") || 
    errorMessage.includes("declined") ||
    errorMessage.includes("User denied") ||
    errorMessage.includes("User rejected")
  );
}


export async function processPayment(
  amount: number,
  payer: PublicKey,
  signTransaction: ((transaction: Transaction) => Promise<Transaction>)
): Promise<PaymentResult> {
  // Add a unique transaction identifier to help debugging
  const transactionId = generateUniqueTransactionId();
  console.log(`Processing payment of ${amount} ${ACTIVE_PAYMENT_TOKEN} (ID: ${transactionId})`);
  
  try {
    // Validate inputs
    if (!amount || amount <= 0) {
      throw new Error(`Invalid payment amount: ${amount}`);
    }
    
    if (!payer) {
      throw new Error('Missing payer wallet address');
    }
    
    if (!signTransaction || typeof signTransaction !== 'function') {
      throw new Error('Missing signature function');
    }
    
    // Choose payment method based on active token
    if (ACTIVE_PAYMENT_TOKEN === "SOL") {
      return sendSOLPayment(amount, payer, signTransaction, transactionId);
    } else if (ACTIVE_PAYMENT_TOKEN === "USDC") {
      return sendUSDCPayment(amount, payer, signTransaction, transactionId);
    } else {
      throw new Error(`Unsupported payment token: ${ACTIVE_PAYMENT_TOKEN}`);
    }
  } catch (error) {
    console.error("Payment processing error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function sendUSDCPayment(
  amount: number, 
  payer: PublicKey,
  signTransaction: ((transaction: Transaction) => Promise<Transaction>),
  transactionId?: string
): Promise<PaymentResult> {
  console.log("Starting USDC payment process for", amount, "USDC", transactionId ? `(ID: ${transactionId})` : '');
  
  // If MINT_ADDRESS is null, use SOL payment instead
  if (MINT_ADDRESS === null) {
    console.log("No mint address provided, using SOL payment instead");
    return sendSOLPayment(amount, payer, signTransaction, transactionId);
  }
  
  try {
    // Create connection to Solana
    console.log("Creating connection to", RPC_ENDPOINT);
    const connection = createConnection();
    
    // Test the connection
    try {
      console.log("Testing connection...");
      const blockHeight = await connection.getBlockHeight();
      console.log("Current block height:", blockHeight);
    } catch (connError) {
      console.error("Connection test failed:", connError);
      return {
        success: false,
        error: `Connection failed: ${connError instanceof Error ? connError.message : String(connError)}`
      };
    }
    
    // Get the USDC mint info
    console.log("Fetching mint info for:", MINT_ADDRESS);
    try {
      const usdcMint = new PublicKey(MINT_ADDRESS);
      console.log("Mint address parsed successfully:", usdcMint.toString());
      
      // Try to fetch mint info
      try {
        const mintInfo = await getMint(connection, usdcMint);
        console.log("Mint info retrieved successfully:", mintInfo);
        
        // Calculate the token amount with decimals
        const tokenAmount = Math.floor(amount * (10 ** mintInfo.decimals));
        console.log("Token amount in smallest units:", tokenAmount);
        
        // Get token accounts
        try {
          const recipient = new PublicKey(RECIPIENT_WALLET_ADDRESS);
          console.log("Recipient address:", RECIPIENT_WALLET_ADDRESS);
          
          // Get or create recipient token account
          const recipientTokenAccount = await getAssociatedTokenAddress(
            usdcMint,
            recipient
          );
          console.log("Recipient token account:", recipientTokenAccount.toString());
          
          // Get payer token account
          const payerTokenAccount = await getAssociatedTokenAddress(
            usdcMint,
            payer
          );
          console.log("Payer token account:", payerTokenAccount.toString());
          
          // Check payer token account exists
          try {
            const payerTokenInfo = await connection.getAccountInfo(payerTokenAccount);
            if (!payerTokenInfo) {
              console.error("Payer token account does not exist");
              return {
                success: false,
                error: "You don't have a USDC token account. Please add USDC to your wallet first."
              };
            }
            
            // Check USDC balance
            try {
              const balance = await connection.getTokenAccountBalance(payerTokenAccount);
              console.log("Current USDC balance:", balance.value.uiAmount);
              
              if ((balance.value.uiAmount || 0) < amount) {
                return {
                  success: false,
                  error: `Insufficient USDC balance. You have ${balance.value.uiAmount} USDC but need ${amount} USDC`
                };
              }
              
              // Create transaction
              console.log("Creating transfer instruction");
              const transferInstruction = createTransferCheckedInstruction(
                payerTokenAccount,
                usdcMint,
                recipientTokenAccount,
                payer,
                tokenAmount,
                mintInfo.decimals
              );
              
              const transaction = new Transaction().add(transferInstruction);
              
              // Get latest blockhash with retry logic
              let blockHash;
              try {
                // Force a new blockhash by requesting it again
                blockHash = await connection.getLatestBlockhash('confirmed');
                console.log(`Blockhash retrieved (${transactionId}):`, blockHash.blockhash.substring(0, 10) + "...");
              } catch (blockHashError) {
                console.error("Failed to get blockhash:", blockHashError);
                return {
                  success: false,
                  error: `Failed to get recent blockhash: ${blockHashError.message}`
                };
              }
              
              transaction.recentBlockhash = blockHash.blockhash;
              transaction.feePayer = payer;
              
              console.log("Requesting signature from wallet");
              // This should trigger the wallet popup
              let signedTransaction;
              try {
                signedTransaction = await signTransaction(transaction);
                console.log("Transaction signed successfully");
              } catch (signError) {
                console.error("Signing failed:", signError);
                return {
                  success: false,
                  error: `Transaction signing failed: ${signError.message || "User may have rejected the request"}`
                };
              }
              
              // Send the signed transaction
              console.log(`Sending transaction (${transactionId})`);
              let signature;
              try {
                signature = await connection.sendRawTransaction(signedTransaction.serialize());
                console.log(`Transaction sent (${transactionId}), signature:`, signature);
              } catch (sendError) {
                console.error(`Failed to send transaction (${transactionId}):`, sendError);
                return {
                  success: false,
                  error: `Failed to send transaction: ${sendError.message}`
                };
              }
              
              // Confirm the transaction
              console.log(`Confirming transaction (${transactionId})...`);
              try {
                const confirmation = await connection.confirmTransaction({
                  signature,
                  blockhash: blockHash.blockhash,
                  lastValidBlockHeight: blockHash.lastValidBlockHeight,
                }, 'confirmed');
                
                if (confirmation.value.err) {
                  console.error(`Transaction error (${transactionId}):`, confirmation.value.err);
                  return {
                    success: false,
                    error: `Transaction error: ${confirmation.value.err.toString()}`
                  };
                }
                
                console.log(`Transaction confirmed successfully (${transactionId})`);
                return {
                  success: true,
                  transaction_hash: signature
                };
              } catch (confirmError) {
                console.error(`Transaction confirmation failed (${transactionId}):`, confirmError);
                
                // Check transaction status manually
                try {
                  const status = await connection.getSignatureStatus(signature);
                  console.log(`Transaction status (${transactionId}):`, status);
                  
                  if (status.value && !status.value.err) {
                    console.log(`Transaction appears to be successful despite confirmation error (${transactionId})`);
                    return {
                      success: true,
                      transaction_hash: signature
                    };
                  }
                } catch (statusError) {
                  console.error(`Failed to check transaction status (${transactionId}):`, statusError);
                }
                
                return {
                  success: false,
                  error: `Transaction confirmation failed: ${confirmError.message}`
                };
              }
            } catch (balanceError) {
              console.error("Error checking token balance:", balanceError);
              return {
                success: false,
                error: `Failed to check USDC balance: ${balanceError.message}`
              };
            }
          } catch (accountError) {
            console.error("Error checking token account:", accountError);
            return {
              success: false,
              error: `Token account error: ${accountError.message}`
            };
          }
        } catch (tokenAccountError) {
          console.error("Error with token accounts:", tokenAccountError);
          return {
            success: false,
            error: `Token account error: ${tokenAccountError.message}`
          };
        }
      } catch (mintError) {
        console.error("Failed to get mint info:", mintError);
        
        // Check if the mint exists
        const accountInfo = await connection.getAccountInfo(usdcMint);
        if (!accountInfo) {
          console.error("Mint account doesn't exist on this network");
          return {
            success: false,
            error: "The USDC token is not available on this network. Please make sure you're connected to Devnet."
          };
        }
        
        return {
          success: false,
          error: `Failed to get token information: ${mintError.message}`
        };
      }
    } catch (pubkeyError) {
      console.error("Error creating PublicKey:", pubkeyError);
      return {
        success: false,
        error: `Invalid mint address: ${pubkeyError.message}`
      };
    }
  } catch (error) {
    console.error("USDC payment error:", error);
    return {
      success: false,
      error: `Payment error: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

export async function sendSOLPayment(
  amount: number, // Amount in SOL
  payer: PublicKey,
  signTransaction: ((transaction: Transaction) => Promise<Transaction>),
  transactionId?: string
): Promise<PaymentResult> {
  try {
    console.log(`Starting SOL payment process for ${amount} SOL`, transactionId ? `(ID: ${transactionId})` : '');
    const connection = createConnection();
    
    // Check payer balance
    console.log("Checking SOL balance for", payer.toString());
    let balance;
    try {
      balance = await connection.getBalance(payer);
    } catch (balanceError) {
      console.error("Failed to get SOL balance:", balanceError);
      return {
        success: false,
        error: `Failed to check SOL balance: ${balanceError.message}`
      };
    }
    
    const solBalance = balance / LAMPORTS_PER_SOL;
    console.log("Current SOL balance:", solBalance);
    
    if (solBalance < amount) {
      return {
        success: false,
        error: `Insufficient SOL balance. You have ${solBalance.toFixed(4)} SOL but need ${amount} SOL`
      };
    }
    
    // Calculate lamports (1 SOL = 1,000,000,000 lamports)
    const lamports = Math.floor(amount * LAMPORTS_PER_SOL);
    console.log("Amount in lamports:", lamports);
    
    // Create a simple transfer transaction with a unique memo
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: payer,
        toPubkey: new PublicKey(RECIPIENT_WALLET_ADDRESS),
        lamports: lamports,
      })
    );
    
    // Get recent blockhash with retry logic
    let blockHash;
    try {
      // Always force a new blockhash fetch to avoid reusing the same one
      blockHash = await connection.getLatestBlockhash('confirmed');
      console.log(`Blockhash retrieved (${transactionId}):`, blockHash.blockhash.substring(0, 10) + "...");
    } catch (blockHashError) {
      console.error("Failed to get blockhash:", blockHashError);
      return {
        success: false,
        error: `Failed to get recent blockhash: ${blockHashError.message}`
      };
    }
    
    transaction.recentBlockhash = blockHash.blockhash;
    transaction.feePayer = payer;
    
    // Sign the transaction
    console.log(`Requesting wallet signature (${transactionId})...`);
    let signedTransaction;
    try {
      signedTransaction = await signTransaction(transaction);
      console.log(`Transaction signed successfully (${transactionId})`);
    } catch (signError) {
      console.error(`Signing failed (${transactionId}):`, signError);
      
      // Check if this is a user rejection
      const errorMessage = signError.message || String(signError);
      const isRejection = errorMessage.includes("rejected") || 
                          errorMessage.includes("cancelled") || 
                          errorMessage.includes("canceled") ||
                          errorMessage.includes("declined") ||
                          errorMessage.includes("User denied") ||
                          errorMessage.includes("refused") ||
                          errorMessage.includes("WalletSignTransactionError");
      
      if (isRejection) {
        console.log("User rejected the transaction");
        return {
          success: false,
          error: "Transaction was declined. You can try again when ready.",
          userRejected: true
        };
      }
      
      return {
        success: false,
        error: `Transaction signing failed: ${signError.message || "User may have rejected the request"}`
      };
    }
    
    // Send the signed transaction
    console.log(`Sending transaction (${transactionId})...`);
    let signature;
    try {
      signature = await connection.sendRawTransaction(signedTransaction.serialize());
      console.log(`Transaction sent (${transactionId}), signature:`, signature);
    } catch (sendError) {
      console.error(`Failed to send transaction (${transactionId}):`, sendError);
      
      // Check if this is a "Transaction already processed" error and provide a more helpful message
      if (sendError.message && sendError.message.includes("already been processed")) {
        return {
          success: false,
          error: `Transaction simulation failed: This transaction has already been processed. Please try again with a new transaction.`
        };
      }
      
      return {
        success: false,
        error: `Failed to send transaction: ${sendError.message}`
      };
    }
    
    // Confirm the transaction
    console.log(`Confirming transaction (${transactionId})...`);
    try {
      const confirmation = await connection.confirmTransaction({
        signature,
        blockhash: blockHash.blockhash,
        lastValidBlockHeight: blockHash.lastValidBlockHeight,
      }, 'confirmed');
      
      if (confirmation.value.err) {
        console.error(`Transaction confirmation error (${transactionId}):`, confirmation.value.err);
        return {
          success: false,
          error: `Transaction failed: ${confirmation.value.err.toString()}`
        };
      }
      
      console.log(`SOL payment successful (${transactionId})`);
      return {
        success: true,
        transaction_hash: signature
      };
    } catch (confirmError) {
      console.error(`Transaction confirmation failed (${transactionId}):`, confirmError);
      
      // Double-check transaction status in case it actually went through
      try {
        const status = await connection.getSignatureStatus(signature);
        console.log(`Transaction status (${transactionId}):`, status);
        
        if (status.value && !status.value.err) {
          console.log(`Transaction appears to be successful despite confirmation error (${transactionId})`);
          return {
            success: true,
            transaction_hash: signature
          };
        }
      } catch (statusError) {
        console.error(`Failed to check transaction status (${transactionId}):`, statusError);
      }
      
      return {
        success: false,
        error: `Transaction confirmation failed: ${confirmError.message}`
      };
    }
  } catch (error) {
    console.error(`SOL payment error (${transactionId || 'unknown'}):`);
    if (error instanceof Error) {
      console.error(error.message);
      console.error(error.stack);
    } else {
      console.error(String(error));
    }
    
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}