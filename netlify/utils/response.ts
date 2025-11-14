import { getCorsHeaders } from './cors';

export type NetlifyResponse = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
};

/**
 * Creates a successful JSON response with optional caching
 */
export function createSuccessResponse(
  data: any,
  statusCode: number = 200,
  cacheMaxAge: number = 0
): NetlifyResponse {
  const headers: Record<string, string> = {
    ...getCorsHeaders(),
    'Content-Type': 'application/json',
  };

  if (cacheMaxAge > 0) {
    headers['Cache-Control'] = `private, max-age=${cacheMaxAge}`;
  } else {
    // Explicitly disable caching for real-time data
    headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
    headers['Pragma'] = 'no-cache';
    headers['Expires'] = '0';
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
export function createEmptyResponse(statusCode: number = 204): NetlifyResponse {
  return {
    statusCode,
    headers: {
      ...getCorsHeaders(),
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
    body: '',
  };
}
