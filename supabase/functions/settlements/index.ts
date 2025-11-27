import { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { verifyAuth } from '../_shared/auth.ts';
import { createErrorResponse, handleError } from '../_shared/error-handler.ts';
import { createSuccessResponse, createEmptyResponse } from '../_shared/response.ts';
import { isValidUUID, validateBodySize, validateSettlementData } from '../_shared/validation.ts';
import { fetchUserEmails } from '../_shared/user-email.ts';

/**
 * Settlements Edge Function
 * 
 * Handles CRUD operations for settlements (payments between users):
 * - GET /settlements?group_id=xxx - List settlements (optionally filtered by group)
 * - POST /settlements - Create new settlement
 * - PUT /settlements - Update existing settlement
 * - DELETE /settlements?id=xxx - Delete settlement
 * 
 * @route /functions/v1/settlements
 * @requires Authentication
 */

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

async function enrichSettlementsWithEmails(
  settlements: Settlement[],
  currentUserId: string,
  currentUserEmail: string | null
): Promise<void> {
  if (settlements.length === 0) {
    return;
  }

  const userIds = new Set<string>();
  settlements.forEach(s => {
    userIds.add(s.from_user_id);
    userIds.add(s.to_user_id);
  });

  const userIdsArray = Array.from(userIds);
  const emailMap = await fetchUserEmails(userIdsArray, currentUserId, currentUserEmail);

  settlements.forEach(s => {
    s.from_user_email = emailMap.get(s.from_user_id);
    s.to_user_email = emailMap.get(s.to_user_id);
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return createEmptyResponse(200);
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

    const { user, supabase } = authResult;
    const currentUserId = user.id;
    const currentUserEmail = user.email;

    if (req.method === 'GET') {
      const url = new URL(req.url);
      const groupId = url.searchParams.get('group_id');
      
      if (groupId && !isValidUUID(groupId)) {
        return createErrorResponse(400, 'Invalid group_id format. Expected UUID.', 'VALIDATION_ERROR');
      }

      let query = supabase
        .from('settlements')
        .select('id, group_id, from_user_id, to_user_id, amount, currency, notes, created_by, created_at')
        .order('created_at', { ascending: false });

      if (groupId) {
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
        query = query.or(`from_user_id.eq.${currentUserId},to_user_id.eq.${currentUserId}`);
      }

      const { data: settlements, error } = await query;

      if (error) {
        return handleError(error, 'fetching settlements');
      }

      const enrichedSettlements = (settlements || []) as Settlement[];
      await enrichSettlementsWithEmails(
        enrichedSettlements,
        currentUserId,
        currentUserEmail
      );

      return createSuccessResponse({ settlements: enrichedSettlements }, 200, 0);
    }

    if (req.method === 'POST') {
      if (!body) {
        return createErrorResponse(400, 'Request body is required', 'VALIDATION_ERROR');
      }

      let settlementData: CreateSettlementRequest;
      try {
        settlementData = JSON.parse(body);
      } catch {
        return createErrorResponse(400, 'Invalid JSON in request body', 'VALIDATION_ERROR');
      }

      if (!settlementData.group_id || !settlementData.from_user_id || !settlementData.to_user_id || !settlementData.amount) {
        return createErrorResponse(400, 'Missing required fields: group_id, from_user_id, to_user_id, amount', 'VALIDATION_ERROR');
      }

      const validation = validateSettlementData(settlementData);
      if (!validation.valid) {
        return createErrorResponse(400, validation.error || 'Invalid settlement data', 'VALIDATION_ERROR');
      }

      if (settlementData.from_user_id !== currentUserId && settlementData.to_user_id !== currentUserId) {
        return createErrorResponse(403, 'Forbidden: You can only create settlements where you are either the payer or receiver', 'PERMISSION_DENIED');
      }

      if (settlementData.from_user_id === settlementData.to_user_id) {
        return createErrorResponse(400, 'from_user_id and to_user_id must be different', 'VALIDATION_ERROR');
      }

      const { data: membership } = await supabase
        .from('group_members')
        .select('group_id')
        .eq('group_id', settlementData.group_id)
        .eq('user_id', currentUserId)
        .single();

      if (!membership) {
        return createErrorResponse(403, 'Forbidden: Not a member of this group', 'PERMISSION_DENIED');
      }

      const { data: toUserMembership } = await supabase
        .from('group_members')
        .select('group_id')
        .eq('group_id', settlementData.group_id)
        .eq('user_id', settlementData.to_user_id)
        .single();

      if (!toUserMembership) {
        return createErrorResponse(400, 'to_user_id is not a member of this group', 'VALIDATION_ERROR');
      }

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

      const enrichedSettlement = settlement as Settlement;
      await enrichSettlementsWithEmails(
        [enrichedSettlement],
        currentUserId,
        currentUserEmail
      );

      return createSuccessResponse({ settlement: enrichedSettlement }, 201);
    }

    if (req.method === 'PUT') {
      if (!body) {
        return createErrorResponse(400, 'Request body is required', 'VALIDATION_ERROR');
      }

      let updateData: { id: string; amount?: number; currency?: string; notes?: string };
      try {
        updateData = JSON.parse(body);
      } catch {
        return createErrorResponse(400, 'Invalid JSON in request body', 'VALIDATION_ERROR');
      }

      if (!updateData.id) {
        return createErrorResponse(400, 'Settlement id is required', 'VALIDATION_ERROR');
      }

      if (!isValidUUID(updateData.id)) {
        return createErrorResponse(400, 'Invalid settlement id format. Expected UUID.', 'VALIDATION_ERROR');
      }

      if (updateData.amount !== undefined && updateData.amount <= 0) {
        return createErrorResponse(400, 'Amount must be greater than 0', 'VALIDATION_ERROR');
      }

      const { data: existingSettlement, error: fetchError } = await supabase
        .from('settlements')
        .select('id, created_by')
        .eq('id', updateData.id)
        .single();

      if (fetchError || !existingSettlement) {
        return createErrorResponse(404, 'Settlement not found', 'NOT_FOUND');
      }

      if (existingSettlement.created_by !== currentUserId) {
        return createErrorResponse(403, 'Forbidden: You can only update settlements you created', 'PERMISSION_DENIED');
      }

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

      const { data: updatedSettlement, error: updateError } = await supabase
        .from('settlements')
        .update(updateFields)
        .eq('id', updateData.id)
        .select()
        .single();

      if (updateError) {
        return handleError(updateError, 'updating settlement');
      }

      const enrichedSettlement = updatedSettlement as Settlement;
      await enrichSettlementsWithEmails(
        [enrichedSettlement],
        currentUserId,
        currentUserEmail
      );

      return createSuccessResponse({ settlement: enrichedSettlement }, 200);
    }

    if (req.method === 'DELETE') {
      const url = new URL(req.url);
      const settlementId = url.searchParams.get('id');

      if (!settlementId) {
        return createErrorResponse(400, 'Settlement id is required', 'VALIDATION_ERROR');
      }

      if (!isValidUUID(settlementId)) {
        return createErrorResponse(400, 'Invalid settlement id format. Expected UUID.', 'VALIDATION_ERROR');
      }

      const { data: existingSettlement, error: fetchError } = await supabase
        .from('settlements')
        .select('id, created_by')
        .eq('id', settlementId)
        .single();

      if (fetchError || !existingSettlement) {
        return createErrorResponse(404, 'Settlement not found', 'NOT_FOUND');
      }

      if (existingSettlement.created_by !== currentUserId) {
        return createErrorResponse(403, 'Forbidden: You can only delete settlements you created', 'PERMISSION_DENIED');
      }

      const { error: deleteError } = await supabase
        .from('settlements')
        .delete()
        .eq('id', settlementId);

      if (deleteError) {
        return handleError(deleteError, 'deleting settlement');
      }

      return createEmptyResponse(204);
    }

    return createErrorResponse(405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
  } catch (error: unknown) {
    return handleError(error, 'settlements handler');
  }
});
