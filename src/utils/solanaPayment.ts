// src/utils/solanaPayment.ts
'use client';

import { 
  Connection, 
  PublicKey, 
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL
} from '@solana/web3.js';
import { 
  createTransferCheckedInstruction, 
  getAssociatedTokenAddress, 
  getMint
} from '@solana/spl-token';
import { RECIPIENT_WALLET_ADDRESS, MINT_ADDRESS, ACTIVE_PAYMENT_TOKEN } from '@/utils/constants';
import { RPC_ENDPOINT } from '@/lib/solana/walletConfig';

export interface PaymentResult {
  success: boolean;
  transaction_hash?: string;
  error?: string;
}

// Check if required imports are available
console.log("@solana/web3.js imported:", typeof Connection !== 'undefined');
console.log("RPC_ENDPOINT:", RPC_ENDPOINT);
console.log("Active payment token:", ACTIVE_PAYMENT_TOKEN);

export async function processPayment(
  amount: number,
  payer: PublicKey,
  signTransaction: ((transaction: Transaction) => Promise<Transaction>)
): Promise<PaymentResult> {
  console.log(`Processing payment of ${amount} ${ACTIVE_PAYMENT_TOKEN}`);
  
  // Choose payment method based on active token
  if (ACTIVE_PAYMENT_TOKEN === "SOL") {
    return sendSOLPayment(amount, payer, signTransaction);
  } else {
    return sendUSDCPayment(amount, payer, signTransaction);
  }
}

export async function sendUSDCPayment(
  amount: number, 
  payer: PublicKey,
  signTransaction: ((transaction: Transaction) => Promise<Transaction>)
): Promise<PaymentResult> {
  console.log("Starting USDC payment process for", amount, "USDC");
  
  // If MINT_ADDRESS is null, use SOL payment instead
  if (MINT_ADDRESS === null) {
    console.log("No mint address provided, using SOL payment instead");
    return sendSOLPayment(amount, payer, signTransaction);
  }
  
  try {
    // Create connection to Solana
    console.log("Creating connection to", RPC_ENDPOINT);
    const connection = new Connection(RPC_ENDPOINT);
    
    // Test the connection
    try {
      console.log("Testing connection...");
      const blockHeight = await connection.getBlockHeight();
      console.log("Current block height:", blockHeight);
    } catch (connError) {
      console.error("Connection test failed:", connError);
      return {
        success: false,
        error: `Connection test failed: ${connError.message}`
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
              const blockHash = await connection.getLatestBlockhash();
              transaction.recentBlockhash = blockHash.blockhash;
              transaction.feePayer = payer;
              
              console.log("Requesting signature from wallet");
              // This should trigger the wallet popup
              const signedTransaction = await signTransaction(transaction);
              console.log("Transaction signed");
              
              console.log("Sending transaction");
              const signature = await connection.sendRawTransaction(signedTransaction.serialize());
              console.log("Transaction sent, signature:", signature);
              
              const confirmation = await connection.confirmTransaction({
                signature,
                blockhash: blockHash.blockhash,
                lastValidBlockHeight: blockHash.lastValidBlockHeight,
              });
              
              if (confirmation.value.err) {
                console.error("Transaction error:", confirmation.value.err);
                return {
                  success: false,
                  error: `Transaction error: ${confirmation.value.err.toString()}`
                };
              }
              
              console.log("Transaction confirmed successfully");
              return {
                success: true,
                transaction_hash: signature
              };
              
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
  signTransaction: ((transaction: Transaction) => Promise<Transaction>)
): Promise<PaymentResult> {
  try {
    console.log("Starting SOL payment process for", amount, "SOL");
    const connection = new Connection(RPC_ENDPOINT);
    
    // Check payer balance
    const balance = await connection.getBalance(payer);
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
    
    // Create a simple transfer transaction
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: payer,
        toPubkey: new PublicKey(RECIPIENT_WALLET_ADDRESS),
        lamports: lamports,
      })
    );
    
    // Get recent blockhash
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = payer;
    
    // Sign the transaction
    console.log("Requesting wallet signature...");
    const signedTransaction = await signTransaction(transaction);
    console.log("Transaction signed");
    
    // Send the transaction
    console.log("Sending transaction...");
    const signature = await connection.sendRawTransaction(signedTransaction.serialize());
    console.log("Transaction sent, signature:", signature);
    
    // Confirm transaction
    console.log("Confirming transaction...");
    const confirmation = await connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight
    });
    
    if (confirmation.value.err) {
      console.error("Transaction confirmation error:", confirmation.value.err);
      return {
        success: false,
        error: `Transaction failed: ${confirmation.value.err.toString()}`
      };
    }
    
    console.log("SOL payment successful");
    return {
      success: true,
      transaction_hash: signature
    };
  } catch (error) {
    console.error("SOL payment error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}