// src/app/api/image-info/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { apiLogger } from '@/utils/logger';
import { findImageAtPosition, refreshImageCacheIfNeeded } from '@/lib/server/imageCache';

/**
 * API to fetch image information for a specific position on the canvas
 */
export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body = await request.json();
    
    // Validate coordinates
    if (body.x === undefined || body.y === undefined) {
      apiLogger.error('Missing coordinates in request');
      return NextResponse.json(
        { error: 'Coordinates (x,y) are required' },
        { status: 400 }
      );
    }
    
    const x = parseInt(body.x);
    const y = parseInt(body.y);
    
    apiLogger.info('Looking up position', { x, y });
    
    // Refresh cache if needed
    await refreshImageCacheIfNeeded();
    
    // Try to find the image in the cache first
    const cachedImage = findImageAtPosition(x, y);
    
    if (cachedImage) {
      apiLogger.info('Found matching image in cache', { image: cachedImage });
      
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
        updated_at
      } = cachedImage;
            
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
        updatedAt: updated_at
      });
    }
    
    // If not in cache, fall back to database query
    if (!supabase) {
      apiLogger.error('Database connection not available');
      return NextResponse.json(
        { error: 'Database connection not available' },
        { status: 500 }
      );
    }
    
    // Execute the stored procedure to find images at this position
    const { data, error } = await supabase.rpc('find_image_at_position', { 
      x_pos: x, 
      y_pos: y 
    });
    
    if (error) {
      apiLogger.error('Stored procedure error', new Error(error.message));
      return NextResponse.json(
        { error: 'Database error while retrieving image information' },
        { status: 500 }
      );
    }
    
    if (data && data.length > 0) {
      const matchingImage = data[0]; // Get the most recent one if multiple
      apiLogger.info('Found matching image in database', { image: matchingImage });
      
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
    apiLogger.info('No image found at position', { x, y });
    return NextResponse.json({
      success: false,
      message: 'No image found at this position'
    });
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    apiLogger.error('Error retrieving image information', new Error(errorMessage));
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to retrieve image information',
        message: errorMessage
      },
      { status: 500 }
    );
  }
}