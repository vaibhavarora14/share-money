import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

interface GroupInvitation {
  id: string;
  group_id: string;
  email: string;
  invited_by: string;
  status: 'pending' | 'accepted' | 'expired' | 'cancelled';
  token?: string;
  expires_at: string;
  created_at: string;
  accepted_at?: string;
}

interface CreateInvitationRequest {
  group_id: string;
  email: string;
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
    const pathParts = event.path.split('/').filter(Boolean);
    // Path can be: /invitations, /invitations/:id, or /invitations/:id/accept
    const invitationsIndex = pathParts.indexOf('invitations');
    const invitationId = invitationsIndex >= 0 && pathParts.length > invitationsIndex + 1
      ? pathParts[invitationsIndex + 1]
      : null;
    const action = invitationsIndex >= 0 && pathParts.length > invitationsIndex + 2
      ? pathParts[invitationsIndex + 2]
      : null;

    // Handle POST /invitations - Create invitation
    if (httpMethod === 'POST' && !invitationId) {
      let requestData: CreateInvitationRequest;
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
          body: JSON.stringify({ error: 'Only group owners can create invitations' }),
        };
      }

      // Check if user is already a member
      const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (adminKey) {
        const findUserResponse = await fetch(
          `${supabaseUrl}/auth/v1/admin/users?email=${encodeURIComponent(normalizedEmail)}`,
          {
            headers: {
              'Authorization': `Bearer ${adminKey}`,
              'apikey': adminKey,
            },
          }
        );

        if (findUserResponse.ok) {
          const usersData = await findUserResponse.json();
          const targetUser = Array.isArray(usersData.users) 
            ? usersData.users.find((u: any) => u.email?.toLowerCase() === normalizedEmail)
            : usersData.users?.[0];

          if (targetUser && targetUser.id) {
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
          }
        }
      }

      // Check if there's already a pending invitation
      const { data: existingInvitation } = await supabase
        .from('group_invitations')
        .select('id')
        .eq('group_id', requestData.group_id)
        .eq('email', normalizedEmail)
        .eq('status', 'pending')
        .single();

      if (existingInvitation) {
        return {
          statusCode: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'A pending invitation already exists for this email' }),
        };
      }

      // Generate a unique token for the invitation
      const token = randomBytes(32).toString('hex');

      // Create invitation
      const { data: invitation, error: createError } = await supabase
        .from('group_invitations')
        .insert({
          group_id: requestData.group_id,
          email: normalizedEmail,
          invited_by: currentUser.id,
          token: token,
          status: 'pending',
        })
        .select()
        .single();

      if (createError) {
        console.error('Supabase error:', createError);
        return {
          statusCode: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Failed to create invitation', details: createError.message }),
        };
      }

      return {
        statusCode: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify(invitation),
      };
    }

    // Handle GET /invitations - List invitations
    if (httpMethod === 'GET' && !invitationId) {
      const groupId = event.queryStringParameters?.group_id;
      const email = event.queryStringParameters?.email;

      let query = supabase
        .from('group_invitations')
        .select('*')
        .order('created_at', { ascending: false });

      if (groupId) {
        // Verify user is a member of the group (any member can view invitations)
        const { data: membership, error: membershipError } = await supabase
          .from('group_members')
          .select('id')
          .eq('group_id', groupId)
          .eq('user_id', currentUser.id)
          .maybeSingle();

        const { data: group } = await supabase
          .from('groups')
          .select('created_by')
          .eq('id', groupId)
          .single();

        const isMember = membership || (group && group.created_by === currentUser.id);

        if (!isMember) {
          return {
            statusCode: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'You must be a member of the group to view invitations' }),
          };
        }

        query = query.eq('group_id', groupId);
      } else if (email) {
        // Users can view invitations sent to their email
        const userEmail = currentUser.email || currentUser.user?.email;
        if (!userEmail || userEmail.toLowerCase() !== email.toLowerCase()) {
          return {
            statusCode: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'You can only view invitations sent to your email' }),
          };
        }
        query = query.eq('email', email.toLowerCase());
      }
      // If no filter, RLS will handle filtering to show only relevant invitations

      const { data: invitations, error } = await query;

      if (error) {
        console.error('Supabase error:', error);
        return {
          statusCode: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Failed to fetch invitations', details: error.message }),
        };
      }

      return {
        statusCode: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify(invitations || []),
      };
    }

    // Handle POST /invitations/:id/accept - Accept invitation
    if (httpMethod === 'POST' && invitationId && action === 'accept') {
      const { data, error: rpcError } = await supabase.rpc('accept_group_invitation', {
        invitation_id: invitationId,
        accepting_user_id: currentUser.id,
      });

      if (rpcError) {
        console.error('Supabase RPC error:', rpcError);
        return {
          statusCode: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: rpcError.message || 'Failed to accept invitation' }),
        };
      }

      return {
        statusCode: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true, message: 'Invitation accepted successfully' }),
      };
    }

    // Handle DELETE /invitations/:id - Cancel invitation
    if (httpMethod === 'DELETE' && invitationId) {
      // Get invitation to verify ownership
      const { data: invitation, error: fetchError } = await supabase
        .from('group_invitations')
        .select('group_id, status')
        .eq('id', invitationId)
        .single();

      if (fetchError || !invitation) {
        return {
          statusCode: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Invitation not found' }),
        };
      }

      // Verify user is owner of the group
      const { data: membership } = await supabase
        .from('group_members')
        .select('role')
        .eq('group_id', invitation.group_id)
        .eq('user_id', currentUser.id)
        .single();

      const { data: group } = await supabase
        .from('groups')
        .select('created_by')
        .eq('id', invitation.group_id)
        .single();

      const isOwner = (membership && membership.role === 'owner') || (group && group.created_by === currentUser.id);

      if (!isOwner) {
        return {
          statusCode: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Only group owners can cancel invitations' }),
        };
      }

      // Update status to cancelled instead of deleting (for audit trail)
      const { error: updateError } = await supabase
        .from('group_invitations')
        .update({ status: 'cancelled' })
        .eq('id', invitationId);

      if (updateError) {
        console.error('Supabase error:', updateError);
        return {
          statusCode: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Failed to cancel invitation', details: updateError.message }),
        };
      }

      return {
        statusCode: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true, message: 'Invitation cancelled successfully' }),
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

