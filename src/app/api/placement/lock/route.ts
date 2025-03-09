// src/app/api/placement/lock/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { CANVAS_WIDTH, CANVAS_HEIGHT, GRID_SIZE } from '@/utils/constants';

// Rate limiting configuration
const MAX_LOCKS_PER_USER = 3; // Maximum concurrent locks per user
const MAX_REQUESTS_PER_MINUTE = 30; // Rate limit for lock requests
const LOCK_DURATION_SECONDS = 120; // 2 minutes lock duration

// In-memory rate limiting (will reset on server restart)
const requestCounts: Record<string, { count: number, timestamp: number }> = {};
const activeLocks: Record<string, Set<number>> = {};

// Validate position is on the grid
function validatePosition(x: number, y: number, width: number, height: number): boolean {
  // Verify that position and size are valid numbers
  if (
    isNaN(x) || isNaN(y) || isNaN(width) || isNaN(height) ||
    !Number.isInteger(x) || !Number.isInteger(y) || 
    !Number.isInteger(width) || !Number.isInteger(height)
  ) {
    return false;
  }

  // Check that position is within canvas bounds
  if (x < 0 || y < 0 || x + width > CANVAS_WIDTH || y + height > CANVAS_HEIGHT) {
    return false;
  }

  // Check that size is reasonable
  if (width <= 0 || height <= 0 || width > CANVAS_WIDTH / 2 || height > CANVAS_HEIGHT / 2) {
    return false;
  }

  // Check that position is aligned to grid
  if (x % GRID_SIZE !== 0 || y % GRID_SIZE !== 0) {
    return false;
  }

  return true;
}

// Check and update rate limits
function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const minute = 60 * 1000;

  // Initialize rate limit data if not exists
  if (!requestCounts[userId]) {
    requestCounts[userId] = { count: 0, timestamp: now };
  }

  // Reset counter if more than a minute has passed
  if (now - requestCounts[userId].timestamp > minute) {
    requestCounts[userId] = { count: 0, timestamp: now };
  }

  // Increment counter
  requestCounts[userId].count++;

  // Check if limit exceeded
  return requestCounts[userId].count <= MAX_REQUESTS_PER_MINUTE;
}

// Track active locks per user
function trackLock(userId: string, lockId: number): boolean {
  // Initialize set if not exists
  if (!activeLocks[userId]) {
    activeLocks[userId] = new Set();
  }

  // Check if user exceeded maximum locks
  if (activeLocks[userId].size >= MAX_LOCKS_PER_USER) {
    return false;
  }

  // Add lock
  activeLocks[userId].add(lockId);
  return true;
}

// Remove lock from tracking
function removeLock(userId: string, lockId: number): void {
  if (activeLocks[userId]) {
    activeLocks[userId].delete(lockId);
    
    // Clean up empty sets
    if (activeLocks[userId].size === 0) {
      delete activeLocks[userId];
    }
  }
}

/**
 * API route handler for acquiring placement locks
 */
export async function POST(request: NextRequest) {
  // Extract user ID from authorization header
  const apiKey = request.headers.get('x-api-key') || '';
  const userId = request.headers.get('x-user-id') || apiKey || 'anonymous';

  // Check rate limit
  if (!checkRateLimit(userId)) {
    console.warn(`[Lock API] Rate limit exceeded for user ${userId}`);
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please try again later.' },
      { status: 429 }
    );
  }

  try {
    const body = await request.json();
    
    // Validate request body
    if (!body.x || !body.y || !body.width || !body.height) {
      return NextResponse.json(
        { error: 'Missing required parameters: x, y, width, height' },
        { status: 400 }
      );
    }
    
    const { x, y, width, height } = body;
    
    // Validate position and size
    if (!validatePosition(x, y, width, height)) {
      return NextResponse.json(
        { error: 'Invalid position or size parameters' },
        { status: 400 }
      );
    }
    
    console.log(`[Lock API] Attempting to lock area: x=${x}, y=${y}, width=${width}, height=${height} for user ${userId}`);
    
    // Check if user already has too many locks
    if (!trackLock(userId, 0)) {
      return NextResponse.json(
        { error: 'Too many active locks. Please release some locks before acquiring new ones.' },
        { status: 429 }
      );
    }

    // Remove temporary tracking (will be added back with actual lock ID)
    removeLock(userId, 0);
    
    // Try to acquire lock using database function
    const { data, error } = await supabase.rpc('lock_area', {
      x_pos: x,
      y_pos: y,
      width: width,
      height: height,
      lock_owner: userId,
      lock_duration_seconds: LOCK_DURATION_SECONDS
    });
    
    if (error) {
      console.error('[Lock API] Database error:', error);
      return NextResponse.json(
        { error: 'Failed to acquire lock: database error' },
        { status: 500 }
      );
    }
    
    const lockId = data;
    
    // If lock_id is 0, area is not available
    if (lockId === 0) {
      return NextResponse.json(
        { success: false, message: 'Area is not available for placement' },
        { status: 409 } // Conflict
      );
    }
    
    // Track this lock for the user
    trackLock(userId, lockId);
    
    console.log(`[Lock API] Lock acquired: ID=${lockId} for area: x=${x}, y=${y}, width=${width}, height=${height}`);
    
    return NextResponse.json({
      success: true,
      lockId: lockId,
      expiresIn: LOCK_DURATION_SECONDS,
      message: 'Lock acquired successfully'
    });
  } catch (error) {
    console.error('[Lock API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * API route handler for releasing placement locks
 */
export async function DELETE(request: NextRequest) {
  // Get lock ID from URL
  const url = new URL(request.url);
  const lockId = parseInt(url.searchParams.get('id') || '0');
  
  // Extract user ID from authorization header
  const apiKey = request.headers.get('x-api-key') || '';
  const userId = request.headers.get('x-user-id') || apiKey || 'anonymous';
  
  if (!lockId) {
    return NextResponse.json(
      { error: 'Missing lock ID' },
      { status: 400 }
    );
  }
  
  try {
    console.log(`[Lock API] Attempting to release lock ID=${lockId} for user ${userId}`);
    
    // Release lock using database function
    const { data, error } = await supabase.rpc('release_lock', {
      id: lockId
    });
    
    if (error) {
      console.error('[Lock API] Database error releasing lock:', error);
      return NextResponse.json(
        { error: 'Failed to release lock: database error' },
        { status: 500 }
      );
    }
    
    // Remove from in-memory tracking
    removeLock(userId, lockId);
    
    const released = data;
    
    if (!released) {
      return NextResponse.json(
        { success: false, message: 'Lock not found or already released' },
        { status: 404 }
      );
    }
    
    console.log(`[Lock API] Lock ID=${lockId} released successfully`);
    
    return NextResponse.json({
      success: true,
      message: 'Lock released successfully'
    });
  } catch (error) {
    console.error('[Lock API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
