import 'dotenv/config';
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
      (event.multiValueHeaders &&
        (event.multiValueHeaders.authorization?.[0] || event.multiValueHeaders.Authorization?.[0]));

    if (!authHeader) {
      return {
        statusCode: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Unauthorized: Missing authorization header',
        }),
      };
    }

    // Verify the user
    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        Authorization: authHeader,
        apikey: supabaseKey,
      },
    });

    if (!userResponse.ok) {
      return {
        statusCode: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Unauthorized: Invalid or expired token',
        }),
      };
    }

    const currentUser = await userResponse.json();

    if (!currentUser || !currentUser.id) {
      return {
        statusCode: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Unauthorized: Invalid user data',
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
          body: JSON.stringify({
            error: 'Missing required fields: group_id, email',
          }),
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

      // Validate and normalize email
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const normalizedEmail = requestData.email.toLowerCase().trim();

      if (!emailRegex.test(normalizedEmail)) {
        return {
          statusCode: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Invalid email address format' }),
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
            error:
              'Server configuration error: Service role key not configured. Please contact support.',
          }),
        };
      }

      const findUserResponse = await fetch(
        `${supabaseUrl}/auth/v1/admin/users?email=${encodeURIComponent(normalizedEmail)}`,
        {
          headers: {
            Authorization: `Bearer ${adminKey}`,
            apikey: adminKey,
          },
        }
      );

      // If user doesn't exist (404), create an invitation instead
      if (!findUserResponse.ok) {
        const errorText = await findUserResponse.text();

        // If it's a 404, the user doesn't exist - create an invitation
        if (findUserResponse.status === 404) {
          // Create pending invitation
          // Note: UNIQUE constraint on (group_id, email) prevents duplicates
          // If duplicate, we'll get a constraint violation error which we handle below
          const { data: invitation, error: inviteError } = await supabase
            .from('group_invitations')
            .insert({
              group_id: requestData.group_id,
              email: normalizedEmail,
              role: requestData.role || 'member',
              invited_by: currentUser.id,
            })
            .select()
            .single();

          if (inviteError) {
            console.error('Error creating invitation:', inviteError);

            // Handle duplicate invitation (UNIQUE constraint violation)
            if (
              inviteError.code === '23505' ||
              inviteError.message.includes('duplicate') ||
              inviteError.message.includes('unique')
            ) {
              return {
                statusCode: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  error: 'An invitation has already been sent to this email address',
                  is_invitation: true,
                }),
              };
            }

            return {
              statusCode: 500,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                error: 'Failed to create invitation',
                details: inviteError.message,
              }),
            };
          }

          return {
            statusCode: 201,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...invitation,
              email: normalizedEmail,
              is_invitation: true,
              message: 'Invitation sent. The user will be added to the group when they sign up.',
            }),
          };
        }

        // Handle other errors
        let errorMessage = 'Failed to search for user';
        if (findUserResponse.status === 401 || findUserResponse.status === 403) {
          errorMessage =
            'Server configuration error: Invalid service role key. Please contact support.';
          console.error('Admin API authentication failed:', errorText);
        } else {
          console.error('Admin API error:', findUserResponse.status, errorText);
          errorMessage = `Failed to search for user: ${errorText || 'Unknown error'}`;
        }

        return {
          statusCode:
            findUserResponse.status === 401 || findUserResponse.status === 403 ? 500 : 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: errorMessage }),
        };
      }

      const usersData = await findUserResponse.json();
      const targetUser = Array.isArray(usersData.users)
        ? usersData.users.find((u: any) => u.email?.toLowerCase() === normalizedEmail)
        : usersData.users?.[0];

      // If user still not found in response, create invitation
      if (!targetUser || !targetUser.id) {
        // Create pending invitation
        // Note: UNIQUE constraint on (group_id, email) prevents duplicates
        const { data: invitation, error: inviteError } = await supabase
          .from('group_invitations')
          .insert({
            group_id: requestData.group_id,
            email: normalizedEmail,
            role: requestData.role || 'member',
            invited_by: currentUser.id,
          })
          .select()
          .single();

        if (inviteError) {
          console.error('Error creating invitation:', inviteError);

          // Handle duplicate invitation (UNIQUE constraint violation)
          if (
            inviteError.code === '23505' ||
            inviteError.message.includes('duplicate') ||
            inviteError.message.includes('unique')
          ) {
            return {
              statusCode: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                error: 'An invitation has already been sent to this email address',
                is_invitation: true,
              }),
            };
          }

          return {
            statusCode: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              error: 'Failed to create invitation',
              details: inviteError.message,
            }),
          };
        }

        return {
          statusCode: 201,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...invitation,
            email: normalizedEmail,
            is_invitation: true,
            message: 'Invitation sent. The user will be added to the group when they sign up.',
          }),
        };
      }

      // User exists - check if already a member
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
          body: JSON.stringify({
            error: 'User is already a member of this group',
          }),
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
          body: JSON.stringify({
            error: 'Failed to add member',
            details: addError.message,
          }),
        };
      }

      return {
        statusCode: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...member,
          email: normalizedEmail,
          is_invitation: false,
        }),
      };
    }

    // Handle DELETE - Remove member from group (or leave group)
    if (httpMethod === 'DELETE') {
      const groupId = event.queryStringParameters?.group_id;
      const providedUserId = event.queryStringParameters?.user_id;

      // Use provided user_id if valid UUID, otherwise default to current user
      // Validate UUID format if provided
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const userId = providedUserId || currentUser.id;

      if (!groupId) {
        return {
          statusCode: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            error: 'Missing group_id in query parameters',
          }),
        };
      }

      // Validate group_id is a valid UUID
      if (!uuidRegex.test(groupId)) {
        return {
          statusCode: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Invalid group_id format' }),
        };
      }

      // Validate user_id format if provided (fail early rather than silently fallback)
      if (providedUserId && !uuidRegex.test(providedUserId)) {
        return {
          statusCode: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Invalid user_id format' }),
        };
      }

      // Use the database function to atomically check and remove member
      // This prevents race conditions when removing the last owner
      const { data, error: rpcError } = await supabase.rpc('remove_group_member', {
        p_group_id: groupId,
        p_user_id: userId,
      });

      if (rpcError) {
        console.error('Supabase RPC error:', rpcError);

        // Handle specific error cases
        const errorMessage = rpcError.message || 'Failed to remove member';

        if (errorMessage.includes('last owner')) {
          return {
            statusCode: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              error: 'Cannot remove the last owner of the group',
            }),
          };
        }

        if (errorMessage.includes('not authenticated') || errorMessage.includes('Unauthorized')) {
          return {
            statusCode: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Unauthorized' }),
          };
        }

        if (errorMessage.includes('not a member')) {
          return {
            statusCode: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              error: 'User is not a member of this group',
            }),
          };
        }

        if (errorMessage.includes('Only group owners')) {
          return {
            statusCode: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              error: 'You can only remove yourself or be removed by group owner',
            }),
          };
        }

        return {
          statusCode: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            error: 'Failed to remove member',
            details: errorMessage,
          }),
        };
      }

      return {
        statusCode: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: true,
          message: 'Member removed successfully',
        }),
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
      body: JSON.stringify({
        error: 'Internal server error',
        details: error.message,
      }),
    };
  }
};
