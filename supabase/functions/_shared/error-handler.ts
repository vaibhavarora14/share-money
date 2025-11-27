import { getCorsHeaders } from './cors.ts';
import { log } from './logger.ts';

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
): Response {
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

  return new Response(JSON.stringify(errorResponse), {
    status: statusCode,
    headers: {
      ...getCorsHeaders(),
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  });
}

/**
 * Handles errors and returns standardized error response
 * Logs sanitized error information
 */
export function handleError(error: unknown, context?: string): Response {
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
    log.error('Error in handler', context || 'unknown', {
      error: error.message,
      stack: error.stack,
    });
    return createErrorResponse(500, 'Internal server error', 'INTERNAL_ERROR', error.message);
  }

  // Unknown error
  log.error('Unknown error in handler', context || 'unknown', {
    error: String(error),
  });
  return createErrorResponse(500, 'Internal server error', 'UNKNOWN_ERROR');
}
