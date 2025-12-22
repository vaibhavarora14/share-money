import { verifyAuth } from '../_shared/auth.ts';
import { createErrorResponse, handleError } from '../_shared/error-handler.ts';
import { createEmptyResponse, createSuccessResponse } from '../_shared/response.ts';
import { fetchUserEmails } from '../_shared/user-email.ts';
import { fetchUserProfiles } from '../_shared/user-profiles.ts';
import { isValidUUID } from '../_shared/validation.ts';

/**
 * Participants Edge Function
 * 
 * Handles fetching participants for a group:
 * - GET /participants?group_id=xxx - Get all participants (members, invited, former) for a group
 * 
 * @route /functions/v1/participants
 * @requires Authentication
 */

interface Participant {
  id: string;
  group_id: string;
  user_id?: string | null;
  email?: string | null;
  type: 'member' | 'invited' | 'former';
  role?: 'owner' | 'member';
  full_name?: string | null;
  avatar_url?: string | null;
  joined_at?: string | null;
  left_at?: string | null;
  created_at: string;
  updated_at: string;
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return createEmptyResponse(200, req);
  }

  try {
    const authResult = await verifyAuth(req);
    const { user, supabase } = authResult;

    const url = new URL(req.url);
    const groupId = url.searchParams.get('group_id');

    if (!groupId) {
      return createErrorResponse(400, 'group_id query parameter is required', 'VALIDATION_ERROR', undefined, req);
    }

    if (!isValidUUID(groupId)) {
      return createErrorResponse(400, 'Invalid group_id format. Expected UUID.', 'VALIDATION_ERROR', undefined, req);
    }

    // Verify user is a member of the group or is the group owner
    const { data: membership, error: membershipError } = await supabase
      .from('group_members')
      .select('id')
      .eq('group_id', groupId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (membershipError || !membership) {
      // Also check if user is the group owner
      const { data: group, error: groupError } = await supabase
        .from('groups')
        .select('created_by')
        .eq('id', groupId)
        .single();

      if (groupError || !group || group.created_by !== user.id) {
        return createErrorResponse(403, 'You must be a member of the group to view participants', 'PERMISSION_DENIED', undefined, req);
      }
    }

    // Fetch all participants for the group
    let { data: participants, error: participantsError } = await supabase
      .from('participants')
      .select('*')
      .eq('group_id', groupId)
      .order('created_at', { ascending: true });

    if (participantsError) {
      return handleError(participantsError, 'fetching participants');
    }

    // Enrich participants with profile data and emails
    if (participants && participants.length > 0) {
      // Collect all user_ids from participants (members and former members)
      const userIds: string[] = [];
      participants.forEach((p: Participant) => {
        if (p.user_id) {
          userIds.push(p.user_id);
        }
      });

      // Fetch profile data and emails for members
      const currentUserEmail = user.email || null;
      const [emailMap, profileMap] = await Promise.all([
        fetchUserEmails(userIds, user.id, currentUserEmail),
        fetchUserProfiles(supabase, userIds),
      ]);

      // Enrich participants with profile data
      participants = participants.map((p: Participant) => {
        if (p.user_id) {
          const profile = profileMap.get(p.user_id);
          const email = emailMap.get(p.user_id);
          
          return {
            ...p,
            full_name: p.full_name || profile?.full_name || null,
            avatar_url: p.avatar_url || profile?.avatar_url || null,
            email: p.email || email || null,
          };
        }
        return p;
      });
    }

    return createSuccessResponse(participants || [], 200, 0, req);
  } catch (error: unknown) {
    return handleError(error, 'participants handler', req);
  }
});

