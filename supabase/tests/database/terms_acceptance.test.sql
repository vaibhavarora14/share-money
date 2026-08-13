BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(4);

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
