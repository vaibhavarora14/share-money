import { verifyAuth } from '../_shared/auth.ts';
import { SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from '../_shared/env.ts';
import { createErrorResponse, handleError } from '../_shared/error-handler.ts';
import { parsePath } from '../_shared/path-parser.ts';
import { createEmptyResponse, createSuccessResponse } from '../_shared/response.ts';
import { isValidEmail, isValidUUID, validateBodySize } from '../_shared/validation.ts';

/**
 * Invitations Edge Function
 * 
 * Handles group invitation operations:
 * - GET /invitations?group_id=xxx - List invitations (optionally filtered by group or email)
 * - POST /invitations - Create new invitation
 * - POST /invitations/:id/accept - Accept invitation
 * - DELETE /invitations/:id - Cancel invitation (owners only)
 * 
 * @route /functions/v1/invitations
 * @requires Authentication
 */

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
  user_id?: string; // User ID if the invited user has signed up
}

interface CreateInvitationRequest {
  group_id: string;
  email: string;
}

interface SupabaseUser {
  id: string;
  email?: string;
}

interface UsersResponse {
  users: SupabaseUser[];
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return createEmptyResponse(200, req);
  }

  try {
    const body = await req.text().catch(() => null);
    const bodySizeValidation = validateBodySize(body);
    if (!bodySizeValidation.valid) {
      return createErrorResponse(413, bodySizeValidation.error || 'Request body too large', 'VALIDATION_ERROR', undefined, req);
    }

    let authResult;
    try {
      authResult = await verifyAuth(req);
    } catch (authError) {
      return handleError(authError, 'authentication', req);
    }

    const { user: currentUser, supabase } = authResult;
    const httpMethod = req.method;
    const url = new URL(req.url);
    const parsedPath = parsePath(url.pathname);
    const invitationId = parsedPath.resource === 'invitations' ? parsedPath.id : null;
    const action = parsedPath.resource === 'invitations' ? parsedPath.action : null;

    // Handle POST /invitations - Create invitation
    if (httpMethod === 'POST' && !invitationId) {
      let requestData: CreateInvitationRequest;
      try {
        requestData = body ? JSON.parse(body) : {};
      } catch {
        return createErrorResponse(400, 'Invalid JSON in request body', 'VALIDATION_ERROR', undefined, req);
      }

      if (!requestData.group_id || !requestData.email) {
        return createErrorResponse(400, 'Missing required fields: group_id, email', 'VALIDATION_ERROR', undefined, req);
      }

      if (!isValidUUID(requestData.group_id)) {
        return createErrorResponse(400, 'Invalid group_id format. Expected UUID.', 'VALIDATION_ERROR', undefined, req);
      }

      const normalizedEmail = requestData.email.toLowerCase().trim();
      
      if (!isValidEmail(normalizedEmail)) {
        return createErrorResponse(400, 'Invalid email address format', 'VALIDATION_ERROR', undefined, req);
      }

      const { data: membership, error: membershipError } = await supabase
        .from('group_members')
        .select('id')
        .eq('group_id', requestData.group_id)
        .eq('user_id', currentUser.id)
        .single();

      if (membershipError || !membership) {
        return createErrorResponse(403, 'You must be a group member to create invitations', 'PERMISSION_DENIED', undefined, req);
      }

      if (SUPABASE_SERVICE_ROLE_KEY) {
        const findUserResponse = await fetch(
          `${SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(normalizedEmail)}`,
          {
            headers: {
              'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              'apikey': SUPABASE_SERVICE_ROLE_KEY,
            },
          }
        );

        if (findUserResponse.ok) {
          const usersData = await findUserResponse.json() as UsersResponse;
          const targetUser = Array.isArray(usersData.users) 
            ? usersData.users.find((u: SupabaseUser) => u.email?.toLowerCase() === normalizedEmail)
            : usersData.users?.[0];

          if (targetUser && targetUser.id) {
            const { data: existingMember } = await supabase
              .from('group_members')
              .select('id')
              .eq('group_id', requestData.group_id)
              .eq('user_id', targetUser.id)
              .single();

            if (existingMember) {
              return createErrorResponse(400, 'User is already a member of this group', 'VALIDATION_ERROR', undefined, req);
            }
          }
        }
      }

      const { data: existingInvitation } = await supabase
        .from('group_invitations')
        .select('id')
        .eq('group_id', requestData.group_id)
        .eq('email', normalizedEmail)
        .eq('status', 'pending')
        .single();

      if (existingInvitation) {
        return createErrorResponse(400, 'A pending invitation already exists for this email', 'VALIDATION_ERROR', undefined, req);
      }

      // Generate a unique token for the invitation using Deno crypto
      const tokenArray = new Uint8Array(32);
      crypto.getRandomValues(tokenArray);
      const token = Array.from(tokenArray)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

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
        return handleError(createError, 'creating invitation', req);
      }

      return createSuccessResponse(invitation, 201, 0, req);
    }

    // Handle GET /invitations - List invitations
    if (httpMethod === 'GET' && !invitationId) {
      const url = new URL(req.url);
      const groupId = url.searchParams.get('group_id');
      const email = url.searchParams.get('email');

      let query = supabase
        .from('group_invitations')
        .select('id, group_id, email, invited_by, status, token, expires_at, created_at, accepted_at')
        .order('created_at', { ascending: false });

      if (groupId) {
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
          return createErrorResponse(403, 'You must be a member of the group to view invitations', 'PERMISSION_DENIED', undefined, req);
        }

        query = query.eq('group_id', groupId);
      } else if (email) {
        const userEmail = currentUser.email;
        if (!userEmail || userEmail.toLowerCase() !== email.toLowerCase()) {
          return createErrorResponse(403, 'You can only view invitations sent to your email', 'PERMISSION_DENIED', undefined, req);
        }
        query = query.eq('email', email.toLowerCase());
      }

      const { data: invitations, error } = await query;

      if (error) {
        return handleError(error, 'fetching invitations', req);
      }

      // Enrich invitations with user_id for invited users who have signed up
      const enrichedInvitations = await Promise.all(
        (invitations || []).map(async (invitation: GroupInvitation) => {
          // Only look up user_id for pending invitations
          if (invitation.status !== 'pending' || !SUPABASE_SERVICE_ROLE_KEY) {
            return invitation;
          }

          try {
            const findUserResponse = await fetch(
              `${SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(invitation.email.toLowerCase())}`,
              {
                headers: {
                  'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                  'apikey': SUPABASE_SERVICE_ROLE_KEY,
                },
              }
            );

            if (findUserResponse.ok) {
              const usersData = await findUserResponse.json() as UsersResponse;
              const targetUser = Array.isArray(usersData.users)
                ? usersData.users.find((u: SupabaseUser) => u.email?.toLowerCase() === invitation.email.toLowerCase())
                : usersData.users?.[0];

              if (targetUser?.id) {
                return {
                  ...invitation,
                  user_id: targetUser.id,
                };
              }
            }
          } catch (err) {
            // If lookup fails, just return invitation without user_id
            // This is expected for users who haven't signed up yet
          }

          return invitation;
        })
      );

      return createSuccessResponse(enrichedInvitations || [], 200, 0, req);
    }

    // Handle POST /invitations/:id/accept - Accept invitation
    if (httpMethod === 'POST' && invitationId && action === 'accept') {
      const { data, error: rpcError } = await supabase.rpc('accept_group_invitation', {
        invitation_id: invitationId,
        accepting_user_id: currentUser.id,
      });

      if (rpcError) {
        return handleError(rpcError, 'accepting invitation', req);
      }

      return createSuccessResponse({ success: true, message: 'Invitation accepted successfully' }, 200, 0, req);
    }

    // Handle DELETE /invitations/:id - Cancel invitation
    if (httpMethod === 'DELETE' && invitationId) {
      const { data: invitation, error: fetchError } = await supabase
        .from('group_invitations')
        .select('group_id, status')
        .eq('id', invitationId)
        .single();

      if (fetchError || !invitation) {
        return createErrorResponse(404, 'Invitation not found', 'NOT_FOUND', undefined, req);
      }

      const { data: membership } = await supabase
        .from('group_members')
        .select('id')
        .eq('group_id', invitation.group_id)
        .eq('user_id', currentUser.id)
        .single();

      if (!membership) {
        return createErrorResponse(403, 'You must be a group member to cancel invitations', 'PERMISSION_DENIED', undefined, req);
      }

      const { error: updateError } = await supabase
        .from('group_invitations')
        .update({ status: 'cancelled' })
        .eq('id', invitationId);

      if (updateError) {
        return handleError(updateError, 'cancelling invitation', req);
      }

      return createSuccessResponse({ success: true, message: 'Invitation cancelled successfully' }, 200, 0, req);
    }

    return createErrorResponse(405, 'Method not allowed', 'METHOD_NOT_ALLOWED', undefined, req);
  } catch (error: unknown) {
    return handleError(error, 'invitations handler', req);
  }
});
