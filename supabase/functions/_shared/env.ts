/**
 * Environment variable utilities
 * Validates required environment variables at module load time
 */

/**
 * Gets a required environment variable, throwing if not set
 */
export function getRequiredEnv(key: string): string {
  const value = Deno.env.get(key);
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

/**
 * Gets an optional environment variable with a default value
 */
export function getOptionalEnv(key: string, defaultValue: string): string {
  return Deno.env.get(key) || defaultValue;
}

// Validate required environment variables at module load
export const SUPABASE_URL = getRequiredEnv('SUPABASE_URL');
export const SUPABASE_ANON_KEY = getRequiredEnv('SUPABASE_ANON_KEY');

// Optional environment variables
export const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
export const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') || undefined;
