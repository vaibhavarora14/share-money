BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(11);

SELECT has_column(
  'public',
  'profiles',
  'terms_accepted_at',
  'profiles record when terms were accepted'
);

SELECT has_column(
  'public',
  'profiles',
  'terms_version',
  'profiles record which terms version was accepted'
);

SELECT ok(
  has_table_privilege('authenticated', 'public.profiles', 'SELECT'),
  'authenticated users can select their RLS-scoped profile'
);

SELECT ok(
  has_table_privilege('authenticated', 'public.profiles', 'INSERT'),
  'authenticated users can create their RLS-scoped profile'
);

SELECT ok(
  has_table_privilege('authenticated', 'public.profiles', 'UPDATE'),
  'authenticated users can update their RLS-scoped profile'
);

SELECT ok(
  NOT has_table_privilege('anon', 'public.profiles', 'SELECT'),
  'anonymous users cannot read profiles'
);

SELECT ok(
  has_table_privilege('service_role', 'public.profiles', 'SELECT'),
  'service role can batch-fetch profiles for authorized app requests'
);

SELECT is(
  (
    SELECT profile_completed
    FROM public.profiles
    WHERE id = '11111111-1111-1111-1111-111111111111'
  ),
  TRUE,
  'seeded E2E users have completed account setup'
);

SELECT is(
  (
    SELECT terms_version
    FROM public.profiles
    WHERE id = '11111111-1111-1111-1111-111111111111'
  ),
  '2026-08-11'::text,
  'seeded E2E users have accepted the current terms version'
);

INSERT INTO auth.users (id, email)
VALUES ('55555555-5555-4555-8555-555555555555', 'terms-onboarding@example.com');

SELECT is(
  (
    SELECT terms_accepted_at
    FROM public.profiles
    WHERE id = '55555555-5555-4555-8555-555555555555'
  ),
  NULL::timestamptz,
  'terms acceptance remains unset until the post-login onboarding step'
);

SELECT is(
  (
    SELECT terms_version
    FROM public.profiles
    WHERE id = '55555555-5555-4555-8555-555555555555'
  ),
  NULL::text,
  'terms version remains unset until the post-login onboarding step'
);

SELECT * FROM finish();
ROLLBACK;
