// src/app/api/cache-status/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { getImageCacheStats, refreshImageCacheIfNeeded } from '@/lib/server/imageCache';
import { apiLogger } from '@/utils/logger';
import { ensureServerInitialized } from '@/lib/server/init';

/**
 * This API route is disabled as the CanvasDebug component has been removed.
 * The image cache stats are no longer displayed in the UI.
 */

/**
 * API to check the status of the image cache (DISABLED)
 */
export async function GET(request: NextRequest) {
  return NextResponse.json({
    success: false,
    message: 'This API route has been disabled'
  }, { status: 404 });
  
  /* Original implementation:
  try {
    // Ensure server is initialized
    await ensureServerInitialized();
    
    const stats = getImageCacheStats();
    
    return NextResponse.json({
      success: true,
      stats
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    apiLogger.error('Error retrieving cache status', new Error(errorMessage));
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to retrieve cache status',
        message: errorMessage
      },
      { status: 500 }
    );
  }
  */
}

/**
 * API to refresh the image cache (DISABLED)
 */
export async function POST(request: NextRequest) {
  return NextResponse.json({
    success: false,
    message: 'This API route has been disabled'
  }, { status: 404 });
  
  /* Original implementation:
  try {
    // Ensure server is initialized
    await ensureServerInitialized();
    
    apiLogger.info('Manual cache refresh requested');
    
    const success = await refreshImageCacheIfNeeded();
    const stats = getImageCacheStats();
    
    return NextResponse.json({
      success,
      stats,
      message: success ? 'Cache refreshed successfully' : 'Failed to refresh cache'
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    apiLogger.error('Error refreshing cache', new Error(errorMessage));
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to refresh cache',
        message: errorMessage
      },
      { status: 500 }
    );
  }
  */
} 