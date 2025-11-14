import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';
import { getCorsHeaders } from '../utils/cors';
import { verifyAuth, AuthResult } from '../utils/auth';
import { handleError, createErrorResponse } from '../utils/error-handler';
import { validateBodySize, isValidUUID, isValidEmail } from '../utils/validation';
import { createSuccessResponse, createEmptyResponse } from '../utils/response';

interface AddMemberRequest {
  group_id: string;
  email: string;
  role?: 'owner' | 'member';
}

interface SupabaseUser {
  id: string;
  email?: string;
}

interface UsersResponse {
  users: SupabaseUser[];
}

// Helper function to create an invitation
async function createInvitation(
  supabase: ReturnType<typeof createClient>,
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
    throw new Error(`Failed to create invitation: ${inviteError.message}`);
  }

  return invitation;
}

export const handler: Handler = async (event, context) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return createEmptyResponse(200);
  }

  try {
    // Validate request body size
    const bodySizeValidation = validateBodySize(event.body);
    if (!bodySizeValidation.valid) {
      return createErrorResponse(413, bodySizeValidation.error || 'Request body too large', 'VALIDATION_ERROR');
    }

    // Verify authentication
    let authResult: AuthResult;
    try {
      authResult = await verifyAuth(event);
    } catch (authError) {
      return handleError(authError, 'authentication');
    }

    const { user: currentUser, supabaseUrl, supabaseKey, authHeader } = authResult;

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
      } catch {
        return createErrorResponse(400, 'Invalid JSON in request body', 'VALIDATION_ERROR');
      }

      // Validate required fields
      if (!requestData.group_id || !requestData.email) {
        return createErrorResponse(400, 'Missing required fields: group_id, email', 'VALIDATION_ERROR');
      }

      // Validate group_id format
      if (!isValidUUID(requestData.group_id)) {
        return createErrorResponse(400, 'Invalid group_id format. Expected UUID.', 'VALIDATION_ERROR');
      }

      // Verify user is owner of the group
      const { data: membership, error: membershipError } = await supabase
        .from('group_members')
        .select('role')
        .eq('group_id', requestData.group_id)
        .eq('user_id', currentUser.id)
        .single();

      if (membershipError || !membership || membership.role !== 'owner') {
        return createErrorResponse(403, 'Only group owners can add members', 'PERMISSION_DENIED');
      }

      // Validate and normalize email
      const normalizedEmail = requestData.email.toLowerCase().trim();
      
      if (!isValidEmail(normalizedEmail)) {
        return createErrorResponse(400, 'Invalid email address format', 'VALIDATION_ERROR');
      }

      // Find user by email
      // Note: Supabase Admin API is needed to search by email
      // This requires SUPABASE_SERVICE_ROLE_KEY to be set in environment variables
      const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      
      if (!adminKey) {
        return createErrorResponse(
          500,
          'Server configuration error: Service role key not configured. This is required for user lookup by email. Please configure SUPABASE_SERVICE_ROLE_KEY in your environment variables.',
          'CONFIGURATION_ERROR'
        );
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
              return createSuccessResponse({
                invitation: true,
                message: 'An invitation has already been sent to this email address. The user will be added to the group when they sign up.',
                email: normalizedEmail,
              }, 200);
            }

            return createSuccessResponse({
              invitation: true,
              message: 'Invitation sent successfully. The user will be added to the group when they sign up.',
              email: normalizedEmail,
              invitation_id: invitation.id,
            }, 201);
          } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Failed to create invitation';
            return handleError(new Error(errorMessage), 'creating invitation');
          }
        }
        
        // Handle other errors
        if (findUserResponse.status === 401 || findUserResponse.status === 403) {
          return createErrorResponse(
            500,
            'Server configuration error: Invalid service role key. Please verify SUPABASE_SERVICE_ROLE_KEY is correctly configured in your environment variables.',
            'CONFIGURATION_ERROR'
          );
        }
        
        return handleError(new Error(`Failed to search for user: ${errorText || 'Unknown error'}`), 'searching for user');
      }

      const usersData = await findUserResponse.json() as UsersResponse;
      const targetUser = Array.isArray(usersData.users) 
        ? usersData.users.find((u: SupabaseUser) => u.email?.toLowerCase() === normalizedEmail)
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
            return createSuccessResponse({
              invitation: true,
              message: 'An invitation has already been sent to this email address. The user will be added to the group when they sign up.',
              email: normalizedEmail,
            }, 200);
          }

          return createSuccessResponse({
            invitation: true,
            message: 'Invitation sent successfully. The user will be added to the group when they sign up.',
            email: normalizedEmail,
            invitation_id: invitation.id,
          }, 201);
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to create invitation';
          return handleError(new Error(errorMessage), 'creating invitation');
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
        return createErrorResponse(400, 'User is already a member of this group', 'VALIDATION_ERROR');
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
            return createSuccessResponse({
              ...member,
              email: normalizedEmail,
            }, 201);
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
        return handleError(addError, 'adding member');
      }

      return createSuccessResponse({
        ...member,
        email: normalizedEmail,
      }, 201);
    }

    // Handle DELETE - Remove member from group (or leave group)
    if (httpMethod === 'DELETE') {
      const groupId = event.queryStringParameters?.group_id;
      const providedUserId = event.queryStringParameters?.user_id;
      
      // Use provided user_id if valid UUID, otherwise default to current user
      const userId = providedUserId || currentUser.id;

      if (!groupId) {
        return createErrorResponse(400, 'Missing group_id in query parameters', 'VALIDATION_ERROR');
      }

      // Validate group_id is a valid UUID
      if (!isValidUUID(groupId)) {
        return createErrorResponse(400, 'Invalid group_id format. Expected UUID.', 'VALIDATION_ERROR');
      }

      // Validate user_id format if provided (fail early rather than silently fallback)
      if (providedUserId && !isValidUUID(providedUserId)) {
        return createErrorResponse(400, 'Invalid user_id format. Expected UUID.', 'VALIDATION_ERROR');
      }

      // Use the database function to atomically check and remove member
      // This prevents race conditions when removing the last owner
      const { data, error: rpcError } = await supabase.rpc('remove_group_member', {
        p_group_id: groupId,
        p_user_id: userId,
      });

      if (rpcError) {
        // Handle specific error cases
        const errorMessage = rpcError.message || 'Failed to remove member';
        
        if (errorMessage.includes('last owner')) {
          return createErrorResponse(400, 'Cannot remove the last owner of the group', 'VALIDATION_ERROR');
        }
        
        if (errorMessage.includes('not authenticated') || errorMessage.includes('Unauthorized')) {
          return createErrorResponse(401, 'Unauthorized', 'AUTH_ERROR');
        }
        
        if (errorMessage.includes('not a member')) {
          return createErrorResponse(404, 'User is not a member of this group', 'NOT_FOUND');
        }
        
        if (errorMessage.includes('Only group owners')) {
          return createErrorResponse(403, 'You can only remove yourself or be removed by group owner', 'PERMISSION_DENIED');
        }

        return handleError(rpcError, 'removing member');
      }

      return createSuccessResponse({ success: true, message: 'Member removed successfully' }, 200);
    }

    // Method not allowed
    return createErrorResponse(405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
  } catch (error: unknown) {
    return handleError(error, 'group-members handler');
  }
};
