-- Backfill profiles for existing users
-- Created: 2025-12-01
--
-- This migration creates missing profile records for users that already exist
-- in auth.users but do not yet have a corresponding row in public.profiles.

INSERT INTO public.profiles (id, profile_completed)
SELECT u.id, FALSE
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;

