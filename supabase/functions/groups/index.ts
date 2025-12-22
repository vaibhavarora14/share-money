import { verifyAuth } from '../_shared/auth.ts';
import { createErrorResponse, handleError } from '../_shared/error-handler.ts';
import { parsePath } from '../_shared/path-parser.ts';
import { createEmptyResponse, createSuccessResponse } from '../_shared/response.ts';
import { fetchUserEmails } from '../_shared/user-email.ts';
import { fetchUserProfiles } from '../_shared/user-profiles.ts';
import { isValidUUID, validateBodySize, validateGroupData } from '../_shared/validation.ts';
import { requireMinVersion } from '../_shared/version-check.ts';

/**
 * Groups Edge Function
 * 
 * Handles CRUD operations for expense groups:
 * - GET /groups - List all groups user belongs to
 * - GET /groups/:id - Get group details with members
 * - POST /groups - Create new group
 * - DELETE /groups/:id - Delete group (owners only)
 * 
 * @route /functions/v1/groups
 * @requires Authentication
 */

interface Group {
  id: string;
  name: string;
  description?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface GroupMember {
  id: string;
  group_id: string;
  user_id: string;
  role: 'owner' | 'member';
  joined_at: string;
}

interface GroupWithMembers extends Group {
  members?: Array<GroupMember & { email?: string; full_name?: string | null; avatar_url?: string | null }>;
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return createEmptyResponse(200, req);
  }

  // Check app version - return 426 if outdated
  const versionError = requireMinVersion(req);
  if (versionError) {
    return versionError;
  }

  try {
    // Validate request body size
    const body = await req.text().catch(() => null);
    const bodySizeValidation = validateBodySize(body);
    if (!bodySizeValidation.valid) {
      return createErrorResponse(413, bodySizeValidation.error || 'Request body too large', 'VALIDATION_ERROR', undefined, req);
    }

    // Verify authentication
    let authResult;
    try {
      authResult = await verifyAuth(req);
    } catch (authError) {
      return handleError(authError, 'authentication', req);
    }

    const { user, supabase } = authResult;
    const currentUserEmail = user.email;

    const httpMethod = req.method;
    const url = new URL(req.url);
    const parsedPath = parsePath(url.pathname);
    const groupId = parsedPath.resource === 'groups' ? parsedPath.id : null;

    // Handle GET /groups - List all groups user belongs to
    if (httpMethod === 'GET' && !groupId) {
      // Get groups and include the user's membership status
      const { data: groups, error } = await supabase
        .from('groups')
        .select(`
          id, 
          name, 
          description, 
          created_by, 
          created_at, 
          updated_at,
          group_members!inner(status)
        `)
        .eq('group_members.user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        return handleError(error, 'fetching groups', req);
      }

      // Flatten the response and extract status
      const flattenedGroups = (groups || []).map((g: any) => ({
        ...g,
        user_status: g.group_members?.[0]?.status || 'active',
        group_members: undefined // Remove nesting
      }));

      // Sort: active/invited first, left (former) last. 
      // Secondary sort is created_at (already handled by DB query, but sort is stable)
      flattenedGroups.sort((a: any, b: any) => {
        if (a.user_status === 'left' && b.user_status !== 'left') return 1;
        if (a.user_status !== 'left' && b.user_status === 'left') return -1;
        return 0; // Keep DB order (created_at DESC) for same statuses
      });

      return createSuccessResponse(flattenedGroups, 200, 0, req); // No caching - real-time data
    }

    // Handle GET /groups/:id - Get group details with members
    if (httpMethod === 'GET' && groupId) {
      // Validate group_id format
      if (!isValidUUID(groupId)) {
        return createErrorResponse(400, 'Invalid group_id format. Expected UUID.', 'VALIDATION_ERROR', undefined, req);
      }

      // Get group details
      const { data: group, error: groupError } = await supabase
        .from('groups')
        .select('id, name, description, created_by, created_at, updated_at')
        .eq('id', groupId)
        .single();

      if (groupError || !group) {
        return createErrorResponse(404, 'Group not found', 'NOT_FOUND');
      }

      // Get group members
      const { data: members, error: membersError } = await supabase
        .from('group_members')
        .select('id, group_id, user_id, role, joined_at, status, left_at')
        .eq('group_id', groupId)
        .order('joined_at', { ascending: true });

      if (membersError) {
        return handleError(membersError, 'fetching group members', req);
      }

      // Enrich members with email addresses and profile data using shared utilities
      const memberIds = new Set((members || []).map((m: GroupMember) => m.user_id));
      const [emailMap, profileMap, participantsResult] = await Promise.all([
        fetchUserEmails(Array.from(memberIds) as string[], user.id, currentUserEmail),
        fetchUserProfiles(supabase, Array.from(memberIds) as string[]),
        supabase
          .from('participants')
          .select('id, user_id')
          .eq('group_id', groupId)
          .in('user_id', Array.from(memberIds))
      ]);
      
      const participants = participantsResult.data || [];
      const participantMap = new Map(participants.map((p: any) => [p.user_id, p.id]));
      
      const membersWithEmails = (members || []).map((member: any) => {
        const profile = profileMap.get(member.user_id);
        return {
          ...member,
          email: emailMap.get(member.user_id),
          full_name: profile?.full_name || null,
          avatar_url: profile?.avatar_url || null,
          participant_id: participantMap.get(member.user_id) || null,
        };
      });

      const groupWithMembers: GroupWithMembers = {
        ...group,
        members: membersWithEmails,
      };

      return createSuccessResponse(groupWithMembers, 200, 0); // No caching - real-time data
    }

    // Handle POST /groups - Create new group
    if (httpMethod === 'POST') {
      let groupData: Partial<Group>;
      try {
        groupData = body ? JSON.parse(body) : {};
      } catch {
        return createErrorResponse(400, 'Invalid JSON in request body', 'VALIDATION_ERROR', undefined, req);
      }

      // Validate required fields
      if (!groupData.name || !groupData.name.trim()) {
        return createErrorResponse(400, 'Missing required field: name', 'VALIDATION_ERROR', undefined, req);
      }

      // Validate group data
      const validation = validateGroupData(groupData);
      if (!validation.valid) {
        return createErrorResponse(400, validation.error || 'Invalid group data', 'VALIDATION_ERROR', undefined, req);
      }

      // Create group using SECURITY DEFINER function to bypass RLS issues
      // This ensures auth.uid() is properly recognized
      const { data: groupResult, error } = await supabase.rpc('create_group', {
        group_name: groupData.name.trim(),
        group_description: groupData.description?.trim() || null,
      });

      if (error) {
        return handleError(error, 'creating group', req);
      }

      // Fetch the created group to return full details
      const { data: group, error: fetchError } = await supabase
        .from('groups')
        .select('id, name, description, created_by, created_at, updated_at')
        .eq('id', groupResult)
        .single();

      if (fetchError || !group) {
        return handleError(fetchError || new Error('Group not found after creation'), 'fetching created group');
      }

      return createSuccessResponse(group, 201);
    }

    // Method not allowed
    return createErrorResponse(405, 'Method not allowed', 'METHOD_NOT_ALLOWED', undefined, req);
  } catch (error: unknown) {
    return handleError(error, 'groups handler', req);
  }
});
