import { verifyAuth } from '../_shared/auth.ts';
import { createErrorResponse, handleError } from '../_shared/error-handler.ts';
import { validateModerationRequest } from '../_shared/moderation.ts';
import { createEmptyResponse, createSuccessResponse } from '../_shared/response.ts';
import { validateBodySize } from '../_shared/validation.ts';

type SupabaseClient = Awaited<ReturnType<typeof verifyAuth>>['supabase'];

async function verifySharedGroup(
  supabase: SupabaseClient,
  groupId: string,
  currentUserId: string,
  targetUserId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('participants')
    .select('user_id')
    .eq('group_id', groupId)
    .in('user_id', [currentUserId, targetUserId]);

  if (error) throw error;
  const userIds = new Set((data || []).map((participant: { user_id: string }) => participant.user_id));
  return userIds.has(currentUserId) && userIds.has(targetUserId);
}

async function verifyReportedContent(
  supabase: SupabaseClient,
  input: {
    group_id: string;
    target_user_id: string;
    content_type: 'activity' | 'transaction' | 'settlement' | 'profile' | null;
    content_id: string | null;
  },
): Promise<boolean> {
  if (!input.content_type || !input.content_id) return true;
  if (input.content_type === 'profile') {
    return input.content_id === input.target_user_id;
  }

  const lookups = {
    activity: {
      table: 'transaction_history',
      authorColumn: 'changed_by',
    },
    transaction: {
      table: 'transactions',
      authorColumn: 'user_id',
    },
    settlement: {
      table: 'settlements',
      authorColumn: 'created_by',
    },
  } as const;
  const lookup = lookups[input.content_type];
  const { data, error } = await supabase
    .from(lookup.table)
    .select(`id, group_id, ${lookup.authorColumn}`)
    .eq('id', input.content_id)
    .eq('group_id', input.group_id)
    .maybeSingle();

  if (error) throw error;
  return !!data && data[lookup.authorColumn] === input.target_user_id;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return createEmptyResponse(200, req);
  }
  if (req.method !== 'POST') {
    return createErrorResponse(405, 'Method not allowed', 'METHOD_NOT_ALLOWED', undefined, req);
  }

  try {
    const body = await req.text().catch(() => null);
    const bodySizeValidation = validateBodySize(body, 8 * 1024);
    if (!bodySizeValidation.valid) {
      return createErrorResponse(
        413,
        bodySizeValidation.error || 'Request body too large',
        'VALIDATION_ERROR',
        undefined,
        req,
      );
    }

    const { user, supabase } = await verifyAuth(req);
    let requestData: unknown;
    try {
      requestData = body ? JSON.parse(body) : {};
    } catch {
      return createErrorResponse(400, 'Invalid JSON in request body', 'VALIDATION_ERROR', undefined, req);
    }

    const validation = validateModerationRequest(requestData, user.id);
    if (!validation.valid) {
      return createErrorResponse(400, validation.error, 'VALIDATION_ERROR', undefined, req);
    }
    const input = validation.value;

    if (!await verifySharedGroup(
      supabase,
      input.group_id,
      user.id,
      input.target_user_id,
    )) {
      return createErrorResponse(
        403,
        'You can only report or block people who share a group with you',
        'PERMISSION_DENIED',
        undefined,
        req,
      );
    }

    if (!await verifyReportedContent(supabase, input)) {
      return createErrorResponse(
        400,
        'The reported content does not match this user or group',
        'VALIDATION_ERROR',
        undefined,
        req,
      );
    }

    if (input.action === 'unblock') {
      const { error } = await supabase
        .from('user_blocks')
        .delete()
        .eq('blocker_id', user.id)
        .eq('blocked_user_id', input.target_user_id);
      if (error) return handleError(error, 'unblocking user', req);

      return createSuccessResponse({
        action: 'unblock',
        target_user_id: input.target_user_id,
      }, 200, 0, req);
    }

    let blockWasCreated = false;
    if (input.action === 'block') {
      const { data: createdBlock, error } = await supabase
        .from('user_blocks')
        .upsert({
          blocker_id: user.id,
          blocked_user_id: input.target_user_id,
        }, {
          onConflict: 'blocker_id,blocked_user_id',
          ignoreDuplicates: true,
        })
        .select('blocked_user_id')
        .maybeSingle();
      if (error) return handleError(error, 'blocking user', req);
      blockWasCreated = !!createdBlock;
    }

    const { data: report, error: reportError } = await supabase
      .from('user_safety_reports')
      .insert({
        reporter_id: user.id,
        reported_user_id: input.target_user_id,
        group_id: input.group_id,
        content_type: input.content_type,
        content_id: input.content_id,
        reason: input.reason,
        details: input.details,
      })
      .select('id, status, created_at')
      .single();

    if (reportError) {
      if (input.action === 'block' && blockWasCreated) {
        await supabase
          .from('user_blocks')
          .delete()
          .eq('blocker_id', user.id)
          .eq('blocked_user_id', input.target_user_id);
      }
      return handleError(reportError, 'submitting safety report', req);
    }

    return createSuccessResponse({
      action: input.action,
      target_user_id: input.target_user_id,
      report,
      blocked: input.action === 'block',
    }, input.action === 'report' ? 201 : 200, 0, req);
  } catch (error: unknown) {
    return handleError(error, 'moderation handler', req);
  }
});
