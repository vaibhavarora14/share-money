import { createClient } from 'jsr:@supabase/supabase-js@2';
import { verifyAuth } from '../_shared/auth.ts';
import { SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from '../_shared/env.ts';
import { createErrorResponse, handleError } from '../_shared/error-handler.ts';
import { createEmptyResponse, createSuccessResponse } from '../_shared/response.ts';

const DELETED_ACCOUNT_LABEL = 'Deleted account';

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return createEmptyResponse(200, req);
  }

  if (req.method !== 'DELETE' && req.method !== 'POST') {
    return createErrorResponse(405, 'Method not allowed', 'METHOD_NOT_ALLOWED', undefined, req);
  }

  try {
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      return createErrorResponse(
        500,
        'Server configuration error',
        'CONFIGURATION_ERROR',
        'Service role key is required to delete accounts',
        req,
      );
    }

    const { user } = await verifyAuth(req);
    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
    const now = new Date().toISOString();

    const { error: participantsError } = await serviceClient
      .from('participants')
      .update({
        type: 'former',
        user_id: null,
        email: null,
        full_name: DELETED_ACCOUNT_LABEL,
        avatar_url: null,
        left_at: now,
        updated_at: now,
      })
      .eq('user_id', user.id);

    if (participantsError) {
      return handleError(participantsError, 'anonymizing participants', req);
    }

    const { error: groupMembersError } = await serviceClient
      .from('group_members')
      .update({
        status: 'left',
        left_at: now,
      })
      .eq('user_id', user.id);

    if (groupMembersError) {
      return handleError(groupMembersError, 'marking group memberships left', req);
    }

    const { error: profileError } = await serviceClient
      .from('profiles')
      .update({
        full_name: DELETED_ACCOUNT_LABEL,
        avatar_url: null,
        phone: null,
        country_code: null,
        profile_completed: false,
        updated_at: now,
      })
      .eq('id', user.id);

    if (profileError) {
      return handleError(profileError, 'anonymizing profile', req);
    }

    const { error: deleteError } = await serviceClient.auth.admin.deleteUser(user.id, true);

    if (deleteError) {
      return handleError(deleteError, 'soft deleting auth user', req);
    }

    return createSuccessResponse({ deleted: true }, 200, 0, req);
  } catch (error) {
    return handleError(error, 'delete account', req);
  }
});
