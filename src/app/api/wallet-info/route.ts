// src/app/api/wallet-info/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

/**
 * API to fetch wallet information for a specific position on the canvas
 */
export async function POST(request: NextRequest) {
  try {
    // Check database connection
    if (!supabase) {
      console.error('[WalletInfo] Database connection not available');
      return NextResponse.json(
        { error: 'Database connection not available' },
        { status: 500 }
      );
    }
    
    // Parse request body
    const body = await request.json();
    
    // Validate coordinates
    if (body.x === undefined || body.y === undefined) {
      console.error('[WalletInfo] Missing coordinates in request');
      return NextResponse.json(
        { error: 'Coordinates (x,y) are required' },
        { status: 400 }
      );
    }
    
    const x = parseInt(body.x);
    const y = parseInt(body.y);
    
    console.log(`[WalletInfo] Looking up position (${x}, ${y})`);
    
    // Execute the stored procedure to find images at this position
    const { data, error } = await supabase.rpc('find_image_at_position', { 
      x_pos: x, 
      y_pos: y 
    });
    
    if (error) {
      console.error('[WalletInfo] Stored procedure error:', error);
      return NextResponse.json(
        { error: 'Database error while retrieving wallet information' },
        { status: 500 }
      );
    }
    
    if (data && data.length > 0) {
      const matchingImage = data[0]; // Get the most recent one if multiple
      const { 
        sender_wallet, 
        user_wallet,
        image_id, 
        start_position_x, 
        start_position_y, 
        size_x, 
        size_y, 
        image_status,
        image_location 
      } = matchingImage;
      
      return NextResponse.json({
        success: true,
        imageId: image_id,
        wallet: sender_wallet || user_wallet || "Unknown",
        user_wallet: user_wallet || "Unknown",
        position: {
          x: start_position_x,
          y: start_position_y,
          width: size_x,
          height: size_y,
          clickedX: x,
          clickedY: y
        },
        status: image_status === 1 ? 'confirmed' : 'pending',
        image_location: image_location || "Unknown"
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