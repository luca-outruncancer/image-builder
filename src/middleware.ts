// src/middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Define rate limiting configuration
const API_RATE_LIMIT = 100; // Max requests per minute for API endpoints
const API_PATHS = ['/api/']; // API path prefixes
const EXCLUDED_PATHS = ['/api/health']; // Excluded from rate limiting

// In-memory rate limiting storage (resets on server restart)
const rateLimits: Record<string, { count: number, timestamp: number }> = {};
const blacklistedIps: Record<string, number> = {}; // IP -> timestamp of ban expiration

// Time window for rate limiting (1 minute)
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

// Ban duration for repeated violations (10 minutes)
const BAN_DURATION_MS = 10 * 60 * 1000;

// Count of violations that triggers a ban
const VIOLATIONS_BEFORE_BAN = 5;

// Token bucket for API key-based rate limiting
type TokenBucket = {
  tokens: number;
  lastRefill: number;
  refillRate: number; // tokens per second
  capacity: number;
};

const apiKeyBuckets: Record<string, TokenBucket> = {};

/**
 * Function to get the client's real IP address, accounting for proxies
 */
function getClientIp(req: NextRequest): string {
  // Try to get IP from Vercel's or Cloudflare's headers first
  const forwarded = req.headers.get('x-forwarded-for');
  
  if (forwarded) {
    // Get the first IP if there are multiple
    return forwarded.split(',')[0].trim();
  }
  
  // Fallback to IP in the NextRequest
  return req.ip || 'unknown';
}

/**
 * Check if the current path should be rate limited
 */
function shouldRateLimit(path: string): boolean {
  // Skip excluded paths
  if (EXCLUDED_PATHS.some(prefix => path.startsWith(prefix))) {
    return false;
  }
  
  // Check if path matches any API prefix
  return API_PATHS.some(prefix => path.startsWith(prefix));
}

/**
 * Process basic rate limiting based on IP address
 */
function processRateLimit(ip: string): { allowed: boolean, remaining: number } {
  // Check if IP is blacklisted
  if (blacklistedIps[ip] && blacklistedIps[ip] > Date.now()) {
    return { allowed: false, remaining: 0 };
  }
  
  const now = Date.now();
  
  // Initialize or reset rate limit if time window has passed
  if (!rateLimits[ip] || now - rateLimits[ip].timestamp > RATE_LIMIT_WINDOW_MS) {
    rateLimits[ip] = { count: 0, timestamp: now };
  }
  
  // Increment request count
  rateLimits[ip].count++;
  
  // Check if limit is exceeded
  if (rateLimits[ip].count > API_RATE_LIMIT) {
    // Track violation for potential blacklisting
    handleRateLimitViolation(ip);
    return { allowed: false, remaining: 0 };
  }
  
  // Return remaining allowed requests
  return { allowed: true, remaining: API_RATE_LIMIT - rateLimits[ip].count };
}

/**
 * Handle repeated rate limit violations with blacklisting
 */
function handleRateLimitViolation(ip: string): void {
  // Initialize violations count storage if it doesn't exist
  const violationsKey = `violations_${ip}`;
  const violations = (global as any)[violationsKey] || 0;
  
  // Increment violations
  (global as any)[violationsKey] = violations + 1;
  
  // Check if we should blacklist this IP
  if ((global as any)[violationsKey] >= VIOLATIONS_BEFORE_BAN) {
    console.warn(`Blacklisting IP ${ip} due to repeated rate limit violations`);
    blacklistedIps[ip] = Date.now() + BAN_DURATION_MS;
    
    // Reset violations counter
    (global as any)[violationsKey] = 0;
  }
}

/**
 * Process API key-based rate limiting using token bucket algorithm
 */
function processApiKeyRateLimit(apiKey: string): { allowed: boolean, remaining: number } {
  // Each API key gets its own rate limit
  if (!apiKeyBuckets[apiKey]) {
    // Default values for new API keys (more generous than IP-based)
    apiKeyBuckets[apiKey] = {
      tokens: 500, // Start with full capacity
      lastRefill: Date.now(),
      refillRate: 8.33, // Refill at ~500 tokens per minute
      capacity: 500  // Maximum token capacity
    };
  }
  
  const bucket = apiKeyBuckets[apiKey];
  const now = Date.now();
  const elapsedSeconds = (now - bucket.lastRefill) / 1000;
  
  // Refill tokens based on elapsed time
  const tokensToAdd = elapsedSeconds * bucket.refillRate;
  bucket.tokens = Math.min(bucket.capacity, bucket.tokens + tokensToAdd);
  bucket.lastRefill = now;
  
  // Try to consume a token
  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return { allowed: true, remaining: Math.floor(bucket.tokens) };
  } else {
    return { allowed: false, remaining: 0 };
  }
}

/**
 * The middleware function
 */
export async function middleware(request: NextRequest) {
  // Get the pathname from the URL
  const { pathname } = request.nextUrl;
  
  // Skip non-API routes
  if (!shouldRateLimit(pathname)) {
    return NextResponse.next();
  }
  
  // Extract client IP
  const clientIp = getClientIp(request);
  
  // Extract API key if present
  const apiKey = request.headers.get('x-api-key');
  
  // Determine which rate limiting to use
  let rateLimitResult;
  
  if (apiKey) {
    // Use API key-based rate limiting
    rateLimitResult = processApiKeyRateLimit(apiKey);
  } else {
    // Fallback to IP-based rate limiting
    rateLimitResult = processRateLimit(clientIp);
  }
  
  // If rate limit exceeded, return 429
  if (!rateLimitResult.allowed) {
    console.warn(`Rate limit exceeded: ${clientIp}, path: ${pathname}, API key: ${apiKey ? 'yes' : 'no'}`);
    
    return new NextResponse(
      JSON.stringify({ 
        error: 'Too Many Requests', 
        message: 'Rate limit exceeded, please try again later' 
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'X-RateLimit-Limit': API_RATE_LIMIT.toString(),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': (Math.floor(Date.now() / 1000) + 60).toString(),
          'Retry-After': '60'
        }
      }
    );
  }
  
  // Continue to the route handler
  const response = NextResponse.next();
  
  // Add rate limit headers to response
  response.headers.set('X-RateLimit-Limit', API_RATE_LIMIT.toString());
  response.headers.set('X-RateLimit-Remaining', rateLimitResult.remaining.toString());
  response.headers.set('X-RateLimit-Reset', (Math.floor(Date.now() / 1000) + 60).toString());
  
  return response;
}

/**
 * Configure which paths this middleware applies to
 */
export const config = {
  // Only apply to API routes (and a few others that need protection)
  matcher: [
    '/api/:path*',
    '/api/payment/:path*',
    '/api/upload/:path*',
    '/api/placement/:path*'
  ],
};
