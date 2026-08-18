BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(56);

SELECT has_table('public', 'notifications', 'notifications inbox exists');
SELECT has_table('public', 'notification_preferences', 'notification preferences exist');
SELECT has_table('public', 'push_tokens', 'push token registry exists');
SELECT has_table('public', 'notification_outbox', 'durable notification outbox exists');
SELECT has_table('public', 'notification_deliveries', 'push delivery audit exists');

SELECT has_column(
  'public',
  'notifications',
  'transaction_reference_id',
  'notifications retain a stable transaction identity after deletion'
);
SELECT has_column(
  'public',
  'notifications',
  'superseded_at',
  'redundant notifications retain their supersession timestamp'
);
SELECT has_column(
  'public',
  'notifications',
  'superseded_by_id',
  'redundant notifications link to their replacement'
);

SELECT has_index(
  'public',
  'notifications',
  'idx_notifications_recipient_created',
  'inbox has stable recipient chronology index'
);
SELECT has_index(
  'public',
  'notifications',
  'idx_notifications_recipient_group_unread',
  'group unread counts are indexed'
);
SELECT has_index(
  'public',
  'notifications',
  'idx_notifications_recipient_active_created',
  'active inbox chronology is indexed separately from retained history'
);
SELECT ok(
  (
    SELECT index_definition.indexdef LIKE 'CREATE UNIQUE INDEX%'
    FROM pg_indexes AS index_definition
    WHERE index_definition.schemaname = 'public'
      AND index_definition.tablename = 'notifications'
      AND index_definition.indexname = 'idx_notifications_recipient_transaction_active'
  ),
  'the database enforces one active notification per recipient and transaction'
);
SELECT has_index(
  'public',
  'notification_outbox',
  'idx_notification_outbox_ready',
  'ready outbox work is indexed'
);
SELECT has_index(
  'public',
  'notification_deliveries',
  'idx_notification_deliveries_ticket',
  'unchecked Expo receipts are indexed'
);

SELECT has_function(
  'public',
  'claim_notification_outbox',
  ARRAY['integer'],
  'worker has an atomic outbox claim function'
);
SELECT has_function(
  'public',
  'enqueue_transaction_notification',
  'notification inserts enqueue durable work'
);
SELECT has_function(
  'public',
  'wake_transaction_notification_worker',
  'outbox inserts wake the worker immediately'
);
SELECT has_function(
  'public',
  'get_notification_unread_summary',
  'inbox has an exact grouped unread summary'
);
SELECT has_function(
  'public',
  'preserve_notification_first_read',
  'database preserves the first read timestamp'
);
SELECT has_function(
  'public',
  'supersede_previous_transaction_notifications',
  'new transaction events supersede older inbox notifications'
);
SELECT has_function(
  'public',
  'get_active_notification_id',
  ARRAY['uuid'],
  'stale push links resolve to the latest actionable notification'
);

SELECT is(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.notifications'::regclass),
  TRUE,
  'notifications use row-level security'
);
SELECT is(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.push_tokens'::regclass),
  TRUE,
  'push tokens use row-level security'
);
SELECT is(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.notification_outbox'::regclass),
  TRUE,
  'outbox uses row-level security'
);

SELECT lives_ok(
  $$
    INSERT INTO public.notifications (
      recipient_user_id,
      actor_user_id,
      group_id,
      source_history_id,
      event_type,
      title,
      body,
      snapshot
    )
    SELECT
      '22222222-2222-2222-2222-222222222222'::UUID,
      '11111111-1111-1111-1111-111111111111'::UUID,
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::UUID,
      id,
      'transaction_created',
      'Notification trigger contract',
      'Summer Vacation 2024',
      '{"transaction":{"id":900000}}'::JSONB
    FROM public.transaction_history
    ORDER BY changed_at
    LIMIT 1
  $$,
  'notification insertion survives the best-effort worker wake trigger'
);

SELECT is(
  (
    SELECT COUNT(*)::INTEGER
    FROM public.notification_outbox AS outbox
    JOIN public.notifications AS notification
      ON notification.id = outbox.notification_id
    WHERE notification.title = 'Notification trigger contract'
  ),
  1,
  'notification insertion always creates durable outbox work'
);

SELECT ok(
  has_table_privilege('authenticated', 'public.notifications', 'SELECT'),
  'authenticated users can select inbox rows through RLS'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.notification_outbox', 'SELECT'),
  'authenticated users cannot inspect the service outbox'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.notification_deliveries', 'SELECT'),
  'authenticated users cannot inspect push delivery state'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.push_tokens', 'SELECT'),
  'push tokens are readable only through service-owned API operations'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.push_tokens', 'INSERT'),
  'push token reassignment cannot bypass the service-owned API'
);
SELECT ok(
  has_table_privilege('service_role', 'public.notifications', 'INSERT'),
  'service role can fan out inbox rows'
);
SELECT ok(
  has_table_privilege('service_role', 'public.push_tokens', 'UPDATE'),
  'service role can manage device token ownership'
);
SELECT ok(
  has_table_privilege('service_role', 'public.notification_outbox', 'UPDATE'),
  'service role can advance durable outbox work'
);
SELECT ok(
  has_table_privilege('service_role', 'public.notification_deliveries', 'INSERT'),
  'service role can persist Expo delivery tickets'
);
SELECT ok(
  has_table_privilege('service_role', 'public.user_blocks', 'SELECT'),
  'service role can apply notification block visibility'
);
SELECT ok(
  has_function_privilege(
    'service_role',
    'public.claim_notification_outbox(integer)',
    'EXECUTE'
  ),
  'service role can claim outbox work'
);
SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.claim_notification_outbox(integer)',
    'EXECUTE'
  ),
  'authenticated users cannot claim outbox work'
);
SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.claim_notification_outbox(integer)',
    'EXECUTE'
  ),
  'anonymous users cannot claim outbox work'
);
SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.enqueue_transaction_notification()',
    'EXECUTE'
  ),
  'authenticated users cannot invoke the notification enqueue trigger function'
);
SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.preserve_notification_first_read()',
    'EXECUTE'
  ),
  'authenticated users cannot invoke the monotonic-read trigger function'
);
SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.wake_transaction_notification_worker()',
    'EXECUTE'
  ),
  'authenticated users cannot invoke the worker wake trigger function'
);
SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.supersede_previous_transaction_notifications()',
    'EXECUTE'
  ),
  'authenticated users cannot invoke the notification supersession trigger function'
);
SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.get_notification_unread_summary()',
    'EXECUTE'
  ),
  'authenticated users can fetch their RLS-scoped unread summary'
);
SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.get_active_notification_id(uuid)',
    'EXECUTE'
  ),
  'authenticated users can resolve their own stale notification links'
);
SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.get_notification_unread_summary()',
    'EXECUTE'
  ),
  'anonymous users cannot query notification summaries'
);

SELECT col_is_unique(
  'public',
  'push_tokens',
  'expo_push_token',
  'a physical Expo token has one current owner'
);

DO $$
BEGIN
  PERFORM set_config(
    'request.jwt.claim.sub',
    '33333333-3333-3333-3333-333333333333',
    TRUE
  );
END;
$$;

CREATE TEMP TABLE notification_summary_baseline AS
SELECT COALESCE(SUM(unread_count), 0)::BIGINT AS unread_count
FROM public.get_notification_unread_summary();

INSERT INTO public.transaction_history (
  id,
  transaction_id,
  activity_type,
  group_id,
  action,
  changed_by,
  changes,
  snapshot
) VALUES
  (
    '90000000-0000-0000-0000-000000000001'::UUID,
    NULL,
    'transaction',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::UUID,
    'created',
    '11111111-1111-1111-1111-111111111111'::UUID,
    '{}'::JSONB,
    '{"id":900001}'::JSONB
  ),
  (
    '90000000-0000-0000-0000-000000000002'::UUID,
    NULL,
    'transaction',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::UUID,
    'updated',
    '11111111-1111-1111-1111-111111111111'::UUID,
    '{}'::JSONB,
    '{"id":900001}'::JSONB
  ),
  (
    '90000000-0000-0000-0000-000000000003'::UUID,
    NULL,
    'transaction',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::UUID,
    'created',
    '11111111-1111-1111-1111-111111111111'::UUID,
    '{}'::JSONB,
    '{"id":900001}'::JSONB
  );

INSERT INTO public.notifications (
  recipient_user_id,
  actor_user_id,
  group_id,
  source_history_id,
  event_type,
  title,
  body,
  snapshot,
  created_at
) VALUES
  (
    '33333333-3333-3333-3333-333333333333'::UUID,
    '11111111-1111-1111-1111-111111111111'::UUID,
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::UUID,
    '90000000-0000-0000-0000-000000000001'::UUID,
    'transaction_created',
    'Supersession original',
    'Summer Vacation 2024',
    '{"transaction":{"id":900001}}'::JSONB,
    '2026-08-18T01:00:00Z'::TIMESTAMPTZ
  ),
  (
    '33333333-3333-3333-3333-333333333333'::UUID,
    '11111111-1111-1111-1111-111111111111'::UUID,
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::UUID,
    '90000000-0000-0000-0000-000000000002'::UUID,
    'transaction_updated',
    'Supersession update',
    'Summer Vacation 2024',
    '{"transaction":{"id":900001}}'::JSONB,
    '2026-08-18T01:01:00Z'::TIMESTAMPTZ
  ),
  (
    '33333333-3333-3333-3333-333333333333'::UUID,
    '11111111-1111-1111-1111-111111111111'::UUID,
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::UUID,
    '90000000-0000-0000-0000-000000000003'::UUID,
    'transaction_created',
    'Supersession delayed original',
    'Summer Vacation 2024',
    '{"transaction":{"id":900001}}'::JSONB,
    '2026-08-18T00:59:00Z'::TIMESTAMPTZ
  );

SELECT is(
  (
    SELECT COUNT(*)::INTEGER
    FROM public.notifications
    WHERE recipient_user_id = '33333333-3333-3333-3333-333333333333'::UUID
      AND transaction_reference_id = 900001
  ),
  3,
  'supersession preserves every immutable notification record'
);

SELECT is(
  (
    SELECT COUNT(*)::INTEGER
    FROM public.notifications
    WHERE recipient_user_id = '33333333-3333-3333-3333-333333333333'::UUID
      AND transaction_reference_id = 900001
      AND superseded_at IS NULL
  ),
  1,
  'only the newest notification remains actionable in the inbox'
);

SELECT is(
  (
    SELECT title
    FROM public.notifications
    WHERE recipient_user_id = '33333333-3333-3333-3333-333333333333'::UUID
      AND transaction_reference_id = 900001
      AND superseded_at IS NULL
  ),
  'Supersession update',
  'the latest event is the active notification'
);

SELECT is(
  (
    SELECT superseded_by_id
    FROM public.notifications
    WHERE title = 'Supersession original'
  ),
  (
    SELECT id
    FROM public.notifications
    WHERE title = 'Supersession update'
  ),
  'the older notification links directly to its replacement'
);

SELECT is(
  (
    SELECT superseded_by_id
    FROM public.notifications
    WHERE title = 'Supersession delayed original'
  ),
  (
    SELECT id
    FROM public.notifications
    WHERE title = 'Supersession update'
  ),
  'a delayed older event cannot replace a newer active notification'
);

SELECT is(
  (
    SELECT outbox.status
    FROM public.notification_outbox AS outbox
    JOIN public.notifications AS notification
      ON notification.id = outbox.notification_id
    WHERE notification.title = 'Supersession original'
  ),
  'skipped',
  'pending push work is cancelled when its notification is superseded'
);

SELECT is(
  (
    SELECT outbox.status
    FROM public.notification_outbox AS outbox
    JOIN public.notifications AS notification
      ON notification.id = outbox.notification_id
    WHERE notification.title = 'Supersession delayed original'
  ),
  'skipped',
  'delayed superseded events never retain pending push work'
);

SELECT is(
  (
    SELECT public.get_active_notification_id(id)
    FROM public.notifications
    WHERE title = 'Supersession original'
  ),
  (
    SELECT id
    FROM public.notifications
    WHERE title = 'Supersession update'
  ),
  'an old notification link resolves to the newest actionable event'
);

SELECT is(
  (
    SELECT COALESCE(SUM(unread_count), 0)::BIGINT
    FROM public.get_notification_unread_summary()
  ) - (
    SELECT unread_count
    FROM notification_summary_baseline
  ),
  1::BIGINT,
  'superseded notifications do not inflate unread or group-dot counts'
);

SELECT * FROM finish();
ROLLBACK;
