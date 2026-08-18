-- RLS policies define which profile row an authenticated user can access, but
-- PostgreSQL table privileges must also allow the operation before RLS runs.
-- Fresh local databases lacked these grants because profiles was created after
-- the initial schema's API-role grants.

REVOKE ALL ON TABLE public.profiles FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;
