import { Handler } from '@netlify/functions';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AuthResult, verifyAuth } from '../utils/auth';
import { createErrorResponse, handleError } from '../utils/error-handler';
import { createEmptyResponse, createSuccessResponse } from '../utils/response';
import { isValidUUID, validateBodySize, validateSettlementData } from '../utils/validation';

interface Settlement {
  id: string;
  group_id: string;
  from_user_id: string;
  to_user_id: string;
  amount: number;
  currency: string;
  notes?: string;
  created_by: string;
  created_at: string;
  from_user_email?: string;
  to_user_email?: string;
}

interface CreateSettlementRequest {
  group_id: string;
  from_user_id: string;
  to_user_id: string;
  amount: number;
  currency?: string;
  notes?: string;
}

interface UserResponse {
  id: string;
  email?: string;
  user?: {
    email?: string;
  };
}

/**
 * Enriches settlements with email addresses for from_user and to_user
 */
async function enrichSettlementsWithEmails(
  supabase: SupabaseClient,
  supabaseUrl: string,
  serviceRoleKey: string | undefined,
  settlements: Settlement[],
  currentUserId: string,
  currentUserEmail: string | null
): Promise<void> {
  if (!serviceRoleKey || settlements.length === 0) {
    return;
  }

  const userIds = new Set<string>();
  settlements.forEach(s => {
    userIds.add(s.from_user_id);
    userIds.add(s.to_user_id);
  });

  const userIdsArray = Array.from(userIds);
  
  // Fetch emails in parallel
  const emailPromises = userIdsArray.map(async (userId): Promise<{ userId: string; email: string | null }> => {
    if (userId === currentUserId && currentUserEmail) {
      return { userId, email: currentUserEmail };
    }

    try {
      const userResponse = await fetch(
        `${supabaseUrl}/auth/v1/admin/users/${userId}`,
        {
          headers: {
            'Authorization': `Bearer ${serviceRoleKey}`,
            'apikey': serviceRoleKey,
          },
        }
      );
      
      if (userResponse.ok) {
        const userData = await userResponse.json() as UserResponse;
        const email = userData.user?.email || userData.email || null;
        return { userId, email };
      }
    } catch (err) {
      // Log error but continue - email enrichment is optional
    }
    return { userId, email: null };
  });

  const emailResults = await Promise.allSettled(emailPromises);
  const emailMap = new Map<string, string>();
  
  for (const result of emailResults) {
    if (result.status === 'fulfilled' && result.value.email) {
      emailMap.set(result.value.userId, result.value.email);
    }
  }

  // Add emails to settlements
  settlements.forEach(s => {
    s.from_user_email = emailMap.get(s.from_user_id);
    s.to_user_email = emailMap.get(s.to_user_id);
  });
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

    const { user, supabaseUrl, supabaseKey, authHeader } = authResult;
    const currentUserId = user.id;
    const currentUserEmail = user.email;

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

    // Handle GET request - list settlements
    if (event.httpMethod === 'GET') {
      const groupId = event.queryStringParameters?.group_id;
      
      // Validate group_id format if provided (UUID format)
      if (groupId && !isValidUUID(groupId)) {
        return createErrorResponse(400, 'Invalid group_id format. Expected UUID.', 'VALIDATION_ERROR');
      }

      // Build query
      let query = supabase
        .from('settlements')
        .select('*')
        .order('created_at', { ascending: false });

      // Filter by group if provided
      if (groupId) {
        // Verify user is a member of the group
        const { data: membership } = await supabase
          .from('group_members')
          .select('group_id')
          .eq('group_id', groupId)
          .eq('user_id', currentUserId)
          .single();

        if (!membership) {
          return createErrorResponse(403, 'Forbidden: Not a member of this group', 'PERMISSION_DENIED');
        }

        query = query.eq('group_id', groupId);
      } else {
        // If no group_id, only return settlements where user is involved
        query = query.or(`from_user_id.eq.${currentUserId},to_user_id.eq.${currentUserId}`);
      }

      const { data: settlements, error } = await query;

      if (error) {
        return handleError(error, 'fetching settlements');
      }

      // Enrich with emails
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const enrichedSettlements = (settlements || []) as Settlement[];
      await enrichSettlementsWithEmails(
        supabase,
        supabaseUrl,
        serviceRoleKey,
        enrichedSettlements,
        currentUserId,
        currentUserEmail
      );

      return createSuccessResponse({ settlements: enrichedSettlements }, 200, 0); // No caching - real-time data
    }

    // Handle POST request - create settlement
    if (event.httpMethod === 'POST') {
      if (!event.body) {
        return createErrorResponse(400, 'Request body is required', 'VALIDATION_ERROR');
      }

      let settlementData: CreateSettlementRequest;
      try {
        settlementData = JSON.parse(event.body);
      } catch {
        return createErrorResponse(400, 'Invalid JSON in request body', 'VALIDATION_ERROR');
      }

      // Validate required fields
      if (!settlementData.group_id || !settlementData.from_user_id || !settlementData.to_user_id || !settlementData.amount) {
        return createErrorResponse(400, 'Missing required fields: group_id, from_user_id, to_user_id, amount', 'VALIDATION_ERROR');
      }

      // Validate settlement data
      const validation = validateSettlementData(settlementData);
      if (!validation.valid) {
        return createErrorResponse(400, validation.error || 'Invalid settlement data', 'VALIDATION_ERROR');
      }

      // Validate that current user is either the payer (from_user_id) or receiver (to_user_id)
      if (settlementData.from_user_id !== currentUserId && settlementData.to_user_id !== currentUserId) {
        return createErrorResponse(403, 'Forbidden: You can only create settlements where you are either the payer or receiver', 'PERMISSION_DENIED');
      }

      // Validate users are different
      if (settlementData.from_user_id === settlementData.to_user_id) {
        return createErrorResponse(400, 'from_user_id and to_user_id must be different', 'VALIDATION_ERROR');
      }

      // Verify user is a member of the group
      const { data: membership } = await supabase
        .from('group_members')
        .select('group_id')
        .eq('group_id', settlementData.group_id)
        .eq('user_id', currentUserId)
        .single();

      if (!membership) {
        return createErrorResponse(403, 'Forbidden: Not a member of this group', 'PERMISSION_DENIED');
      }

      // Verify to_user_id is also a member of the group OR has a pending invitation
      const { data: toUserCheck, error: toUserError } = await supabase
        .rpc('is_user_member_or_invited', {
          check_group_id: settlementData.group_id,
          check_user_id: settlementData.to_user_id
        });

      if (toUserError || !toUserCheck) {
        return createErrorResponse(400, 'to_user_id must be a member of this group or have a pending invitation', 'VALIDATION_ERROR');
      }

      // Also verify from_user_id is a member or invited (if not the current user)
      if (settlementData.from_user_id !== currentUserId) {
        const { data: fromUserCheck, error: fromUserError } = await supabase
          .rpc('is_user_member_or_invited', {
            check_group_id: settlementData.group_id,
            check_user_id: settlementData.from_user_id
          });

        if (fromUserError || !fromUserCheck) {
          return createErrorResponse(400, 'from_user_id must be a member of this group or have a pending invitation', 'VALIDATION_ERROR');
        }
      }

      // Create settlement
      const { data: settlement, error } = await supabase
        .from('settlements')
        .insert({
          group_id: settlementData.group_id,
          from_user_id: settlementData.from_user_id,
          to_user_id: settlementData.to_user_id,
          amount: settlementData.amount,
          currency: settlementData.currency || 'USD',
          notes: settlementData.notes || null,
          created_by: currentUserId,
        })
        .select()
        .single();

      if (error) {
        return handleError(error, 'creating settlement');
      }

      // Enrich with emails
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const enrichedSettlement = settlement as Settlement;
      await enrichSettlementsWithEmails(
        supabase,
        supabaseUrl,
        serviceRoleKey,
        [enrichedSettlement],
        currentUserId,
        currentUserEmail
      );

      return createSuccessResponse({ settlement: enrichedSettlement }, 201);
    }

    // Handle PUT request - update settlement
    if (event.httpMethod === 'PUT') {
      if (!event.body) {
        return createErrorResponse(400, 'Request body is required', 'VALIDATION_ERROR');
      }

      let updateData: { id: string; amount?: number; currency?: string; notes?: string };
      try {
        updateData = JSON.parse(event.body);
      } catch {
        return createErrorResponse(400, 'Invalid JSON in request body', 'VALIDATION_ERROR');
      }

      if (!updateData.id) {
        return createErrorResponse(400, 'Settlement id is required', 'VALIDATION_ERROR');
      }

      // Validate UUID format
      if (!isValidUUID(updateData.id)) {
        return createErrorResponse(400, 'Invalid settlement id format. Expected UUID.', 'VALIDATION_ERROR');
      }

      // Validate amount if provided
      if (updateData.amount !== undefined && updateData.amount <= 0) {
        return createErrorResponse(400, 'Amount must be greater than 0', 'VALIDATION_ERROR');
      }

      // Fetch the settlement to get group_id
      const { data: existingSettlement, error: fetchError } = await supabase
        .from('settlements')
        .select('id, group_id, created_by')
        .eq('id', updateData.id)
        .single();

      if (fetchError || !existingSettlement) {
        return createErrorResponse(404, 'Settlement not found', 'NOT_FOUND');
      }

      // Verify user can update: any group member can update any settlement in their group
      // This allows all group members to modify any settlement, regardless of who created it
      let canUpdate = false;
      
      if (existingSettlement.group_id) {
        // Check if user is a group member - if so, they can update any settlement in the group
        const { data: groupMember, error: memberError } = await supabase
          .from('group_members')
          .select('user_id')
          .eq('group_id', existingSettlement.group_id)
          .eq('user_id', currentUserId)
          .single();
        
        canUpdate = !memberError && !!groupMember;
      }
      
      // Also allow users to update settlements they created (even if not in a group)
      if (!canUpdate && existingSettlement.created_by === currentUserId) {
        canUpdate = true;
      }

      if (!canUpdate) {
        return createErrorResponse(403, 'Forbidden: You can only update settlements you created or settlements in groups you belong to', 'PERMISSION_DENIED');
      }

      // Build update object (only include fields that are provided)
      const updateFields: {
        amount?: number;
        currency?: string;
        notes?: string | null;
      } = {};

      if (updateData.amount !== undefined) {
        updateFields.amount = updateData.amount;
      }
      if (updateData.currency !== undefined) {
        updateFields.currency = updateData.currency;
      }
      if (updateData.notes !== undefined) {
        updateFields.notes = updateData.notes || null;
      }

      // Update settlement
      const { data: updatedSettlement, error: updateError } = await supabase
        .from('settlements')
        .update(updateFields)
        .eq('id', updateData.id)
        .select()
        .single();

      if (updateError) {
        return handleError(updateError, 'updating settlement');
      }

      // Enrich with emails
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const enrichedSettlement = updatedSettlement as Settlement;
      await enrichSettlementsWithEmails(
        supabase,
        supabaseUrl,
        serviceRoleKey,
        [enrichedSettlement],
        currentUserId,
        currentUserEmail
      );

      return createSuccessResponse({ settlement: enrichedSettlement }, 200);
    }

    // Handle DELETE request - delete settlement
    if (event.httpMethod === 'DELETE') {
      const settlementId = event.queryStringParameters?.id;

      if (!settlementId) {
        return createErrorResponse(400, 'Settlement id is required', 'VALIDATION_ERROR');
      }

      // Validate UUID format
      if (!isValidUUID(settlementId)) {
        return createErrorResponse(400, 'Invalid settlement id format. Expected UUID.', 'VALIDATION_ERROR');
      }

      // Fetch the settlement to get group_id
      const { data: existingSettlement, error: fetchError } = await supabase
        .from('settlements')
        .select('id, group_id, created_by')
        .eq('id', settlementId)
        .single();

      if (fetchError || !existingSettlement) {
        return createErrorResponse(404, 'Settlement not found', 'NOT_FOUND');
      }

      // Verify user can delete: any group member can delete any settlement in their group
      // This allows all group members to delete any settlement, regardless of who created it
      let canDelete = false;
      
      if (existingSettlement.group_id) {
        // Check if user is a group member - if so, they can delete any settlement in the group
        const { data: groupMember, error: memberError } = await supabase
          .from('group_members')
          .select('user_id')
          .eq('group_id', existingSettlement.group_id)
          .eq('user_id', currentUserId)
          .single();
        
        canDelete = !memberError && !!groupMember;
      }
      
      // Also allow users to delete settlements they created (even if not in a group)
      if (!canDelete && existingSettlement.created_by === currentUserId) {
        canDelete = true;
      }

      if (!canDelete) {
        return createErrorResponse(403, 'Forbidden: You can only delete settlements you created or settlements in groups you belong to', 'PERMISSION_DENIED');
      }

      // Delete settlement
      const { error: deleteError } = await supabase
        .from('settlements')
        .delete()
        .eq('id', settlementId);

      if (deleteError) {
        return handleError(deleteError, 'deleting settlement');
      }

      return createEmptyResponse(204);
    }

    // Method not allowed
    return createErrorResponse(405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
  } catch (error: unknown) {
    return handleError(error, 'settlements handler');
  }
};
