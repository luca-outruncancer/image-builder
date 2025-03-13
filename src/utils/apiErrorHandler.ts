// src/utils/apiErrorHandler.ts
import { NextRequest, NextResponse } from 'next/server';
import { apiLogger } from '@/utils/logger/index';

/**
 * API error response structure
 */
export interface ApiErrorResponse {
  success: false;
  error: string;
  code?: string;
  details?: any;
  requestId?: string;
}

/**
 * Enum of common API error types
 */
export enum ApiErrorType {
  BAD_REQUEST = 'BAD_REQUEST',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE'
}

/**
 * Map API error types to HTTP status codes
 */
const errorStatusCodes: Record<ApiErrorType, number> = {
  [ApiErrorType.BAD_REQUEST]: 400,
  [ApiErrorType.UNAUTHORIZED]: 401,
  [ApiErrorType.FORBIDDEN]: 403,
  [ApiErrorType.NOT_FOUND]: 404, 
  [ApiErrorType.CONFLICT]: 409,
  [ApiErrorType.VALIDATION_ERROR]: 422,
  [ApiErrorType.INTERNAL_ERROR]: 500,
  [ApiErrorType.SERVICE_UNAVAILABLE]: 503
};

/**
 * Creates a standardized API error response
 */
export function createApiError(
  type: ApiErrorType,
  message: string,
  details?: any,
  code?: string,
  requestId?: string,
): NextResponse<ApiErrorResponse> {
  // Extract request ID from headers if not provided
  let finalRequestId = requestId;
  
  // Get appropriate status code or default to 500
  const status = errorStatusCodes[type] || 500;
  
  // Determine if we should include error details in the response
  // Don't include internal details for 500 errors in production
  const shouldIncludeDetails = status < 500 || process.env.NODE_ENV !== 'production';
  
  // Create standardized error response
  const errorResponse: ApiErrorResponse = {
    success: false,
    error: message,
    code: code || type,
    // Only include details if appropriate
    ...(shouldIncludeDetails && details ? { details } : {}),
    // Include request ID for tracking
    ...(finalRequestId ? { requestId: finalRequestId } : {})
  };
  
  // Log the error
  apiLogger.error(`API Error [${type}]: ${message}`, {
    code: errorResponse.code,
    status,
    details: details || {},
    requestId: finalRequestId
  });
  
  return NextResponse.json(errorResponse, { status });
}

/**
 * Handles unexpected errors in API routes
 */
export function handleApiError(error: unknown, context?: Record<string, any>) {
  const err = error instanceof Error ? error : new Error(String(error));
  apiLogger.error('API error occurred', err, context);
  
  return {
    error: {
      message: err.message,
      ...(context || {})
    }
  };
}

/**
 * Higher-order function that wraps an API handler with error handling
 */
export function withErrorHandling(handler: (req: NextRequest) => Promise<NextResponse>) {
  return async (req: NextRequest): Promise<NextResponse> => {
    try {
      return await handler(req);
    } catch (error) {
      return handleApiError(error, req);
    }
  };
}

export function logApiRequest(method: string, path: string, context?: Record<string, any>) {
  apiLogger.info('API request received', {
    method,
    path,
    ...(context || {})
  });
}

export function logApiResponse(status: number, path: string, context?: Record<string, any>) {
  apiLogger.info('API response sent', {
    status,
    path,
    ...(context || {})
  });
}
