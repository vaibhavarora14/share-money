import { isValidUUID } from './validation.ts';

export const REPORT_REASONS = [
  'spam',
  'harassment',
  'hate_speech',
  'sexual_content',
  'violence',
  'other',
] as const;

export const REPORT_CONTENT_TYPES = [
  'activity',
  'transaction',
  'settlement',
  'profile',
] as const;

export type ReportReason = typeof REPORT_REASONS[number];
export type ReportContentType = typeof REPORT_CONTENT_TYPES[number];
export type ModerationAction = 'report' | 'block' | 'unblock';

export interface ModerationRequest {
  action: ModerationAction;
  request_id?: string | null;
  group_id: string;
  target_user_id: string;
  content_type?: ReportContentType;
  content_id?: string;
  reason?: ReportReason;
  details?: string | null;
}

export type ValidModerationRequest = {
  action: ModerationAction;
  request_id: string | null;
  group_id: string;
  target_user_id: string;
  content_type: ReportContentType | null;
  content_id: string | null;
  reason: ReportReason | null;
  details: string | null;
};

export type ModerationValidationResult =
  | { valid: true; value: ValidModerationRequest }
  | { valid: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validateModerationRequest(
  input: unknown,
  currentUserId: string,
): ModerationValidationResult {
  if (!isRecord(input)) {
    return { valid: false, error: 'Invalid moderation request' };
  }

  const action = input.action;
  if (action !== 'report' && action !== 'block' && action !== 'unblock') {
    return { valid: false, error: 'Unsupported moderation action' };
  }

  const requestId = input.request_id;
  if (
    requestId !== undefined &&
    requestId !== null &&
    (typeof requestId !== 'string' || !isValidUUID(requestId))
  ) {
    return { valid: false, error: 'Invalid request_id format. Expected UUID.' };
  }

  const groupId = input.group_id;
  const targetUserId = input.target_user_id;
  if (typeof groupId !== 'string' || !isValidUUID(groupId)) {
    return { valid: false, error: 'Invalid group_id format. Expected UUID.' };
  }
  if (typeof targetUserId !== 'string' || !isValidUUID(targetUserId)) {
    return { valid: false, error: 'Invalid target_user_id format. Expected UUID.' };
  }
  if (targetUserId === currentUserId) {
    return { valid: false, error: 'You cannot block or report yourself' };
  }

  const contentType = typeof input.content_type === 'string'
    ? input.content_type
    : null;
  const contentId = typeof input.content_id === 'string'
    ? input.content_id.trim()
    : null;

  if (contentType !== null && !REPORT_CONTENT_TYPES.includes(contentType as ReportContentType)) {
    return { valid: false, error: 'Unsupported content type' };
  }
  if ((contentType === null) !== (contentId === null || contentId.length === 0)) {
    return { valid: false, error: 'Content type and content ID must be provided together' };
  }
  if ((action === 'report' || action === 'block') && (!contentType || !contentId)) {
    return {
      valid: false,
      error: action === 'report'
        ? 'Reports must identify the content being reported'
        : 'Blocks must identify the content or profile being blocked',
    };
  }

  const rawReason = input.reason;
  const reason = action === 'block' && rawReason === undefined
    ? 'harassment'
    : rawReason ?? null;
  if (reason !== null && (
    typeof reason !== 'string' ||
    !REPORT_REASONS.includes(reason as ReportReason)
  )) {
    return { valid: false, error: 'Unsupported report reason' };
  }
  if (action === 'report' && reason === null) {
    return { valid: false, error: 'A report reason is required' };
  }

  if (input.details !== undefined && input.details !== null && typeof input.details !== 'string') {
    return { valid: false, error: 'Report details must be text' };
  }
  const details = typeof input.details === 'string' ? input.details.trim() : null;
  if (details && details.length > 1000) {
    return { valid: false, error: 'Report details must be 1000 characters or fewer' };
  }

  return {
    valid: true,
    value: {
      action,
      request_id: typeof requestId === 'string' ? requestId : null,
      group_id: groupId,
      target_user_id: targetUserId,
      content_type: contentType as ReportContentType | null,
      content_id: contentId || null,
      reason: reason as ReportReason | null,
      details: details || null,
    },
  };
}

export function filterBlockedActivityRecords<T extends { changed_by: string }>(
  records: T[],
  blockedUserIds: ReadonlySet<string>,
): T[] {
  if (blockedUserIds.size === 0) return records;
  return records.filter((record) => !blockedUserIds.has(record.changed_by));
}
