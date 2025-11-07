import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
};

interface AddMemberRequest {
  group_id: string;
  email: string;
  role?: 'owner' | 'member';
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

    const currentUser = await userResponse.json();
    
    if (!currentUser || !currentUser.id) {
      return {
        statusCode: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          error: 'Unauthorized: Invalid user data'
        }),
      };
    }

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

    // Handle POST - Add member to group
    if (httpMethod === 'POST') {
      let requestData: AddMemberRequest;
      try {
        requestData = JSON.parse(event.body || '{}');
      } catch (e) {
        return {
          statusCode: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Invalid JSON in request body' }),
        };
      }

      // Validate required fields
      if (!requestData.group_id || !requestData.email) {
        return {
          statusCode: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Missing required fields: group_id, email' }),
        };
      }

      // Verify user is owner of the group
      const { data: membership, error: membershipError } = await supabase
        .from('group_members')
        .select('role')
        .eq('group_id', requestData.group_id)
        .eq('user_id', currentUser.id)
        .single();

      if (membershipError || !membership || membership.role !== 'owner') {
        return {
          statusCode: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Only group owners can add members' }),
        };
      }

      // Find user by email
      // Note: Supabase Admin API is needed to search by email
      // This requires SUPABASE_SERVICE_ROLE_KEY to be set in environment variables
      const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      
      if (!adminKey) {
        console.error('SUPABASE_SERVICE_ROLE_KEY is not set. Cannot search users by email.');
        return {
          statusCode: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            error: 'Server configuration error: Service role key not configured. Please contact support.' 
          }),
        };
      }
      
      const findUserResponse = await fetch(
        `${supabaseUrl}/auth/v1/admin/users?email=${encodeURIComponent(requestData.email)}`,
        {
          headers: {
            'Authorization': `Bearer ${adminKey}`,
            'apikey': adminKey,
          },
        }
      );

      if (!findUserResponse.ok) {
        const errorText = await findUserResponse.text();
        let errorMessage = 'User not found with the provided email';
        
        // Provide more specific error messages
        if (findUserResponse.status === 401 || findUserResponse.status === 403) {
          errorMessage = 'Server configuration error: Invalid service role key. Please contact support.';
          console.error('Admin API authentication failed:', errorText);
        } else if (findUserResponse.status === 404) {
          errorMessage = 'User not found with the provided email. Please make sure the user has signed up.';
        } else {
          console.error('Admin API error:', findUserResponse.status, errorText);
          errorMessage = `Failed to search for user: ${errorText || 'Unknown error'}`;
        }
        
        return {
          statusCode: findUserResponse.status === 401 || findUserResponse.status === 403 ? 500 : 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: errorMessage }),
        };
      }

      const usersData = await findUserResponse.json();
      const targetUser = Array.isArray(usersData.users) 
        ? usersData.users.find((u: any) => u.email === requestData.email)
        : usersData.users?.[0];

      if (!targetUser || !targetUser.id) {
        return {
          statusCode: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'User not found with the provided email' }),
        };
      }

      // Check if user is already a member
      const { data: existingMember } = await supabase
        .from('group_members')
        .select('id')
        .eq('group_id', requestData.group_id)
        .eq('user_id', targetUser.id)
        .single();

      if (existingMember) {
        return {
          statusCode: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'User is already a member of this group' }),
        };
      }

      // Add member to group
      const { data: member, error: addError } = await supabase
        .from('group_members')
        .insert({
          group_id: requestData.group_id,
          user_id: targetUser.id,
          role: requestData.role || 'member',
        })
        .select()
        .single();

      if (addError) {
        console.error('Supabase error:', addError);
        return {
          statusCode: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Failed to add member', details: addError.message }),
        };
      }

      return {
        statusCode: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...member,
          email: requestData.email,
        }),
      };
    }

    // Handle DELETE - Remove member from group (or leave group)
    if (httpMethod === 'DELETE') {
      const groupId = event.queryStringParameters?.group_id;
      const userId = event.queryStringParameters?.user_id || currentUser.id;

      if (!groupId) {
        return {
          statusCode: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Missing group_id in query parameters' }),
        };
      }

      // Users can remove themselves, or owners can remove any member
      const { data: membership } = await supabase
        .from('group_members')
        .select('role')
        .eq('group_id', groupId)
        .eq('user_id', currentUser.id)
        .single();

      const isOwner = membership?.role === 'owner';
      const isRemovingSelf = userId === currentUser.id;

      if (!isOwner && !isRemovingSelf) {
        return {
          statusCode: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'You can only remove yourself or be removed by group owner' }),
        };
      }

      // Check if the user being removed is an owner
      const { data: memberToRemove } = await supabase
        .from('group_members')
        .select('role')
        .eq('group_id', groupId)
        .eq('user_id', userId)
        .single();

      const isRemovingOwner = memberToRemove?.role === 'owner';

      // Prevent removing the last owner (only if the person being removed is an owner)
      if (isRemovingOwner) {
        const { data: owners } = await supabase
          .from('group_members')
          .select('id')
          .eq('group_id', groupId)
          .eq('role', 'owner');

        if (owners && owners.length === 1) {
          return {
            statusCode: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Cannot remove the last owner of the group' }),
          };
        }
      }

      const { error: deleteError } = await supabase
        .from('group_members')
        .delete()
        .eq('group_id', groupId)
        .eq('user_id', userId);

      if (deleteError) {
        console.error('Supabase error:', deleteError);
        return {
          statusCode: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Failed to remove member', details: deleteError.message }),
        };
      }

      return {
        statusCode: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true, message: 'Member removed successfully' }),
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
