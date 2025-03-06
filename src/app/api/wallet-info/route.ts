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
    
    // Execute the exact SQL query to find images at this position
    const { data, error } = await supabase.rpc('find_image_at_position', { 
      x_pos: x, 
      y_pos: y 
    });
    
    // If RPC function isn't set up, fallback to raw query
    if (error && error.message.includes('does not exist')) {
      console.log('[WalletInfo] RPC not found, using raw query');
      
      // Use raw SQL query to find the image at this position
      const { data: rawData, error: rawError } = await supabase
        .from('images')
        .select('*')
        .lte('start_position_x', x)
        .lt(`${x}`, `start_position_x + size_x`)
        .lte('start_position_y', y)
        .lt(`${y}`, `start_position_y + size_y`)
        .in('image_status', [1, 2])  // Only confirmed or pending images
        .order('created_at', { ascending: false });
        
      if (rawError) {
        console.error('[WalletInfo] Raw query error:', rawError);
        return NextResponse.json(
          { error: 'Database error while retrieving wallet information' },
          { status: 500 }
        );
      }
      
      if (rawData && rawData.length > 0) {
        const matchingImage = rawData[0]; // Get the most recent one if multiple
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
      
      // No image found
      return NextResponse.json({
        success: false,
        message: 'No image found at this position'
      });
    }
    
    if (error) {
      console.error('[WalletInfo] Database query error:', error);
      return NextResponse.json(
        { error: 'Database error while retrieving wallet information' },
        { status: 500 }
      );
    }
    
    if (data && data.length > 0) {
      const matchingImage = data[0]; // Get the most recent one if multiple
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