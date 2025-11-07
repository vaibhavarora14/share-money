import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

interface Group {
  id: string;
  name: string;
  description?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface GroupMember {
  id: string;
  group_id: string;
  user_id: string;
  role: 'owner' | 'member';
  joined_at: string;
}

interface GroupWithMembers extends Group {
  members?: Array<GroupMember & { email?: string }>;
}

export const handler: Handler = async (event, context) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: '',
    };
  }

  try {
    // Get Supabase credentials from environment variables
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
    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        'Authorization': authHeader,
        'apikey': supabaseKey,
      },
    });

    if (!userResponse.ok) {
      return {
        statusCode: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          error: 'Unauthorized: Invalid or expired token'
        }),
      };
    }

    const user = await userResponse.json();
    
    if (!user || !user.id) {
      return {
        statusCode: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          error: 'Unauthorized: Invalid user data'
        }),
      };
    }

    // Extract email from user object (could be user.email or user.user?.email)
    const currentUserEmail = user.email || user.user?.email || null;
    console.log('Current user:', { id: user.id, email: currentUserEmail, userObject: JSON.stringify(user) });

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

    const httpMethod = event.httpMethod;
    const pathParts = event.path.split('/').filter(Boolean);
    const groupId = pathParts[pathParts.length - 1] !== 'groups' 
      ? pathParts[pathParts.length - 1] 
      : null;

    // Handle GET /groups - List all groups user belongs to
    if (httpMethod === 'GET' && !groupId) {
      const { data: groups, error } = await supabase
        .from('groups')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Supabase error:', error);
        return {
          statusCode: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Failed to fetch groups', details: error.message }),
        };
      }

      return {
        statusCode: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify(groups || []),
      };
    }

    // Handle GET /groups/:id - Get group details with members
    if (httpMethod === 'GET' && groupId) {
      // Get group details
      const { data: group, error: groupError } = await supabase
        .from('groups')
        .select('*')
        .eq('id', groupId)
        .single();

      if (groupError || !group) {
        return {
          statusCode: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Group not found' }),
        };
      }

      // Get group members
      const { data: members, error: membersError } = await supabase
        .from('group_members')
        .select('*')
        .eq('group_id', groupId)
        .order('joined_at', { ascending: true });

      if (membersError) {
        console.error('Supabase error:', membersError);
        return {
          statusCode: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Failed to fetch group members', details: membersError.message }),
        };
      }

      // Try to get user emails using admin API if service role key is available
      // Also include current user's email if they're a member
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      console.log('Service role key available:', !!serviceRoleKey);
      console.log('Members to process:', members?.length || 0);
      console.log('Current user ID:', user.id);
      console.log('Current user email:', currentUserEmail);
      let membersWithEmails = members || [];

      if (serviceRoleKey) {
        try {
          membersWithEmails = await Promise.all(
            (members || []).map(async (member) => {
              // If this is the current user, use their email directly
              if (member.user_id === user.id && currentUserEmail) {
                return {
                  ...member,
                  email: currentUserEmail,
                };
              }

              // Otherwise, fetch from Admin API
              try {
                console.log(`Fetching user ${member.user_id} from Admin API`);
                const userResponse = await fetch(
                  `${supabaseUrl}/auth/v1/admin/users/${member.user_id}`,
                  {
                    headers: {
                      'Authorization': `Bearer ${serviceRoleKey}`,
                      'apikey': serviceRoleKey,
                    },
                  }
                );
                console.log(`Admin API response status for ${member.user_id}:`, userResponse.status);
                if (userResponse.ok) {
                  const userData = await userResponse.json();
                  console.log(`Admin API response for ${member.user_id}:`, JSON.stringify(userData));
                  const email = userData.user?.email || userData.email || userData?.email || null;
                  console.log(`Extracted email for ${member.user_id}:`, email);
                  return {
                    ...member,
                    email: email,
                  };
                } else {
                  const errorText = await userResponse.text();
                  console.error(`Failed to fetch user ${member.user_id}: ${userResponse.status} - ${errorText}`);
                }
              } catch (err) {
                console.error(`Error fetching user ${member.user_id}:`, err);
              }
              return member;
            })
          );
        } catch (err) {
          console.error('Error fetching member emails:', err);
        }
      } else {
        // If no service role key, at least set current user's email
        membersWithEmails = (members || []).map(member => {
          if (member.user_id === user.id && currentUserEmail) {
            return {
              ...member,
              email: currentUserEmail,
            };
          }
          return member;
        });
      }

      console.log('Final members with emails:', JSON.stringify(membersWithEmails.map(m => ({ id: m.id, user_id: m.user_id, email: m.email }))));
      
      const groupWithMembers: GroupWithMembers = {
        ...group,
        members: membersWithEmails,
      };

      return {
        statusCode: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify(groupWithMembers),
      };
    }

    // Handle POST /groups - Create new group
    if (httpMethod === 'POST') {
      let groupData: Partial<Group>;
      try {
        groupData = JSON.parse(event.body || '{}');
      } catch (e) {
        return {
          statusCode: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Invalid JSON in request body' }),
        };
      }

      // Validate required fields
      if (!groupData.name || !groupData.name.trim()) {
        return {
          statusCode: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Missing required field: name' }),
        };
      }

      // Create group using SECURITY DEFINER function to bypass RLS issues
      // This ensures auth.uid() is properly recognized
      const { data: groupResult, error } = await supabase.rpc('create_group', {
        group_name: groupData.name.trim(),
        group_description: groupData.description?.trim() || null,
      });

      if (error) {
        console.error('Supabase error:', error);
        return {
          statusCode: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Failed to create group', details: error.message }),
        };
      }

      // Fetch the created group to return full details
      const { data: group, error: fetchError } = await supabase
        .from('groups')
        .select('*')
        .eq('id', groupResult)
        .single();

      if (fetchError || !group) {
        console.error('Supabase error fetching group:', fetchError);
        return {
          statusCode: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Failed to fetch created group', details: fetchError?.message }),
        };
      }

      return {
        statusCode: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify(group),
      };
    }

    // Method not allowed
    return {
      statusCode: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  } catch (error: any) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error', details: error.message }),
    };
  }
};
