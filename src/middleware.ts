// src/middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { apiLogger, generateRequestId } from '@/utils/logger';
import { ensureServerInitialized } from '@/lib/server/init';

// Initialize server on module load
const serverInitPromise = ensureServerInitialized();

// This function can be marked `async` if using `await` inside
export async function middleware(request: NextRequest) {
  // Generate a unique request ID for tracking this request through the logs
  const requestId = generateRequestId();
  
  // Extract useful information from the request
  const url = request.nextUrl.clone();
  const method = request.method;
  const path = url.pathname;
  const userAgent = request.headers.get('user-agent') || 'unknown';
  const referer = request.headers.get('referer') || 'direct';
  const contentType = request.headers.get('content-type') || 'none';
  
  // Log API request
  if (path.startsWith('/api')) {
    const timestamp = new Date().toISOString();
    
    apiLogger.info(`API Request: ${method} ${path}`, {
      method,
      path,
      query: Object.fromEntries(url.searchParams.entries()),
      timestamp,
      userAgent,
      referer,
      contentType,
      requestId
    });
    
    // Ensure server is initialized for API routes
    // We don't need to await this for most routes since it's already initialized at module load
    // But we make sure it's at least in progress
    serverInitPromise.catch(error => {
      apiLogger.error('Server initialization error in middleware', error, { requestId });
    });
    
    // Create response with added headers
    const response = NextResponse.next();
    
    // Add X-Request-ID header to response for client-side reference
    response.headers.set('X-Request-ID', requestId);
    
    return response;
  }
  
  // Continue for non-API routes without modification
  return NextResponse.next();
}

// Configure the middleware to run only on API routes
export const config = {
  matcher: '/api/:path*',
};
