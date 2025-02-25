// src/app/api/upload/route.ts
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
// import { put } from '@vercel/blob'; // Uncomment for Vercel deployment
import { createImageRecord } from '@/lib/imageStorage';

// Ensure the uploads directory exists
const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const position = JSON.parse(formData.get('position') as string);
    const size = JSON.parse(formData.get('size') as string);
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    
    // Local file storage for development
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const filename = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9\.]/g, '_')}`;
    const filepath = path.join(uploadsDir, filename);
    fs.writeFileSync(filepath, buffer);
    const fileUrl = `/uploads/${filename}`;
    
    /* Vercel Blob Storage - uncomment for production
    const blob = await put(file.name, file, { access: 'public' });
    const fileUrl = blob.url;
    */
    
    // Store metadata in database
    const record = await createImageRecord({
      image_location: fileUrl,
      start_position_x: position.x,
      start_position_y: position.y,
      size_x: size.width,
      size_y: size.height
    });
    
    if (!record) {
      return NextResponse.json({ error: 'Failed to save image metadata' }, { status: 500 });
    }
    
    return NextResponse.json({ 
      success: true, 
      url: fileUrl, 
      record 
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}