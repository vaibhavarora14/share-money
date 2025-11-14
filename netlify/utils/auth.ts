import { Handler } from '@netlify/functions';

export interface UserInfo {
  id: string;
  email: string | null;
}

export interface AuthResult {
  user: UserInfo;
  supabaseUrl: string;
  supabaseKey: string;
  authHeader: string;
}

/**
 * Verifies the user's authentication token and returns user info
 * Throws an error if authentication fails
 */
export async function verifyAuth(event: Handler['event']): Promise<AuthResult> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase credentials');
  }

  // Get authorization header - Netlify Functions headers are lowercase
  const authHeader = 
    event.headers.authorization || 
    event.headers.Authorization ||
    event.headers['authorization'] ||
    event.headers['Authorization'] ||
    (event.multiValueHeaders && (
      event.multiValueHeaders.authorization?.[0] ||
      event.multiValueHeaders.Authorization?.[0]
    ));
  
  if (!authHeader) {
    throw new Error('Unauthorized: Missing authorization header');
  }

  // Verify the user by calling Supabase REST API directly
  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      'Authorization': authHeader,
      'apikey': supabaseKey,
    },
  });

  if (!userResponse.ok) {
    throw new Error('Unauthorized: Invalid or expired token');
  }

  const user = await userResponse.json();
  
  if (!user || !user.id) {
    throw new Error('Unauthorized: Invalid user data');
  }

  return {
    user: {
      id: user.id,
      email: user.email || user.user?.email || null,
    },
    supabaseUrl,
    supabaseKey,
    authHeader,
  };
}
