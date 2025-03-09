// src/app/api/verify-transaction/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { Connection, PublicKey, TransactionSignature, TransactionStatus } from '@solana/web3.js';
import { RPC_ENDPOINT, RECIPIENT_WALLET_ADDRESS, ACTIVE_PAYMENT_TOKEN } from '@/utils/constants';
import { supabase } from '@/lib/supabase';
import { createImageRecord, updateImageStatus, IMAGE_STATUS } from '@/lib/imageStorage';
import { ErrorCategory, PaymentStatus } from '@/lib/payment/types';

// Define rate limiting state object (will reset on server restart)
const ipRateLimits: Record<string, { count: number, timestamp: number }> = {};
const MAX_REQUESTS_PER_MINUTE = 20;

// Create a connection to Solana
const connection = new Connection(RPC_ENDPOINT, 'confirmed');

export async function POST(request: NextRequest) {
  // Get IP address for rate limiting
  const ip = request.headers.get('x-forwarded-for') || 'unknown';
  
  // Implement basic rate limiting
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please try again later.' },
      { status: 429 }
    );
  }
  
  try {
    // Parse request body
    const body = await request.json();
    
    // Validate request parameters
    if (!body.signature || !body.imageId) {
      return NextResponse.json(
        { error: 'Missing required parameters: signature and imageId' },
        { status: 400 }
      );
    }
    
    const { signature, imageId } = body;
    
    console.log(`[TransactionVerify] Verifying transaction:`, {
      signature: signature.substring(0, 8) + '...',
      imageId
    });
    
    // Verify the transaction on the blockchain
    const result = await verifyTransaction(signature, imageId);
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('[TransactionVerify] Error:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to verify transaction',
        message: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

/**
 * Verifies a Solana transaction and updates image status accordingly
 */
async function verifyTransaction(signature: string, imageId: number): Promise<any> {
  try {
    // Get transaction from blockchain
    const transaction = await connection.getTransaction(signature, {
      maxSupportedTransactionVersion: 0
    });
    
    if (!transaction) {
      console.error(`[TransactionVerify] Transaction not found: ${signature}`);
      return { 
        success: false, 
        status: PaymentStatus.FAILED,
        error: {
          category: ErrorCategory.BLOCKCHAIN_ERROR,
          message: 'Transaction not found on the blockchain',
          retryable: false
        }
      };
    }
    
    // Log transaction data for debugging
    console.log(`[TransactionVerify] Transaction found:`, {
      signature: signature.substring(0, 8) + '...',
      blockTime: transaction.blockTime,
      slot: transaction.slot,
      meta: {
        fee: transaction.meta?.fee,
        err: transaction.meta?.err,
        status: transaction.meta?.err ? 'failed' : 'success'
      }
    });
    
    // Check for transaction errors
    if (transaction.meta?.err) {
      console.error(`[TransactionVerify] Transaction failed:`, transaction.meta.err);
      
      // Update image status to payment failed
      await updateImageStatus(imageId, IMAGE_STATUS.PAYMENT_FAILED);
      
      return { 
        success: false, 
        status: PaymentStatus.FAILED,
        error: {
          category: ErrorCategory.BLOCKCHAIN_ERROR,
          message: 'Transaction failed on the blockchain',
          retryable: false,
          details: transaction.meta.err
        }
      };
    }
    
    // Verify transaction details
    // 1. Check recipient (this is critical)
    const isRecipientValid = validateRecipient(transaction, RECIPIENT_WALLET_ADDRESS);
    if (!isRecipientValid) {
      console.error(`[TransactionVerify] Invalid recipient address for transaction: ${signature}`);
      
      // Update image status to payment failed
      await updateImageStatus(imageId, IMAGE_STATUS.PAYMENT_FAILED);
      
      return { 
        success: false, 
        status: PaymentStatus.FAILED,
        error: {
          category: ErrorCategory.BLOCKCHAIN_ERROR,
          message: 'Transaction was not sent to the correct recipient',
          retryable: false
        }
      };
    }
    
    // 2. Validate amount (implementation depends on token type)
    // TODO: Implement amount validation based on token type (SOL vs SPL)
    
    // 3. Verify transaction is confirmed
    if (!transaction.meta?.computeUnitsConsumed) {
      console.warn(`[TransactionVerify] Transaction may not be fully confirmed: ${signature}`);
    }
    
    // If everything is valid, update image status to confirmed
    try {
      await updateImageStatus(imageId, IMAGE_STATUS.CONFIRMED, true);
      
      console.log(`[TransactionVerify] Transaction verified and image updated:`, {
        signature: signature.substring(0, 8) + '...',
        imageId,
        status: 'CONFIRMED'
      });
      
      return { 
        success: true, 
        status: PaymentStatus.CONFIRMED,
        transactionHash: signature,
        blockTime: transaction.blockTime,
        slot: transaction.slot
      };
    } catch (dbError) {
      console.error(`[TransactionVerify] Database error updating image status:`, dbError);
      
      return { 
        success: true, 
        status: PaymentStatus.CONFIRMED,
        transactionHash: signature,
        warning: 'Transaction verified but failed to update image status in database'
      };
    }
  } catch (error) {
    console.error(`[TransactionVerify] Error verifying transaction:`, error);
    
    return { 
      success: false, 
      status: PaymentStatus.FAILED,
      error: {
        category: ErrorCategory.UNKNOWN_ERROR,
        message: 'Error verifying transaction',
        retryable: true,
        originalError: error
      }
    };
  }
}

/**
 * Validates that the transaction recipient matches the expected recipient
 */
function validateRecipient(transaction: any, expectedRecipient: string): boolean {
  try {
    // For SOL transfers
    if (ACTIVE_PAYMENT_TOKEN === 'SOL') {
      // Check in preTokenBalances and postTokenBalances
      const transfers = transaction.meta?.postTokenBalances || [];
      const expectedRecipientPubkey = new PublicKey(expectedRecipient);
      
      // Extract recipient from instructions
      for (const instruction of transaction.transaction.message.instructions) {
        // SOL transfer will typically have program ID = System Program
        if (instruction.programId.toString() === '11111111111111111111111111111111') {
          // Parse the data to find the destination
          // This is a simplified check and should be enhanced for production
          const accounts = instruction.accounts || [];
          if (accounts.length >= 2) {
            const destination = transaction.transaction.message.accountKeys[accounts[1]];
            if (destination.toString() === expectedRecipient) {
              return true;
            }
          }
        }
      }
    } else {
      // For SPL token transfers (simplified, should be enhanced)
      const tokenTransfers = transaction.meta?.postTokenBalances || [];
      const expectedRecipientPubkey = new PublicKey(expectedRecipient);
      
      for (const transfer of tokenTransfers) {
        if (transfer.owner === expectedRecipient) {
          return true;
        }
      }
    }
    
    // No matching transfer found
    return false;
  } catch (error) {
    console.error(`[TransactionVerify] Error validating recipient:`, error);
    return false;
  }
}

/**
 * Check rate limit for an IP address
 * @returns true if within rate limit, false if exceeded
 */
function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const minute = 60 * 1000;
  
  // Initialize rate limit data for this IP if not exists
  if (!ipRateLimits[ip]) {
    ipRateLimits[ip] = { count: 0, timestamp: now };
  }
  
  // Reset counter if more than a minute has passed
  if (now - ipRateLimits[ip].timestamp > minute) {
    ipRateLimits[ip] = { count: 0, timestamp: now };
  }
  
  // Increment counter
  ipRateLimits[ip].count++;
  
  // Check if limit is exceeded
  if (ipRateLimits[ip].count > MAX_REQUESTS_PER_MINUTE) {
    console.warn(`[RateLimit] IP ${ip} exceeded rate limit`);
    return false;
  }
  
  return true;
}
