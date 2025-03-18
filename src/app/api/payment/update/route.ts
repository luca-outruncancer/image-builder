import { NextRequest, NextResponse } from 'next/server';
import { apiLogger } from '@/utils/logger';
import { ensureServerInitialized } from '@/lib/server/init';
import { getSupabaseClient } from '@/lib/supabase';
import { nanoid } from 'nanoid';
import { PaymentStatus } from '@/lib/payment/types';
import { updateImageInCache } from '@/lib/server/imageCache';
/**
 * API endpoint to update payment status in the database
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
      apiLogger.debug('Parsed request body', {
        requestId,
        bodyKeys: Object.keys(body || {}),
        hasTransactionId: !!body?.transactionId,
        hasPaymentId: !!body?.paymentId,
        hasStatus: !!body?.status
      });
    } catch (parseError) {
      const errorMessage = parseError instanceof Error ? parseError.message : String(parseError);
      apiLogger.error('Failed to parse request JSON', new Error(errorMessage), { 
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
    const { 
      transactionId, 
      paymentId, 
      status, 
      transactionHash = null, 
      blockchainConfirmation = false 
    } = body || {};
    
    // Add debug logging
    apiLogger.debug('===== DEBUG: PAYMENT UPDATE API =====');
    apiLogger.debug('Request params:', { transactionId, paymentId, status });
    
    if (!transactionId || !status) {
      apiLogger.error('Missing required payment update parameters', {
        requestId,
        hasTransactionId: !!transactionId,
        hasStatus: !!status
      });
      
      return NextResponse.json(
        { 
          success: false,
          error: 'Missing required parameters',
          details: {
            missing: [
              !transactionId && 'transactionId',
              !status && 'status'
            ].filter(Boolean)
          }
        },
        { status: 400 }
      );
    }
    
    // Debug: Check all transaction records to find a match
    const { data: allTransactions, error: allTxError } = await supabase
      .from('transaction_records')
      .select('tx_id, transaction_hash, status')
      .order('created_at', { ascending: false })
      .limit(5);
      
    apiLogger.debug('===== DEBUG: Recent transactions =====');
    apiLogger.debug('Looking for tx_id:', transactionId);
    apiLogger.debug('Recent transactions:', allTransactions);
    
    // Try alternative query by payment ID (transaction_hash)
    if (paymentId) {
      const { data: byHash, error: hashError } = await supabase
        .from('transaction_records')
        .select('tx_id, transaction_hash, status')
        .eq('transaction_hash', paymentId)
        .single();
        
      apiLogger.debug('===== DEBUG: Alternative lookup by paymentId =====');
      apiLogger.debug('Looking for transaction_hash:', paymentId);
      apiLogger.debug('Result:', byHash || 'Not found');
      apiLogger.debug('Error:', hashError || 'No error');
      
      // If we found a match but it has a different tx_id, that might be our issue
      if (byHash && byHash.tx_id !== parseInt(transactionId) && !isNaN(parseInt(transactionId))) {
        apiLogger.debug('===== DEBUG: MISMATCH DETECTED =====');
        apiLogger.debug('Client sent tx_id:', transactionId);
        apiLogger.debug('Database has tx_id:', byHash.tx_id, 'for the same payment');
      }
    }
    
    // First, get the current transaction record
    const { data: currentTransaction, error: fetchError } = await supabase
      .from('transaction_records')
      .select('attempt_count, tx_id, transaction_hash')
      .eq('tx_id', transactionId)
      .single();
      
    apiLogger.debug('===== DEBUG: Query result =====');
    apiLogger.debug('Query for tx_id:', transactionId);
    apiLogger.debug('Result:', currentTransaction || 'Not found');
    apiLogger.debug('Error:', fetchError || 'No error');
      
    if (fetchError) {
      apiLogger.error('Failed to fetch transaction record', new Error(fetchError.message), {
        requestId,
        transactionId
      });
      
      return NextResponse.json(
        { 
          success: false,
          error: 'Failed to fetch transaction record',
          details: fetchError.message
        },
        { status: 500 }
      );
    }
    
    // Update the transaction record in the database
    const { data: transaction, error: transactionError } = await supabase
      .from('transaction_records')
      .update({
        status,
        transaction_hash: transactionHash || undefined,
        signature: blockchainConfirmation ? 'confirmed' : undefined,
        confirmed_at: blockchainConfirmation ? new Date().toISOString() : undefined,
        attempt_count: (currentTransaction?.attempt_count || 0) + 1
      })
      .eq('tx_id', transactionId)
      .select()
      .single();
    
    if (transactionError) {
      apiLogger.error('Failed to update transaction record', new Error(transactionError.message), {
        requestId,
        transactionId,
        status
      });
      
      return NextResponse.json(
        { 
          success: false,
          error: 'Failed to update transaction record',
          details: transactionError.message
        },
        { status: 500 }
      );
    }
    
    // If this is a final status, also update the image status
    let imageUpdateResult: { success: boolean; error?: string } = { success: true };
    
    if (status === PaymentStatus.CONFIRMED || status === PaymentStatus.FAILED) {
      const imageId = transaction.image_id;
      
      // Update the image status in the database
      const { error: imageError } = await supabase
        .from('images')
        .update({
          status,
          updated_at: new Date().toISOString()
        })
        .eq('image_id', imageId);
      
      if (imageError) {
        apiLogger.warn('Transaction updated but failed to update image status', {
          requestId,
          transactionId,
          imageId,
          status,
          error: imageError.message
        });
        
        imageUpdateResult = { 
          success: false, 
          error: 'Failed to update image status' 
        };
      } else {
        // Update the image cache if the status changed
        try {
          // First get the current image data
          const { data: imageData } = await supabase
            .from('images')
            .select('*')
            .eq('image_id', imageId)
            .single();
            
          if (imageData) {
            await updateImageInCache({
              image_id: imageData.image_id,
              image_location: imageData.image_location,
              start_position_x: imageData.start_position_x,
              start_position_y: imageData.start_position_y,
              size_x: imageData.size_x,
              size_y: imageData.size_y,
              status: imageData.status,
              sender_wallet: imageData.sender_wallet,
              created_at: imageData.created_at,
              updated_at: imageData.updated_at,
              payment_attempts: imageData.payment_attempts || 0
            });
            
            apiLogger.debug('Updated image cache after status change', {
              imageId,
              status
            });
          }
        } catch (cacheError) {
          // Non-critical error, just log it
          apiLogger.warn('Failed to update image cache', cacheError instanceof Error ? cacheError : new Error(String(cacheError)), {
            imageId,
            status
          });
        }
      }
    }
    
    apiLogger.info('Payment status updated', {
      requestId,
      transactionId,
      paymentId,
      newStatus: status,
      imageUpdated: imageUpdateResult.success
    });
    
    return NextResponse.json({
      success: true,
      transactionId,
      paymentId,
      status,
      imageUpdateResult
    });
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    apiLogger.error('Error updating payment status', new Error(errorMessage), { requestId });
    
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to update payment status',
        details: errorMessage
      },
      { status: 500 }
    );
  }
} 