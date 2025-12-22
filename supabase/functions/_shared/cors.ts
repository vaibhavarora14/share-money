import { ALLOWED_ORIGIN } from './env.ts';

/**
 * CORS headers utility for Supabase Edge Functions
 * Requires ALLOWED_ORIGIN environment variable to be set for security.
 * Supports a single origin or a comma-separated list of origins in ALLOWED_ORIGIN.
 * 
 * Security: Never allows wildcard '*' in production. ALLOWED_ORIGIN must be explicitly set.
 */
export function getCorsHeaders(req?: Request): Record<string, string> {
  // Parse allowed origins from environment variable
  const allowedOrigins = ALLOWED_ORIGIN 
    ? ALLOWED_ORIGIN.split(',').map(o => o.trim()).filter(o => o.length > 0)
    : [];
  
  // Security: Require explicit origin configuration
  if (allowedOrigins.length === 0) {
    throw new Error(
      'ALLOWED_ORIGIN must be set for CORS security. ' +
      'Set it in Supabase project settings: Settings > Edge Functions > Environment Variables'
    );
  }
  
  // Security: Always reject wildcard for maximum security
  // Wildcard CORS is a security risk and should never be used
  if (allowedOrigins.includes('*')) {
    throw new Error(
      'Wildcard CORS origin (*) is not allowed for security reasons. ' +
      'Please set specific origins in ALLOWED_ORIGIN environment variable. ' +
      'Example: https://yourdomain.com,https://www.yourdomain.com'
    );
  }
  
  const requestOrigin = req?.headers.get('Origin');
  let originToAllow: string | null = null;
  
  // Determine which origin to allow
  if (requestOrigin) {
    // Check if request origin is in allowed list
    if (allowedOrigins.includes(requestOrigin)) {
      originToAllow = requestOrigin;
    }
  } else if (allowedOrigins.length === 1) {
    // Single specific origin, use it (for same-origin requests without Origin header)
    originToAllow = allowedOrigins[0];
  }
  
  // If no valid origin found, reject the request
  if (!originToAllow) {
    const errorMsg = requestOrigin
      ? `Origin '${requestOrigin}' is not allowed. Allowed origins: ${allowedOrigins.join(', ')}`
      : `No origin specified and multiple origins configured. Allowed origins: ${allowedOrigins.join(', ')}`;
    throw new Error(errorMsg);
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
