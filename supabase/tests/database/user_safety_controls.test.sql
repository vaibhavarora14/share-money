BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(11);

INSERT INTO auth.users (id, email)
VALUES
  ('11111111-1111-4111-8111-111111111111', 'reporter@example.com'),
  ('22222222-2222-4222-8222-222222222222', 'target@example.com'),
  ('33333333-3333-4333-8333-333333333333', 'outsider@example.com');

INSERT INTO public.groups (id, name, created_by)
VALUES (
  '44444444-4444-4444-8444-444444444444',
  'Safety test group',
  '11111111-1111-4111-8111-111111111111'
);

INSERT INTO public.group_members (group_id, user_id, role, status)
VALUES
  (
    '44444444-4444-4444-8444-444444444444',
    '11111111-1111-4111-8111-111111111111',
    'owner',
    'active'
  ),
  (
    '44444444-4444-4444-8444-444444444444',
    '22222222-2222-4222-8222-222222222222',
    'member',
    'active'
  )
ON CONFLICT (group_id, user_id) DO UPDATE
SET role = EXCLUDED.role,
    status = EXCLUDED.status;

INSERT INTO public.participants (group_id, user_id, type, role)
VALUES
  (
    '44444444-4444-4444-8444-444444444444',
    '11111111-1111-4111-8111-111111111111',
    'member',
    'owner'
  ),
  (
    '44444444-4444-4444-8444-444444444444',
    '22222222-2222-4222-8222-222222222222',
    'member',
    'member'
  )
ON CONFLICT (group_id, user_id) DO UPDATE
SET type = EXCLUDED.type,
    role = EXCLUDED.role;

INSERT INTO public.transactions (
  id,
  amount,
  description,
  date,
  type,
  currency,
  user_id,
  paid_by_participant_id,
  group_id
)
VALUES (
  9001,
  12.00,
  'Safety test transaction',
  CURRENT_DATE,
  'expense',
  'USD',
  '22222222-2222-4222-8222-222222222222',
  (
    SELECT id
    FROM public.participants
    WHERE group_id = '44444444-4444-4444-8444-444444444444'
      AND user_id = '22222222-2222-4222-8222-222222222222'
  ),
  '44444444-4444-4444-8444-444444444444'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',
  true
);

SELECT throws_ok(
  $$
    INSERT INTO public.user_safety_reports (
      reporter_id,
      reported_user_id,
      group_id,
      content_type,
      content_id,
      reason
    ) VALUES (
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      '44444444-4444-4444-8444-444444444444',
      'transaction',
      '9001',
      'spam'
    )
  $$,
  '42501',
  'permission denied for table user_safety_reports',
  'authenticated callers cannot bypass moderation through direct report inserts'
);

SELECT throws_ok(
  $$
    INSERT INTO public.user_blocks (blocker_id, blocked_user_id)
    VALUES (
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222'
    )
  $$,
  '42501',
  'permission denied for table user_blocks',
  'authenticated callers cannot bypass moderation through direct block inserts'
);

SELECT lives_ok(
  $$
    SELECT public.submit_moderation_action(
      'report',
      '44444444-4444-4444-8444-444444444444',
      '22222222-2222-4222-8222-222222222222',
      'transaction',
      '9001',
      'spam',
      'Verified transaction report'
    )
  $$,
  'valid shared-group content can be reported through the secured RPC'
);

RESET ROLE;
SELECT is(
  (SELECT count(*)::integer FROM public.user_safety_reports),
  1,
  'a valid report is persisted'
);
SELECT is(
  (SELECT status FROM public.user_safety_reports LIMIT 1),
  'pending',
  'the RPC forces new reports to pending'
);
SELECT is(
  (SELECT reviewed_at FROM public.user_safety_reports LIMIT 1),
  NULL::timestamptz,
  'the RPC does not allow callers to forge review timestamps'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',
  true
);
SELECT throws_ok(
  $$
    SELECT public.submit_moderation_action(
      'report',
      '44444444-4444-4444-8444-444444444444',
      '22222222-2222-4222-8222-222222222222',
      'transaction',
      '999999',
      'spam',
      NULL
    )
  $$,
  '22023',
  'The reported content does not match this user or group',
  'the RPC rejects content that does not belong to the target user and group'
);
SELECT lives_ok(
  $$
    SELECT public.submit_moderation_action(
      'block',
      '44444444-4444-4444-8444-444444444444',
      '22222222-2222-4222-8222-222222222222',
      'profile',
      '22222222-2222-4222-8222-222222222222',
      'harassment',
      NULL
    )
  $$,
  'blocking commits the block and developer report together'
);

RESET ROLE;
SELECT is(
  (SELECT count(*)::integer FROM public.user_blocks),
  1,
  'blocking persists one block'
);
SELECT is(
  (SELECT count(*)::integer FROM public.user_safety_reports),
  2,
  'blocking also persists a developer report'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  '33333333-3333-4333-8333-333333333333',
  true
);
SELECT throws_ok(
  $$
    SELECT public.submit_moderation_action(
      'report',
      '44444444-4444-4444-8444-444444444444',
      '22222222-2222-4222-8222-222222222222',
      'transaction',
      '9001',
      'spam',
      NULL
    )
  $$,
  '42501',
  'You can only report or block people who share a group with you',
  'the RPC rejects callers outside the shared group'
);

SELECT * FROM finish();
ROLLBACK;
