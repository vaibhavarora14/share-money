import { createClient } from 'jsr:@supabase/supabase-js@2';

export interface UserInfo {
  id: string;
  email: string | null;
}

/**
 * Verifies the user's authentication token and returns user info
 * Throws an error if authentication fails
 */
export async function verifyAuth(request: Request): Promise<{ user: UserInfo; supabase: ReturnType<typeof createClient> }> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase credentials');
  }

  // Get authorization header
  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization');
  
  if (!authHeader) {
    throw new Error('Unauthorized: Missing authorization header');
  }

  // Create Supabase client with auth header
  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  // Verify the user
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error('Unauthorized: Invalid or expired token');
  }

  return {
    user: {
      id: user.id,
      email: user.email || null,
    },
    supabase,
  };
}
