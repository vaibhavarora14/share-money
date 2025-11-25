/**
 * CORS headers utility for Supabase Edge Functions
 * In production, set ALLOWED_ORIGIN environment variable to restrict access.
 * Falls back to '*' for development if not set.
 */
export function getCorsHeaders(): Record<string, string> {
  const allowedOrigin = Deno.env.get('ALLOWED_ORIGIN') || '*';
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  };
}
