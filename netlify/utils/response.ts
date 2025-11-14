import { Handler } from '@netlify/functions';
import { getCorsHeaders } from './cors';

/**
 * Creates a successful JSON response with optional caching
 */
export function createSuccessResponse(
  data: any,
  statusCode: number = 200,
  cacheMaxAge: number = 0
): Handler['response'] {
  const headers: Record<string, string> = {
    ...getCorsHeaders(),
    'Content-Type': 'application/json',
  };

  if (cacheMaxAge > 0) {
    headers['Cache-Control'] = `private, max-age=${cacheMaxAge}`;
  }

  return {
    statusCode,
    headers,
    body: JSON.stringify(data),
  };
}

/**
 * Creates an empty response (for DELETE, etc.)
 */
export function createEmptyResponse(statusCode: number = 204): Handler['response'] {
  return {
    statusCode,
    headers: getCorsHeaders(),
    body: '',
  };
}
