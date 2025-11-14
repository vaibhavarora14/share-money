import { Handler } from '@netlify/functions';
import { getCorsHeaders } from './cors';
import { NetlifyResponse } from './response';

/**
 * Sanitizes error messages to remove sensitive information before logging
 */
function sanitizeErrorMessage(message: string): string {
  // Remove stack traces (lines starting with "at" or file paths)
  let sanitized = message
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      return (
        !trimmed.startsWith('at ') &&
        !trimmed.includes('/node_modules/') &&
        !trimmed.includes('\\node_modules\\') &&
        !trimmed.match(/^[A-Z]:\\/) && // Windows absolute paths
        !trimmed.startsWith('/') && // Unix absolute paths (but allow relative)
        !trimmed.match(/^\w+:\/\//) // URLs
      );
    })
    .join('\n')
    .trim();

  // If we filtered everything out, return a generic message
  if (!sanitized) {
    return 'An error occurred';
  }

  // Limit message length to prevent UI issues
  if (sanitized.length > 200) {
    sanitized = sanitized.substring(0, 197) + '...';
  }

  return sanitized;
}

/**
 * Sanitizes data for logging to remove sensitive information
 */
function sanitizeForLogging(data: any): any {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data !== 'object') {
    return data;
  }

  const sensitiveFields = [
    'password',
    'token',
    'access_token',
    'refresh_token',
    'authorization',
    'apikey',
    'secret',
    'key',
  ];

  if (Array.isArray(data)) {
    return data.map(item => sanitizeForLogging(item));
  }

  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    const isSensitive = sensitiveFields.some(field => lowerKey.includes(field));
    
    if (isSensitive) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeForLogging(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Standardized error response interface
 */
export interface ErrorResponse {
  error: string;
  code?: string;
  details?: string;
  timestamp?: string;
}

/**
 * Creates a standardized error response
 */
export function createErrorResponse(
  statusCode: number,
  error: string,
  code?: string,
  details?: string
): NetlifyResponse {
  const errorResponse: ErrorResponse = {
    error,
    timestamp: new Date().toISOString(),
  };

  if (code) {
    errorResponse.code = code;
  }

  if (details) {
    errorResponse.details = sanitizeErrorMessage(details);
  }

  return {
    statusCode,
    headers: { 
      ...getCorsHeaders(), 
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
    body: JSON.stringify(errorResponse),
  };
}

/**
 * Handles errors and returns standardized error response
 * Logs sanitized error information
 */
export function handleError(error: unknown, context?: string): NetlifyResponse {
  // Sanitize error for logging
  const sanitizedError = sanitizeForLogging(error);
  const logMessage = context 
    ? `Error in ${context}: ${JSON.stringify(sanitizedError)}`
    : `Error: ${JSON.stringify(sanitizedError)}`;
  
  console.error(logMessage);

  // Determine error type and create appropriate response
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    
    // Authentication errors
    if (message.includes('unauthorized') || message.includes('not authenticated')) {
      return createErrorResponse(401, 'Unauthorized', 'AUTH_ERROR', error.message);
    }

    // Validation errors
    if (message.includes('invalid') || message.includes('validation') || message.includes('missing')) {
      return createErrorResponse(400, 'Invalid request', 'VALIDATION_ERROR', error.message);
    }

    // Not found errors
    if (message.includes('not found') || message.includes('404')) {
      return createErrorResponse(404, 'Resource not found', 'NOT_FOUND', error.message);
    }

    // Permission errors
    if (message.includes('forbidden') || message.includes('permission') || message.includes('403')) {
      return createErrorResponse(403, 'Forbidden', 'PERMISSION_DENIED', error.message);
    }

    // Rate limiting
    if (message.includes('rate limit') || message.includes('too many requests')) {
      return createErrorResponse(429, 'Too many requests', 'RATE_LIMIT', error.message);
    }

    // Server errors
    return createErrorResponse(500, 'Internal server error', 'INTERNAL_ERROR', error.message);
  }

  // Unknown error
  return createErrorResponse(500, 'Internal server error', 'UNKNOWN_ERROR');
}
