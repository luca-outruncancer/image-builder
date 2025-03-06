// src/app/api/wallet-info/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

/**
 * API to fetch wallet information for a specific position on the canvas
 */
export async function POST(request: NextRequest) {
  try {
    if (!supabase) {
      return NextResponse.json(
        { error: 'Database connection not available' },
        { status: 500 }
      );
    }
    
    const body = await request.json();
    
    if (body.x === undefined || body.y === undefined) {
      return NextResponse.json(
        { error: 'Coordinates (x,y) are required' },
        { status: 400 }
      );
    }
    
    const x = parseInt(body.x);
    const y = parseInt(body.y);
    
    console.log(`[WalletInfo] Looking up position (${x}, ${y})`);
    
    // Find images at this position
    let query = supabase
      .from('images')
      .select('*')
      .in('image_status', [1, 2]) // Status 1 = confirmed, 2 = pending payment
      .lte('start_position_x', x)
      .lte('start_position_y', y)
      .order('created_at', { ascending: false });
    
    const { data, error } = await query;
    
    if (error) {
      console.error('[WalletInfo] Database query error:', error);
      return NextResponse.json(
        { error: 'Database error while retrieving wallet information' },
        { status: 500 }
      );
    }
    
    // Filter to find exact match - we need to check if position is within image bounds
    const matchingImage = data.find(img => 
      x >= img.start_position_x && 
      x < (img.start_position_x + img.size_x) &&
      y >= img.start_position_y && 
      y < (img.start_position_y + img.size_y)
    );
    
    if (matchingImage) {
      const { sender_wallet, image_id, start_position_x, start_position_y, size_x, size_y, image_status } = matchingImage;
      
      return NextResponse.json({
        success: true,
        imageId: image_id,
        wallet: sender_wallet || "Unknown",
        position: {
          x: start_position_x,
          y: start_position_y,
          width: size_x,
          height: size_y
        },
        status: image_status === 1 ? 'confirmed' : 'pending'
      });
    }
    
    // No image found at this position
    return NextResponse.json({
      success: false,
      message: 'No image found at this position'
    });
    
  } catch (error) {
    console.error('[WalletInfo] Error:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to retrieve wallet information',
        message: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}