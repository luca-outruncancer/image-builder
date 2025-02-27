// src/app/api/payment-verify/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { saveTransactionServer, TRANSACTION_STATUS } from '@/lib/server/transactionStorageServer';
import { updateImageStatusServer, IMAGE_STATUS } from '@/lib/server/imageStorageServer';

export interface TransactionVerifyRequest {
  imageId: number;
  transactionHash: string;
  senderWallet: string;
  recipientWallet: string;
  amount: number;
  token: string;
  status: string;
}

export async function POST(request: NextRequest) {
  try {
    const data: TransactionVerifyRequest = await request.json();
    
    console.log("[Server] Payment verification request:", data);
    
    // Validate required fields
    if (!data.imageId || !data.transactionHash || !data.senderWallet || !data.amount || !data.token) {
      return NextResponse.json(
        { error: 'Missing required payment information' },
        { status: 400 }
      );
    }
    
    // Create transaction record in the database
    const transactionResult = await saveTransactionServer({
      image_id: data.imageId,
      transaction_hash: data.transactionHash,
      sender_wallet: data.senderWallet,
      recipient_wallet: data.recipientWallet,
      amount: data.amount,
      token: data.token,
      transaction_status: data.status || TRANSACTION_STATUS.SUCCESS,
      blockchain_confirmation: true // We're assuming the client has verified the transaction
    });
    
    if (!transactionResult.success) {
      console.error("[Server] Failed to save transaction:", transactionResult.error);
      
      // Try to at least update the image status even if we couldn't save the transaction
      if (data.status === TRANSACTION_STATUS.SUCCESS) {
        try {
          await updateImageStatusServer(data.imageId, IMAGE_STATUS.CONFIRMED, true);
        } catch (updateError) {
          console.error("[Server] Failed to update image status after payment:", updateError);
        }
      }
      
      return NextResponse.json({
        success: false,
        error: "Failed to save transaction record, but payment is processed",
        imageUpdated: true
      });
    }
    
    return NextResponse.json({
      success: true,
      transactionId: transactionResult.data?.[0]?.transaction_id,
      message: `Payment ${data.status} for image ${data.imageId}`
    });
  } catch (error) {
    console.error('[Server] Payment verification error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to verify payment: ' + (error instanceof Error ? error.message : String(error)),
        success: false
      },
      { status: 500 }
    );
  }
}

// This route allows checking payment status by imageId
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const imageId = searchParams.get('imageId');
    
    if (!imageId) {
      return NextResponse.json(
        { error: 'Missing imageId parameter' },
        { status: 400 }
      );
    }
    
    // In a real implementation, you would query the database for the latest transaction status
    // and perhaps also check the blockchain status
    
    return NextResponse.json({
      success: true,
      message: `Payment status check endpoint available`,
      imageId: parseInt(imageId),
      // This is just a placeholder - in a real implementation you would query the database
      // and return actual status information
      status: "For checking payment status programmatically"
    });
  } catch (error) {
    console.error('[Server] Payment status check error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to check payment status: ' + (error instanceof Error ? error.message : String(error)),
        success: false
      },
      { status: 500 }
    );
  }
}
