// src/app/api/upload/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { writeFile } from 'fs/promises';
import path from 'path';
import { nanoid } from 'nanoid';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Initialize Supabase client with error handling
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let supabase: any = null;

try {
  if (!supabaseUrl) {
    console.error("Missing Supabase URL environment variable");
  }
  
  if (!supabaseKey) {
    console.error("Missing Supabase key environment variable");
  }
  
  if (supabaseUrl && supabaseKey) {
    supabase = createClient(supabaseUrl, supabaseKey);
    console.log("Supabase client initialized successfully");
  } else {
    console.error("Unable to initialize Supabase client due to missing environment variables");
  }
} catch (error) {
  console.error("Error initializing Supabase client:", error);
}

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
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
          console.log("Created uploads directory:", uploadDir);
        }
      } catch (dirError) {
        console.error("Error creating upload directory:", dirError);
      }
      
      // In local development, save to public directory
      const filePath = path.join(uploadDir, fileName);
      await writeFile(filePath, buffer);
      
      console.log("File saved successfully at:", filePath);
    } catch (fileError) {
      console.error("Error saving file:", fileError);
      return NextResponse.json(
        { error: 'Failed to save file: ' + (fileError instanceof Error ? fileError.message : String(fileError)) },
        { status: 500 }
      );
    }
    
    // For local development, use a URL path to the local file
    const url = `/uploads/${fileName}`;
    
    // If Supabase is not available, still allow file uploads but skip database operations
    if (!supabase) {
      console.warn("Skipping database operations due to missing Supabase configuration");
      return NextResponse.json({
        success: true,
        url,
        record: {
          image_id: id,
          image_location: url,
          start_position_x: position.x,
          start_position_y: position.y,
          size_x: size.width,
          size_y: size.height,
          active: true,
          wallet_address: payment?.wallet || null,
          transaction_hash: payment?.transaction_hash || null,
          payment_status: payment?.transaction_hash ? 'paid' : 'pending',
        },
        warning: "Database operations were skipped due to missing Supabase configuration"
      });
    }
    
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
          { 
            success: true, // Still mark as success since file was saved
            url,
            error: 'Failed to save image to database: ' + error.message,
            record: {
              image_id: id,
              image_location: url,
              start_position_x: position.x,
              start_position_y: position.y,
              size_x: size.width,
              size_y: size.height,
            }
          },
          { status: 200 } // Return 200 since the file was saved successfully
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
        { 
          success: true, // Still mark as success since file was saved
          url,
          error: 'Database operation failed: ' + (dbError instanceof Error ? dbError.message : String(dbError)),
          record: {
            image_id: id,
            image_location: url,
            start_position_x: position.x,
            start_position_y: position.y,
            size_x: size.width,
            size_y: size.height,
          }
        },
        { status: 200 } // Return 200 since the file was saved successfully
      );
    }
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Failed to upload image: ' + (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}