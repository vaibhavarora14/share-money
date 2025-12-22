import { verifyAuth } from '../_shared/auth.ts';
import { createErrorResponse, handleError } from '../_shared/error-handler.ts';
import { createEmptyResponse, createSuccessResponse } from '../_shared/response.ts';
import { fetchUserEmails } from '../_shared/user-email.ts';
import { isValidUUID, validateBodySize, validateSettlementData } from '../_shared/validation.ts';

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
  from_participant_id: string;
  to_participant_id: string;
  from_user_id?: string; // Kept for logic, but participant is primary
  to_user_id?: string;
  amount: number;
  currency: string;
  notes?: string;
  created_by: string;
  created_at: string;
  from_user_email?: string;
  to_user_email?: string;
  from_full_name?: string;
  to_full_name?: string;
}

interface CreateSettlementRequest {
  group_id: string;
  from_participant_id: string;
  to_participant_id: string;
  amount: number;
  currency?: string;
  notes?: string;
}

async function enrichSettlementsWithParticipants(
  supabase: any,
  settlements: Settlement[],
  currentUserId: string,
  currentUserEmail: string | null
): Promise<void> {
  if (settlements.length === 0) {
    return;
  }

  const participantIds = new Set<string>();
  settlements.forEach(s => {
    participantIds.add(s.from_participant_id);
    participantIds.add(s.to_participant_id);
  });

  const { data: participants } = await supabase
    .from('participants')
    .select('id, user_id, email, full_name')
    .in('id', Array.from(participantIds));

  if (!participants) return;

  const participantMap = new Map<string, any>();
  participants.forEach((p: any) => participantMap.set(p.id, p));
  
  const userIdsToFetch = participants
    .filter((p: any) => p.user_id)
    .map((p: any) => p.user_id!);
    
  const emailMap = await fetchUserEmails(userIdsToFetch, currentUserId, currentUserEmail);

  settlements.forEach(s => {
    const fromP = participantMap.get(s.from_participant_id);
    const toP = participantMap.get(s.to_participant_id);

    if (fromP) {
      s.from_user_id = fromP.user_id || undefined;
      s.from_user_email = fromP.email || (fromP.user_id ? emailMap.get(fromP.user_id) : undefined);
      s.from_full_name = fromP.full_name || undefined;
    }
    if (toP) {
      s.to_user_id = toP.user_id || undefined;
      s.to_user_email = toP.email || (toP.user_id ? emailMap.get(toP.user_id) : undefined);
      s.to_full_name = toP.full_name || undefined;
    }
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
        .select('id, group_id, from_participant_id, to_participant_id, amount, currency, notes, created_by, created_at')
        .order('created_at', { ascending: false });

      if (groupId) {
        // Simple membership check via participants (since everyone is a participant)
        const { data: memberParticipant } = await supabase
          .from('participants')
          .select('id')
          .eq('group_id', groupId)
          .eq('user_id', currentUserId)
          .maybeSingle();

        if (!memberParticipant) {
          return createErrorResponse(403, 'Forbidden: Not a member of this group', 'PERMISSION_DENIED');
        }

        query = query.eq('group_id', groupId);
      } else {
        // For global settlements, we'd need a more complex query joining with participants
        // For now, let's stick to group-based or creator-based
        query = query.eq('created_by', currentUserId);
      }

      const { data: settlements, error } = await query;

      if (error) {
        return handleError(error, 'fetching settlements');
      }

      const enrichedSettlements = (settlements || []) as Settlement[];
      await enrichSettlementsWithParticipants(
        supabase,
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

      const validation = validateSettlementData(settlementData);
      if (!validation.valid) {
        return createErrorResponse(400, validation.error || 'Invalid settlement data', 'VALIDATION_ERROR');
      }

      if (!settlementData.group_id || !settlementData.from_participant_id || !settlementData.to_participant_id || !settlementData.amount) {
        return createErrorResponse(400, 'Missing required fields: group_id, from_participant_id, to_participant_id, amount', 'VALIDATION_ERROR');
      }

      // Verify group membership of the creator
      const { data: creatorParticipant } = await supabase
        .from('participants')
        .select('id')
        .eq('group_id', settlementData.group_id)
        .eq('user_id', currentUserId)
        .maybeSingle();

      if (!creatorParticipant) {
        return createErrorResponse(403, 'Forbidden: Not a member of this group', 'PERMISSION_DENIED');
      }

      // Ensure at least one of the participants is the creator (or creator is an owner)
      // Actually, if you're in the group, you can record a settlement between any two participants
      // but usually you record one where YOU are involved.
      
      const { data: settlement, error } = await supabase
        .from('settlements')
        .insert({
          group_id: settlementData.group_id,
          from_participant_id: settlementData.from_participant_id,
          to_participant_id: settlementData.to_participant_id,
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
      await enrichSettlementsWithParticipants(
        supabase,
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

      const updateFields: any = {};
      if (updateData.amount !== undefined) updateFields.amount = updateData.amount;
      if (updateData.currency !== undefined) updateFields.currency = updateData.currency;
      if (updateData.notes !== undefined) updateFields.notes = updateData.notes || null;

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
      await enrichSettlementsWithParticipants(
        supabase,
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
