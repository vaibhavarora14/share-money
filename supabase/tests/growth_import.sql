BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(16);

SELECT has_function(
  'public',
  'import_splitwise',
  ARRAY['uuid', 'uuid', 'jsonb', 'jsonb'],
  'Splitwise import is exposed as one transactional RPC'
);

SELECT has_function(
  'public',
  'create_group',
  ARRAY['character varying', 'text', 'jsonb', 'uuid'],
  'Group creation accepts an idempotency key'
);

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;

CREATE TEMP TABLE growth_test_ids (
  group_id UUID NOT NULL,
  owner_participant_id UUID,
  import_id UUID NOT NULL
);

INSERT INTO growth_test_ids (group_id, import_id)
SELECT
  public.create_group(
    'Atomic import test',
    NULL,
    '{"source":"google","medium":"organic","landing_path":"/in/splitwise-alternative","intent":"splitwise-import","captured_at":"2026-08-11T00:00:00.000Z"}'::jsonb,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid
  ),
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid
;

UPDATE growth_test_ids ids
SET owner_participant_id = participant.id
FROM public.participants participant
WHERE participant.group_id = ids.group_id
  AND participant.user_id = '11111111-1111-1111-1111-111111111111'::uuid;

SELECT is(
  public.create_group(
    'Ignored retry name',
    NULL,
    NULL,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid
  ),
  (SELECT group_id FROM growth_test_ids),
  'Retrying group creation returns the original group'
);

CREATE TEMP TABLE first_import_result AS
SELECT public.import_splitwise(
  ids.import_id,
  ids.group_id,
  jsonb_build_array(jsonb_build_object(
    'description', 'Train tickets',
    'date', '2026-08-01',
    'category', 'Travel',
    'currency', 'INR',
    'amount', 120,
    'paid_by_participant_id', ids.owner_participant_id,
    'splits', jsonb_build_array(jsonb_build_object(
      'participant_id', ids.owner_participant_id,
      'amount', 120
    ))
  )),
  '[]'::jsonb
) AS result
FROM growth_test_ids ids;

SELECT is(
  (SELECT result->>'duplicate' FROM first_import_result),
  'false',
  'The first import is not marked as a duplicate'
);

SELECT is(
  (SELECT result->>'activated' FROM first_import_result),
  'true',
  'The first import atomically activates the group'
);

CREATE TEMP TABLE replay_import_result AS
SELECT public.import_splitwise(
  ids.import_id,
  ids.group_id,
  jsonb_build_array(jsonb_build_object(
    'description', 'Train tickets',
    'date', '2026-08-01',
    'category', 'Travel',
    'currency', 'INR',
    'amount', 120,
    'paid_by_participant_id', ids.owner_participant_id,
    'splits', jsonb_build_array(jsonb_build_object(
      'participant_id', ids.owner_participant_id,
      'amount', 120
    ))
  )),
  '[]'::jsonb
) AS result
FROM growth_test_ids ids;

SELECT is(
  (SELECT result->>'duplicate' FROM replay_import_result),
  'true',
  'A completed import replay returns the stored result'
);

SELECT is(
  (SELECT result->>'activated' FROM replay_import_result),
  'false',
  'A completed replay cannot emit group activation twice'
);

SELECT is(
  (
    SELECT COUNT(*)::integer
    FROM public.transactions
    WHERE group_id = (SELECT group_id FROM growth_test_ids)
      AND description = 'Train tickets'
  ),
  1,
  'Replaying an import does not duplicate ledger rows'
);

SELECT is(
  (
    SELECT acquisition_context->>'landing_path'
    FROM public.groups
    WHERE id = (SELECT group_id FROM growth_test_ids)
  ),
  '/in/splitwise-alternative',
  'The database stores only sanitized acquisition context'
);

SELECT throws_ok(
  $$
    SELECT public.import_splitwise(
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid,
      (SELECT group_id FROM growth_test_ids),
      '[{"description":"Bad","date":"2026-08-01","currency":"INR","amount":10,"paid_by_participant_id":"00000000-0000-0000-0000-000000000000","splits":[]}]'::jsonb,
      '[]'::jsonb
    )
  $$,
  '22023',
  NULL,
  'The transactional RPC validates participants at the database boundary'
);

CREATE TEMP TABLE member_activation_ids (
  group_id UUID NOT NULL,
  member_participant_id UUID,
  transaction_id INTEGER
);

INSERT INTO member_activation_ids (group_id)
SELECT public.create_group(
  'Member activation test',
  NULL,
  NULL,
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd'::uuid
);

RESET ROLE;
INSERT INTO public.group_members (group_id, user_id, role, status)
SELECT
  group_id,
  '22222222-2222-2222-2222-222222222222'::uuid,
  'member',
  'active'
FROM member_activation_ids;

UPDATE member_activation_ids ids
SET member_participant_id = participant.id
FROM public.participants participant
WHERE participant.group_id = ids.group_id
  AND participant.user_id = '22222222-2222-2222-2222-222222222222'::uuid;

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;

WITH inserted AS (
  INSERT INTO public.transactions (
    user_id,
    amount,
    description,
    date,
    type,
    group_id,
    currency,
    paid_by_participant_id
  )
  SELECT
    '22222222-2222-2222-2222-222222222222'::uuid,
    10,
    'Member-created expense',
    '2026-08-11',
    'expense',
    group_id,
    'INR',
    member_participant_id
  FROM member_activation_ids
  RETURNING id
)
UPDATE member_activation_ids
SET transaction_id = inserted.id
FROM inserted;

SELECT is(
  (
    SELECT activation_method
    FROM public.groups
    WHERE id = (SELECT group_id FROM member_activation_ids)
  ),
  'manual_expense',
  'A non-owner member can activate a group with its first expense'
);

SELECT is(
  (
    SELECT activation_source_id
    FROM public.groups
    WHERE id = (SELECT group_id FROM member_activation_ids)
  ),
  (SELECT transaction_id::TEXT FROM member_activation_ids),
  'Manual activation records the transaction that won the race'
);

SELECT is(
  (
    SELECT manual_expense_count
    FROM public.groups
    WHERE id = (SELECT group_id FROM member_activation_ids)
  ),
  1,
  'Manual expenses increment the durable invite-prompt counter'
);

RESET ROLE;
UPDATE public.groups
SET created_at = NOW() - INTERVAL '8 days'
WHERE id = (SELECT group_id FROM member_activation_ids);

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;

WITH inserted AS (
  INSERT INTO public.transactions (
    user_id, amount, description, date, type, group_id, currency, paid_by_participant_id
  )
  SELECT
    '22222222-2222-2222-2222-222222222222'::uuid,
    12,
    'Day seven expense',
    CURRENT_DATE,
    'expense',
    group_id,
    'INR',
    member_participant_id
  FROM member_activation_ids
  RETURNING id
)
UPDATE member_activation_ids
SET transaction_id = inserted.id
FROM inserted;

SELECT is(
  (
    SELECT day_7_activity_source_id
    FROM public.groups
    WHERE id = (SELECT group_id FROM member_activation_ids)
  ),
  (SELECT transaction_id::TEXT FROM member_activation_ids),
  'The first expense after day seven records the activity source once'
);

SELECT throws_ok(
  $$
    UPDATE public.groups
    SET activated_at = NOW()
    WHERE id = (SELECT group_id FROM member_activation_ids)
  $$,
  '42501',
  NULL,
  'Authenticated clients cannot forge group activation fields'
);

SELECT throws_ok(
  $$ SELECT * FROM public.splitwise_imports LIMIT 1 $$,
  '42501',
  NULL,
  'Authenticated clients cannot read or forge import state directly'
);

SELECT * FROM finish();
ROLLBACK;
