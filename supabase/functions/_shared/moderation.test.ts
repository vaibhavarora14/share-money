import {
  filterBlockedActivityRecords,
  validateModerationRequest,
} from './moderation.ts';

function assertEquals(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected, null, 2)}, got ${JSON.stringify(actual, null, 2)}`,
    );
  }
}

const reporterId = '11111111-1111-4111-8111-111111111111';
const reportedUserId = '22222222-2222-4222-8222-222222222222';
const groupId = '33333333-3333-4333-8333-333333333333';
const activityId = '44444444-4444-4444-8444-444444444444';
const requestId = '55555555-5555-4555-8555-555555555555';

Deno.test('validateModerationRequest accepts a report and trims optional details', () => {
  const result = validateModerationRequest({
    action: 'report',
    request_id: requestId,
    group_id: groupId,
    target_user_id: reportedUserId,
    content_type: 'activity',
    content_id: activityId,
    reason: 'harassment',
    details: '  Repeated abusive descriptions  ',
  }, reporterId);

  assertEquals(result, {
    valid: true,
    value: {
      action: 'report',
      request_id: requestId,
      group_id: groupId,
      target_user_id: reportedUserId,
      content_type: 'activity',
      content_id: activityId,
      reason: 'harassment',
      details: 'Repeated abusive descriptions',
    },
  });
});

Deno.test('validateModerationRequest rejects malformed idempotency keys', () => {
  const result = validateModerationRequest({
    action: 'report',
    request_id: 'not-a-uuid',
    group_id: groupId,
    target_user_id: reportedUserId,
    content_type: 'activity',
    content_id: activityId,
    reason: 'harassment',
  }, reporterId);

  assertEquals(result, {
    valid: false,
    error: 'Invalid request_id format. Expected UUID.',
  });
});

Deno.test('validateModerationRequest defaults a block report reason', () => {
  const result = validateModerationRequest({
    action: 'block',
    group_id: groupId,
    target_user_id: reportedUserId,
    content_type: 'profile',
    content_id: reportedUserId,
  }, reporterId);

  assertEquals(result, {
    valid: true,
    value: {
      action: 'block',
      request_id: null,
      group_id: groupId,
      target_user_id: reportedUserId,
      content_type: 'profile',
      content_id: reportedUserId,
      reason: 'harassment',
      details: null,
    },
  });
});

Deno.test('validateModerationRequest rejects self-blocking', () => {
  const result = validateModerationRequest({
    action: 'block',
    group_id: groupId,
    target_user_id: reporterId,
    content_type: 'profile',
    content_id: reporterId,
  }, reporterId);

  assertEquals(result, {
    valid: false,
    error: 'You cannot block or report yourself',
  });
});

Deno.test('validateModerationRequest requires content details for reports', () => {
  const result = validateModerationRequest({
    action: 'report',
    group_id: groupId,
    target_user_id: reportedUserId,
    reason: 'spam',
  }, reporterId);

  assertEquals(result, {
    valid: false,
    error: 'Reports must identify the content being reported',
  });
});

Deno.test('validateModerationRequest rejects unsupported reasons and oversized details', () => {
  const unsupportedReason = validateModerationRequest({
    action: 'report',
    group_id: groupId,
    target_user_id: reportedUserId,
    content_type: 'activity',
    content_id: activityId,
    reason: 'dislike',
  }, reporterId);
  const oversizedDetails = validateModerationRequest({
    action: 'report',
    group_id: groupId,
    target_user_id: reportedUserId,
    content_type: 'activity',
    content_id: activityId,
    reason: 'other',
    details: 'a'.repeat(1001),
  }, reporterId);

  assertEquals(unsupportedReason, {
    valid: false,
    error: 'Unsupported report reason',
  });
  assertEquals(oversizedDetails, {
    valid: false,
    error: 'Report details must be 1000 characters or fewer',
  });
});

Deno.test('filterBlockedActivityRecords removes every activity authored by a blocked user', () => {
  const records = [
    { id: 'activity-1', changed_by: reportedUserId },
    { id: 'activity-2', changed_by: reporterId },
    { id: 'activity-3', changed_by: reportedUserId },
  ];

  assertEquals(
    filterBlockedActivityRecords(records, new Set([reportedUserId])),
    [{ id: 'activity-2', changed_by: reporterId }],
  );
});
