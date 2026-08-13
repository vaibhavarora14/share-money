import { verifyAuth } from '../_shared/auth.ts';
import { createErrorResponse, handleError } from '../_shared/error-handler.ts';
import { validateModerationRequest } from '../_shared/moderation.ts';
import { createEmptyResponse, createSuccessResponse } from '../_shared/response.ts';
import { validateBodySize } from '../_shared/validation.ts';

interface ModerationRpcResult {
  action: 'report' | 'block' | 'unblock';
  target_user_id: string;
  report_id: string | null;
  report_status: string | null;
  report_created_at: string | null;
  blocked: boolean;
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

    const { data, error: moderationError } = await supabase.rpc(
      'submit_moderation_action',
      {
        p_action: input.action,
        p_group_id: input.group_id,
        p_target_user_id: input.target_user_id,
        p_content_type: input.content_type,
        p_content_id: input.content_id,
        p_reason: input.reason,
        p_details: input.details,
      },
    );

    if (moderationError) {
      if (moderationError.code === '42501') {
        return createErrorResponse(
          403,
          moderationError.message,
          'PERMISSION_DENIED',
          undefined,
          req,
        );
      }
      if (moderationError.code === '22023') {
        return createErrorResponse(
          400,
          moderationError.message,
          'VALIDATION_ERROR',
          undefined,
          req,
        );
      }
      return handleError(
        new Error(moderationError.message),
        'submitting moderation action',
        req,
      );
    }

    const result = (data?.[0] || null) as ModerationRpcResult | null;
    if (!result) {
      return handleError(
        new Error('Moderation action returned no result'),
        'submitting moderation action',
        req,
      );
    }

    const report = result.report_id
      ? {
        id: result.report_id,
        status: result.report_status,
        created_at: result.report_created_at,
      }
      : null;

    return createSuccessResponse({
      action: result.action,
      target_user_id: result.target_user_id,
      report,
      blocked: result.blocked,
    }, input.action === 'report' ? 201 : 200, 0, req);
  } catch (error: unknown) {
    return handleError(error, 'moderation handler', req);
  }
});
