import { ALLOWED_ORIGIN } from './env.ts';

/**
 * CORS headers utility for Supabase Edge Functions
 * Requires ALLOWED_ORIGIN environment variable to be set for security.
 */
/**
 * CORS headers utility for Supabase Edge Functions
 * Supports a single origin or a comma-separated list of origins in ALLOWED_ORIGIN.
 */
export function getCorsHeaders(req?: Request): Record<string, string> {
  // Use '*' as fallback if ALLOWED_ORIGIN is not set (useful for debugging preflight blocks)
  const allowedOrigins = ALLOWED_ORIGIN ? ALLOWED_ORIGIN.split(',').map(o => o.trim()) : ['*'];
  const requestOrigin = req?.headers.get('Origin');

  let originToAllow = allowedOrigins[0];
  if (requestOrigin) {
    if (allowedOrigins.includes('*') || allowedOrigins.includes(requestOrigin)) {
      originToAllow = requestOrigin;
    }
  }

  // Get requested headers for preflight
  const requestedHeaders = req?.headers.get('Access-Control-Request-Headers');
  
  return {
    'Access-Control-Allow-Origin': originToAllow,
    'Access-Control-Allow-Headers': requestedHeaders || 'authorization, x-client-info, apikey, content-type, x-app-version, prefer',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Expose-Headers': 'Content-Length, X-JSON',
  };
}
