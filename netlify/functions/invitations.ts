import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';
import { getCorsHeaders } from '../utils/cors';
import { verifyAuth, AuthResult } from '../utils/auth';
import { handleError, createErrorResponse } from '../utils/error-handler';
import { validateBodySize, isValidUUID, isValidEmail } from '../utils/validation';
import { createSuccessResponse, createEmptyResponse } from '../utils/response';

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

      // Validate and normalize email
      const normalizedEmail = requestData.email.toLowerCase().trim();
      
      if (!isValidEmail(normalizedEmail)) {
        return createErrorResponse(400, 'Invalid email address format', 'VALIDATION_ERROR');
      }

      // Verify user is owner of the group
      const { data: membership, error: membershipError } = await supabase
        .from('group_members')
        .select('role')
        .eq('group_id', requestData.group_id)
        .eq('user_id', currentUser.id)
        .single();

      if (membershipError || !membership || membership.role !== 'owner') {
        return createErrorResponse(403, 'Only group owners can create invitations', 'PERMISSION_DENIED');
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
          const usersData = await findUserResponse.json() as UsersResponse;
          const targetUser = Array.isArray(usersData.users) 
            ? usersData.users.find((u: SupabaseUser) => u.email?.toLowerCase() === normalizedEmail)
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
              return createErrorResponse(400, 'User is already a member of this group', 'VALIDATION_ERROR');
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
        return createErrorResponse(400, 'A pending invitation already exists for this email', 'VALIDATION_ERROR');
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
        return handleError(createError, 'creating invitation');
      }

      return createSuccessResponse(invitation, 201);
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
          return createErrorResponse(403, 'You must be a member of the group to view invitations', 'PERMISSION_DENIED');
        }

        query = query.eq('group_id', groupId);
      } else if (email) {
        // Users can view invitations sent to their email
        const userEmail = currentUser.email;
        if (!userEmail || userEmail.toLowerCase() !== email.toLowerCase()) {
          return createErrorResponse(403, 'You can only view invitations sent to your email', 'PERMISSION_DENIED');
        }
        query = query.eq('email', email.toLowerCase());
      }
      // If no filter, RLS will handle filtering to show only relevant invitations

      const { data: invitations, error } = await query;

      if (error) {
        return handleError(error, 'fetching invitations');
      }

      return createSuccessResponse(invitations || [], 200, 0); // No caching - real-time data
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
      // Get invitation to verify ownership
      const { data: invitation, error: fetchError } = await supabase
        .from('group_invitations')
        .select('group_id, status')
        .eq('id', invitationId)
        .single();

      if (fetchError || !invitation) {
        return createErrorResponse(404, 'Invitation not found', 'NOT_FOUND');
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
        return createErrorResponse(403, 'Only group owners can cancel invitations', 'PERMISSION_DENIED');
      }

      // Update status to cancelled instead of deleting (for audit trail)
      const { error: updateError } = await supabase
        .from('group_invitations')
        .update({ status: 'cancelled' })
        .eq('id', invitationId);

      if (updateError) {
        return handleError(updateError, 'cancelling invitation');
      }

      return createSuccessResponse({ success: true, message: 'Invitation cancelled successfully' }, 200);
    }

    // Method not allowed
    return createErrorResponse(405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
  } catch (error: unknown) {
    return handleError(error, 'invitations handler');
  }
};

