BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(4);

SELECT is_empty(
  $$
    SELECT table_name
    FROM unnest(ARRAY['exchange_rates', 'group_exchange_rates']) AS tables(table_name)
    WHERE NOT (
      SELECT relrowsecurity
      FROM pg_class
      WHERE oid = format('public.%I', table_name)::regclass
    )
  $$,
  'rate books enforce RLS'
);

SELECT ok(
  has_table_privilege('authenticated', 'public.exchange_rates', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.exchange_rates', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.exchange_rates', 'UPDATE')
  AND NOT has_table_privilege('authenticated', 'public.exchange_rates', 'DELETE'),
  'authenticated users can read cached market rates but cannot write them'
);

SELECT ok(
  has_table_privilege('authenticated', 'public.group_exchange_rates', 'SELECT,INSERT,UPDATE,DELETE')
  AND has_function_privilege(
    'authenticated',
    'public.update_group_currency_settings(uuid, varchar, boolean)',
    'EXECUTE'
  ),
  'active members can manage group rates and settlement settings through RLS and RPC'
);

SELECT is_empty(
  $$
    SELECT table_name
    FROM unnest(ARRAY['exchange_rates', 'group_exchange_rates']) AS tables(table_name)
    WHERE has_table_privilege('anon', format('public.%I', table_name), 'SELECT')
  $$,
  'anonymous users cannot read rate books'
);

SELECT * FROM finish();
ROLLBACK;
