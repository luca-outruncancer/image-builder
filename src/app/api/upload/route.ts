// src/app/api/upload/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { writeFile } from 'fs/promises';
import path from 'path';
import fs from 'fs';
import { nanoid } from 'nanoid';
import { createImageRecordServer, IMAGE_STATUS } from '@/lib/server/imageStorageServer';
import { RECIPIENT_WALLET_ADDRESS } from '@/utils/constants';

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
    
    // Use the image storage utility to create a record
    try {
      // Determine the initial status - default to pending payment
      let initialStatus = IMAGE_STATUS.PENDING_PAYMENT;
      
      // Create the image record
      const { success, data: imageRecord, error } = await createImageRecordServer({
        image_location: url,
        start_position_x: position.x,
        start_position_y: position.y,
        size_x: size.width,
        size_y: size.height,
        image_status: initialStatus
      });
      
      if (!success || !imageRecord) {
        console.error("Error creating image record:", error);
        return NextResponse.json({
          success: true, // Still mark as success since file was saved
          url,
          record: {
            image_id: Date.now(),
            image_location: url,
            start_position_x: position.x,
            start_position_y: position.y,
            size_x: size.width,
            size_y: size.height,
            image_status: initialStatus,
            created_at: new Date().toISOString()
          },
          warning: "Image record created in memory only. Database connection failed: " + error
        });
      }
      
      // If there's payment info, include it in the response
      // We'll handle the actual transaction processing on the client
      const paymentInfo = payment ? {
        imageId: imageRecord.image_id,
        senderWallet: payment.wallet,
        recipientWallet: RECIPIENT_WALLET_ADDRESS,
        amount: payment.amount,
        token: payment.currency
      } : null;
      
      return NextResponse.json({
        success: true,
        url,
        record: imageRecord,
        payment: paymentInfo
      });
    } catch (dbError) {
      console.error("Database operation error:", dbError);
      
      // Still return success with the file URL and a warning
      return NextResponse.json({
        success: true, // Still mark as success since file was saved
        url,
        record: {
          image_id: Date.now(),
          image_location: url,
          start_position_x: position.x,
          start_position_y: position.y,
          size_x: size.width,
          size_y: size.height,
          image_status: IMAGE_STATUS.PENDING_PAYMENT,
          created_at: new Date().toISOString()
        },
        warning: "Database operation failed. File was saved locally but record wasn't stored in the database."
      });
    }
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Failed to upload image: ' + (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}