// src/app/api/payment/verify/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { apiLogger } from '@/utils/logger';
import { ensureServerInitialized } from '@/lib/server/init';
import { getSupabaseClient } from '@/lib/supabase';
import { nanoid } from 'nanoid';
import { Connection, PublicKey } from '@solana/web3.js';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { ACTIVE_NETWORK } from '@/utils/constants';

// Determine the correct RPC endpoint based on environment
const getRpcEndpoint = () => {
  // Use the network from constants, ensuring it's compared as a string
  const network = String(ACTIVE_NETWORK);
  
  // Compare as strings to avoid TypeScript errors
  if (network === 'mainnet-beta' || network === 'mainnet') {
    return 'https://api.mainnet-beta.solana.com';
  } else if (network === 'devnet') {
    return 'https://api.devnet.solana.com';
  } else if (network === 'testnet') {
    return 'https://api.testnet.solana.com';
  } else {
    // For any other network or custom networks
    apiLogger.debug('Using default devnet endpoint, network was:', { network });
    return 'https://api.devnet.solana.com'; // Default to devnet
  }
};

/**
 * API endpoint to verify a transaction on the blockchain
 * This runs on the server and handles blockchain verification
 */
export async function POST(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') || nanoid();

  try {
    // Ensure server is initialized before processing
    await ensureServerInitialized();
    
    // Get Supabase client
    const supabase = getSupabaseClient();
    if (!supabase) {
      apiLogger.error('Database connection not available', { requestId });
      return NextResponse.json(
        { success: false, error: 'Database connection not available' },
        { status: 500 }
      );
    }
    
    // Parse request body with proper error handling
    let body;
    try {
      // This is where the "Unexpected end of JSON input" error is happening
      body = await request.json();
      
      // Log the received body for debugging
      apiLogger.debug('Received request body', {
        requestId,
        bodyKeys: body ? Object.keys(body) : 'null',
        hasTransactionHash: !!body?.transactionHash,
        hasTransactionId: !!body?.transactionId
      });
    } catch (parseError) {
      // Improve error handling for JSON parse errors
      const errorMessage = parseError instanceof Error ? parseError.message : String(parseError);
      
      // Added more detailed error logging
      apiLogger.error('Failed to parse request JSON', new Error(errorMessage), { 
        requestId,
        contentType: request.headers.get('content-type') || 'unknown',
        contentLength: request.headers.get('content-length') || 'unknown',
        errorName: parseError instanceof Error ? parseError.name : 'Unknown',
        errorStack: parseError instanceof Error ? parseError.stack : 'No stack trace'
      });
      
      // Try to read the raw request body as text for debugging
      try {
        const clonedRequest = request.clone();
        clonedRequest.text().then(text => {
          apiLogger.debug('Raw request body', {
            requestId,
            rawBody: text.substring(0, 200) + (text.length > 200 ? '...' : ''),
            bodyLength: text.length
          });
        }).catch(e => {
          apiLogger.debug('Failed to read raw request body', { error: String(e) });
        });
      } catch (cloneError) {
        apiLogger.debug('Failed to clone request', { error: String(cloneError) });
      }
      
      return NextResponse.json(
        { success: false, error: 'Invalid JSON in request body', details: errorMessage },
        { status: 400 }
      );
    }
    
    // Validate required fields with null safety
    const transactionHash = body?.transactionHash;
    const transactionId = body?.transactionId;
    
    if (!transactionHash) {
      apiLogger.error('Missing transaction hash', { requestId, body: JSON.stringify(body) });
      return NextResponse.json(
        { success: false, error: 'Transaction hash is required' },
        { status: 400 }
      );
    }

    // Add debug logging
    apiLogger.info('Processing verification request', {
      requestId,
      transactionHash,
      transactionId: transactionId || 'not_provided'
    });
    
    // Create a connection to the Solana cluster
    const endpoint = getRpcEndpoint();
    apiLogger.debug('Connecting to Solana RPC', { endpoint, requestId });
    
    const connection = new Connection(endpoint, 'confirmed');
    
    try {
      // Fetch transaction details with a timeout
      apiLogger.debug('Fetching transaction details', { transactionHash, requestId });
      
      // Add a timeout promise to prevent hanging
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Transaction verification timed out')), 15000);
      });
      
      // Use Promise.race to implement a timeout
      const transactionDetailsPromise = connection.getTransaction(transactionHash, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0
      });
      
      const transactionDetails = await Promise.race([
        transactionDetailsPromise,
        timeoutPromise
      ]) as Awaited<typeof transactionDetailsPromise>;
      
      // Handle null response case
      if (!transactionDetails) {
        apiLogger.warn('Transaction not found on blockchain', {
          requestId,
          transactionHash
        });
        
        return NextResponse.json({
          success: false,
          verified: false,
          status: 'NOT_FOUND',
          message: 'Transaction not found on blockchain'
        });
      }
      
      // Check if the transaction was confirmed
      const confirmed = transactionDetails.meta?.err === null;
      
      // If transaction ID is provided, update the record in the database
      if (transactionId && confirmed) {
        try {
          const { error } = await supabase
            .from('transaction_records')
            .update({
              signature: 'verified',
              confirmed_at: new Date().toISOString()
            })
            .eq('tx_id', transactionId);
            
          if (error) {
            apiLogger.warn('Failed to update transaction record', { 
              requestId, 
              transactionId, 
              error: error.message 
            });
          }
        } catch (dbError) {
          apiLogger.error('Database error during transaction update', 
            dbError instanceof Error ? dbError : new Error(String(dbError)), 
            { requestId, transactionId }
          );
          // Don't return an error here, continue with the verification response
        }
      }
      
      // Prepare a safe response with null checking
      const safeDetails = {
        slot: transactionDetails.slot || 0,
        blockTime: transactionDetails.blockTime || 0,
        fee: transactionDetails.meta?.fee || 0,
        err: transactionDetails.meta?.err || null
      };
      
      apiLogger.info('Transaction verification completed', {
        requestId,
        transactionHash,
        confirmed,
        ...safeDetails
      });
      
      return NextResponse.json({
        success: true,
        verified: confirmed,
        status: confirmed ? 'CONFIRMED' : 'FAILED',
        details: safeDetails
      });
      
    } catch (blockchainError) {
      const errorMessage = blockchainError instanceof Error ? blockchainError.message : String(blockchainError);
      apiLogger.error('Error verifying transaction on blockchain', new Error(errorMessage), {
        requestId,
        transactionHash,
        errorType: blockchainError instanceof Error ? blockchainError.name : typeof blockchainError,
        errorStack: blockchainError instanceof Error ? blockchainError.stack : 'No stack trace available'
      });
      
      return NextResponse.json({
        success: false,
        verified: false,
        status: 'ERROR',
        message: 'Error verifying transaction on blockchain',
        error: errorMessage
      });
    }
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    apiLogger.error('Error in transaction verification API', error instanceof Error ? error : new Error(errorMessage), { 
      requestId,
      errorType: error instanceof Error ? error.name : typeof error,
      errorStack: error instanceof Error ? error.stack : 'No stack trace available'
    });
    
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to verify transaction',
        details: errorMessage
      },
      { status: 500 }
    );
  }
} 