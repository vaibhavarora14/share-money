import { verifyAuth } from '../_shared/auth.ts';
import { createErrorResponse, handleError } from '../_shared/error-handler.ts';
import { createSuccessResponse } from '../_shared/response.ts';
import { validateBodySize, isValidUUID, isValidEmail } from '../_shared/validation.ts';
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from '../_shared/env.ts';

/**
 * Group Members Edge Function
 * 
 * Handles group member management:
 * - POST /group-members - Add member to group (creates invitation if user doesn't exist)
 * - DELETE /group-members?group_id=xxx&user_id=xxx - Remove member from group
 * 
 * @route /functions/v1/group-members
 * @requires Authentication
 */

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

async function createInvitation(
  supabase: Awaited<ReturnType<typeof verifyAuth>>['supabase'],
  groupId: string,
  email: string,
  invitedBy: string
): Promise<{ id: string } | null> {
  const normalizedEmail = email.toLowerCase().trim();
  
  const { data: existingInvitation } = await supabase
    .from('group_invitations')
    .select('id')
    .eq('group_id', groupId)
    .eq('email', normalizedEmail)
    .eq('status', 'pending')
    .single();

  if (existingInvitation) {
    return null;
  }

  const tokenArray = new Uint8Array(32);
  crypto.getRandomValues(tokenArray);
  const token = Array.from(tokenArray)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200 });
  }

  try {
    const body = await req.text().catch(() => null);
    const bodySizeValidation = validateBodySize(body);
    if (!bodySizeValidation.valid) {
      return createErrorResponse(413, bodySizeValidation.error || 'Request body too large', 'VALIDATION_ERROR');
    }

    let authResult;
    try {
      authResult = await verifyAuth(req);
    } catch (authError) {
      return handleError(authError, 'authentication');
    }

    const { user: currentUser, supabase } = authResult;
    const httpMethod = req.method;

    if (httpMethod === 'POST') {
      let requestData: AddMemberRequest;
      try {
        requestData = body ? JSON.parse(body) : {};
      } catch {
        return createErrorResponse(400, 'Invalid JSON in request body', 'VALIDATION_ERROR');
      }

      if (!requestData.group_id || !requestData.email) {
        return createErrorResponse(400, 'Missing required fields: group_id, email', 'VALIDATION_ERROR');
      }

      if (!isValidUUID(requestData.group_id)) {
        return createErrorResponse(400, 'Invalid group_id format. Expected UUID.', 'VALIDATION_ERROR');
      }

      const { data: membership, error: membershipError } = await supabase
        .from('group_members')
        .select('id')
        .eq('group_id', requestData.group_id)
        .eq('user_id', currentUser.id)
        .single();

      if (membershipError || !membership) {
        return createErrorResponse(403, 'You must be a member of the group to add members', 'PERMISSION_DENIED');
      }

      const normalizedEmail = requestData.email.toLowerCase().trim();
      
      if (!isValidEmail(normalizedEmail)) {
        return createErrorResponse(400, 'Invalid email address format', 'VALIDATION_ERROR');
      }

      if (!SUPABASE_SERVICE_ROLE_KEY) {
        return createErrorResponse(
          500,
          'Server configuration error: Service role key not configured. This is required for user lookup by email. Please configure SUPABASE_SERVICE_ROLE_KEY in your environment variables.',
          'CONFIGURATION_ERROR'
        );
      }
      
      const findUserResponse = await fetch(
        `${SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(normalizedEmail)}`,
        {
          headers: {
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'apikey': SUPABASE_SERVICE_ROLE_KEY,
          },
        }
      );

      if (!findUserResponse.ok) {
        const errorText = await findUserResponse.text();
        
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

      const { data: existingMember } = await supabase
        .from('group_members')
        .select('id')
        .eq('group_id', requestData.group_id)
        .eq('user_id', targetUser.id)
        .single();

      if (existingMember) {
        return createErrorResponse(400, 'User is already a member of this group', 'VALIDATION_ERROR');
      }

      const { data: pendingInvitation } = await supabase
        .from('group_invitations')
        .select('id')
        .eq('group_id', requestData.group_id)
        .eq('email', normalizedEmail)
        .eq('status', 'pending')
        .single();

      if (pendingInvitation) {
        const { error: acceptError } = await supabase.rpc('accept_group_invitation', {
          invitation_id: pendingInvitation.id,
          accepting_user_id: targetUser.id,
        });

        if (!acceptError) {
          const { data: member } = await supabase
            .from('group_members')
            .select('id, group_id, user_id, role, joined_at')
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

    if (httpMethod === 'DELETE') {
      const url = new URL(req.url);
      const groupId = url.searchParams.get('group_id');
      const providedUserId = url.searchParams.get('user_id');
      
      const userId = providedUserId || currentUser.id;

      if (!groupId) {
        return createErrorResponse(400, 'Missing group_id in query parameters', 'VALIDATION_ERROR');
      }

      if (!isValidUUID(groupId)) {
        return createErrorResponse(400, 'Invalid group_id format. Expected UUID.', 'VALIDATION_ERROR');
      }

      if (providedUserId && !isValidUUID(providedUserId)) {
        return createErrorResponse(400, 'Invalid user_id format. Expected UUID.', 'VALIDATION_ERROR');
      }

      const { data, error: rpcError } = await supabase.rpc('remove_group_member', {
        p_group_id: groupId,
        p_user_id: userId,
      });

      if (rpcError) {
        const errorMessage = rpcError.message || 'Failed to remove member';
        
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

    return createErrorResponse(405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
  } catch (error: unknown) {
    return handleError(error, 'group-members handler');
  }
});
