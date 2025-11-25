import { verifyAuth } from '../_shared/auth.ts';
import { createErrorResponse, handleError } from '../_shared/error-handler.ts';
import { createSuccessResponse } from '../_shared/response.ts';
import { validateBodySize, isValidUUID, isValidEmail } from '../_shared/validation.ts';

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

interface SupabaseUser {
  id: string;
  email?: string;
}

interface UsersResponse {
  users: SupabaseUser[];
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
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const httpMethod = req.method;
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
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

      const normalizedEmail = requestData.email.toLowerCase().trim();
      
      if (!isValidEmail(normalizedEmail)) {
        return createErrorResponse(400, 'Invalid email address format', 'VALIDATION_ERROR');
      }

      const { data: membership, error: membershipError } = await supabase
        .from('group_members')
        .select('role')
        .eq('group_id', requestData.group_id)
        .eq('user_id', currentUser.id)
        .single();

      if (membershipError || !membership || membership.role !== 'owner') {
        return createErrorResponse(403, 'Only group owners can create invitations', 'PERMISSION_DENIED');
      }

      const adminKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
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
              return createErrorResponse(400, 'User is already a member of this group', 'VALIDATION_ERROR');
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
        return createErrorResponse(400, 'A pending invitation already exists for this email', 'VALIDATION_ERROR');
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
        return handleError(createError, 'creating invitation');
      }

      return createSuccessResponse(invitation, 201);
    }

    // Handle GET /invitations - List invitations
    if (httpMethod === 'GET' && !invitationId) {
      const url = new URL(req.url);
      const groupId = url.searchParams.get('group_id');
      const email = url.searchParams.get('email');

      let query = supabase
        .from('group_invitations')
        .select('*')
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
          return createErrorResponse(403, 'You must be a member of the group to view invitations', 'PERMISSION_DENIED');
        }

        query = query.eq('group_id', groupId);
      } else if (email) {
        const userEmail = currentUser.email;
        if (!userEmail || userEmail.toLowerCase() !== email.toLowerCase()) {
          return createErrorResponse(403, 'You can only view invitations sent to your email', 'PERMISSION_DENIED');
        }
        query = query.eq('email', email.toLowerCase());
      }

      const { data: invitations, error } = await query;

      if (error) {
        return handleError(error, 'fetching invitations');
      }

      return createSuccessResponse(invitations || [], 200, 0);
    }

    // Handle POST /invitations/:id/accept - Accept invitation
    if (httpMethod === 'POST' && invitationId && action === 'accept') {
      const { data, error: rpcError } = await supabase.rpc('accept_group_invitation', {
        invitation_id: invitationId,
        accepting_user_id: currentUser.id,
      });

      if (rpcError) {
        return handleError(rpcError, 'accepting invitation');
      }

      return createSuccessResponse({ success: true, message: 'Invitation accepted successfully' }, 200);
    }

    // Handle DELETE /invitations/:id - Cancel invitation
    if (httpMethod === 'DELETE' && invitationId) {
      const { data: invitation, error: fetchError } = await supabase
        .from('group_invitations')
        .select('group_id, status')
        .eq('id', invitationId)
        .single();

      if (fetchError || !invitation) {
        return createErrorResponse(404, 'Invitation not found', 'NOT_FOUND');
      }

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
        return createErrorResponse(403, 'Only group owners can cancel invitations', 'PERMISSION_DENIED');
      }

      const { error: updateError } = await supabase
        .from('group_invitations')
        .update({ status: 'cancelled' })
        .eq('id', invitationId);

      if (updateError) {
        return handleError(updateError, 'cancelling invitation');
      }

      return createSuccessResponse({ success: true, message: 'Invitation cancelled successfully' }, 200);
    }

    return createErrorResponse(405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
  } catch (error: unknown) {
    return handleError(error, 'invitations handler');
  }
});
