-- Add reliable email -> user id lookup for edge functions
-- Created: 2026-07-06
--
-- Context:
-- The group-members and invitations edge functions previously looked up existing
-- users via `GET /auth/v1/admin/users?email=...`. GoTrue's admin list endpoint
-- does not support an `email` query parameter (only `filter`), so the parameter
-- was silently ignored and only the newest page (~50 users) was returned. Any
-- existing user outside that page was treated as non-existent and received a
-- pending invitation instead of being added as a group member.
--
-- This function provides an exact, index-friendly, case-insensitive lookup
-- against auth.users. It is intended to be called server-side only (edge
-- functions using the service role), so execution is NOT granted to anon or
-- authenticated roles to avoid exposing an email-existence oracle to clients.

CREATE OR REPLACE FUNCTION public.get_user_id_by_email(p_email TEXT)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT u.id
  FROM auth.users u
  WHERE LOWER(u.email) = LOWER(TRIM(p_email))
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_user_id_by_email(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_user_id_by_email(TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.get_user_id_by_email(TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_id_by_email(TEXT) TO service_role;

COMMENT ON FUNCTION public.get_user_id_by_email(TEXT) IS
  'Server-side exact lookup of an auth user id by email (case-insensitive). Service role only.';
