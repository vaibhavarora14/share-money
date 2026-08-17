BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(26);

SELECT has_table('public', 'notifications', 'notifications inbox exists');
SELECT has_table('public', 'notification_preferences', 'notification preferences exist');
SELECT has_table('public', 'push_tokens', 'push token registry exists');
SELECT has_table('public', 'notification_outbox', 'durable notification outbox exists');
SELECT has_table('public', 'notification_deliveries', 'push delivery audit exists');

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
  has_function_privilege(
    'authenticated',
    'public.get_notification_unread_summary()',
    'EXECUTE'
  ),
  'authenticated users can fetch their RLS-scoped unread summary'
);

SELECT col_is_unique(
  'public',
  'push_tokens',
  'expo_push_token',
  'a physical Expo token has one current owner'
);

SELECT * FROM finish();
ROLLBACK;
