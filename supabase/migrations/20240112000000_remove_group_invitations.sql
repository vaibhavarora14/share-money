-- Rollback migration: Remove group invitations feature
-- This undoes: 20240110000000_create_group_invitations.sql

-- Step 1: Revoke grants on the function before dropping (only if function exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    AND p.proname = 'accept_pending_invitations'
  ) THEN
    REVOKE EXECUTE ON FUNCTION accept_pending_invitations() FROM authenticated;
  END IF;
END $$;

-- Step 2: Drop the function first (it references the table)
DROP FUNCTION IF EXISTS accept_pending_invitations();

-- Step 3: Drop RLS policies (using IF EXISTS to handle case where table doesn't exist)
DROP POLICY IF EXISTS "Users can view invitations for their groups" ON group_invitations;
DROP POLICY IF EXISTS "Group owners can create invitations" ON group_invitations;
DROP POLICY IF EXISTS "Group owners can delete invitations" ON group_invitations;

-- Step 4: Disable RLS only if table exists (wrapped in DO block to handle gracefully)
DO $$
BEGIN
  IF EXISTS (
    SELECT FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename = 'group_invitations'
  ) THEN
    ALTER TABLE group_invitations DISABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- Step 5: Drop the table (indexes are automatically dropped)
DROP TABLE IF EXISTS group_invitations;

