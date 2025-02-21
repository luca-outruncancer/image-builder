// src/app/api/upload/route.ts
import { writeFile } from 'fs/promises';
import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { nanoid } from 'nanoid';
import { promises as fs } from 'fs';

const STORAGE_FILE = path.join(process.cwd(), 'data', 'images.json');

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const position = JSON.parse(formData.get('position') as string);
    const size = JSON.parse(formData.get('size') as string);
    
    if (!file || !position || !size) {
      return NextResponse.json({ error: 'Missing required data' }, { status: 400 });
    }

    const filename = `${nanoid()}_${file.name}`;
    const uploadDir = path.join(process.cwd(), 'public', 'uploads');
    const filePath = path.join(uploadDir, filename);
    
    // Ensure upload directory exists
    await fs.mkdir(uploadDir, { recursive: true });

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await writeFile(filePath, buffer);

    // Read existing records
    let records = [];
    try {
      const jsonData = await fs.readFile(STORAGE_FILE, 'utf8');
      records = JSON.parse(jsonData);
    } catch (error) {
      await fs.mkdir(path.dirname(STORAGE_FILE), { recursive: true });
    }

    // Create new record
    const newRecord = {
      image_id: records.length + 1,
      image_location: `/uploads/${filename}`,
      size_x: size.width,
      size_y: size.height,
      start_position_x: position.x,
      start_position_y: position.y,
      active: true,
      timestamp: new Date().toISOString()
    };

    // Save updated records
    records.push(newRecord);
    await fs.writeFile(STORAGE_FILE, JSON.stringify(records, null, 2));

    return NextResponse.json({ 
      success: true,
      filename,
      url: `/uploads/${filename}`,
      record: newRecord
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}