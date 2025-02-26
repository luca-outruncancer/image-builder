// src/app/api/upload/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { writeFile } from 'fs/promises';
import path from 'path';
import { nanoid } from 'nanoid';
import { createClient } from '@supabase/supabase-js';
import { verifyWalletOwnership } from '@/utils/solana';

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const positionString = formData.get('position') as string;
    const sizeString = formData.get('size') as string;
    const paymentString = formData.get('payment') as string;

    if (!file || !positionString || !sizeString) {
      return NextResponse.json(
        { error: 'File, position, and size are required' },
        { status: 400 }
      );
    }

    const position = JSON.parse(positionString);
    const size = JSON.parse(sizeString);
    const payment = paymentString ? JSON.parse(paymentString) : null;

    // Generate a unique ID for the file
    const id = nanoid();
    const fileExtension = file.name.split('.').pop();
    const fileName = `${id}.${fileExtension}`;
    
    // Save locally for development, use Vercel Blob in production
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    
    // In local development, save to public directory
    const filePath = path.join(process.cwd(), 'public/uploads', fileName);
    await writeFile(filePath, buffer);
    
    // For local development, use a URL path to the local file
    const url = `/uploads/${fileName}`;
    
    // Save record to database
    const { data: record, error } = await supabase
      .from('images')
      .insert({
        image_location: url,
        start_position_x: position.x,
        start_position_y: position.y,
        size_x: size.width,
        size_y: size.height,
        active: true,
        wallet_address: payment?.wallet || null,
        transaction_hash: payment?.transaction_hash || null,
        payment_status: payment?.transaction_hash ? 'paid' : 'pending',
        cost: payment?.amount || null,
        currency: payment?.currency || null
      })
      .select()
      .single();
    
    if (error) {
      console.error('Database error:', error);
      return NextResponse.json(
        { error: 'Failed to save image to database' },
        { status: 500 }
      );
    }
    
    // If payment info is provided, save to transactions table
    if (payment?.wallet && payment?.transaction_hash) {
      const { error: txError } = await supabase
        .from('transactions')
        .insert({
          image_id: record.image_id,
          solana_wallet: payment.wallet,
          transaction_hash: payment.transaction_hash,
          amount: payment.amount,
          currency: payment.currency,
          timestamp: new Date().toISOString()
        });
      
      if (txError) {
        console.error('Transaction save error:', txError);
        // Continue anyway since the image upload succeeded
      }
    }
    
    return NextResponse.json({
      success: true,
      url,
      record
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Failed to upload image' },
      { status: 500 }
    );
  }
}