import { Handler } from '@netlify/functions';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Get CORS headers with configurable origin.
 * In production, set ALLOWED_ORIGIN environment variable to restrict access.
 * Falls back to '*' for development if not set.
 */
function getCorsHeaders(): Record<string, string> {
  const allowedOrigin = process.env.ALLOWED_ORIGIN || '*';
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };
}

interface Settlement {
  id: string;
  group_id: string;
  from_user_id: string;
  to_user_id: string;
  amount: number;
  currency: string;
  notes?: string;
  created_by: string;
  created_at: string;
  from_user_email?: string;
  to_user_email?: string;
}

interface CreateSettlementRequest {
  group_id: string;
  from_user_id: string;
  to_user_id: string;
  amount: number;
  currency?: string;
  notes?: string;
}

interface UserResponse {
  id: string;
  email?: string;
  user?: {
    email?: string;
  };
}

/**
 * Verifies the user's authentication token and returns user info
 */
async function verifyUser(
  supabaseUrl: string,
  supabaseKey: string,
  authHeader: string
): Promise<{ id: string; email: string | null }> {
  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      'Authorization': authHeader,
      'apikey': supabaseKey,
    },
  });

  if (!userResponse.ok) {
    throw new Error('Unauthorized: Invalid or expired token');
  }

  const user = await userResponse.json() as UserResponse;
  
  if (!user || !user.id) {
    throw new Error('Unauthorized: Invalid user data');
  }

  return {
    id: user.id,
    email: user.email || user.user?.email || null,
  };
}

/**
 * Enriches settlements with email addresses for from_user and to_user
 */
async function enrichSettlementsWithEmails(
  supabase: SupabaseClient,
  supabaseUrl: string,
  serviceRoleKey: string | undefined,
  settlements: Settlement[],
  currentUserId: string,
  currentUserEmail: string | null
): Promise<void> {
  if (!serviceRoleKey || settlements.length === 0) {
    return;
  }

  const userIds = new Set<string>();
  settlements.forEach(s => {
    userIds.add(s.from_user_id);
    userIds.add(s.to_user_id);
  });

  const userIdsArray = Array.from(userIds);
  
  // Fetch emails in parallel
  const emailPromises = userIdsArray.map(async (userId): Promise<{ userId: string; email: string | null }> => {
    if (userId === currentUserId && currentUserEmail) {
      return { userId, email: currentUserEmail };
    }

    try {
      const userResponse = await fetch(
        `${supabaseUrl}/auth/v1/admin/users/${userId}`,
        {
          headers: {
            'Authorization': `Bearer ${serviceRoleKey}`,
            'apikey': serviceRoleKey,
          },
        }
      );
      
      if (userResponse.ok) {
        const userData = await userResponse.json() as UserResponse;
        const email = userData.user?.email || userData.email || null;
        return { userId, email };
      }
    } catch (err) {
      console.error(`Error fetching email for user ${userId}:`, err);
    }
    return { userId, email: null };
  });

  const emailResults = await Promise.allSettled(emailPromises);
  const emailMap = new Map<string, string>();
  
  for (const result of emailResults) {
    if (result.status === 'fulfilled' && result.value.email) {
      emailMap.set(result.value.userId, result.value.email);
    }
  }

  // Add emails to settlements
  settlements.forEach(s => {
    s.from_user_email = emailMap.get(s.from_user_id);
    s.to_user_email = emailMap.get(s.to_user_id);
  });
}

export const handler: Handler = async (event, context) => {
  const corsHeaders = getCorsHeaders();
  
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: '',
    };
  }

  try {
    // Get Supabase credentials
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return {
        statusCode: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Missing Supabase credentials' }),
      };
    }

    // Get authorization header
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
      return {
        statusCode: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Unauthorized: Missing authorization header' }),
      };
    }

    // Verify the user
    const user = await verifyUser(supabaseUrl, supabaseKey, authHeader);
    const currentUserId = user.id;
    const currentUserEmail = user.email;

    // Create Supabase client
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

    // Handle GET request - list settlements
    if (event.httpMethod === 'GET') {
      const groupId = event.queryStringParameters?.group_id;
      
      // Validate group_id format if provided (UUID format)
      if (groupId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(groupId)) {
        return {
          statusCode: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Invalid group_id format. Expected UUID.' }),
        };
      }

      // Build query
      let query = supabase
        .from('settlements')
        .select('*')
        .order('created_at', { ascending: false });

      // Filter by group if provided
      if (groupId) {
        // Verify user is a member of the group
        const { data: membership } = await supabase
          .from('group_members')
          .select('group_id')
          .eq('group_id', groupId)
          .eq('user_id', currentUserId)
          .single();

        if (!membership) {
          return {
            statusCode: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Forbidden: Not a member of this group' }),
          };
        }

        query = query.eq('group_id', groupId);
      } else {
        // If no group_id, only return settlements where user is involved
        query = query.or(`from_user_id.eq.${currentUserId},to_user_id.eq.${currentUserId}`);
      }

      const { data: settlements, error } = await query;

      if (error) {
        console.error('Error fetching settlements:', error);
        return {
          statusCode: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Failed to fetch settlements', details: error.message }),
        };
      }

      // Enrich with emails
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const enrichedSettlements = (settlements || []) as Settlement[];
      await enrichSettlementsWithEmails(
        supabase,
        supabaseUrl,
        serviceRoleKey,
        enrichedSettlements,
        currentUserId,
        currentUserEmail
      );

      return {
        statusCode: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ settlements: enrichedSettlements }),
      };
    }

    // Handle POST request - create settlement
    if (event.httpMethod === 'POST') {
      if (!event.body) {
        return {
          statusCode: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Request body is required' }),
        };
      }

      let settlementData: CreateSettlementRequest;
      try {
        settlementData = JSON.parse(event.body);
      } catch (err) {
        return {
          statusCode: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Invalid JSON in request body' }),
        };
      }

      // Validate required fields
      if (!settlementData.group_id || !settlementData.from_user_id || !settlementData.to_user_id || !settlementData.amount) {
        return {
          statusCode: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Missing required fields: group_id, from_user_id, to_user_id, amount' }),
        };
      }

      // Validate amount is positive
      if (settlementData.amount <= 0) {
        return {
          statusCode: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Amount must be greater than 0' }),
        };
      }

      // Validate from_user_id matches current user (users can only settle on their own behalf)
      if (settlementData.from_user_id !== currentUserId) {
        return {
          statusCode: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Forbidden: You can only create settlements where you are the payer' }),
        };
      }

      // Validate users are different
      if (settlementData.from_user_id === settlementData.to_user_id) {
        return {
          statusCode: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'from_user_id and to_user_id must be different' }),
        };
      }

      // Validate UUID formats
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(settlementData.group_id) || 
          !uuidRegex.test(settlementData.from_user_id) || 
          !uuidRegex.test(settlementData.to_user_id)) {
        return {
          statusCode: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Invalid UUID format for group_id, from_user_id, or to_user_id' }),
        };
      }

      // Verify user is a member of the group
      const { data: membership } = await supabase
        .from('group_members')
        .select('group_id')
        .eq('group_id', settlementData.group_id)
        .eq('user_id', currentUserId)
        .single();

      if (!membership) {
        return {
          statusCode: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Forbidden: Not a member of this group' }),
        };
      }

      // Verify to_user_id is also a member of the group
      const { data: toUserMembership } = await supabase
        .from('group_members')
        .select('group_id')
        .eq('group_id', settlementData.group_id)
        .eq('user_id', settlementData.to_user_id)
        .single();

      if (!toUserMembership) {
        return {
          statusCode: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'to_user_id is not a member of this group' }),
        };
      }

      // Create settlement
      const { data: settlement, error } = await supabase
        .from('settlements')
        .insert({
          group_id: settlementData.group_id,
          from_user_id: settlementData.from_user_id,
          to_user_id: settlementData.to_user_id,
          amount: settlementData.amount,
          currency: settlementData.currency || 'USD',
          notes: settlementData.notes || null,
          created_by: currentUserId,
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating settlement:', error);
        return {
          statusCode: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Failed to create settlement', details: error.message }),
        };
      }

      // Enrich with emails
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const enrichedSettlement = settlement as Settlement;
      await enrichSettlementsWithEmails(
        supabase,
        supabaseUrl,
        serviceRoleKey,
        [enrichedSettlement],
        currentUserId,
        currentUserEmail
      );

      return {
        statusCode: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ settlement: enrichedSettlement }),
      };
    }

    // Method not allowed
    return {
      statusCode: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  } catch (error: unknown) {
    console.error('Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      statusCode: 500,
      headers: { ...getCorsHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error', details: errorMessage }),
    };
  }
};
