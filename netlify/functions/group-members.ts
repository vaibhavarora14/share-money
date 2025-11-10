import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';

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

// Helper function to create an invitation
async function createInvitation(
  supabase: any,
  groupId: string,
  email: string,
  invitedBy: string
): Promise<{ id: string } | null> {
  // Normalize email to prevent duplicate invitations with different casing
  const normalizedEmail = email.toLowerCase().trim();
  
  // Check if there's already a pending invitation
  const { data: existingInvitation } = await supabase
    .from('group_invitations')
    .select('id')
    .eq('group_id', groupId)
    .eq('email', normalizedEmail)
    .eq('status', 'pending')
    .single();

  if (existingInvitation) {
    return null; // Invitation already exists
  }

  // Generate a unique token for the invitation
  const token = randomBytes(32).toString('hex');

  // Create invitation
  const { data: invitation, error: inviteError } = await supabase
    .from('group_invitations')
    .insert({
      group_id: groupId,
      email: normalizedEmail,
      invited_by: invitedBy,
      token: token,
      status: 'pending',
    })
    .select()
    .single();

  if (inviteError) {
    console.error('Supabase error creating invitation:', inviteError);
    throw new Error(`Failed to create invitation: ${inviteError.message}`);
  }

  return invitation;
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
            error: 'Server configuration error: Service role key not configured. This is required for user lookup by email. Please configure SUPABASE_SERVICE_ROLE_KEY in your environment variables.' 
          }),
        };
      }
      
      const findUserResponse = await fetch(
        `${supabaseUrl}/auth/v1/admin/users?email=${encodeURIComponent(normalizedEmail)}`,
        {
          headers: {
            'Authorization': `Bearer ${adminKey}`,
            'apikey': adminKey,
          },
        }
      );

      // If user lookup fails, try to create invitation
      if (!findUserResponse.ok) {
        const errorText = await findUserResponse.text();
        
        // If it's a 404 or empty result, user doesn't exist - create invitation
        if (findUserResponse.status === 404 || findUserResponse.status === 200) {
          try {
            const invitation = await createInvitation(
              supabase,
              requestData.group_id,
              normalizedEmail,
              currentUser.id
            );

            if (!invitation) {
              return {
                statusCode: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                  invitation: true,
                  message: 'An invitation has already been sent to this email address. The user will be added to the group when they sign up.',
                  email: normalizedEmail,
                }),
              };
            }

            return {
              statusCode: 201,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                invitation: true,
                message: 'Invitation sent successfully. The user will be added to the group when they sign up.',
                email: normalizedEmail,
                invitation_id: invitation.id,
              }),
            };
          } catch (error: any) {
            return {
              statusCode: 500,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              body: JSON.stringify({ error: error.message || 'Failed to create invitation' }),
            };
          }
        }
        
        // Handle other errors
        let errorMessage = 'Failed to search for user';
        let statusCode = 500;
        
        if (findUserResponse.status === 401 || findUserResponse.status === 403) {
          errorMessage = 'Server configuration error: Invalid service role key. Please verify SUPABASE_SERVICE_ROLE_KEY is correctly configured in your environment variables.';
          statusCode = 500;
          console.error('Admin API authentication failed:', errorText);
        } else {
          console.error('Admin API error:', findUserResponse.status, errorText);
          errorMessage = `Failed to search for user: ${errorText || 'Unknown error'}`;
          statusCode = 500;
        }
        
        return {
          statusCode,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: errorMessage }),
        };
      }

      const usersData = await findUserResponse.json();
      const targetUser = Array.isArray(usersData.users) 
        ? usersData.users.find((u: any) => u.email?.toLowerCase() === normalizedEmail)
        : usersData.users?.[0];

      // If user doesn't exist, create an invitation instead
      if (!targetUser || !targetUser.id) {
        try {
          const invitation = await createInvitation(
            supabase,
            requestData.group_id,
            normalizedEmail,
            currentUser.id
          );

          if (!invitation) {
            return {
              statusCode: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                invitation: true,
                message: 'An invitation has already been sent to this email address. The user will be added to the group when they sign up.',
                email: normalizedEmail,
              }),
            };
          }

          return {
            statusCode: 201,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              invitation: true,
              message: 'Invitation sent successfully. The user will be added to the group when they sign up.',
              email: normalizedEmail,
              invitation_id: invitation.id,
            }),
          };
        } catch (error: any) {
          return {
            statusCode: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: error.message || 'Failed to create invitation' }),
          };
        }
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
          body: JSON.stringify({ error: 'User is already a member of this group' }),
        };
      }

      // Check if there's a pending invitation for this user and accept it
      const { data: pendingInvitation } = await supabase
        .from('group_invitations')
        .select('id')
        .eq('group_id', requestData.group_id)
        .eq('email', normalizedEmail)
        .eq('status', 'pending')
        .single();

      if (pendingInvitation) {
        // Accept the invitation (this will add the user to the group)
        const { error: acceptError } = await supabase.rpc('accept_group_invitation', {
          invitation_id: pendingInvitation.id,
          accepting_user_id: targetUser.id,
        });

        if (acceptError) {
          console.error('Error accepting invitation:', acceptError);
          // Continue to add member directly if accepting invitation fails
        } else {
          // Invitation accepted successfully, fetch the member record
          const { data: member } = await supabase
            .from('group_members')
            .select('*')
            .eq('group_id', requestData.group_id)
            .eq('user_id', targetUser.id)
            .single();

          if (member) {
            return {
              statusCode: 201,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                ...member,
                email: normalizedEmail,
              }),
            };
          }
        }
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
          email: normalizedEmail,
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
          body: JSON.stringify({ error: 'Missing group_id in query parameters' }),
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
            body: JSON.stringify({ error: 'Cannot remove the last owner of the group' }),
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
            body: JSON.stringify({ error: 'User is not a member of this group' }),
          };
        }
        
        if (errorMessage.includes('Only group owners')) {
          return {
            statusCode: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'You can only remove yourself or be removed by group owner' }),
          };
        }

        return {
          statusCode: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Failed to remove member', details: errorMessage }),
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
