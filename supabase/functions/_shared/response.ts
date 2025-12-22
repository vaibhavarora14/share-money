import { getCorsHeaders } from './cors.ts';

/**
 * Creates a successful JSON response with optional caching
 */
export function createSuccessResponse(
  data: unknown,
  statusCode: number = 200,
  cacheMaxAge: number = 0,
  req?: Request
): Response {
  const headers: Record<string, string> = {
    ...getCorsHeaders(req),
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

  return new Response(JSON.stringify(data), {
    status: statusCode,
    headers,
  });
}

/**
 * Creates an empty response (for DELETE, etc.)
 */
export function createEmptyResponse(statusCode: number = 204, req?: Request): Response {
  return new Response(null, {
    status: statusCode,
    headers: {
      ...getCorsHeaders(req),
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  });
}
