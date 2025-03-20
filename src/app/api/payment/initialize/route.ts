// src/app/api/payment/initialize/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { apiLogger } from '@/utils/logger';
import { ensureServerInitialized } from '@/lib/server/init';
import { getSupabaseClient } from '@/lib/server/supabase';
import { nanoid } from 'nanoid';
import { PaymentStatus } from '@/lib/payment/types';
import { RECIPIENT_WALLET_ADDRESS } from '@/utils/constants';

/**
 * API endpoint to initialize a payment in the database
 * This runs on the server and handles all database operations
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
    
    // Parse request body
    let body;
    try {
      body = await request.json();
      
      // Add debug logging for received data
      apiLogger.debug('Parsed initialization request', {
        requestId,
        bodyKeys: Object.keys(body || {}),
        hasImageId: !!body?.imageId,
        hasAmount: body?.amount !== undefined,
        hasWalletAddress: !!body?.walletAddress
      });
    } catch (parseError) {
      const errorMessage = parseError instanceof Error ? parseError.message : String(parseError);
      apiLogger.error('Failed to parse initialization request JSON', new Error(errorMessage), { 
        requestId,
        contentType: request.headers.get('content-type'),
        contentLength: request.headers.get('content-length')
      });
      
      return NextResponse.json(
        { success: false, error: 'Invalid JSON in request body', details: errorMessage },
        { status: 400 }
      );
    }
    
    // Validate required fields
    const { imageId, amount, walletAddress, token = 'SOL' } = body || {};
    
    if (!imageId || amount === undefined || !walletAddress) {
      apiLogger.error('Missing required payment parameters', {
        requestId,
        hasImageId: !!imageId,
        hasAmount: amount !== undefined,
        hasWalletAddress: !!walletAddress
      });
      
      return NextResponse.json(
        { 
          success: false,
          error: 'Missing required parameters',
          details: {
            missing: [
              !imageId && 'imageId',
              amount === undefined && 'amount',
              !walletAddress && 'walletAddress'
            ].filter(Boolean)
          }
        },
        { status: 400 }
      );
    }
    
    // Generate a unique payment ID
    const paymentId = `pay_${Date.now()}_${nanoid(6)}`;
    
    // Create a transaction record in the database
    // Note: attempt_count has a default value in the schema
    // signature and confirmed_at are null at initialization
    const { data: transaction, error: transactionError } = await supabase
      .from('transaction_records')
      .insert({
        transaction_hash: paymentId, // Use paymentId as the transaction hash until we have a real one
        image_id: imageId,
        amount,
        token,
        sender_wallet: walletAddress,
        recipient_wallet: RECIPIENT_WALLET_ADDRESS,
        status: PaymentStatus.INITIALIZED,
        created_at: new Date().toISOString(),
        unique_nonce: nanoid(16) // Required field, VARCHAR(16) NOT NULL
      })
      .select()
      .single();
    
    if (transactionError) {
      apiLogger.error('Failed to create transaction record', new Error(transactionError.message), {
        requestId,
        paymentId,
        imageId
      });
      
      return NextResponse.json(
        { 
          success: false,
          error: 'Failed to create transaction record',
          details: transactionError.message
        },
        { status: 500 }
      );
    }
    
    // Debug logging to see what we're returning to the client
    apiLogger.debug('===== DEBUG: PAYMENT INITIALIZE API =====');
    apiLogger.debug('Created transaction:', {
      tx_id: transaction.tx_id,
      type: typeof transaction.tx_id,
      transaction_hash: transaction.transaction_hash
    });
    apiLogger.debug('Full transaction object:', transaction);
    
    // Update the image status
    const { error: imageError } = await supabase
      .from('images')
      .update({
        status: PaymentStatus.INITIALIZED
      })
      .eq('image_id', imageId);
    
    if (imageError) {
      apiLogger.warn('Transaction created but failed to update image status', {
        requestId,
        paymentId,
        imageId,
        error: imageError.message
      });
      
      // Return success with warning since the transaction was created
      return NextResponse.json({
        success: true,
        paymentId,
        transactionId: transaction.tx_id,
        status: PaymentStatus.INITIALIZED,
        warning: 'Image status could not be updated'
      });
    }
    
    apiLogger.info('Payment initialized successfully', {
      requestId,
      paymentId,
      transactionId: transaction.tx_id,
      imageId
    });
    
    return NextResponse.json({
      success: true,
      paymentId,
      transactionId: transaction.tx_id,
      status: PaymentStatus.INITIALIZED
    });
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    apiLogger.error('Error initializing payment', new Error(errorMessage), { requestId });
    
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to initialize payment',
        details: errorMessage
      },
      { status: 500 }
    );
  }
} 