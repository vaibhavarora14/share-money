import { createClient } from 'jsr:@supabase/supabase-js@2';
import { verifyAuth } from '../_shared/auth.ts';
import { createErrorResponse, handleError } from '../_shared/error-handler.ts';
import { validateGroupData, isValidUUID, validateBodySize } from '../_shared/validation.ts';
import { createSuccessResponse, createEmptyResponse } from '../_shared/response.ts';

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
  members?: Array<GroupMember & { email?: string }>;
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return createEmptyResponse(200);
  }

  try {
    // Validate request body size
    const body = await req.text().catch(() => null);
    const bodySizeValidation = validateBodySize(body);
    if (!bodySizeValidation.valid) {
      return createErrorResponse(413, bodySizeValidation.error || 'Request body too large', 'VALIDATION_ERROR');
    }

    // Verify authentication
    let authResult;
    try {
      authResult = await verifyAuth(req);
    } catch (authError) {
      return handleError(authError, 'authentication');
    }

    const { user, supabase } = authResult;
    const currentUserEmail = user.email;

    const httpMethod = req.method;
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    const groupId = pathParts[pathParts.length - 1] !== 'groups' 
      ? pathParts[pathParts.length - 1] 
      : null;

    // Handle GET /groups - List all groups user belongs to
    if (httpMethod === 'GET' && !groupId) {
      const { data: groups, error } = await supabase
        .from('groups')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        return handleError(error, 'fetching groups');
      }

      return createSuccessResponse(groups || [], 200, 0); // No caching - real-time data
    }

    // Handle GET /groups/:id - Get group details with members
    if (httpMethod === 'GET' && groupId) {
      // Validate group_id format
      if (!isValidUUID(groupId)) {
        return createErrorResponse(400, 'Invalid group_id format. Expected UUID.', 'VALIDATION_ERROR');
      }

      // Get group details
      const { data: group, error: groupError } = await supabase
        .from('groups')
        .select('*')
        .eq('id', groupId)
        .single();

      if (groupError || !group) {
        return createErrorResponse(404, 'Group not found', 'NOT_FOUND');
      }

      // Get group members
      const { data: members, error: membersError } = await supabase
        .from('group_members')
        .select('*')
        .eq('group_id', groupId)
        .order('joined_at', { ascending: true });

      if (membersError) {
        return handleError(membersError, 'fetching group members');
      }

      // Try to get user emails using admin API if service role key is available
      // Also include current user's email if they're a member
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      let membersWithEmails = members || [];

      if (serviceRoleKey && supabaseUrl) {
        try {
          membersWithEmails = await Promise.all(
            (members || []).map(async (member) => {
              // If this is the current user, use their email directly
              if (member.user_id === user.id && currentUserEmail) {
                return {
                  ...member,
                  email: currentUserEmail,
                };
              }

              // Otherwise, fetch from Admin API
              try {
                const userResponse = await fetch(
                  `${supabaseUrl}/auth/v1/admin/users/${member.user_id}`,
                  {
                    headers: {
                      'Authorization': `Bearer ${serviceRoleKey}`,
                      'apikey': serviceRoleKey,
                    },
                  }
                );
                if (userResponse.ok) {
                  const userData = await userResponse.json();
                  const email = userData.user?.email || userData.email || userData?.email || null;
                  return {
                    ...member,
                    email: email,
                  };
                } else {
                  const errorText = await userResponse.text();
                  console.error(`Failed to fetch user ${member.user_id}: ${userResponse.status} - ${errorText}`);
                }
              } catch (err) {
                console.error(`Error fetching user ${member.user_id}:`, err);
              }
              return member;
            })
          );
        } catch (err) {
          console.error('Error fetching member emails:', err);
        }
      } else {
        // If no service role key, at least set current user's email
        membersWithEmails = (members || []).map(member => {
          if (member.user_id === user.id && currentUserEmail) {
            return {
              ...member,
              email: currentUserEmail,
            };
          }
          return member;
        });
      }

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
        return createErrorResponse(400, 'Invalid JSON in request body', 'VALIDATION_ERROR');
      }

      // Validate required fields
      if (!groupData.name || !groupData.name.trim()) {
        return createErrorResponse(400, 'Missing required field: name', 'VALIDATION_ERROR');
      }

      // Validate group data
      const validation = validateGroupData(groupData);
      if (!validation.valid) {
        return createErrorResponse(400, validation.error || 'Invalid group data', 'VALIDATION_ERROR');
      }

      // Create group using SECURITY DEFINER function to bypass RLS issues
      // This ensures auth.uid() is properly recognized
      const { data: groupResult, error } = await supabase.rpc('create_group', {
        group_name: groupData.name.trim(),
        group_description: groupData.description?.trim() || null,
      });

      if (error) {
        return handleError(error, 'creating group');
      }

      // Fetch the created group to return full details
      const { data: group, error: fetchError } = await supabase
        .from('groups')
        .select('*')
        .eq('id', groupResult)
        .single();

      if (fetchError || !group) {
        return handleError(fetchError || new Error('Group not found after creation'), 'fetching created group');
      }

      return createSuccessResponse(group, 201);
    }

    // Handle DELETE /groups/:id - Delete group
    if (httpMethod === 'DELETE' && groupId) {
      // Verify user is the owner
      const { data: group, error: groupError } = await supabase
        .from('groups')
        .select('created_by')
        .eq('id', groupId)
        .single();

      if (groupError || !group) {
        return createErrorResponse(404, 'Group not found', 'NOT_FOUND');
      }

      if (group.created_by !== user.id) {
        return createErrorResponse(403, 'Only group owners can delete groups', 'PERMISSION_DENIED');
      }

      const { error: deleteError } = await supabase
        .from('groups')
        .delete()
        .eq('id', groupId);

      if (deleteError) {
        return handleError(deleteError, 'deleting group');
      }

      return createSuccessResponse({ success: true, message: 'Group deleted successfully' }, 200);
    }

    // Method not allowed
    return createErrorResponse(405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
  } catch (error: unknown) {
    return handleError(error, 'groups handler');
  }
});
