import { ALLOWED_ORIGIN } from './env.ts';

/**
 * CORS headers utility for Supabase Edge Functions
 * Requires ALLOWED_ORIGIN environment variable to be set for security.
 */
export function getCorsHeaders(): Record<string, string> {
  if (!ALLOWED_ORIGIN) {
    throw new Error('ALLOWED_ORIGIN environment variable must be set for security');
  }
  
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  };
}
