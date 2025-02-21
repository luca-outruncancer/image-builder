// src/app/api/images/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

const dataFile = path.join(process.cwd(), 'data', 'images.json');

export async function GET() {
  try {
    const jsonData = await fs.readFile(dataFile, 'utf8');
    const images = JSON.parse(jsonData);
    return NextResponse.json({ images });
  } catch (error) {
    if ((error as any).code === 'ENOENT') {
      await fs.mkdir(path.dirname(dataFile), { recursive: true });
      await fs.writeFile(dataFile, '[]');
      return NextResponse.json({ images: [] });
    }
    return NextResponse.json({ error: 'Failed to fetch images' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const newRecord = await request.json();
    const jsonData = await fs.readFile(dataFile, 'utf8').catch(() => '[]');
    const records = JSON.parse(jsonData);
    records.push(newRecord);
    await fs.writeFile(dataFile, JSON.stringify(records, null, 2));
    return NextResponse.json({ success: true, record: newRecord });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to save record' }, { status: 500 });
  }
}