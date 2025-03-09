// src/middleware.ts
import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { LOGGING } from './utils/constants';

/**
 * Middleware to add request ID to all requests for correlation in logs
 */
export function middleware(request: NextRequest) {
  // Don't process non-API requests
  if (!request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.next();
  }
  
  const response = NextResponse.next();
  
  // Generate a unique request ID if one doesn't exist
  let requestId = request.headers.get(LOGGING.REQUEST_ID_HEADER);
  if (!requestId) {
    requestId = uuidv4();
  }
  
  // Add the request ID to the response headers so client can use it
  response.headers.set(LOGGING.REQUEST_ID_HEADER, requestId);
  
  return response;
}

// Configure matcher to apply this middleware only to API routes
export const config = {
  matcher: '/api/:path*',
};
