-- Record one-time, account-level acceptance after authentication.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS terms_version TEXT;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_terms_acceptance_complete;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_terms_acceptance_complete CHECK (
    (terms_accepted_at IS NULL AND terms_version IS NULL)
    OR (terms_accepted_at IS NOT NULL AND NULLIF(BTRIM(terms_version), '') IS NOT NULL)
  );

COMMENT ON COLUMN public.profiles.terms_accepted_at IS
  'Server timestamp when the user accepted the current legal terms after login.';
COMMENT ON COLUMN public.profiles.terms_version IS
  'Published terms version accepted by the user; a mismatch triggers onboarding again.';
