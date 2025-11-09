-- Rollback migration: Remove group invitations feature
-- This undoes: 20240110000000_create_group_invitations.sql

-- Step 1: Drop the function first (it references the table)
DROP FUNCTION IF EXISTS accept_pending_invitations();

-- Step 2: Drop RLS policies
DROP POLICY IF EXISTS "Users can view invitations for their groups" ON group_invitations;
DROP POLICY IF EXISTS "Group owners can create invitations" ON group_invitations;
DROP POLICY IF EXISTS "Group owners can delete invitations" ON group_invitations;

-- Step 3: Disable RLS (optional, but clean)
ALTER TABLE group_invitations DISABLE ROW LEVEL SECURITY;

-- Step 4: Drop the table (indexes are automatically dropped)
DROP TABLE IF EXISTS group_invitations;

