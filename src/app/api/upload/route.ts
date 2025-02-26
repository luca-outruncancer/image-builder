// src/app/api/upload/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { writeFile } from 'fs/promises';
import path from 'path';
import { nanoid } from 'nanoid';
import { createClient } from '@supabase/supabase-js';

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

    console.log("Upload request received:", { position, size, payment });

    // Generate a unique ID for the file
    const id = nanoid();
    const fileExtension = file.name.split('.').pop();
    const fileName = `${id}.${fileExtension}`;
    
    try {
      // Save locally for development, use Vercel Blob in production
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      
      // Create directory if it doesn't exist
      const uploadDir = path.join(process.cwd(), 'public/uploads');
      try {
        await writeFile(path.join(uploadDir, '.gitkeep'), '');
      } catch (dirError) {
        console.log("Upload directory already exists or couldn't be created");
      }
      
      // In local development, save to public directory
      const filePath = path.join(uploadDir, fileName);
      await writeFile(filePath, buffer);
      
      console.log("File saved successfully at:", filePath);
    } catch (fileError) {
      console.error("Error saving file:", fileError);
      return NextResponse.json(
        { error: 'Failed to save file' },
        { status: 500 }
      );
    }
    
    // For local development, use a URL path to the local file
    const url = `/uploads/${fileName}`;
    
    // Save record to database
    try {
      console.log("Saving image record to database");
      
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
      
      console.log("Image record saved:", record);
      
      // If payment info is provided, save to transactions table
      if (payment?.wallet && payment?.transaction_hash) {
        try {
          console.log("Saving transaction record to database");
          
          const { data: txData, error: txError } = await supabase
            .from('transactions')
            .insert({
              image_id: record.image_id,
              solana_wallet: payment.wallet,
              transaction_hash: payment.transaction_hash,
              amount: payment.amount,
              currency: payment.currency,
              timestamp: new Date().toISOString()
            })
            .select();
          
          if (txError) {
            console.error('Transaction save error:', txError);
            // We'll continue anyway since the image upload succeeded
          } else {
            console.log("Transaction record saved:", txData);
          }
        } catch (txCatchError) {
          console.error("Error saving transaction:", txCatchError);
          // Continue anyway since the image upload succeeded
        }
      }
      
      return NextResponse.json({
        success: true,
        url,
        record
      });
    } catch (dbError) {
      console.error("Database operation error:", dbError);
      return NextResponse.json(
        { error: 'Database operation failed' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Failed to upload image' },
      { status: 500 }
    );
  }
}