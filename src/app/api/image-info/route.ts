// src/app/api/image-info/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

/**
 * API to fetch image information for a specific position on the canvas
 */
export async function POST(request: NextRequest) {
  try {
    // Check database connection
    if (!supabase) {
      console.error('[ImageInfo] Database connection not available');
      return NextResponse.json(
        { error: 'Database connection not available' },
        { status: 500 }
      );
    }
    
    // Parse request body
    const body = await request.json();
    
    // Validate coordinates
    if (body.x === undefined || body.y === undefined) {
      console.error('[ImageInfo] Missing coordinates in request');
      return NextResponse.json(
        { error: 'Coordinates (x,y) are required' },
        { status: 400 }
      );
    }
    
    const x = parseInt(body.x);
    const y = parseInt(body.y);
    
    console.log(`[ImageInfo] Looking up position (${x}, ${y})`);
    
    // Execute the stored procedure to find images at this position
    const { data, error } = await supabase.rpc('find_image_at_position', { 
      x_pos: x, 
      y_pos: y 
    });
    
    if (error) {
      console.error('[ImageInfo] Stored procedure error:', error);
      return NextResponse.json(
        { error: 'Database error while retrieving image information' },
        { status: 500 }
      );
    }
    
    if (data && data.length > 0) {
      const matchingImage = data[0]; // Get the most recent one if multiple
      console.log('[ImageInfo] Found matching image:', matchingImage);
      
      const { 
        image_id,
        image_location,
        start_position_x,
        start_position_y,
        size_x,
        size_y,
        status,
        sender_wallet,
        created_at,
        updated_at,
        cost
      } = matchingImage;
      
      console.log('[ImageInfo] Sender wallet:', sender_wallet);
      
      return NextResponse.json({
        success: true,
        wallet: sender_wallet || "Unknown",
        imageId: image_id,
        image_location,
        position: {
          x: start_position_x,
          y: start_position_y,
          width: size_x,
          height: size_y,
          clickedX: x,
          clickedY: y
        },
        status,
        createdAt: created_at,
        updatedAt: updated_at,
        cost
      });
    }
    
    // No image found at this position
    return NextResponse.json({
      success: false,
      message: 'No image found at this position'
    });
    
  } catch (error) {
    console.error('[ImageInfo] Error:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to retrieve image information',
        message: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}